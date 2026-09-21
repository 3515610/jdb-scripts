// ==========================================
// 康师傅 抓包即同步到青龙｜借鉴glados消息缓存模式 Surge专用｜修复重复通知
// ==========================================
const QL_URL = "http://192.168.99.1:5700";
const CLIENT_ID = "tGj6_OuEQFme";
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";
const ENV_NAME = "kangshifu_zh";
const KEY_NAME = "ksf_accounts";
const BARK_KEY = ""; //填写你的bark密钥，留空则不启用bark

// 缓存通知消息
let notifyTitle = "";
let notifySubtitle = "";
let notifyBody = "";

// 统一通知入口
function sendNotification(title, sub, body) {
    // Surge原生通知
    $notification.post(title, sub, body);
    // bark兜底推送
    if (BARK_KEY && BARK_KEY.length > 0) {
        const url = `https://api.day.app/${encodeURIComponent(title)}?body=${encodeURIComponent(body)}`;
        $httpClient.get(url, err => {
            if(err) console.log("Bark推送异常:", err);
        })
    }
}

const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let uniqueId = ck;
    // JWT解析id
    try {
        const base64Url = ck.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        if (payload.id) uniqueId = payload.id.toString();
    } catch(e) {}

    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    const exists = accounts.find(a => a.uniqueId === uniqueId || a.ck === ck);

    // ========== 新增判断：CK完全不变就直接退出，不执行同步、不弹通知 ==========
    if(exists && exists.ck === ck){
        // CK无更新，直接结束，不触发通知
        $done();
    }

    let isNewAccount = false;
    if (exists) {
        exists.ck = ck;
    } else {
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}`, uniqueId: uniqueId });
        isNewAccount = true;
    }
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);

    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

    $httpClient.get({ url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 }, function(err, resp, data) {
        if (err || !data) {
            notifyTitle = "❌ CK同步青龙失败";
            notifySubtitle = "获取青龙token失败";
            notifyBody = err || "返回数据为空";
            sendNotification(notifyTitle, notifySubtitle, notifyBody);
            return $done();
        }
        let qlToken;
        try {
            qlToken = JSON.parse(data).data.token;
        } catch(e) {
            notifyTitle = "❌ CK同步青龙失败";
            notifySubtitle = "解析青龙token出错";
            notifyBody = e.message;
            sendNotification(notifyTitle, notifySubtitle, notifyBody);
            return $done();
        }

        $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 }, function(err2, resp2, data2) {
            if (err2 || !data2) {
                notifyTitle = "❌ CK同步青龙失败";
                notifySubtitle = "查询青龙环境变量失败";
                notifyBody = err2 || "返回数据为空";
                sendNotification(notifyTitle, notifySubtitle, notifyBody);
                return $done();
            }
            let envs;
            try {
                envs = JSON.parse(data2).data;
            } catch(e) {
                notifyTitle = "❌ CK同步青龙失败";
                notifySubtitle = "解析环境变量列表出错";
                notifyBody = e.message;
                sendNotification(notifyTitle, notifySubtitle, notifyBody);
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
                    notifyTitle = "康师傅CK同步成功 🎉";
                    notifySubtitle = `已更新账号: ${accRemark}`;
                    notifyBody = `当前共 ${accounts.length} 个账号`;
                } else {
                    notifyTitle = "❌ CK同步青龙失败";
                    notifySubtitle = "更新环境变量接口异常";
                    notifyBody = `err:${err3}, status:${resp3?.status||'无'}`;
                }
                sendNotification(notifyTitle, notifySubtitle, notifyBody);
                $done();
            });
        });
    });
}
