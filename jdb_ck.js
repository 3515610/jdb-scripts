// ==========================================
// 勇闯天涯 抓包即同步到青龙｜终极防并发版
// 一打开勇闯天涯小程序，自动抓取 Authorization 并同步到青龙
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";           // 青龙地址（必须手机能访问）
const CLIENT_ID     = "tGj6_OuEQFme";                       // 青龙 openapi id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";           // 青龙 openapi secret
const ENV_NAME      = "CRB_ACCOUNTS";                       // 勇闯天涯环境变量名
const KEY_NAME      = "crb_accounts";                       // 本地存储 key
const BARK_KEY      = "";                                   // Bark 密钥，留空不启用

// 🚀 防并发抢锁：5 秒内只允许执行一次
const LOCK_KEY  = "crb_sync_lock";
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
    const headers = $request.headers || {};
    const target = name.toLowerCase();
    for (const k in headers) {
        if (k.toLowerCase() === target) return headers[k];
    }
    return null;
}

// 🔑 勇闯天涯的 CK 就是 Authorization 头
const auth = getHeader("Authorization");

if (!auth) {
    console.log("⏭️ 请求头中缺少 Authorization，跳过");
    $done();
}

console.log("🔑 捕获到 Authorization: " + auth.slice(0, 12) + "***");

// ============ 本地账户列表（按 auth 去重） ============
let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

const exists = accounts.find(a => a.auth === auth);

let action = "";
let currentRemark = "";

if (exists) {
    action = "unchanged";
    currentRemark = exists.remark;
    console.log("✅ 账号已存在且 Authorization 一致，跳过");
} else {
    currentRemark = `勇闯天涯_账号${accounts.length + 1}`;
    accounts.push({
        auth: auth,
        remark: currentRemark
    });
    action = "created";
    console.log("➕ 新增账号: " + currentRemark);
}

$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// 格式化：备注@auth（与 Python 脚本 CRB_ACCOUNTS 的 remark@auth 一致）
const formatted = accounts.map(a => `${a.remark}@${a.auth}`).join("\n");

// ============ 同步到青龙 ============
$httpClient.get(
    { url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 },
    function (err, resp, data) {
        if (err || !data) {
            sendNotification("❌ 勇闯天涯CK同步青龙失败", "获取青龙token失败", String(err || "返回数据为空"));
            return $done();
        }
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; }
        catch (e) {
            sendNotification("❌ 勇闯天涯CK同步青龙失败", "解析青龙token出错", e.message);
            return $done();
        }

        $httpClient.get(
            { url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 },
            function (err2, resp2, data2) {
                if (err2 || !data2) {
                    sendNotification("❌ 勇闯天涯CK同步青龙失败", "查询青龙环境变量失败", String(err2 || "返回数据为空"));
                    return $done();
                }
                let envs;
                try { envs = JSON.parse(data2).data; }
                catch (e) {
                    sendNotification("❌ 勇闯天涯CK同步青龙失败", "解析环境变量列表出错", e.message);
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
                                created:   "🎉 勇闯天涯CK同步成功",
                                unchanged: "✅ 勇闯天涯CK已存在",
                            };
                            sendNotification(
                                titleMap[action] || "勇闯天涯CK同步成功",
                                `账号: ${currentRemark}`,
                                `当前共 ${accounts.length} 个账号`
                            );
                        } else {
                            sendNotification(
                                "❌ 勇闯天涯CK同步青龙失败",
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
