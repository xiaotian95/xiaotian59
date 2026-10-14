const state = {
  files: [],
  result: null,
};

const $ = (id) => document.getElementById(id);
const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 隐私模式或存储不可用时静默失败
    }
  },
  getJson(key, fallback) {
    try {
      const parsed = JSON.parse(this.get(key, ''));
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  },
  setJson(key, value) {
    this.set(key, JSON.stringify(value));
  },
};

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  const grid = $('previewGrid');
  grid.innerHTML = '';
  state.files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    const image = document.createElement('img');
    image.src = URL.createObjectURL(file);
    image.alt = `彩票照片 ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.files.splice(index, 1);
      renderPreviews();
    });
    item.append(image, remove);
    grid.appendChild(item);
  });
  $('fileCount').textContent = `${state.files.length} 张`;
}

function renderBalls(container, numbers, type, matched = []) {
  const fragment = document.createDocumentFragment();
  numbers.forEach((number) => {
    const span = document.createElement('span');
    span.className = `ball ${type}${matched.includes(number) ? ' matched-number' : ''}`;
    span.textContent = number;
    fragment.appendChild(span);
  });
  container.appendChild(fragment);
}

function renderDrawSummary(draws) {
  const container = $('drawSummary');
  container.innerHTML = '';
  const drawList = Array.isArray(draws)
    ? draws
    : Object.entries(draws).map(([key, draw]) => ({
        ...draw,
        type: draw.type || key.split('|')[0],
      }));
  drawList.forEach((draw) => {
    const type = draw.type;
    const box = document.createElement('div');
    box.className = 'draw-box';
    const label = document.createElement('strong');
    label.textContent = type === 'ssq' ? '双色球开奖：' : '大乐透开奖：';
    box.appendChild(label);

    if (!draw.found) {
      box.appendChild(document.createTextNode(`${draw.date} 暂无开奖记录`));
      container.appendChild(box);
      return;
    }

    const issue = document.createElement('span');
    issue.textContent = `第 ${draw.issue} 期`;
    issue.className = 'history-sub';
    box.appendChild(issue);
    box.appendChild(document.createTextNode(` · ${draw.date}`));
    box.appendChild(document.createElement('br'));

    if (type === 'ssq') {
      renderBalls(box, draw.red, 'red');
      renderBalls(box, draw.blue, 'blue');
    } else {
      renderBalls(box, draw.front, 'red');
      renderBalls(box, draw.back, 'blue');
    }
    container.appendChild(box);
  });
}

function renderTicket(ticket, index) {
  const card = document.createElement('div');
  const isWinner = ticket.level && ticket.level !== '未中奖' && ticket.level !== '无法核对';
  card.className = `ticket-result${isWinner ? ' winner' : ''}`;

  const head = document.createElement('div');
  head.className = 'ticket-head';
  const name = document.createElement('div');
  name.className = 'ticket-name';
  name.textContent = `第 ${index + 1} 张 · ${ticket.lottery === 'ssq' ? '双色球' : '大乐透'}`;
  head.appendChild(name);

  const tag = document.createElement('span');
  tag.className = `prize-tag${isWinner ? ' hit' : ''}`;
  tag.textContent = ticket.level || '未中奖';
  head.appendChild(tag);
  card.appendChild(head);

  if (!ticket.valid) {
    const note = document.createElement('p');
    note.className = 'result-note';
    note.textContent = ticket.reason || '识别结果无效';
    card.appendChild(note);
    return card;
  }

  const info = document.createElement('div');
  info.className = 'prize-info';

  const levelItem = document.createElement('div');
  levelItem.className = 'prize-info-item';
  const levelLabel = document.createElement('span');
  levelLabel.className = 'prize-info-label';
  levelLabel.textContent = '几等奖';
  const levelValue = document.createElement('strong');
  levelValue.textContent = ticket.level || '未中奖';
  levelItem.append(levelLabel, levelValue);

  const amountItem = document.createElement('div');
  amountItem.className = 'prize-info-item';
  const amountLabel = document.createElement('span');
  amountLabel.className = 'prize-info-label';
  amountLabel.textContent = '中奖金额';
  const amountValue = document.createElement('strong');
  amountValue.textContent = isWinner
    ? ticket.estimatedPrize || '以官方兑奖为准'
    : '0 元';
  amountItem.append(amountLabel, amountValue);

  info.append(levelItem, amountItem);
  card.appendChild(info);

  if (ticket.lottery === 'ssq') {
    const row = document.createElement('div');
    row.className = 'number-row';
    row.appendChild(document.createTextNode('红球'));
    renderBalls(row, ticket.red, 'red', ticket.matched.red);
    row.appendChild(document.createTextNode('蓝球'));
    renderBalls(row, ticket.blue, 'blue', ticket.matched.blue);
    card.appendChild(row);
  } else {
    const row = document.createElement('div');
    row.className = 'number-row';
    row.appendChild(document.createTextNode('前区'));
    renderBalls(row, ticket.front, 'red', ticket.matched.front);
    row.appendChild(document.createTextNode('后区'));
    renderBalls(row, ticket.back, 'blue', ticket.matched.back);
    card.appendChild(row);
  }

  const note = document.createElement('p');
  note.className = 'result-note';
  if (isWinner) {
    note.textContent = `🎉 已命中奖项，金额仅供参考，请以官方兑奖为准`;
  } else {
    note.textContent = '未中奖，下次好运。';
  }
  card.appendChild(note);
  return card;
}

function parsePrizeMoney(value) {
  if (!value || value.includes('浮动奖金')) return null;
  const digits = String(value).replace(/,/g, '').match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

function renderResult(payload) {
  $('resultCard').hidden = false;
  const recognizedDate = payload.tickets?.find((ticket) => ticket.drawDate)?.drawDate;
  if (recognizedDate) {
    $('drawDate').value = recognizedDate;
  }
  renderDrawSummary(payload.draws);

  const winningTickets = (payload.tickets || []).filter(
    (ticket) => ticket.level && ticket.level !== '未中奖' && ticket.level !== '无法核对',
  );
  const fixedAmounts = winningTickets
    .map((ticket) => parsePrizeMoney(ticket.estimatedPrize))
    .filter((amount) => Number.isFinite(amount));
  const fixedTotal = fixedAmounts.reduce((sum, amount) => sum + amount, 0);
  const hasFloating = winningTickets.some((ticket) =>
    String(ticket.estimatedPrize || '').includes('浮动奖金'),
  );

  let totalSummary = document.getElementById('totalSummary');
  if (!totalSummary) {
    totalSummary = document.createElement('div');
    totalSummary.id = 'totalSummary';
    totalSummary.className = 'total-summary';
    $('resultCard').insertBefore(totalSummary, $('resultList'));
  }
  if (winningTickets.length) {
    const parts = [];
    if (fixedTotal > 0) {
      parts.push(`固定奖合计：${fixedTotal.toLocaleString('zh-CN')} 元`);
    }
    if (hasFloating) {
      parts.push('浮动奖金额以官方兑奖为准');
    }
    totalSummary.textContent = `🎉 中奖总金额${parts.length ? `：${parts.join('，')}` : ''}`;
    totalSummary.hidden = false;
  } else {
    totalSummary.hidden = true;
  }

  const list = $('resultList');
  list.innerHTML = '';
  payload.tickets.forEach((ticket, index) => {
    list.appendChild(renderTicket(ticket, index));
  });
}

function saveHistory(payload) {
  const records = storage.getJson('lotteryHistory', []);
  const record = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    drawDate: payload.tickets?.[0]?.drawDate || $('drawDate').value,
    type: $('lotteryType').value,
    tickets: payload.tickets,
    draws: payload.draws,
  };
  records.unshift(record);
  storage.setJson('lotteryHistory', records.slice(0, 30));
  renderHistory();
}

function historyBadge(record) {
  const hit = record.tickets?.some(
    (ticket) => ticket.level && ticket.level !== '未中奖' && ticket.level !== '无法核对',
  );
  const total = record.tickets?.length || 0;
  return hit ? `中奖 ${total} 张` : `已核对 ${total} 张`;
}

function renderHistory() {
  const records = storage.getJson('lotteryHistory', []);
  const list = $('historyList');
  list.innerHTML = '';
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-text';
    empty.textContent = '暂无记录';
    list.appendChild(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const main = document.createElement('div');
    main.className = 'history-main';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = `${record.type === 'ssq' ? '双色球' : record.type === 'dlt' ? '大乐透' : '自动识别'} · ${record.drawDate}`;
    const sub = document.createElement('div');
    sub.className = 'history-sub';
    sub.textContent = new Date(record.createdAt).toLocaleString('zh-CN');
    main.append(title, sub);

    const badge = document.createElement('span');
    badge.className = `history-badge${historyBadge(record).startsWith('中奖') ? ' hit' : ''}`;
    badge.textContent = historyBadge(record);
    item.append(main, badge);
    item.addEventListener('click', () => {
      renderResult(record);
      window.scrollTo({ top: $('resultCard').offsetTop - 20, behavior: 'smooth' });
    });
    list.appendChild(item);
  });
}

async function checkTickets() {
  if (!state.files.length) {
    showToast('请先上传彩票照片');
    return;
  }

  const button = $('checkButton');
  button.disabled = true;
  $('loadingText').hidden = false;
  try {
    const images = await Promise.all(state.files.map(fileToDataUrl));
    const response = await fetch('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images,
        lotteryType: $('lotteryType').value,
        drawDate: $('drawDate').value,
        apiKey: $('apiKeyInput').value.trim(),
        model: $('modelInput').value.trim(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '识别失败');
    }
    state.result = payload;
    renderResult(payload);
    saveHistory(payload);
    showToast('识别并核对完成');
  } catch (error) {
    showToast(error.message || '识别失败');
  } finally {
    button.disabled = false;
    $('loadingText').hidden = true;
  }
}

function initSettings() {
  $('apiKeyInput').value = storage.get('arkApiKey', '');
  $('modelInput').value = storage.get('arkVisionModel', 'doubao-seed-2-0-lite-260428');
  $('apiKeyInput').addEventListener('change', () => storage.set('arkApiKey', $('apiKeyInput').value.trim()));
  $('modelInput').addEventListener('change', () => storage.set('arkVisionModel', $('modelInput').value.trim()));
  $('settingsTrigger').addEventListener('click', () => {
    $('settingsCard').hidden = !$('settingsCard').hidden;
  });
  $('closeSettings').addEventListener('click', () => {
    $('settingsCard').hidden = true;
  });
}

function initUploader() {
  const input = $('fileInput');
  const uploader = $('uploader');
  input.addEventListener('change', () => {
    state.files.push(...Array.from(input.files));
    input.value = '';
    renderPreviews();
  });
  uploader.addEventListener('click', () => input.click());
  uploader.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploader.classList.add('dragging');
  });
  uploader.addEventListener('dragleave', () => uploader.classList.remove('dragging'));
  uploader.addEventListener('drop', (event) => {
    event.preventDefault();
    uploader.classList.remove('dragging');
    state.files.push(...Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/')));
    renderPreviews();
  });
  $('clearButton').addEventListener('click', () => {
    state.files = [];
    renderPreviews();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  $('drawDate').value = today();
  initSettings();
  initUploader();
  renderHistory();
  $('checkButton').addEventListener('click', checkTickets);
  $('closeResult').addEventListener('click', () => {
    $('resultCard').hidden = true;
  });
  $('clearHistory').addEventListener('click', () => {
    storage.setJson('lotteryHistory', []);
    renderHistory();
  });
});
