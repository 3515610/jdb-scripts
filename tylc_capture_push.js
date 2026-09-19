// ==========================================
// 统一绿茶 抓包即推送青龙 (单条即时推送版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700"; // ⚠️ 改成你的青龙地址
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "tongyilvcha_zh"; // 根据你的截图自动匹配了
const KEY_NAME = "tylc_accounts";

// 提取截图里看到的 Authorization 字段
const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    
    // 简单去重
    const exists = accounts.find(a => a.ck === ck);
    
    if (exists) {
        if (exists.ck !== ck) {
            exists.ck = ck;
            $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        }
    } else {
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}` });
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
    }

    // 🚀 立刻开始推送到青龙（单条数据不会超时！）
    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

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
            }, function(err3, resp3, data3) {
                if (!err3 && resp3 && resp3.status === 200) {
                    $notify("统一绿茶CK同步成功 🎉", `已更新账号: ${exists ? exists.remark : accounts[accounts.length-1].remark}`, `当前共 ${accounts.length} 个账号`);
                } else {
                    $notify("统一绿茶同步失败 ❌", "推送出错", (err3 || "HTTP:" + (resp3 ? resp3.status : "未知")));
                }
                $done();
            });
        });
    });
}
$done({});
