// ==========================================
// 康师傅 抓包即同步到青龙（防止大数据超时版）
// ==========================================
const QL_URL = "http://192.168.99.1:5700";
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "kangshifu_zh";
const KEY_NAME = "ksf_accounts";

const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let uniqueId = ck;
    // 尝试从 JWT 中提取稳定的 ID (id 或 crmId)
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
    
    if (exists) {
        if (exists.ck !== ck) {
            exists.ck = ck;
            $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        }
    } else {
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}`, uniqueId: uniqueId });
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
    }

    // 🚀 立刻开始同步（因为是单条数据，只有1KB，绝对不会超时！）
    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

    $httpClient.get({ url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, timeout: 5 }, function(err, resp, data) {
        if (err || !data) return $done();
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; } catch(e) { return $done(); }

        $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken }, timeout: 5 }, function(err2, resp2, data2) {
            if (err2 || !data2) return $done();
            let envs;
            try { envs = JSON.parse(data2).data; } catch(e) { return $done(); }

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
                    // 同步成功，弹通知！
                    $notify("康师傅CK同步成功 🎉", `已更新账号: ${exists ? exists.remark : accounts[accounts.length-1].remark}`, `当前共 ${accounts.length} 个账号`);
                }
                $done();
            });
        });
    });
}
