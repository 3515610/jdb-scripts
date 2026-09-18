// 康师傅抓包（终极去重版，基于JWT内部ID）
const KEY_NAME = "ksf_accounts";
const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let uniqueId = ck; // 默认用整串token作为唯一ID
    // 尝试从 JWT 中提取稳定的 ID (id 或 crmId)
    try {
        const base64Url = ck.replace("Bearer ", "").split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        if (payload.id) {
            uniqueId = payload.id.toString(); // 优先使用 id
        } else if (payload.crmId) {
            uniqueId = payload.crmId.toString(); // 其次使用 crmId
        }
    } catch(e) {
        // 如果解析失败，保留使用 ck 完整串去重
    }

    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    
    // 根据 uniqueId 查找已存在的账号
    const existsIndex = accounts.findIndex(a => a.uniqueId === uniqueId || a.ck === ck);
    
    if (existsIndex !== -1) {
        // 账号已存在，仅更新 token 和 uniqueId
        if (accounts[existsIndex].ck !== ck) {
            accounts[existsIndex].ck = ck;
            accounts[existsIndex].uniqueId = uniqueId;
            $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
            $notify("康师傅CK更新 🔄", `更新账号: ${accounts[existsIndex].remark}`, "Token已刷新");
        }
    } else {
        // 全新账号
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}`, uniqueId: uniqueId });
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        $notify("康师傅抓包成功 🎉", `新增账号: 账号${accounts.length}`, `当前共 ${accounts.length} 个账号`);
    }
}
$done({});
