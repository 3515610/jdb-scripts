// ==========================================
// 统一绿茶 抓包即推送 (极简防错版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700"; 
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "tongyilvcha_zh"; 
const KEY_NAME = "tylc_accounts";

const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    
    // 只要抓到，就清空数组，只保留最新的这一个，绝不重复！
    let remark = "我若安好"; // 默认备注
    if (accounts.length > 0) {
        remark = accounts[0].remark; // 保留你之前改过的备注
    }
    accounts = [{ ck: ck, remark: remark }];
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);

    // 推送到青龙
    const formatted = `${accounts[0].remark}@${accounts[0].ck}`;

    $httpClient.get({ 
        url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, 
        timeout: 5 
    }, function(err, resp, data) {
        if (err || !data) return $done();
        let qlToken;
        try { qlToken = JSON.parse(data).data.token; } catch(e) { return $done(); }

        $httpClient.get({ 
            url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, 
            headers: { "Authorization": "Bearer " + qlToken }, 
            timeout: 5 
        }, function(err2, resp2, data2) {
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
            }, function(err3) {
                $done();
            });
        });
    });
}
$done({});
