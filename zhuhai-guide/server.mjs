import http from "node:http";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8766);
const DEEPSEEK_API_KEY = loadEnv().DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

function loadEnv() {
  const env = {};
  try {
    const text = readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // .env 不存在时，尝试使用系统环境变量
  }
  return env;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/generate" && req.method === "POST") {
      await handleGenerate(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "服务器内部错误" });
  }
});

async function handleGenerate(req, res) {
  if (!DEEPSEEK_API_KEY) {
    sendJson(res, 500, { error: "未配置 DEEPSEEK_API_KEY，请在 .env 中填写。" });
    return;
  }

  const raw = await readBody(req);
  let city = "";
  try {
    city = String(JSON.parse(raw || "{}").city || "").trim();
  } catch {
    city = "";
  }

  if (!city) {
    sendJson(res, 400, { error: "请传入城市名称。" });
    return;
  }

  const prompt = buildPrompt(city);

  let upstream;
  try {
    upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.35,
        response_format: { type: "json_object" },
        max_tokens: 12000
      })
    });
  } catch (error) {
    sendJson(res, 502, { error: "调用 DeepSeek 失败，请检查网络或稍后重试。" });
    return;
  }

  const upstreamBody = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const message =
      upstreamBody.error && upstreamBody.error.message
        ? upstreamBody.error.message
        : "DeepSeek 返回错误。";
    sendJson(res, upstream.status || 502, { error: message });
    return;
  }

  const content =
    upstreamBody.choices &&
    upstreamBody.choices[0] &&
    upstreamBody.choices[0].message &&
    upstreamBody.choices[0].message.content;

  if (!content) {
    sendJson(res, 502, { error: "DeepSeek 未返回内容，请重试。" });
    return;
  }

  const parsed = parseJson(content);
  if (!parsed) {
    sendJson(res, 502, { error: "DeepSeek 返回的内容不是有效 JSON，请重试。" });
    return;
  }

  sendJson(res, 200, normalize(parsed, city));
}

function buildPrompt(city) {
  return `请为城市“${city}”生成一份第一次去也适用的保姆级旅游攻略。

要求：
1. 只返回一个 JSON 对象，不要 Markdown，不要解释。
2. 语言为简体中文。
3. 内容要务实，重点写清楚：少踩坑、先去哪、路线怎么安排不浪费、交通怎么坐、吃住行怎么选。
4. 价格、班次、开放时间如果无法确定，请用“以官方为准”“建议出发前确认”等表述，不要编造具体数字。
5. 坐标只给知名地点的大致经纬度，并明确它只是概览坐标。

JSON 结构必须严格如下：
{
  "city": "城市名",
  "title": "页面主标题",
  "summary": "一句话介绍",
  "badges": ["四个核心卖点"],
  "highlights": [
    {"icon":"emoji","title":"小标题","text":"简短说明"}
  ],
  "sections": [
    {
      "key":"attractions",
      "index":"01",
      "en":"SIGHTS",
      "title":"景点",
      "intro":"一段简介",
      "type":"cards",
      "items":[{"tag":"免费或付费等","title":"景点名","text":"怎么玩、避坑"}]
    },
    {
      "key":"transport",
      "index":"02",
      "en":"TRANSPORT",
      "title":"交通",
      "intro":"一段简介",
      "type":"text",
      "items":[{"title":"到达方式","text":"说明"}]
    },
    {
      "key":"food",
      "index":"03",
      "en":"EAT",
      "title":"美食",
      "intro":"一段简介",
      "type":"cards",
      "items":[{"title":"食物","text":"推荐与避坑"}]
    },
    {
      "key":"stay",
      "index":"04",
      "en":"STAY",
      "title":"住宿",
      "intro":"一段简介",
      "type":"text",
      "items":[{"tag":"适合人群","title":"区域","text":"理由"}]
    },
    {
      "key":"itinerary",
      "index":"05",
      "en":"ROUTE",
      "title":"行程安排",
      "intro":"一段简介",
      "type":"route",
      "items":[{"day":"DAY 1","title":"主题","text":"路线"}]
    },
    {
      "key":"local",
      "index":"06",
      "en":"LIKE A LOCAL",
      "title":"本地人经常去的地方",
      "intro":"一段简介",
      "type":"text",
      "items":[{"title":"地点","text":"本地玩法"}]
    },
    {
      "key":"budget",
      "index":"07",
      "en":"BUDGET",
      "title":"预算",
      "intro":"预算仅为参考区间",
      "type":"budget",
      "items":[{"tier":"经济型","cost":"约 ¥...","who":"适合人群","combo":"典型组合"}]
    },
    {
      "key":"weather",
      "index":"08",
      "en":"WEATHER",
      "title":"天气",
      "intro":"一段简介",
      "type":"text",
      "items":[{"title":"季节","text":"穿衣与提醒"}]
    },
    {
      "key":"prep",
      "index":"09",
      "en":"CHECKLIST",
      "title":"行前准备",
      "intro":"一段简介",
      "type":"checklist",
      "items":["准备事项"]
    },
    {
      "key":"shopping",
      "index":"10",
      "en":"SHOPPING",
      "title":"购物",
      "intro":"一段简介",
      "type":"text",
      "items":[{"title":"购物主题","text":"建议与避坑"}]
    },
    {
      "key":"emergency",
      "index":"11",
      "en":"EMERGENCY",
      "title":"应急信息",
      "intro":"关键应急电话",
      "type":"emergency",
      "items":[{"label":"报警","value":"110"},{"label":"火警","value":"119"},{"label":"急救","value":"120"}]
    }
  ],
  "map": {
    "center": [纬度, 经度],
    "places": [
      {"name":"地点","lat":纬度,"lng":经度,"note":"说明"}
    ]
  }
}`;
}

const SYSTEM_PROMPT =
  "你是一位熟悉中国城市旅行、表达务实的旅行攻略编辑。你只输出符合用户要求结构的 JSON。";

function parseJson(content) {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function normalize(data, city) {
  const result = { ...data };
  if (!result.city) result.city = city;
  if (!result.title) result.title = city + "旅游攻略";
  result.badges = Array.isArray(result.badges) ? result.badges.slice(0, 4) : [];
  result.highlights = Array.isArray(result.highlights) ? result.highlights.slice(0, 6) : [];
  result.sections = Array.isArray(result.sections) ? result.sections : [];
  return result;
}

async function serveStatic(pathname, req, res) {
  let relative = decodeURIComponent(pathname);
  if (relative === "/") relative = "/generator.html";

  const filePath = path.resolve(__dirname, "." + relative);
  const root = path.resolve(__dirname);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const indexFile = path.join(filePath, "index.html");
      await sendFile(indexFile, req, res);
      return;
    }
    await sendFile(filePath, req, res);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

async function sendFile(filePath, req, res) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI 城市攻略生成器已启动：http://127.0.0.1:${PORT}/`);
  if (!DEEPSEEK_API_KEY) {
    console.warn("⚠ 尚未配置 DEEPSEEK_API_KEY，请在 zhuhai-guide/.env 中填写。");
  }
});
