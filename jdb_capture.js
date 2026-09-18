// 加多宝抓包（极简静默版）
const KEY_NAME = "jdb_accounts";
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

if (token && unique) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    const exists = accounts.find(a => a.unique === unique);
    if (exists) {
        exists.token = token;
    } else {
        accounts.push({ token, unique, remark: `账号${accounts.length + 1}` });
    }
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
}
$done({});
