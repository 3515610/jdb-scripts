// ==========================================
// 勇闯天涯 抓包同步青龙（多账号精准版 v2）
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";           // 青龙地址
const CLIENT_ID     = "tGj6_OuEQFme";                       // 青龙 openapi id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";           // 青龙 openapi secret
const ENV_NAME      = "CRB_ACCOUNTS";                       // 青龙环境变量名
const KEY_NAME      = "crb_multi_v2";                       // ⚠️ 全新本地存储 key，隔离旧垃圾数据

// 统一通知
function sendNotification(title, sub, body) {
    $notification.post(title, sub, body);
}

// 防抖锁（2秒内只允许触发一次）
const LOCK_KEY  = "crb_multi_lock_v2";
const nowTime   = Date.now();
const lockTime  = parseInt($persistentStore.read(LOCK_KEY) || "0");
if (nowTime - lockTime < 2000) { $done(); }
$persistentStore.write(nowTime.toString(), LOCK_KEY);

// 提取并清洗 Authorization
function getHeader(name) {
    return $request.headers[name] || $request.headers[name.toLowerCase()] || null;
}

let ck = getHeader("Authorization");
if (!ck || ck.length < 10) { $done(); }

ck = ck.trim();
if (ck.toLowerCase().startsWith("bearer ")) {
    ck = ck.substring(7).trim();
}

// ============ 读取本地多账号列表 ============
let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

// 多账号核心去重逻辑：如果当前 CK 已存在，则是旧账号；不存在，则新增
const exists = accounts.find(a => a.ck === ck);

let action = "";
let currentRemark = "";

if (exists) {
    action = "unchanged";
    currentRemark = exists.remark;
    console.log("✅ 账号已存在，跳过: " + currentRemark);
} else {
    // 追加新账号
    const newRemark = `勇闯_账号${accounts.length + 1}`;
    accounts.push({
        ck: ck,
        remark: newRemark
    });
    action = "created";
    currentRemark = newRemark;
    console.log("➕ 新增账号: " + currentRemark);
}

$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// 格式化环境变量：备注1@ck1\n备注2@ck2
const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

// ============ 同步到青龙 ============
$httpClient.get({ url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 }, function (err, resp, data) {
    if (err || !data) return $done();
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch (e) { return $done(); }

    $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 }, function (err2, resp2, data2) {
        if (err2 || !data2) return $done();
        let envs;
        try { envs = JSON.parse(data2).data; } catch (e) { return $done(); }

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
                const titleMap = {
                    created:   "🎉 勇闯CK同步成功",
                    unchanged: "✅ 勇闯CK已存在",
                };
                sendNotification(titleMap[action] || "勇闯CK同步成功", `账号: ${currentRemark}`, `当前共 ${accounts.length} 个账号`);
            }
            $done();
        });
    });
});
