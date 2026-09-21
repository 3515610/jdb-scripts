// Surge版 加多宝CK捕获脚本｜加通知 + 30秒冷却锁（优化防频繁执行，缓解小程序卡顿）
const KEY_NAME = "jdb_accounts";
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

if (token && unique) {
  // 冷却锁：同一个账号30秒内只执行一次，避免多条接口并发重复跑脚本
  const lockKey = `jdb_lock_${unique}`;
  const lastExecTime = parseInt($persistentStore.read(lockKey) || "0");
  const now = Math.floor(Date.now() / 1000);
  const coolSeconds = 30;

  if (now - lastExecTime < coolSeconds) {
    console.log(`加多宝：账号冷却中，跳过本次`);
    $done({});
    return;
  }
  $persistentStore.write(lockKey, now.toString());

  let accountsStr = $persistentStore.read(KEY_NAME);
  let accounts = [];
  if (accountsStr) {
    try {
      accounts = JSON.parse(accountsStr);
    } catch (e) {
      accounts = [];
    }
  }
  if (!Array.isArray(accounts)) accounts = [];

  const exists = accounts.find(a => a.unique === unique);
  let notifyTitle, notifyBody;
  if (exists) {
    exists.token = token;
    notifyTitle = "加多宝｜账号Token更新";
    notifyBody = `账号数：${accounts.length}`;
  } else {
    accounts.push({ token: token, unique: unique, remark: `账号${accounts.length + 1}` });
    notifyTitle = "加多宝｜捕获新账号";
    notifyBody = `账号数：${accounts.length}`;
  }

  $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
  console.log(`✅ 成功捕获/更新账号，当前共 ${accounts.length} 个`);
  // Surge弹窗通知
  $notification.post(notifyTitle, notifyBody, "");
}
$done({});
