// ==========================================
// 加多宝 BoxJs 主动推送到青龙 (完美版)
// 作者：@你的名字
// ==========================================

const QL_URL = $prefs.valueForKey("JDB_QL_URL") || "http://192.168.99.1:5700";
const CLIENT_ID = $prefs.valueForKey("JDB_CLIENT_ID");
const CLIENT_SECRET = $prefs.valueForKey("JDB_CLIENT_SECRET");
const ENV_NAME = $prefs.valueForKey("JDB_ENV_NAME") || "JDBC_ACCOUNTS";

// 读取 BoxJs 中抓取到的账号数据
const accountsStr = $prefs.valueForKey("jdb_accounts");
if (!accountsStr) {
    $notify("加多宝同步失败 ❌", "没有读取到账号数据", "请先去小程序触发抓包");
    $done();
}

let accounts = [];
try {
    accounts = JSON.parse(accountsStr);
} catch(e) {}

if (!Array.isArray(accounts) || accounts.length === 0) {
    $notify("加多宝同步失败 ❌", "账号数据为空", "请确认是否已抓包");
    $done();
}

// 格式化为青龙需要的 多行 token,unique,remark 格式
const formatted = accounts.map(a => `${a.token},${a.unique},${a.remark}`).join("\n");

// 1. 获取青龙 Token
$httpClient.get(`${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, (err, resp, data) => {
    if (err || resp.status !== 200) {
        $notify("加多宝同步失败 ❌", "无法连接青龙", "请检查青龙地址是否正确");
        return $done();
    }
    let qlToken;
    try { qlToken = JSON.parse(data).data.token; } catch(e) {
        $notify("加多宝同步失败 ❌", "Token解析失败", data);
        return $done();
    }

    // 2. 查询现有的环境变量
    $httpClient.get({ url: `${QL_URL}/open/envs?searchValue=${ENV_NAME}`, headers: { "Authorization": "Bearer " + qlToken } }, (err2, resp2, data2) => {
        if (err2) {
            $notify("加多宝同步失败 ❌", "查询环境变量失败", err2);
            return $done();
        }
        let envs;
        try { envs = JSON.parse(data2).data; } catch(e) {
            $notify("加多宝同步失败 ❌", "环境变量解析失败", data2);
            return $done();
        }

        const method = envs && envs.length > 0 ? "put" : "post";
        const payload = { name: ENV_NAME, value: formatted, remarks: "BoxJs自动同步" };
        if (method === "put") payload.id = envs[0].id;

        // 3. 推送更新到青龙
        $httpClient[method]({ 
            url: `${QL_URL}/open/envs`, 
            headers: { "Authorization": "Bearer " + qlToken, "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }, (err3, resp3, data3) => {
            if (err3 || resp3.status !== 200) {
                $notify("加多宝同步失败 ❌", "推送到青龙出错", err3 || data3);
            } else {
                // 🎉 推送成功，发出系统级通知！
                $notify("加多宝CK同步成功 🎉", `已同步 ${accounts.length} 个账号`, "青龙环境变量已更新");
            }
            $done();
        });
    });
});
