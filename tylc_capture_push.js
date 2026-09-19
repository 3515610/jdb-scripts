// ==========================================
// 统一绿茶 抓包即推送青龙 (终极防重复版)
// ==========================================
const QL_URL = "http://192.168.99.1:5700"; 
const CLIENT_ID = "tGj6_OuEQFme"; 
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; 
const ENV_NAME = "tongyilvcha_zh"; // ⚠️ 必须和你青龙里一致
const KEY_NAME = "tylc_accounts";

// 解析JWT中的唯一标识(sub)用于完美去重
function getJwtSub(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return token;
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload).sub || token;
    } catch(e) {
        return token;
    }
}

const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    
    // 🚀 核心修复：用 JWT 的 sub 字段去重
    const uniqueId = getJwtSub(ck);
    const existsIndex = accounts.findIndex(a => (a.uniqueId === uniqueId) || (a.ck === ck));
    
    if (existsIndex !== -1) {
        // 账号存在，只更新Token，绝不改变remark（备注）
        accounts[existsIndex].ck = ck;
        accounts[existsIndex].uniqueId = uniqueId;
    } else {
        // 新账号
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}`, uniqueId: uniqueId });
    }
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);

    // 推送到青龙
    const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

    $httpClient.get({ 
        url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`, 
        timeout: 5 
    }, function(err, resp, data) {
        if (err || !data) {
            $notify("统一绿茶同步失败 ❌", "连接青龙失败", err || "无响应");
            return $done();
        }
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
                    $notify("统一绿茶CK同步成功 🎉", `当前共 ${accounts.length} 个账号`, `已同步: ${accounts.map(a=>a.remark).join(',')}`);
                } else {
                    $notify("统一绿茶同步失败 ❌", "推送出错", (err3 || "HTTP:" + (resp3 ? resp3.status : "未知")));
                }
                $done();
            });
        });
    });
}
$done({});
