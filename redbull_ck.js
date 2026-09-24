// ==========================================
// 红牛红包版 抓包即同步到青龙｜自动取昵称｜终极防并发版
// ==========================================
const QL_URL        = "http://192.168.99.1:5700";
const CLIENT_ID     = "tGj6_OuEQFme";
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";
const ENV_NAME      = "redbull_zh";
const KEY_NAME      = "rb_accounts";
const BARK_KEY      = "";   // Bark 密钥，留空不启用

// 🚀 防并发锁
const LOCK_KEY = "rb_sync_lock";
const nowTime  = Date.now();
const lockTime = parseInt($persistentStore.read(LOCK_KEY) || "0");

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

// 从 URL 提取 SessionKey
function extractSessionKey(url) {
    if (!url) return null;
    const m = url.match(/[?&]SessionKey=([^&]+)/i);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

// 请求 GetUserInfo 拿昵称 / 手机号
function fetchUserInfo(sessionKey, cb) {
    const infoUrl = `https://tcp-crm.com/dtc/CMiniApi/OAuthProgram/GetUserInfo?SessionKey=${sessionKey}`;
    $httpClient.post(
        {
            url: infoUrl,
            headers: {
                "Host": "tcp-crm.com",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.73(0x18004921) NetType/WIFI Language/zh_CN",
                "Referer": "https://servicewechat.com/wx14eb1126b8a25636/187/page-frame.html",
            },
            body: "{}",
            timeout: 8,
        },
        function (err, resp, data) {
            if (err || !data) {
                console.log("❌ GetUserInfo 请求失败: " + err);
                return cb(null);
            }
            try {
                const json = JSON.parse(data);
                if (json.code === 0 && json.data) return cb(json.data);
                console.log("❌ GetUserInfo 返回异常: " + data.slice(0, 120));
            } catch (e) {
                console.log("❌ GetUserInfo 解析失败: " + e.message);
            }
            cb(null);
        }
    );
}

const sessionKey = extractSessionKey($request.url || "");
if (!sessionKey || sessionKey.length < 10) {
    console.log("⏭️ 未在 URL 中找到有效 SessionKey");
    $done();
}

console.log("🔑 捕获 SessionKey: " + sessionKey.slice(0, 8) + "***");

// 读取本地缓存账号
let accounts = [];
try { accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]"); }
catch (e) { accounts = []; }

// 先用 SessionKey 快速判断是否已存在
const existingByCk = accounts.find(a => a.ck === sessionKey);

fetchUserInfo(sessionKey, function (user) {
    // 兜底：拿不到用户信息就按 SessionKey 存
    const nick   = (user && user.NickName) ? String(user.NickName).trim() : "未知昵称";
    const mobile = (user && user.Mobile)   ? String(user.Mobile).trim()   : "";
    const uid    = (user && user.ID)       ? String(user.ID)              : "";

    // 🎯 唯一标识优先级：ID > Mobile > SessionKey
    let uniqueId = uid || mobile || sessionKey;
    // 手机后4位用于备注
    const mobileTail = mobile.length === 11 ? mobile.slice(-4) : "";
    const remark = mobileTail ? `红牛_${nick}_${mobileTail}` : `红牛_${nick}`;

    // 按 uniqueId 去重
    let target = accounts.find(a => a.uniqueId === uniqueId);

    // 如果没按 uniqueId 找到，但按 SessionKey 找到了，也认（老数据兼容）
    if (!target && existingByCk) target = existingByCk;

    let action = "";
    if (target) {
        const oldCk = target.ck;
        target.ck       = sessionKey;
        target.uniqueId = uniqueId;
        target.nick     = nick;
        target.mobile   = mobile;
        target.remark   = remark;
        action = (oldCk === sessionKey) ? "unchanged" : "updated";
        console.log(`♻️ 已更新账号: ${remark} (${action})`);
    } else {
        accounts.push({
            ck: sessionKey,
            uniqueId: uniqueId,
            nick: nick,
            mobile: mobile,
            remark: remark,
        });
        action = "created";
        console.log(`➕ 新增账号: ${remark}`);
    }

    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);

    // 格式化：备注@SessionKey
    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");
    const currentRemark = remark;

    // ============ 同步到青龙 ============
    $httpClient.get(
        { url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 },
        function (err, resp, data) {
            if (err || !data) {
                sendNotification("❌ 红牛CK同步青龙失败", "获取青龙token失败", String(err || "返回数据为空"));
                return $done();
            }
            let qlToken;
            try { qlToken = JSON.parse(data).data.token; }
            catch (e) {
                sendNotification("❌ 红牛CK同步青龙失败", "解析青龙token出错", e.message);
                return $done();
            }

            $httpClient.get(
                { url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 },
                function (err2, resp2, data2) {
                    if (err2 || !data2) {
                        sendNotification("❌ 红牛CK同步青龙失败", "查询环境变量失败", String(err2 || "返回数据为空"));
                        return $done();
                    }
                    let envs;
                    try { envs = JSON.parse(data2).data; }
                    catch (e) {
                        sendNotification("❌ 红牛CK同步青龙失败", "解析环境变量列表出错", e.message);
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
                                    created:   "🐂 红牛CK同步成功 🎉",
                                    updated:   "🐂 红牛CK已更新 ♻️",
                                    unchanged: "🐂 红牛CK已存在 ✅",
                                };
                                sendNotification(
                                    titleMap[action] || "🐂 红牛CK同步成功",
                                    `账号: ${currentRemark}`,
                                    `当前共 ${accounts.length} 个账号`
                                );
                            } else {
                                sendNotification(
                                    "❌ 红牛CK同步青龙失败",
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
});
