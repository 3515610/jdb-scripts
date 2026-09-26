// ==========================================
// 加多宝 抓包同步青龙（多账号完美版 v3 - 保留自定义备注）
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";           // ⚠️ 青龙地址
const CLIENT_ID     = "tGj6_OuEQFme";                       // 青龙 openapi id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";           // 青龙 openapi secret
const ENV_NAME      = "JDBC_ACCOUNTS";                      // 加多宝环境变量名
const KEY_NAME      = "jdb_accounts_v3";                    // 全新本地存储 key

function sendNotification(title, sub, body) { $notification.post(title, sub, body); }

// 防抖锁（2秒内只允许触发一次）
const LOCK_KEY  = "jdb_sync_lock_v3";
const nowTime   = Date.now();
const lockTime  = parseInt($persistentStore.read(LOCK_KEY) || "0");
if (nowTime - lockTime < 2000) { $done(); }
$persistentStore.write(nowTime.toString(), LOCK_KEY);

function getHeader(name) {
    return $request.headers[name] || $request.headers[name.toLowerCase()] || $request.headers[name.toUpperCase()] || null;
}

const token = getHeader("apitoken");
const unique = getHeader("unique_identity");

if (!token || !unique) { $done(); }

let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

const exists = accounts.find(a => a.unique === unique);
let action = "";
let currentRemark = "";

if (exists) {
    if (exists.token === token) {
        action = "unchanged";
    } else {
        exists.token = token;
        action = "updated";
    }
    currentRemark = exists.remark;
} else {
    const newRemark = `加多宝_账号${accounts.length + 1}`;
    accounts.push({ token: token, unique: unique, remark: newRemark });
    action = "created";
    currentRemark = newRemark;
}
$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// ============ 同步到青龙 ============
$httpClient.get({ url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 }, function (err, resp, data) {
    if (err || !data) return $done();
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch (e) { return $done(); }

    $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 }, function (err2, resp2, data2) {
        if (err2 || !data2) return $done();
        let envs;
        try { envs = JSON.parse(data2).data; } catch (e) { return $done(); }

        // 🌟 核心：解析青龙现有的环境变量，提取用户自定义的备注
        let qlRemarks = {};
        if (envs && envs.length > 0 && envs[0].value) {
            envs[0].value.split("\n").forEach(line => {
                let parts = line.split(",");
                if (parts.length >= 2) {
                    let u = parts[1].trim();
                    let r = parts[2] ? parts[2].trim() : "";
                    if (u) qlRemarks[u] = r;
                }
            });
        }

        // 组装推送数据，优先使用青龙里已有的备注
        const formatted = accounts.map(a => {
            let finalRemark = qlRemarks[a.unique] ? qlRemarks[a.unique] : a.remark;
            if (qlRemarks[a.unique]) {
                a.remark = qlRemarks[a.unique]; // 同步更新本地缓存，避免下次覆盖
            }
            return `${a.token},${a.unique},${finalRemark}`;
        }).join("\n");

        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);

        const method  = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: ENV_NAME, value: formatted, remarks: "Surge抓包同步" };
        if (method === "put") payload.id = envs[0].id;

        $httpClient[method]({
            url: `${QL_URL}/open/envs`,
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            timeout: 5
        }, function (err3, resp3) {
            if (!err3 && resp3 && resp3.status === 200) {
                const titleMap = { created: "🎉 加多宝CK同步成功", updated: "♻️ 加多宝CK已更新", unchanged: "✅ 加多宝CK已存在" };
                sendNotification(titleMap[action] || "加多宝CK同步成功", `账号: ${currentRemark}`, `当前共 ${accounts.length} 个账号`);
            }
            $done();
        });
    });
});
