// ==========================================
// 康师傅 抓包即同步到青龙｜终极防并发版
// ==========================================
const QL_URL = "http://192.168.99.1:5700";
const CLIENT_ID = "tGj6_OuEQFme";
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";
const ENV_NAME = "kangshifu_zh";
const KEY_NAME = "ksf_accounts";
const BARK_KEY = ""; // 填写你的bark密钥，留空则不启用bark

// 🚀 防并发抢锁机制：5秒内只允许执行一次
const LOCK_KEY = "ksf_sync_lock";
const nowTime = Date.now();
const lockTime = parseInt($persistentStore.read(LOCK_KEY) || "0");

if (nowTime - lockTime < 5000) {
    console.log("⏭️ 5秒内已触发过，忽略并发请求");
    $done();
}
// 立刻抢锁，确保后续并发请求读到最新时间
$persistentStore.write(nowTime.toString(), LOCK_KEY);

// 统一通知入口
function sendNotification(title, sub, body) {
    $notification.post(title, sub, body);
    if (BARK_KEY && BARK_KEY.length > 0) {
        const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}?body=${encodeURIComponent(body)}`;
        $httpClient.get(url, err => { if(err) console.log("Bark推送异常:", err); })
    }
}

const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let uniqueId = ck;
    try {
        const base64Url = ck.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        // 根据你上一个截图，康师傅的JWT里没有id，只有crmId，这里兼容一下
        if (payload.crmId) uniqueId = payload.crmId.toString();
        else if (payload.id) uniqueId = payload.id.toString();
    } catch(e) {}

    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    // 根据 uniqueId 去重
    const exists = accounts.find(a => a.uniqueId === uniqueId || a.ck === ck);

    if (exists) {
        if (exists.ck !== ck) {
            exists.ck = ck;
            $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        }
    } else {
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}`, uniqueId: uniqueId });
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
    }

    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

    $httpClient.get({ url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 }, function(err, resp, data) {
        if (err || !data) {
            sendNotification("❌ CK同步青龙失败", "获取青龙token失败", err || "返回数据为空");
            return $done();
        }
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; } catch(e) {
            sendNotification("❌ CK同步青龙失败", "解析青龙token出错", e.message);
            return $done();
        }

        $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 }, function(err2, resp2, data2) {
            if (err2 || !data2) {
                sendNotification("❌ CK同步青龙失败", "查询青龙环境变量失败", err2 || "返回数据为空");
                return $done();
            }
            let envs;
            try { envs = JSON.parse(data2).data; } catch(e) {
                sendNotification("❌ CK同步青龙失败", "解析环境变量列表出错", e.message);
                return $done();
            }

            const method = envs && envs.length > 0 ? "put" : "post";
            const payload = { name: ENV_NAME, value: formatted, remarks: "Surge抓包同步" };
            if (method === "put") payload.id = envs[0].id;

            $httpClient[method]({
                url: `${QL_URL}/open/envs`,
                headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                timeout: 5
            }, function(err3, resp3, data3) {
                if (!err3 && resp3 && resp3.status === 200) {
                    const accRemark = exists ? exists.remark : accounts[accounts.length - 1].remark;
                    sendNotification("康师傅CK同步成功 🎉", `已更新账号: ${accRemark}`, `当前共 ${accounts.length} 个账号`);
                } else {
                    sendNotification("❌ CK同步青龙失败", "更新环境变量接口异常", `err:${err3}, status:${resp3?.status||'无'}`);
                }
                $done();
            });
        });
    });
}
