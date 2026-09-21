// Surge 加多宝抓包 + 自动同步青龙 + Surge通知，带并发锁
const KEY_NAME = "jdb_accounts";
const QL_URL = "http://192.168.99.1:5700"; // 替换成你N1青龙地址
const CLIENT_ID = "tGj6_OuEQFme";         // 替换青龙open client_id
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M"; //青龙secret
const QL_ENV_NAME = "jdb_token"; //青龙环境变量名称，加多宝脚本读取这个变量

const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];

// 没有抓到凭证直接退出
if (!token || !unique) {
  $done({});
  return;
}
console.log(`捕获加多宝 unique:${unique}, token前缀:${token.substring(0,20)}`);

// ===== 并发锁，防止小程序多条请求重复执行 =====
const lockKey = `jdb_lock_${unique}`;
const lastRun = parseInt($persistentStore.read(lockKey) || "0");
const now = Math.floor(Date.now() / 1000);
const lockTime = 30; //30秒冷却
if (now - lastRun < lockTime) {
  console.log(`加多宝账号${unique} 30秒内已处理，跳过`);
  $done({});
  return;
}
$persistentStore.write(lockKey, now.toString());

// 读取账号列表
let accountsStr = $persistentStore.read(KEY_NAME);
let accounts = [];
if (accountsStr) {
  try { accounts = JSON.parse(accountsStr); } catch (e) { accounts = []; }
}
if (!Array.isArray(accounts)) accounts = [];

// 更新/新增账号
const existsIndex = accounts.findIndex(a => a.unique === unique);
if (existsIndex > -1) {
  accounts[existsIndex].token = token;
  console.log(`✅ 更新加多宝账号：${accounts[existsIndex].remark}`);
} else {
  const newRemark = `账号${accounts.length + 1}`;
  accounts.push({ token: token, unique: unique, remark: newRemark });
  console.log(`✅ 新增加多宝账号：${newRemark}`);
}
$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

// 组装成青龙环境变量内容，格式：账号1@token1\n账号2@token2
const qlValue = accounts.map(item => `${item.remark}@${item.token}`).join("\n");

// ========== 青龙API同步 ==========
$httpClient.get({
  url: `${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
  timeout: 4
}, function (err, resp, data) {
  if (err || !data) {
    $notification.post("加多宝同步❌", "获取青龙Token失败", `${err}`);
    $done({});
    return;
  }
  let qlToken;
  try {
    qlToken = JSON.parse(data).data.token;
  } catch (e) {
    $notification.post("加多宝同步❌", "解析青龙Token失败", e.message);
    $done({});
    return;
  }

  // 查询环境变量
  $httpClient.get({
    url: `${QL_URL}/open/envs?searchValue=${QL_ENV_NAME}`,
    headers: { "Authorization": "Bearer " + qlToken },
    timeout: 4
  }, function (err2, resp2, data2) {
    if (err2 || !data2) {
      $notification.post("加多宝同步❌", "查询青龙环境变量失败", `${err2}`);
      $done({});
      return;
    }
    let envList;
    try {
      envList = JSON.parse(data2).data;
    } catch (e) {
      $notification.post("加多宝同步❌", "解析环境变量返回失败", e.message);
      $done({});
      return;
    }

    const method = envList && envList.length > 0 ? "put" : "post";
    const payload = {
      name: QL_ENV_NAME,
      value: qlValue,
      remarks: "Surge抓包自动同步加多宝token"
    };
    if (method === "put") payload.id = envList[0].id;

    $httpClient[method]({
      url: `${QL_URL}/open/envs`,
      headers: {
        "Authorization": "Bearer " + qlToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      timeout: 4
    }, function (err3, resp3, data3) {
      if (!err3 && resp3.status === 200) {
        $notification.post("加多宝同步✅", `共${accounts.length}个账号`, "Token已写入青龙");
      } else {
        $notification.post("加多宝同步❌", "更新环境变量失败", `err:${err3},status:${resp3?.status}`);
      }
      $done({});
    })
  })
})
