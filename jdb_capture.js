// Surge版 加多宝CK捕获脚本｜复刻康师傅通知逻辑
const KEY_NAME = "jdb_accounts";
const BARK_KEY = ""; // 填写你的bark密钥，留空则不启用bark

// 复制康师傅的统一通知函数
function sendNotification(title, sub, body) {
    $notification.post(title, sub, body);
    if (BARK_KEY && BARK_KEY.length > 0) {
        const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}?body=${encodeURIComponent(body)}`;
        $httpClient.get(url, err => { if(err) console.log("Bark推送异常:", err); })
    }
}

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
  let tipText = "";
  let remarkText = "";
  if (exists) {
    exists.token = token;
    tipText = `✅ 更新已有账号：${exists.remark}`;
    remarkText = exists.remark;
  } else {
    remarkText = `账号${accounts.length + 1}`;
    accounts.push({ token: token, unique: unique, remark: remarkText });
    tipText = `🎉 捕获新账号：${remarkText}`;
  }

  $persistentStore.write(JSON.stringify(accounts), KEY_NAME);
  console.log(`${tipText}，当前共 ${accounts.length} 个`);

  // 使用康师傅同款通知调用
  sendNotification("加多宝CK捕获", tipText, `账号总数：${accounts.length}`);
}
$done({});
