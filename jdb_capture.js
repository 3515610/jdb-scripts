// Surge版 加多宝CK捕获脚本 http-request 兼容版
const KEY_NAME = "jdb_accounts";
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

console.log("🔍 加多宝捕获脚本触发");
console.log(`token=${token}, unique=${unique}`);

if (token && unique) {
  let accountsStr = $persistentStore.read(KEY_NAME);
  let accounts = [];
  if (accountsStr) {
    try { accounts = JSON.parse(accountsStr); } catch(e) {
      console.log("❌ 解析存储失败", e);
    }
  }
  if (!Array.isArray(accounts)) accounts = [];

  const exists = accounts.find(a => a.unique === unique);
  let tipText = "";
  if (exists) {
    exists.token = token;
    tipText = `✅ 更新已有账号：${exists.remark}`;
  } else {
    const newRemark = `账号${accounts.length + 1}`;
    accounts.push({ token: token, unique: unique, remark: newRemark });
    tipText = `🎉 捕获新账号：${newRemark}`;
  }

  $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
  console.log(`${tipText}，当前共 ${accounts.length} 个账号`);
  // 移除第四个sound参数，只用基础三参数，http-request兼容性更好
  $notification.post("加多宝CK捕获", tipText, `账号总数：${accounts.length}`);
}
$done({});
