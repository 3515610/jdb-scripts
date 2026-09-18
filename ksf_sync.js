// ==========================================
// 康师傅 BoxJs 同步到青龙 (Surge 极速版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700"; // 改成你的青龙地址
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "kangshifu_zh";

// 读取本地存储
let accounts = JSON.parse($persistentStore.read("ksf_accounts") || "[]");

if (accounts.length === 0) {
    $notify("康师傅同步检查", "本地存储为空", "请去小程序点几下触发抓包");
    $done();
}

// 格式化
const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

// 1. 获取 Token
$httpClient.get({ 
    url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, 
    timeout: 10 
}, function(err, resp, data) {
    if (err || !data) {
        $notify("康师傅同步失败 ❌", "无法连接青龙", err || "返回为空");
        return $done();
    }
    
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch(e) { return $done(); }
    if (!qlToken) return $done();

    // 2. 查询现有环境变量
    $httpClient.get({ 
        url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, 
        headers: { "Authorization": "Bearer " + qlToken },
        timeout: 10 
    }, function(err2, resp2, data2) {
        if (err2 || !data2) return $done();
        
        let envs;
        try { envs = JSON.parse(data2).data; } catch(e) { return $done(); }

        const method = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: ENV_NAME, value: formatted, remarks: "Surge自动同步" };
        if (method === "put") payload.id = envs[0].id;

        // 3. 推送更新
        $httpClient[method]({ 
            url: `${QL_URL}/open/envs`, 
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload),
            timeout: 10
        }, function(err3, resp3, data3) {
            if (err3 || !resp3 || resp3.status !== 200) {
                $notify("康师傅同步失败 ❌", "推送出错", err3 || data3);
            } else {
                $notify("康师傅CK同步成功 🎉", `已同步 ${accounts.length} 个账号`, "青龙环境变量已更新");
            }
            $done();
        });
    });
});
