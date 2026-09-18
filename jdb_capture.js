// Surge版 加多宝CK捕获脚本
const KEY_NAME = "jdb_accounts";
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

if (token && unique) {
  let accountsStr = $persistentStore.read(KEY_NAME);
  let accounts = [];
  if (accountsStr) {
    try { accounts = JSON.parse(accountsStr); } catch(e) {}
  }
  if (!Array.isArray(accounts)) accounts = [];

  const exists = accounts.find(a => a.unique === unique);
  if (exists) {
    exists.token = token;
  } else {
    accounts.push({ token: token, unique: unique, remark: `账号${accounts.length + 1}` });
  }

  $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
  
  // 🚀 强制发送通知，方便你测试
  $notification.post("加多宝抓包通知测试", "脚本已成功执行！", `当前共 ${accounts.length} 个账号，Token: ${token.slice(0, 10)}...`);
  
  console.log(`✅ 成功捕获/更新账号，当前共 ${accounts.length} 个`);
}
$done({});
