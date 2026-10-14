import {
  getDraw,
  checkSsq,
  checkDlt,
  callVision,
  normalizeDate,
  normalizeTicket,
  extractJson,
  todayDate,
} from '../../server.mjs';

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(data),
  };
}

function getBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败');
  }
}

function resolveAction(event) {
  const query = event.queryStringParameters || {};
  if (query.action) return query.action;
  const path = event.path || '';
  if (path.includes('recognize')) return 'recognize';
  if (path.includes('draw')) return 'draw';
  return 'health';
}

export async function handler(event) {
  const action = resolveAction(event);
  const query = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET' && action === 'health') {
      return jsonResponse(200, { ok: true });
    }

    if (event.httpMethod === 'GET' && action === 'draw') {
      const type = query.type;
      const date = normalizeDate(query.date);
      if (!['ssq', 'dlt'].includes(type) || !date) {
        return jsonResponse(400, { error: '参数错误' });
      }
      const draw = await getDraw(type, date);
      return jsonResponse(200, draw);
    }

    if (event.httpMethod === 'POST' && action === 'recognize') {
      const body = getBody(event);
      const images = Array.isArray(body.images) ? body.images : [];
      const selectedType = ['ssq', 'dlt', 'auto'].includes(body.lotteryType)
        ? body.lotteryType
        : 'auto';
      const fallbackDate = normalizeDate(body.drawDate) || todayDate();
      const apiKey = String(body.apiKey || '').trim() || process.env.ARK_API_KEY || '';
      const model = String(body.model || '').trim() || process.env.ARK_VISION_MODEL || 'doubao-seed-2-0-lite-260428';

      if (images.length > 10) {
        return jsonResponse(400, { error: '单次最多上传 10 张图片' });
      }

      const visionResult = await callVision(images, apiKey, model);
      const rawTickets = Array.isArray(visionResult?.tickets) ? visionResult.tickets : [];
      const fallbackType = selectedType === 'auto' ? 'ssq' : selectedType;
      const tickets = rawTickets.map((raw) => normalizeTicket(raw, fallbackType));
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

      return jsonResponse(200, {
        tickets: checkedTickets,
        draws,
        rawCount: rawTickets.length,
      });
    }

    return jsonResponse(404, { error: '未找到接口' });
  } catch (error) {
    console.error(error);
    return jsonResponse(500, { error: error?.message || '服务器内部错误' });
  }
}
