// 加多宝 纯抓包（极简版，绝不卡顿）
const KEY_NAME = "jdb_accounts";
const apitoken = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

if (apitoken && unique) {
    let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
    const exists = accounts.find(a => a.unique === unique);
    
    if (exists) {
        exists.token = apitoken;
    } else {
        accounts.push({ token: apitoken, unique: unique, remark: `账号${accounts.length + 1}` });
    }
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
}
$done({});
