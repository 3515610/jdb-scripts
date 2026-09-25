/**
 * 勇闯天涯 抓CK同步青龙
 * Surge http-request 脚本
 * 从模块 arguments 读取配置，抓取 Authorization 并同步到青龙面板
 */

const $ = new Env("勇闯天涯_CK");

// ==================== 读取模块 arguments 配置 ====================
// Surge 模块 arguments 通过 $argument 传入
// 格式：青龙地址,青龙ClientID,青龙ClientSecret,环境变量名,BarkKey,PushPlusToken
const argStr = typeof $argument !== "undefined" ? $argument : "";
const argParts = argStr.split(",").map((s) => s.trim());

const QL_URL = argParts[0] || "";              // 青龙地址
const QL_CLIENT_ID = argParts[1] || "";        // 青龙 OpenApi 用户名
const QL_CLIENT_SECRET = argParts[2] || "";    // 青龙 OpenApi 密钥
const ENV_NAME = argParts[3] || "CRB_ACCOUNTS";// 环境变量名
const BARK_KEY = argParts[4] || "";            // Bark 推送 Key
const PUSHPLUS_TOKEN = argParts[5] || "";      // PushPlus Token

// ==================== 主逻辑 ====================

(async () => {
  // 1. 提取 Authorization
  const auth =
    $request.headers["Authorization"] ||
    $request.headers["authorization"] ||
    "";

  if (!auth || auth.length < 10) {
    console.log("未找到有效 Authorization，放行");
    $done({});
    return;
  }

  // 2. 判断是否和上次抓到的相同（持久化去重）
  const storedCK = $.getdata("crb_ck") || "";
  if (storedCK === auth) {
    console.log("CK 未变化，跳过同步");
    $done({});
    return;
  }

  // 3. 保存新 CK
  $.setdata(auth, "crb_ck");
  console.log("发现新 CK：" + auth.substring(0, 30) + "...");

  // 4. 生成备注名
  const remark = getRemark();
  const envValue = remark + "@" + auth;

  // 5. 同步青龙
  try {
    const result = await syncToQinglong(envValue, auth);
    if (result.success) {
      const title = "✅ 勇闯天涯 CK 获取成功";
      const content = `备注：${remark}\n状态：${result.message}`;
      $.msg(title, content);
      sendNotification(title, content);
    } else {
      const title = "⚠️ 勇闯天涯 同步青龙失败";
      const content = `备注：${remark}\n原因：${result.message}`;
      $.msg(title, content);
      sendNotification(title, content);
    }
  } catch (e) {
    console.log("同步异常：" + e);
    $.msg("❌ 勇闯天涯 CK 处理异常", String(e));
  }

  $done({});
})();

// ==================== 辅助函数 ====================

/**
 * 生成备注名
 * 优先从请求头读取昵称，否则用时间戳
 */
function getRemark() {
  const headers = $request.headers;
  const nick =
    headers["X-User-Nickname"] ||
    headers["nickName"] ||
    headers["nickname"] ||
    "";
  if (nick) {
    try {
      return decodeURIComponent(nick);
    } catch (e) {
      return nick;
    }
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `账号_${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}

/**
 * 同步环境变量到青龙面板
 */
async function syncToQinglong(envValue, auth) {
  if (!QL_URL || !QL_CLIENT_ID || !QL_CLIENT_SECRET) {
    return { success: false, message: "青龙配置不完整，请在模块参数中填写" };
  }

  try {
    // ---- 1. 登录获取 Token ----
    const loginResp = await $.http.post({
      url: `${QL_URL}/api/user/login`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: QL_CLIENT_ID,
        password: QL_CLIENT_SECRET,
      }),
    });

    let loginData;
    try {
      loginData = JSON.parse(loginResp.body);
    } catch (e) {
      return { success: false, message: "登录响应解析失败" };
    }

    if (!loginData.data || !loginData.data.token) {
      return {
        success: false,
        message: "登录失败：" + (loginData.message || loginResp.body),
      };
    }
    const token = loginData.data.token;

    // ---- 2. 查询现有环境变量 ----
    const searchResp = await $.http.get({
      url: `${QL_URL}/api/envs?searchValue=${ENV_NAME}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    let searchData;
    try {
      searchData = JSON.parse(searchResp.body);
    } catch (e) {
      return { success: false, message: "查询环境变量响应解析失败" };
    }

    const envList = (searchData.data || []).filter((e) => e.name === ENV_NAME);

    // ---- 3. 判断 CK 是否已存在 ----
    let mergedValue = "";
    let alreadyExist = false;

    if (envList.length > 0) {
      // 合并所有同名变量的 value
      const allLines = [];
      for (const env of envList) {
        const lines = String(env.value || "").split("\n");
        for (const l of lines) {
          if (l.trim()) allLines.push(l.trim());
        }
      }

      // 判断 auth 是否已存在
      for (const line of allLines) {
        if (line.indexOf(auth) >= 0) {
          alreadyExist = true;
          break;
        }
      }

      if (alreadyExist) {
        return { success: true, message: "该 CK 已存在，跳过" };
      }

      // 追加新值
      mergedValue = allLines.join("\n") + "\n" + envValue;

      // ---- 4a. 更新第一个变量，删除多余的 ----
      const firstEnv = envList[0];
      const updateResp = await $.http.put({
        url: `${QL_URL}/api/envs`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: firstEnv.id,
          name: ENV_NAME,
          value: mergedValue,
          remarks: "勇闯天涯 CK（Surge 自动抓取）",
        }),
      });

      const updateData = JSON.parse(updateResp.body);
      if (updateData.code !== 200) {
        return {
          success: false,
          message: "更新失败：" + (updateData.message || updateResp.body),
        };
      }

      // 删除多余的同名变量
      const extraIds = envList.slice(1).map((e) => e.id);
      if (extraIds.length > 0) {
        await $.http.put({
          url: `${QL_URL}/api/envs`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(extraIds),
        });
      }

      return {
        success: true,
        message: `已追加（当前共 ${mergedValue.split("\n").length} 个账号）`,
      };
    } else {
      // ---- 4b. 创建新变量 ----
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
      if (createData.code !== 200) {
        return {
          success: false,
          message: "创建失败：" + (createData.message || createResp.body),
        };
      }

      return { success: true, message: "已创建新环境变量" };
    }
  } catch (e) {
    return { success: false, message: "请求异常：" + e };
  }
}

/**
 * 外部通知推送（Bark / PushPlus）
 */
function sendNotification(title, content) {
  // Bark
  if (BARK_KEY) {
    const barkUrl = BARK_KEY.startsWith("http")
      ? BARK_KEY
      : `https://api.day.app/${BARK_KEY}`;
    $.http
      .post({
        url: barkUrl,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title,
          body: content,
          sound: "alarm",
        }),
      })
      .then((resp) => console.log("Bark 推送完成，状态：" + resp.status))
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
      .then((resp) => console.log("PushPlus 推送完成：" + resp.body))
      .catch((e) => console.log("PushPlus 推送异常：" + e));
  }
}

// ==================== Env 工具类 ====================
function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.isSurge =
        typeof $httpClient !== "undefined" && typeof $persistentStore !== "undefined";
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
      console.log(`[通知] ${title} - ${content}`);
    }

    http = {
      get: (options) =>
        new Promise((resolve, reject) => {
          const opt = Object.assign({}, options);
          if (this.isSurge || this.isLoon) {
            $httpClient.get(opt, (err, resp, data) => {
              if (err) reject(err);
              else resolve({ status: resp.status, headers: resp.headers, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) =>
                resolve({
                  status: resp.statusCode,
                  headers: resp.headers,
                  body: resp.body,
                }),
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
              else resolve({ status: resp.status, headers: resp.headers, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) =>
                resolve({
                  status: resp.statusCode,
                  headers: resp.headers,
                  body: resp.body,
                }),
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
              else resolve({ status: resp.status, headers: resp.headers, body: data });
            });
          } else if (this.isQuanX) {
            $task.fetch(opt).then(
              (resp) =>
                resolve({
                  status: resp.statusCode,
                  headers: resp.headers,
                  body: resp.body,
                }),
              (err) => reject(err)
            );
          }
        }),
    };
  })();
}
