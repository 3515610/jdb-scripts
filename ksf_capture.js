// ==========================================
// 康师傅 抓包即同步到青龙｜【并发去重终极版】基于JWT唯一ID锁，解决多条请求重复通知
// ==========================================
const QL_URL = "http://192.168.99.1:5700";
const CLIENT_ID = "tGj6_OuEQFme";
const CLIENT_SECRET = "mvz-zcTL3FAWsTEDCikXvD_M";
const ENV_NAME = "kangshifu_zh";
const KEY_NAME = "ksf_accounts";
const BARK_KEY = ""; //留空不启用Bark

let notifyTitle = "";
let notifySubtitle = "";
let notifyBody = "";

// 统一通知入口
function sendNotification(title, sub, body) {
    $notification.post(title, sub, body);
    if (BARK_KEY && BARK_KEY.length > 0) {
        const url = `https://api.day.app/${BARK_KEY}/${encodeURIComponent(title)}?body=${encodeURIComponent(body)}`;
        $httpClient.get(url, err => {
            if(err) console.log("Bark推送异常:", err);
        })
    }
}

const ck = $request.headers['Authorization'] || $request.headers['authorization'];
if (!ck) return $done();

console.log("捕获Authorization，前缀：" + ck.substring(0,30));

// 解析JWT拿到用户唯一ID
let uniqueId = null;
try {
    const base64Url = ck.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).charCodeAt(0).toString(16)).slice(-2)).join(''));
    const payload = JSON.parse(jsonPayload);
    if(payload.id) uniqueId = payload.id.toString();
} catch(e) {
    console.log("JWT解析失败：" + e.message);
}
if(!uniqueId) uniqueId = ck;

// 【核心】按用户uniqueId做30秒防并发锁，同一个用户30秒内只处理一次
const lockKey = `lock_${uniqueId}`;
const lastTime = parseInt($persistentStore.read(lockKey) || "0");
const now = Math.floor(Date.now()/1000);
const lockDuration = 30;

if(now - lastTime < lockDuration){
    console.log(`用户ID:${uniqueId} 30秒内已经处理过，跳过本次同步与通知`);
    return $done();
}
// 写入锁，标记已处理
$persistentStore.write(lockKey, now.toString());

// 读取账号列表
let accounts = JSON.parse($persistentStore.read(KEY_NAME) || "[]");
const existsIndex = accounts.findIndex(item => item.uniqueId === uniqueId);
const exists = existsIndex >=0 ? accounts[existsIndex] : null;

// 判断：账号存在并且CK没有更新，直接结束
if(exists && exists.ck === ck){
    console.log(`用户ID:${uniqueId} CK未更新，跳过同步`);
    return $done();
}

// 更新或新增账号
if(exists){
    accounts[existsIndex].ck = ck;
    console.log(`更新已有账号:${exists.remark}`);
}else{
    const newRemark = `账号${accounts.length+1}`;
    accounts.push({ck:ck, remark:newRemark, uniqueId:uniqueId});
    console.log(`新增账号:${newRemark}`);
}
$persistentStore.write(JSON.stringify(accounts), KEY_NAME);

const formatted = accounts.map(a => `${a.remark}@${a.ck}`).join("\n");

// 青龙API同步流程
$httpClient.get({url:`${QL_URL}/open/auth/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,timeout:5},function(err,resp,data){
    if(err || !data){
        notifyTitle = "❌ CK同步青龙失败";
        notifySubtitle = "获取青龙token失败";
        notifyBody = err||"返回空";
        sendNotification(notifyTitle,notifySubtitle,notifyBody);
        return $done();
    }
    let qlToken;
    try{qlToken = JSON.parse(data).data.token;}catch(e){
        notifyTitle = "❌ CK同步青龙失败";
        notifySubtitle = "解析青龙token出错";
        notifyBody = e.message;
        sendNotification(notifyTitle,notifySubtitle,notifyBody);
        return $done();
    }

    $httpClient.get({url:`${QL_URL}/open/envs?searchValue=${ENV_NAME}`,headers:{"Authorization":"Bearer "+qlToken},timeout:5},function(err2,resp2,data2){
        if(err2||!data2){
            notifyTitle = "❌ CK同步青龙失败";
            notifySubtitle = "查询环境变量失败";
            notifyBody = err2||"返回空";
            sendNotification(notifyTitle,notifySubtitle,notifyBody);
            return $done();
        }
        let envs;
        try{envs = JSON.parse(data2).data;}catch(e){
            notifyTitle = "❌ CK同步青龙失败";
            notifySubtitle = "解析环境变量失败";
            notifyBody = e.message;
            sendNotification(notifyTitle,notifySubtitle,notifyBody);
            return $done();
        }

        const method = envs && envs.length>0 ? "put" : "post";
        const payload = {name:ENV_NAME,value:formatted,remarks:"Surge抓包同步"};
        if(method==="put") payload.id = envs[0].id;

        $httpClient[method]({
            url:`${QL_URL}/open/envs`,
            headers:{"Authorization":"Bearer "+qlToken,"Content-Type":"application/json"},
            body:JSON.stringify(payload),
            timeout:5
        },function(err3,resp3,data3){
            if(!err3 && resp3 && resp3.status===200){
                const accRemark = exists ? exists.remark : accounts[accounts.length-1].remark;
                notifyTitle = "康师傅CK同步成功 🎉";
                notifySubtitle = `已更新账号:${accRemark}`;
                notifyBody = `当前共 ${accounts.length} 个账号`;
            }else{
                notifyTitle = "❌ CK同步青龙失败";
                notifySubtitle = "更新环境变量异常";
                notifyBody = `err:${err3}, status:${resp3?.status||'无'}`;
            }
            sendNotification(notifyTitle,notifySubtitle,notifyBody);
            $done();
        })
    })
})
