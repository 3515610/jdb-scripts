// Surge版 加多宝CK捕获（带通知测试）
const KEY_NAME = "jdb_accounts";
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

// 🚀 1. 只要脚本运行，立刻发个通知测试
$notification.post("加多宝脚本运行中", "Surge成功拦截请求", "准备抓取账号...");

if (token && unique) {
  let accountsStr = $persistentStore.read(KEY_NAME);
  let accounts = [];
  if (accountsStr) {
    try { accounts = JSON.parse(accountsStr); } catch(e) {}
  }
  if (!Array.isArray(accounts)) accounts = [];

  const exists = accounts.find(a => a.unique === unique);
  let isNew = false;
  let isUpdate = false;

  if (exists) {
    if (exists.token !== token) {
      exists.token = token;
      isUpdate = true;
    }
  } else {
    accounts.push({ token: token, unique: unique, remark: `账号${accounts.length + 1}` });
    isNew = true;
  }

  if (isNew || isUpdate) {
    $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
    // 🚀 2. 成功抓取到账号，再次发通知
    if (isNew) {
      const newAcc = accounts[accounts.length - 1];
      $notification.post("加多宝抓包成功 🎉", `捕获新账号: ${newAcc.remark}`, `当前共 ${accounts.length} 个账号`);
    } else if (isUpdate) {
      $notification.post("加多宝CK更新 🔄", `更新账号: ${exists.remark}`, "Token已刷新");
    }
  }
  console.log(`✅ 成功捕获，当前共 ${accounts.length} 个账号`);
}
$done({});
