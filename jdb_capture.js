// 加多宝 抓包（极简版）
const KEY_NAME = "jdb_accounts";
const ck = $request.headers['Authorization'] || $request.headers['authorization'];

if (ck) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    // 直接使用完整 ck 字符串去重
    const existsIndex = accounts.findIndex(a => a.ck === ck);
    
    if (existsIndex !== -1) {
        accounts[existsIndex].ck = ck; // 更新
    } else {
        accounts.push({ ck: ck, remark: `账号${accounts.length + 1}` });
    }
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
}
$done({});
