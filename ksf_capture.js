// 康师傅抓包（远程极简版）
const KEY_NAME = "ksf_accounts";
const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    const exists = accounts.find(a => a.ck === ck);
    
    if (!exists) {
        // 新增账号
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}` });
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        $notify("康师傅抓包成功 🎉", `新增账号: 账号${accounts.length}`, `当前共 ${accounts.length} 个账号`);
    } else if (exists.ck !== ck) {
        // 更新Token
        exists.ck = ck;
        $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
        $notify("康师傅CK更新 🔄", `更新账号: ${exists.remark}`, "Token已刷新");
    }
}
$done({});
