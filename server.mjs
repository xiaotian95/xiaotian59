import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { URL } from 'node:url';

const currentFileUrl = import.meta?.url || '';
const __dirname = currentFileUrl ? path.dirname(fileURLToPath(currentFileUrl)) : process.cwd();
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_API_KEY = process.env.ARK_API_KEY || '';
const DEFAULT_MODEL = process.env.ARK_VISION_MODEL || 'doubao-seed-2-0-lite-260428';
const DEFAULT_BASE_URL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

// 简单的进程内缓存：降低重复调用外部接口的压力
const drawCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

function normalizeNumber(value) {
  const text = String(value).trim();
  if (!text) return '';
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.length === 1 ? `0${digits}` : digits;
}

function normalizeNumbers(list) {
  return (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean);
}

function normalizeDate(date) {
  if (!date) return '';
  const match = String(date).match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function fetchJson(url, headers = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`接口请求失败：${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getSsqDraw(date) {
  const cacheKey = `ssq:${date}`;
  const cached = drawCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const url =
    'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=120';
  const data = await fetchJson(url);
  const list = Array.isArray(data?.result) ? data.result : [];
  const item = list.find((row) => normalizeDate(row.date) === date);

  if (!item) {
    return { found: false, type: 'ssq', date };
  }

  const result = {
    found: true,
    type: 'ssq',
    issue: item.code,
    date,
    red: normalizeNumbers(String(item.red).split(',')),
    blue: normalizeNumbers(String(item.blue).split(',')),
    prizeGrades: Array.isArray(item.prizegrades)
      ? item.prizegrades.map((grade) => ({
          level: grade.type,
          count: grade.typenum,
          money: grade.typemoney,
        }))
      : [],
    specialRuleInfo: item.specialRuleInfo || '',
  };

  drawCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

async function getDltDraw(date) {
  const cacheKey = `dlt:${date}`;
  const cached = drawCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const url =
    'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=1';
  const data = await fetchJson(url, {
    Referer: 'https://static.sporttery.cn/',
  });
  const list = Array.isArray(data?.value?.list) ? data.value.list : [];
  const item = list.find((row) => row.lotteryDrawTime === date);

  if (!item) {
    return { found: false, type: 'dlt', date };
  }

  const raw = String(item.lotteryDrawResult || '').trim().split(/\s+/).map(normalizeNumber);
  const front = raw.slice(0, 5);
  const back = raw.slice(5, 7);
  const result = {
    found: true,
    type: 'dlt',
    issue: item.lotteryDrawNum,
    date,
    front,
    back,
    prizeLevels: Array.isArray(item.prizeLevelList)
      ? item.prizeLevelList.map((level) => ({
          name: level.prizeLevel,
          count: level.stakeCount,
          money: level.stakeAmountFormat,
          condition: level.lotteryCondition,
        }))
      : [],
    poolBalanceAfterdraw: item.poolBalanceAfterdraw || '',
  };

  drawCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

async function getDraw(type, date) {
  if (type === 'ssq') return getSsqDraw(date);
  if (type === 'dlt') return getDltDraw(date);
  throw new Error('未知彩票类型');
}

function countMatches(ticketNumbers, winningNumbers) {
  const winning = new Set(winningNumbers);
  return ticketNumbers.filter((number) => winning.has(number)).length;
}

function checkSsq(ticket, draw) {
  const red = normalizeNumbers(ticket.red || ticket.front);
  const blue = normalizeNumbers(ticket.blue || ticket.back);
  if (red.length !== 6 || blue.length !== 1) {
    return { valid: false, reason: '双色球号码数量不完整' };
  }

  const redHit = countMatches(red, draw.red);
  const blueHit = countMatches(blue, draw.blue);
  let level = null;

  if (redHit === 6 && blueHit === 1) level = { name: '一等奖', type: 1 };
  else if (redHit === 6 && blueHit === 0) level = { name: '二等奖', type: 2 };
  else if (redHit === 5 && blueHit === 1) level = { name: '三等奖', type: 3 };
  else if (redHit === 5 || (redHit === 4 && blueHit === 1))
    level = { name: '四等奖', type: 4 };
  else if (redHit === 4 || (redHit === 3 && blueHit === 1))
    level = { name: '五等奖', type: 5 };
  else if (blueHit === 1) level = { name: '六等奖', type: 6 };

  const matched = {
    redHit,
    blueHit,
    red: red.filter((number) => draw.red.includes(number)),
    blue: blue.filter((number) => draw.blue.includes(number)),
  };

  let estimatedPrize = '';
  if (level?.type) {
    const grade = draw.prizeGrades?.find((item) => Number(item.level) === level.type);
    if (grade?.money) estimatedPrize = `${Number(grade.money).toLocaleString('zh-CN')} 元/注`;
    else if (level.type === 1) estimatedPrize = '浮动奖金';
    else if (level.type === 2) estimatedPrize = '浮动奖金';
    else if (level.type === 3) estimatedPrize = '3,000 元/注';
    else if (level.type === 4) estimatedPrize = '200 元/注';
    else if (level.type === 5) estimatedPrize = '10 元/注';
    else if (level.type === 6) estimatedPrize = '5 元/注';
  }

  return {
    valid: true,
    lottery: 'ssq',
    level: level?.name || '未中奖',
    levelType: level?.type || null,
    red,
    blue,
    matched,
    estimatedPrize,
  };
}

function checkDlt(ticket, draw) {
  const front = normalizeNumbers(ticket.front || ticket.red);
  const back = normalizeNumbers(ticket.back || ticket.blue);
  if (front.length !== 5 || back.length !== 2) {
    return { valid: false, reason: '大乐透号码数量不完整' };
  }

  const frontHit = countMatches(front, draw.front);
  const backHit = countMatches(back, draw.back);
  let level = null;

  if (frontHit === 5 && backHit === 2) level = { name: '一等奖', type: 1 };
  else if (frontHit === 5 && backHit === 1) level = { name: '二等奖', type: 2 };
  else if (frontHit === 5 || (frontHit === 4 && backHit === 2))
    level = { name: '三等奖', type: 3 };
  else if (frontHit === 4 && backHit === 1) level = { name: '四等奖', type: 4 };
  else if (frontHit === 4 || (frontHit === 3 && backHit === 2))
    level = { name: '五等奖', type: 5 };
  else if ((frontHit === 3 && backHit === 1) || (frontHit === 2 && backHit === 2))
    level = { name: '六等奖', type: 6 };
  else if (
    frontHit === 3 ||
    (frontHit === 2 && backHit === 1) ||
    (frontHit === 1 && backHit === 2) ||
    backHit === 2
  )
    level = { name: '七等奖', type: 7 };

  const matched = {
    frontHit,
    backHit,
    front: front.filter((number) => draw.front.includes(number)),
    back: back.filter((number) => draw.back.includes(number)),
  };

  let estimatedPrize = '';
  if (level?.type) {
    const item = draw.prizeLevels?.find((row) => {
      const normalizedName = row.name.replace('(追加)', '').replace('等奖', '');
      return Number(normalizedName) === level.type;
    });
    if (item?.money && item.money !== '-1') {
      estimatedPrize = `${Number(item.money).toLocaleString('zh-CN')} 元/注`;
    } else if (level.type === 1 || level.type === 2) {
      estimatedPrize = '浮动奖金';
    } else if (level.type === 3) estimatedPrize = '5,000 元/注';
    else if (level.type === 4) estimatedPrize = '300 元/注';
    else if (level.type === 5) estimatedPrize = '150 元/注';
    else if (level.type === 6) estimatedPrize = '15 元/注';
    else if (level.type === 7) estimatedPrize = '5 元/注';
  }

  return {
    valid: true,
    lottery: 'dlt',
    level: level?.name || '未中奖',
    levelType: level?.type || null,
    front,
    back,
    matched,
    estimatedPrize,
  };
}

function extractJson(text) {
  if (!text) return {};
  const cleaned = String(text).trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        // 继续尝试提取第一个 JSON 块
      }
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalizeTicket(raw, fallbackType) {
  const lottery = ['ssq', 'dlt'].includes(raw?.lottery) ? raw.lottery : fallbackType;
  const ticket = {
    lottery,
    issue: raw?.issue ? String(raw.issue).trim() : '',
    index: raw?.index || raw?.line || '',
    drawDate: normalizeDate(raw?.drawDate || raw?.date || raw?.drawTime),
  };

  if (lottery === 'ssq') {
    ticket.red = normalizeNumbers(raw.red || raw.front);
    ticket.blue = normalizeNumbers(raw.blue || raw.back);
  } else {
    ticket.front = normalizeNumbers(raw.front || raw.red);
    ticket.back = normalizeNumbers(raw.back || raw.blue);
  }
  return ticket;
}

async function callVision(images, apiKey, model) {
  if (!apiKey) {
    throw new Error('缺少火山方舟 API Key，请在页面右上角设置');
  }
  if (!images.length) {
    throw new Error('请先上传彩票图片');
  }

const prompt = `你是彩票票据识别助手。请从用户上传的图片中识别所有彩票号码。
图片可能是一张彩票，也可能包含多张彩票，请逐张识别。

支持两种彩票：
1. 双色球（lottery 字段填 "ssq"）：6个红球（01-33）+ 1个蓝球（01-16）。
2. 超级大乐透（lottery 字段填 "dlt"）：5个前区（01-35）+ 2个后区（01-12）。

双色球使用 "red" 和 "blue" 字段；大乐透使用 "front" 和 "back" 字段。
如果能识别到期号，填 "issue" 字段；如果能识别到开奖日期，填 "drawDate" 字段，格式为 YYYY-MM-DD。

只输出一个 JSON 对象，不要输出其他文字或解释，格式如下：
{"tickets":[{"lottery":"ssq","issue":"2026117","drawDate":"2026-10-13","red":["04","11","14","22","26","27"],"blue":["04"]}]}

如果某张彩票无法识别，请把可识别的字段留空，不要编造号码。`;

  const content = [
    { type: 'text', text: prompt },
    ...images.map((image) => ({
      type: 'image_url',
      image_url: { url: image },
    })),
  ];

  const url = `${DEFAULT_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`视觉识别接口失败：${response.status} ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error('视觉识别接口未返回内容');
  }
  return extractJson(message);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/draw') {
      const type = requestUrl.searchParams.get('type');
      const date = normalizeDate(requestUrl.searchParams.get('date'));
      if (!['ssq', 'dlt'].includes(type) || !date) {
        return sendJson(res, 400, { error: '参数错误' });
      }
      const draw = await getDraw(type, date);
      return sendJson(res, 200, draw);
    }

    if (req.method === 'POST' && pathname === '/api/recognize') {
      const body = await readJsonBody(req);
      const images = Array.isArray(body.images) ? body.images : [];
      const selectedType = ['ssq', 'dlt', 'auto'].includes(body.lotteryType)
        ? body.lotteryType
        : 'auto';
      const fallbackDate = normalizeDate(body.drawDate) || todayDate();
      const apiKey = String(body.apiKey || '').trim() || DEFAULT_API_KEY;
      const model = String(body.model || '').trim() || DEFAULT_MODEL;

      if (images.length > 10) {
        return sendJson(res, 400, { error: '单次最多上传 10 张图片' });
      }

      const visionResult = await callVision(images, apiKey, model);
      const rawTickets = Array.isArray(visionResult?.tickets) ? visionResult.tickets : [];
      const fallbackType = selectedType === 'auto' ? 'ssq' : selectedType;
      const tickets = rawTickets.map((raw) => normalizeTicket(raw, fallbackType));

      // 若自动识别但没有任何有效彩票，回退为用户选择类型
      const finalTickets = tickets.length
        ? tickets
        : [{ lottery: fallbackType, red: [], blue: [], front: [], back: [] }];

      const normalizedTickets = finalTickets.map((ticket) => ({
        ...ticket,
        drawDate: ticket.drawDate || fallbackDate,
      }));

      const groupKeys = [
        ...new Set(
          normalizedTickets.map((ticket) => `${ticket.lottery}|${ticket.drawDate}`),
        ),
      ];
      const draws = {};
      for (const key of groupKeys) {
        const [type, date] = key.split('|');
        draws[key] = await getDraw(type, date);
      }

      const checkedTickets = normalizedTickets.map((ticket) => {
        const draw = draws[`${ticket.lottery}|${ticket.drawDate}`];
        if (!draw?.found) {
          return {
            ...ticket,
            valid: false,
            reason: `${ticket.lottery === 'ssq' ? '双色球' : '大乐透'}在该日期暂无开奖记录`,
            level: '无法核对',
          };
        }
        const checked =
          ticket.lottery === 'ssq' ? checkSsq(ticket, draw) : checkDlt(ticket, draw);
        return { ...ticket, ...checked };
      });

      return sendJson(res, 200, {
        tickets: checkedTickets,
        draws,
        rawCount: rawTickets.length,
      });
    }

    // 静态文件服务
    if (req.method === 'GET') {
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(PUBLIC_DIR, relativePath);
      const pathDiff = path.relative(PUBLIC_DIR, filePath);
      if (pathDiff.startsWith('..') || path.isAbsolute(pathDiff)) {
        return sendText(res, 403, '禁止访问');
      }
      try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime =
          ext === '.html'
            ? 'text/html; charset=utf-8'
            : ext === '.css'
              ? 'text/css; charset=utf-8'
              : ext === '.js'
                ? 'text/javascript; charset=utf-8'
                : ext === '.svg'
                  ? 'image/svg+xml'
                  : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(content);
      } catch (error) {
        if (error.code === 'ENOENT') return sendText(res, 404, '未找到资源');
        throw error;
      }
    }

    return sendText(res, 404, '未找到接口');
  } catch (error) {
    console.error(error);
    const message = error?.message || '服务器内部错误';
    return sendJson(res, 500, { error: message });
  }
});

const isMain = currentFileUrl
  ? currentFileUrl === pathToFileURL(process.argv[1]).href
  : false;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`彩票图片识别中奖已启动：http://localhost:${PORT}`);
  });
}

export {
  getDraw,
  getSsqDraw,
  getDltDraw,
  checkSsq,
  checkDlt,
  callVision,
  normalizeDate,
  normalizeTicket,
  extractJson,
  todayDate,
};
