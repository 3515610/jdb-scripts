// ==========================================
// 康师傅 BoxJs 同步到青龙 (远程 Cron 版)
// ==========================================
const QL_URL = $prefs.valueForKey("KSF_QL_URL") || "http://192.168.99.1:5700";
const CLIENT_ID = $prefs.valueForKey("KSF_CLIENT_ID") || "tGj6_OuEQFme";
const CLIENT_SECRET = $prefs.valueForKey("KSF_CLIENT_SECRET") || "mvz-zcTL3FAWsTEDCikXvD_M";
const ENV_NAME = "kangshifu_zh"; // 康师傅脚本所需的环境变量名

// 1. 读取本地存储
let accounts = JSON.parse($persistentStore.read("ksf_accounts") || "[]");

if (accounts.length === 0) {
    $notify("康师傅同步检查", "本地存储为空", "请去小程序点几下触发抓包");
    $done();
}

// 2. 格式化为青龙需要的 备注名@ck 格式
const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

// 3. 获取青龙 Token
$httpClient.get(`${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, (err, resp, data) => {
    if (err) return $notify("康师傅同步失败 ❌", "无法连接青龙", "检查青龙地址或网络");
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch(e) { return $notify("康师傅同步失败 ❌", "Token解析失败", data); }

    // 4. 查询现有环境变量
    $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken } }, (err2, resp2, data2) => {
        if (err2) return $notify("康师傅同步失败 ❌", "查询环境变量失败", err2);
        let envs;
        try { envs = JSON.parse(data2).data; } catch(e) { return $notify("康师傅同步失败 ❌", "环境变量解析失败", data2); }

        const method = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: ENV_NAME, value: formatted, remarks: "Surge自动同步" };
        if (method === "put") payload.id = envs[0].id;

        // 5. 推送到青龙
        $httpClient[method]({ 
            url: `${QL_URL}/open/envs`, 
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }, (err3, resp3, data3) => {
            if (err3 || resp3.status !== 200) {
                $notify("康师傅同步失败 ❌", "推送到青龙出错", err3 || data3);
            } else {
                $notify("康师傅CK同步成功 🎉", `已同步 ${accounts.length} 个账号`, "青龙环境变量已更新");
            }
            $done();
        });
    });
});
