// ==========================================
// 勇闯天涯 抓包即同步到青龙｜终极防重复版 v3
// 一打开勇闯天涯小程序，自动抓取 Authorization 同步到青龙
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";           // 青龙地址（必须手机能访问）
const CLIENT_ID     = "tGj6_OuEQFme";                       // 青龙 openapi id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";           // 青龙 openapi secret
const ENV_NAME      = "CRB_ACCOUNTS";                       // 勇闯天涯环境变量名
const KEY_NAME      = "crb_accounts_v3";                    // ⚠️ 本地存储 key 已升级为 v3，彻底重置
const BARK_KEY      = "";                                   // Bark 密钥，留空不启用

// 🚀 防并发抢锁：5 秒内只允许执行一次
const LOCK_KEY  = "crb_sync_lock_v3";
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

let ck = getHeader("Authorization");

if (!ck || ck.length < 10) {
    console.log("⏭️ 请求头中缺少 Authorization，跳过");
    $done();
}

// ✨ 清洗 Token：去掉 Bearer 前缀和空格，防止因为前缀变化导致被当作新账号
ck = ck.trim();
if (ck.toLowerCase().startsWith("bearer ")) {
    ck = ck.substring(7).trim();
}

console.log("🔑 捕获到 CK: " + ck.slice(0, 12) + "***");

// ============ 本地账户列表（去重） ============
let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

// 用清洗后的 CK 去重
const exists = accounts.find(a => a.ck === ck);

let action = "";
if (exists) {
    action = "unchanged";
    console.log("✅ 账号已存在，跳过: " + exists.remark);
} else {
    // 🎯 单账号模式：直接清空旧列表，只保留最新捕获的账号（如果你有多个微信号，请把下面这三行删掉，解除注释上面的 push 代码）
    accounts = [{
        ck: ck,
        remark: `勇闯_账号1`
    }];
    action = "created";
    console.log("➕ 强制覆盖为单账号: 勇闯_账号1");
    
    /* 
    // 如果你确实有多个微信号需要同步，请删除上面强制覆盖的代码，启用下面这段新增代码：
    accounts.push({
        ck: ck,
        remark: `勇闯_账号${accounts.length + 1}`
    });
    action = "created";
    console.log("➕ 新增账号: " + `勇闯_账号${accounts.length}`);
    */
}

$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// 格式化：备注@ck（勇闯天涯的环境变量格式）
const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");
const currentRemark = exists ? exists.remark : accounts[accounts.length - 1].remark;

// ============ 同步到青龙 ============
$httpClient.get(
    { url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 },
    function (err, resp, data) {
        if (err || !data) {
            sendNotification("❌ 勇闯CK同步青龙失败", "获取青龙token失败", String(err || "返回数据为空"));
            return $done();
        }
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; }
        catch (e) {
            sendNotification("❌ 勇闯CK同步青龙失败", "解析青龙token出错", e.message);
            return $done();
        }

        $httpClient.get(
            { url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 },
            function (err2, resp2, data2) {
                if (err2 || !data2) {
                    sendNotification("❌ 勇闯CK同步青龙失败", "查询环境变量失败", String(err2 || "返回数据为空"));
                    return $done();
                }
                let envs;
                try { envs = JSON.parse(data2).data; }
                catch (e) {
                    sendNotification("❌ 勇闯CK同步青龙失败", "解析环境变量列表出错", e.message);
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
                                created:   "🎉 勇闯CK同步成功",
                                unchanged: "✅ 勇闯CK已存在",
                            };
                            sendNotification(
                                titleMap[action] || "勇闯CK同步成功",
                                `账号: ${currentRemark}`,
                                `当前共 ${accounts.length} 个账号`
                            );
                        } else {
                            sendNotification(
                                "❌ 勇闯CK同步青龙失败",
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
