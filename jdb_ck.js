// ==========================================
// 加多宝 抓包即同步到青龙｜终极防并发版
// 一打开加多宝小程序，自动抓取 apitoken 和 unique_identity 同步到青龙
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";           // 青龙地址（必须手机能访问）
const CLIENT_ID     = "tGj6_OuEQFme";                       // 青龙 openapi id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";           // 青龙 openapi secret
const ENV_NAME      = "JDBC_ACCOUNTS";                      // 加多宝环境变量名
const KEY_NAME      = "jdb_accounts";                       // 本地存储 key
const BARK_KEY      = "";                                   // Bark 密钥，留空不启用

// 🚀 防并发抢锁：5 秒内只允许执行一次
const LOCK_KEY  = "jdb_sync_lock";
const nowTime   = Date.now();
const lockTime  = parseInt($persistentStore.read(LOCK_KEY) || "0");

if (nowTime - lockTime < 5000) {
    console.log("⏭️ 5秒内已触发过，忽略并发请求");
    $done();
}
$persistentStore.write(nowTime.toString(), LOCK_KEY);

// 统一通知
function sendNotification(title, sub, body) {
    $notification.post(title, sub, body);
    if (BARK_KEY && BARK_KEY.length > 0) {
        const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}?body=${encodeURIComponent(body)}`;
        $httpClient.get(url, err => { if (err) console.log("Bark推送异常:", err); });
    }
}

// 提取请求头（兼容大小写）
function getHeader(name) {
    return $request.headers[name] || $request.headers[name.toLowerCase()] || $request.headers[name.toUpperCase()] || null;
}

const token  = getHeader("apitoken");
const unique = getHeader("unique_identity");

if (!token || !unique) {
    console.log("⏭️ 请求头中缺少 apitoken 或 unique_identity，跳过");
    $done();
}

console.log("🔑 捕获到 token: " + token.slice(0, 8) + "*** | unique: " + unique);

// ============ 本地账户列表（按 unique 去重） ============
let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

// 以 unique 为唯一标识
const exists = accounts.find(a => a.unique === unique);

let action = "";
if (exists) {
    if (exists.token === token) {
        action = "unchanged";
        console.log("✅ 账号已存在且 Token 一致，跳过");
    } else {
        exists.token = token;
        action = "updated";
        console.log("♻️ 已更新账号 Token: " + exists.remark);
    }
} else {
    accounts.push({
        token: token,
        unique: unique,
        remark: `加多宝_账号${accounts.length + 1}`
    });
    action = "created";
    console.log("➕ 新增账号: " + `加多宝_账号${accounts.length}`);
}

$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// 格式化：token,unique,备注
const formatted = accounts.map(a => `${a.token},${a.unique},${a.remark}`).join("\n");
const currentRemark = exists ? exists.remark : accounts[accounts.length - 1].remark;

// ============ 同步到青龙 ============
$httpClient.get(
    { url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 },
    function (err, resp, data) {
        if (err || !data) {
            sendNotification("❌ 加多宝CK同步青龙失败", "获取青龙token失败", String(err || "返回数据为空"));
            return $done();
        }
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; }
        catch (e) {
            sendNotification("❌ 加多宝CK同步青龙失败", "解析青龙token出错", e.message);
            return $done();
        }

        $httpClient.get(
            { url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 },
            function (err2, resp2, data2) {
                if (err2 || !data2) {
                    sendNotification("❌ 加多宝CK同步青龙失败", "查询青龙环境变量失败", String(err2 || "返回数据为空"));
                    return $done();
                }
                let envs;
                try { envs = JSON.parse(data2).data; }
                catch (e) {
                    sendNotification("❌ 加多宝CK同步青龙失败", "解析环境变量列表出错", e.message);
                    return $done();
                }

                const method  = envs && envs.length > 0 ? "put" : "post";
                const payload = { name: ENV_NAME, value: formatted, remarks: "Surge抓包同步" };
                if (method === "put") payload.id = envs[0].id;

                $httpClient[method](
                    {
                        url: `${QL_URL}/open/envs`,
                        headers: {
                            "Authorization": "Bearer " + qlToken,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload),
                        timeout: 5,
                    },
                    function (err3, resp3, data3) {
                        if (!err3 && resp3 && resp3.status === 200) {
                            const titleMap = {
                                created:   "🎉 加多宝CK同步成功",
                                updated:   "♻️ 加多宝CK已更新",
                                unchanged: "✅ 加多宝CK已存在",
                            };
                            sendNotification(
                                titleMap[action] || "加多宝CK同步成功",
                                `账号: ${currentRemark}`,
                                `当前共 ${accounts.length} 个账号`
                            );
                        } else {
                            sendNotification(
                                "❌ 加多宝CK同步青龙失败",
                                "更新环境变量接口异常",
                                `err:${err3}, status:${resp3 ? resp3.status : "无"}`
                            );
                        }
                        $done();
                    }
                );
            }
        );
    }
);
