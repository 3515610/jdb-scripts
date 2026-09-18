// ==========================================
// 康师傅 BoxJs 同步到青龙 (Surge 极速防崩版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700"; 
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "kangshifu_zh";

let accounts = [];
try {
    accounts = JSON.parse($persistentStore.read("ksf_accounts") || "[]");
} catch(e) {
    $notify("康师傅同步失败 ❌", "本地数据解析失败", "请去BoxJs确认格式是否正确");
    $done();
}

if (!Array.isArray(accounts) || accounts.length === 0) {
    $notify("康师傅同步检查", "本地存储为空", "请去小程序点几下触发抓包");
    $done();
}

// 格式化数据
const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

// 1. 获取 Token（添加空值保护）
$httpClient.get({ 
    url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, 
    timeout: 10 
}, function(err, resp, data) {
    if (err || !resp || !data) {
        $notify("康师傅同步失败 ❌", "无法连接青龙", err || "响应为空");
        return $done();
    }
    
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch(e) { return $done(); }
    if (!qlToken) return $done();

    // 2. 查询现有环境变量（添加空值保护）
    $httpClient.get({ 
        url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, 
        headers: { "Authorization": "Bearer " + qlToken },
        timeout: 10 
    }, function(err2, resp2, data2) {
        if (err2 || !resp2 || !data2) return $done();
        
        let envs;
        try { envs = JSON.parse(data2).data; } catch(e) { return $done(); }

        const method = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: ENV_NAME, value: formatted, remarks: "Surge自动同步" };
        if (method === "put") payload.id = envs[0].id;

        // 3. 推送更新（添加极其严格的防崩保护）
        $httpClient[method]({ 
            url: `${QL_URL}/open/envs`, 
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload),
            timeout: 15 // 给推送增加超时时间，因为数据很大
        }, function(err3, resp3, data3) {
            if (err3 || !resp3 || resp3.status !== 200) {
                $notify("康师傅同步失败 ❌", "推送到青龙出错", (err3 || "HTTP:" + (resp3 ? resp3.status : "未知")));
            } else {
                $notify("康师傅CK同步成功 🎉", `已同步 ${accounts.length} 个账号`, "青龙环境变量已更新");
            }
            $done();
        });
    });
});
