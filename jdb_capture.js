// 加多宝 CK 捕获脚本
const KEY_NAME = "jdb_accounts";
const $ = new Env('捕获_加多宝');
const token = $request.headers['apitoken'] || $request.headers['APITOKEN'];
const unique = $request.headers['unique_identity'] || $request.headers['UNIQUE_IDENTITY'];
if (token && unique) {
  let accounts = $.getjson(KEY_NAME, []);
  if (!Array.isArray(accounts)) accounts = [];
  const exists = accounts.find(a => a.unique === unique);
  if (exists) {
    exists.token = token;
  } else {
    accounts.push({ token: token, unique: unique, remark: `账号${accounts.length + 1}` });
  }
  $.setjson(accounts, KEY_NAME);
}
$.done();
