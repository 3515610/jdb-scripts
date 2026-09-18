// ==========================================
// 加多宝 BoxJs 同步到青龙 (远程 Cron 版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700";
const CLIENT_ID = "tGj6_OuEQFme";
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";

let accounts = JSON.parse($persistentStore.read("jdb_accounts") || "[]");

if (accounts.length === 0) {
    $notify("加多宝同步检查", "本地存储为空", "请去小程序点几下触发抓包");
    $done();
}

const formatted = accounts.map(a => `${a.token},${a.unique},${a.remark}`).join("\n");

$httpClient.get(`${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, (err, resp, data) => {
    if (err) return $notify("加多宝同步失败 ❌", "无法连接青龙", "检查青龙地址或网络");
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch(e) { return $notify("加多宝同步失败 ❌", "Token解析失败", data); }

    $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=JDBC_ACCOUNTS`, headers: { "Authorization": "Bearer " + qlToken } }, (err2, resp2, data2) => {
        if (err2) return $notify("加多宝同步失败 ❌", "查询环境变量失败", err2);
        let envs;
        try { envs = JSON.parse(data2).data; } catch(e) { return $notify("加多宝同步失败 ❌", "环境变量解析失败", data2); }

        const method = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: "JDBC_ACCOUNTS", value: formatted, remarks: "Surge自动同步" };
        if (method === "put") payload.id = envs[0].id;

        $httpClient[method]({ 
            url: `${QL_URL}/open/envs`, 
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }, (err3, resp3, data3) => {
            if (err3 || resp3.status !== 200) {
                $notify("加多宝同步失败 ❌", "推送到青龙出错", err3 || data3);
            } else {
                $notify("加多宝CK同步成功 🎉", `已同步 ${accounts.length} 个账号`, "青龙环境变量已更新");
            }
            $done();
        });
    });
});
