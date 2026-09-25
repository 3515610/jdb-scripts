/**
 * 勇闯天涯 抓CK同步青龙
 * Surge http-request 脚本
 * 用于抓取雪花勇闯天涯小程序的 Authorization 并同步到青龙面板
 */

// ==================== 用户配置区 ====================

// 青龙面板配置
const QL_URL = "http://你的青龙IP:5700";       // 青龙面板地址，不要带末尾斜杠
const QL_CLIENT_ID = "你的OpenApi用户名";       // 青龙 OpenApi 用户名（通常为 admin）
const QL_CLIENT_SECRET = "你的OpenApi密钥";     // 青龙 OpenApi 密钥
const ENV_NAME = "CRB_ACCOUNTS";                // 环境变量名称，与 Python 脚本中的一致

// 通知配置（可留空不填）
const BARK_KEY = "";              // Bark 推送 Key，留空不推送
const PUSHPLUS_TOKEN = "";        // PushPlus Token，留空不推送

// ==================== 配置区结束 ====================

const $ = new Env("勇闯天涯_CK");

// 获取请求头中的 Authorization（即 CK）
const auth = $request.headers["Authorization"] || $request.headers["authorization"] || "";

if (!auth) {
  // 没有 Authorization，直接放行
  $done({});
} else {
  // 使用持久化存储避免重复抓取同一个 CK
  const storedCK = $.getdata("crb_ck") || "";

  if (storedCK === auth) {
    // CK 未变化，跳过同步
    console.log("CK 未变化，跳过同步");
    $done({});
  } else {
    // 新 CK，保存并同步
    $.setdata(auth, "crb_ck");

    // 备注名：从请求头中尝试获取昵称，若无则使用时间戳
    const remark = getRemark();

    // 组装环境变量值，格式：备注名@ck
    const envValue = remark + "@" + auth;

    // 同步到青龙
    syncToQinglong(envValue).then((result) => {
      if (result) {
        $.msg(
          "✅ 勇闯天涯 CK 获取成功",
          `备注：${remark}\nCK：${auth.substring(0, 30)}...\n已同步至青龙面板`
        );
        sendNotification("✅ 勇闯天涯 CK 获取成功", `备注：${remark}\n已同步至青龙面板`);
      } else {
        $.msg("⚠️ 勇闯天涯 CK 已获取，但同步青龙失败", `CK：${auth.substring(0, 30)}...\n请检查青龙配置`);
        sendNotification("⚠️ 勇闯天涯 同步失败", `CK 已抓取但同步青龙失败`);
      }
      $done({});
    });
  }
}

// ==================== 辅助函数 ====================

/**
 * 尝试从请求头中提取备注名
 */
function getRemark() {
  // 雪花勇闯天涯的请求头中可能包含用户信息
  const headers = $request.headers;
  // 尝试从常见字段获取
  const nickName =
    headers["X-User-Nickname"] ||
    headers["nickName"] ||
    headers["nickname"] ||
    "";

  if (nickName) {
    return decodeURIComponent(nickName);
  }

  // 无昵称时，用时间戳作为备注名
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `账号_${mm}${dd}${hh}${mi}`;
}

/**
 * 同步环境变量到青龙面板
 */
async function syncToQinglong(envValue) {
  if (!QL_URL || !QL_CLIENT_ID || !QL_CLIENT_SECRET) {
    console.log("青龙配置不完整，跳过同步");
    return false;
  }

  try {
    // 1. 获取 Token
    const tokenResp = await $.http.get({
      url: `${QL_URL}/api/user/login`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: QL_CLIENT_ID,
        password: QL_CLIENT_SECRET,
      }),
    });

    const tokenData = JSON.parse(tokenResp.body);
    if (!tokenData.data || !tokenData.data.token) {
      console.log("青龙登录失败：", tokenResp.body);
      return false;
    }
    const token = tokenData.data.token;

    // 2. 获取现有环境变量
    const envResp = await $.http.get({
      url: `${QL_URL}/api/envs?searchValue=${ENV_NAME}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const envData = JSON.parse(envResp.body);
    let existingEnvs = envData.data || [];

    // 3. 判断是否已存在该 CK 的环境变量
    let found = false;
    for (const env of existingEnvs) {
      if (env.name === ENV_NAME && env.value === envValue) {
        found = true;
        break;
      }
    }

    if (found) {
      console.log("该 CK 已存在于青龙中，跳过");
      return true;
    }

    // 4. 追加新环境变量
    // 如果已有同名变量，需要合并（多账号）
    let newValue = envValue;
    const existingSameName = existingEnvs.filter((e) => e.name === ENV_NAME);

    if (existingSameName.length > 0) {
      // 取第一个的值，追加新 CK
      newValue = existingSameName[0].value + "\n" + envValue;

      // 更新
      const updateResp = await $.http.put({
        url: `${QL_URL}/api/envs`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: existingSameName[0].id,
          name: ENV_NAME,
          value: newValue,
        }),
      });

      const updateData = JSON.parse(updateResp.body);
      console.log("更新环境变量结果：", updateResp.body);
      return updateData.code === 200;
    } else {
      // 创建新变量
      const createResp = await $.http.post({
        url: `${QL_URL}/api/envs`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: ENV_NAME,
          value: envValue,
          remarks: "勇闯天涯 CK（Surge 自动抓取）",
        }),
      });

      const createData = JSON.parse(createResp.body);
      console.log("创建环境变量结果：", createResp.body);
      return createData.code === 200;
    }
  } catch (e) {
    console.log("同步青龙异常：", e);
    return false;
  }
}

/**
 * 发送通知（Bark / PushPlus）
 */
function sendNotification(title, content) {
  // Bark
  if (BARK_KEY) {
    $.http
      .post({
        url: `https://api.day.app/${BARK_KEY}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title,
          body: content,
          sound: "alarm",
        }),
      })
      .then((resp) => {
        console.log("Bark 推送：" + (resp.status === 200 ? "成功" : "失败"));
      })
      .catch((e) => console.log("Bark 推送异常：" + e));
  }

  // PushPlus
  if (PUSHPLUS_TOKEN) {
    $.http
      .post({
        url: "http://www.pushplus.plus/send",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: PUSHPLUS_TOKEN,
          title: title,
          content: content.replace(/\n/g, "<br>"),
          template: "html",
        }),
      })
      .then((resp) => {
        const data = JSON.parse(resp.body);
        console.log("PushPlus 推送：" + (data.code === 200 ? "成功" : "失败"));
      })
      .catch((e) => console.log("PushPlus 推送异常：" + e));
  }
}

// ==================== Env 工具类 ====================
function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.isSurge = typeof $httpClient !== "undefined";
      this.isQuanX = typeof $task !== "undefined";
      this.isLoon = typeof $loon !== "undefined";
    }
    getdata(key) {
      if (this.isSurge || this.isLoon) return $persistentStore.read(key);
      if (this.isQuanX) return $prefs.valueForKey(key);
    }
    setdata(value, key) {
      if (this.isSurge || this.isLoon) return $persistentStore.write(value, key);
      if (this.isQuanX) return $prefs.setValueForKey(value, key);
    }
    msg(title, content) {
      if (this.isSurge) $notification.post(title, "", content);
      if (this.isQuanX) $notify(title, "", content);
      if (this.isLoon) $notification.post(title, "", content);
    }
    http = {
      get: (options) =>
        new Promise((resolve, reject) => {
          const opt = Object.assign({}, options);
          if (this.isSurge || this.isLoon) {
            $httpClient.get(opt, (err, resp, data) => {
              if (err) reject(err);
              else resolve({ status: resp.status, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) => resolve({ status: resp.statusCode, body: resp.body }),
              (err) => reject(err)
            );
          }
        }),
      post: (options) =>
        new Promise((resolve, reject) => {
          const opt = Object.assign({}, options);
          if (this.isSurge || this.isLoon) {
            $httpClient.post(opt, (err, resp, data) => {
              if (err) reject(err);
              else resolve({ status: resp.status, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) => resolve({ status: resp.statusCode, body: resp.body }),
              (err) => reject(err)
            );
          }
        }),
      put: (options) =>
        new Promise((resolve, reject) => {
          const opt = Object.assign({}, options, { method: "PUT" });
          if (this.isSurge || this.isLoon) {
            $httpClient.put(opt, (err, resp, data) => {
              if (err) reject(err);
              else resolve({ status: resp.status, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) => resolve({ status: resp.statusCode, body: resp.body }),
              (err) => reject(err)
            );
          }
        }),
    };
  })();
}

// 执行
$done({});
