const STORAGE_KEY = "freedom-index-state-v1";

const defaultState = {
  lifestyle: 10000,
  childCount: 1,
  childCost: 580000,
  health: 300000,
  capital: 0,
  assets: 800000,
  salary: 20000,
  otherIncome: 0,
  otherIncomeFrequency: "monthly",
  currentSpend: 10000,
  nominalReturn: 4.5,
  inflation: 2,
};

const presets = {
  light: {
    lifestyle: 5000,
    childCount: 0,
    childCost: 580000,
    health: 150000,
    capital: 0,
    currentSpend: 5000,
  },
  balanced: {
    lifestyle: 10000,
    childCount: 1,
    childCost: 580000,
    health: 300000,
    capital: 0,
    currentSpend: 10000,
  },
  metro: {
    lifestyle: 15000,
    childCount: 2,
    childCost: 1500000,
    health: 1500000,
    capital: 7000000,
    currentSpend: 15000,
  },
};

const state = { ...defaultState };
let lastRenderedTarget = 0;
let numberAnimationFrame = null;
let toastTimer;
let copyTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  form: $("#freedomForm"),
  lifestyleInput: $("#lifestyleInput"),
  lifestyleRange: $("#lifestyleRange"),
  childCostInput: $("#childCostInput"),
  healthInput: $("#healthInput"),
  capitalInput: $("#capitalInput"),
  assetsInput: $("#assetsInput"),
  salaryInput: $("#monthlySalaryInput"),
  otherIncomeInput: $("#otherIncomeInput"),
  currentSpendInput: $("#currentSpendInput"),
  nominalRange: $("#nominalRange"),
  inflationRange: $("#inflationRange"),
  targetNumber: $("#targetNumber"),
  targetCompact: $("#targetCompact"),
  resultBadge: $("#resultBadge"),
  formulaText: $("#formulaText"),
  progressRing: $("#progressRing"),
  progressNumber: $("#progressNumber"),
  inlineProgress: $("#inlineProgress"),
  gapTitle: $("#gapTitle"),
  gapDescription: $("#gapDescription"),
  lifestyleValue: $("#lifestyleValue"),
  childValue: $("#childValue"),
  healthValue: $("#healthValue"),
  capitalValue: $("#capitalValue"),
  safeMonthly: $("#safeMonthly"),
  multiplierMetric: $("#multiplierMetric"),
  heroMultiplier: $("#heroMultiplier"),
  annualSpend: $("#annualSpend"),
  lifestyleTargetInline: $("#lifestyleTargetInline"),
  nominalOutput: $("#nominalOutput"),
  inflationOutput: $("#inflationOutput"),
  realRateOutput: $("#realRateOutput"),
  warningMessage: $("#warningMessage"),
  compositionBar: $("#compositionBar"),
  segments: {
    lifestyle: $(".lifestyle-segment"),
    child: $(".child-segment"),
    health: $(".health-segment"),
    capital: $(".capital-segment"),
  },
  routeAssets: $("#routeAssets"),
  routeTarget: $("#routeTarget"),
  routeRate: $("#routeRate"),
  annualSalaryValue: $("#annualSalaryValue"),
  annualOtherValue: $("#annualOtherValue"),
  annualIncomeValue: $("#annualIncomeValue"),
  annualSavingsValue: $("#annualSavingsValue"),
  otherIncomeFrequencyLabel: $("#otherIncomeFrequencyLabel"),
  savingsRateValue: $("#savingsRateValue"),
  routeFill: $("#routeFill"),
  routeCurrentMarker: $("#routeCurrentMarker"),
  routeProgressLabel: $("#routeProgressLabel"),
  yearsToFreedom: $("#yearsToFreedom"),
  yearsUnit: $("#yearsUnit"),
  routeNarrative: $("#routeNarrative"),
  copyButton: $("#copyButton"),
  copyLabel: $("#copyLabel"),
  toast: $("#toast"),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value, digits = 0) {
  if (!Number.isFinite(value)) return "无法计算";
  return `¥${Math.round(value).toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
  })}`;
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "收益条件无效";
  if (Math.abs(value) >= 100000000) {
    return `${(value / 100000000).toFixed(2).replace(/\.?0+$/, "")} 亿`;
  }
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1).replace(/\.0$/, "")} 万`;
  }
  return `${Math.round(value).toLocaleString("zh-CN")} 元`;
}

function formatPercent(value, digits = 1) {
  return `${value.toFixed(digits).replace(/\.0$/, "")}%`;
}

function formatMultiplier(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return Math.round(value).toLocaleString("zh-CN");
  return value.toFixed(1).replace(/\.0$/, "");
}

function readStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object") return;

    Object.entries(defaultState).forEach(([key, defaultValue]) => {
      if (typeof defaultValue === "number" && Number.isFinite(Number(stored[key]))) {
        state[key] = Number(stored[key]);
      }

      if (typeof defaultValue === "string" && typeof stored[key] === "string") {
        state[key] = stored[key];
      }
    });
  } catch {
    // 本地存储不可用时，直接采用默认参数。
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或禁用存储时不影响计算。
  }
}

function syncControlsFromState() {
  elements.lifestyleInput.value = state.lifestyle;
  elements.lifestyleRange.value = state.lifestyle;
  elements.childCostInput.value = state.childCost;
  elements.healthInput.value = state.health;
  elements.capitalInput.value = state.capital;
  elements.assetsInput.value = state.assets;
  elements.salaryInput.value = state.salary;
  elements.otherIncomeInput.value = state.otherIncome;
  elements.currentSpendInput.value = state.currentSpend;
  elements.nominalRange.value = state.nominalReturn;
  elements.inflationRange.value = state.inflation;
}

function setActiveButton(selector, activeValue, attribute) {
  $$(selector).forEach((button) => {
    const value = Number(button.dataset[attribute]);
    button.classList.toggle("is-active", value === activeValue);
    button.setAttribute("aria-pressed", String(value === activeValue));
  });
}

function markPresetActive() {
  const matching = Object.entries(presets).find(([, values]) =>
    Object.entries(values).every(([key, value]) => state[key] === value),
  );

  $$(".preset-button").forEach((button) => {
    const isActive = matching?.[0] === button.dataset.preset;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function calculateIncome() {
  const annualSalary = state.salary * 12;
  const annualOther =
    state.otherIncome * (state.otherIncomeFrequency === "yearly" ? 1 : 12);
  const annualIncome = annualSalary + annualOther;
  const annualSpending = state.currentSpend * 12;
  const annualSavings = Math.max(annualIncome - annualSpending, 0);
  const savingsRate = annualIncome > 0 ? (annualSavings / annualIncome) * 100 : 0;
  const annualShortfall = Math.max(annualSpending - annualIncome, 0);

  return {
    annualSalary,
    annualOther,
    annualIncome,
    annualSpending,
    annualSavings,
    savingsRate,
    annualShortfall,
  };
}

function calculate() {
  const realRate = state.nominalReturn - state.inflation;
  const hasPositiveRealReturn = realRate > 0;
  const multiplier = hasPositiveRealReturn ? 12 / (realRate / 100) : Infinity;
  const annualSpend = state.lifestyle * 12;
  const lifestyleTarget = hasPositiveRealReturn ? annualSpend / (realRate / 100) : Infinity;
  const childTarget = state.childCount * state.childCost;
  const fixedTarget = childTarget + state.health + state.capital;
  const target = lifestyleTarget + fixedTarget;
  const progress = Number.isFinite(target) && target > 0 ? (state.assets / target) * 100 : 0;
  const gap = Number.isFinite(target) ? Math.max(target - state.assets, 0) : Infinity;
  const surplus = Number.isFinite(target) ? Math.max(state.assets - target, 0) : 0;
  const safeMonthly =
    hasPositiveRealReturn && state.assets > fixedTarget
      ? ((state.assets - fixedTarget) * (realRate / 100)) / 12
      : 0;

  return {
    realRate,
    hasPositiveRealReturn,
    multiplier,
    annualSpend,
    lifestyleTarget,
    childTarget,
    fixedTarget,
    target,
    progress,
    gap,
    surplus,
    safeMonthly,
  };
}

function animateNumber(element, from, to, formatter) {
  if (numberAnimationFrame) {
    cancelAnimationFrame(numberAnimationFrame);
    numberAnimationFrame = null;
  }

  if (!Number.isFinite(to)) {
    element.textContent = "无法计算";
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !Number.isFinite(from) || from === to) {
    element.textContent = formatter(to);
    return;
  }

  const start = performance.now();
  const duration = 560;

  function frame(now) {
    const elapsed = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - elapsed, 4);
    const value = from + (to - from) * eased;
    element.textContent = formatter(value);

    if (elapsed < 1) {
      numberAnimationFrame = requestAnimationFrame(frame);
    } else {
      element.textContent = formatter(to);
      numberAnimationFrame = null;
    }
  }

  numberAnimationFrame = requestAnimationFrame(frame);
}

function updateBreakdown(result) {
  const denominator = Number.isFinite(result.target) && result.target > 0 ? result.target : 1;
  const shares = {
    lifestyle: (result.lifestyleTarget / denominator) * 100,
    child: (result.childTarget / denominator) * 100,
    health: (result.health / denominator) * 100,
    capital: (result.capital / denominator) * 100,
  };

  Object.entries(shares).forEach(([key, share]) => {
    elements.segments[key].style.width = `${Math.max(share, share > 0 ? 0.4 : 0)}%`;
  });
}

function calculateYearsToFreedom(result, income) {
  if (!result.hasPositiveRealReturn) return Infinity;
  if (state.assets >= result.target) return 0;

  const rate = result.realRate / 100;
  const savings = income.annualSavings;
  const current = state.assets;

  if (rate === 0) {
    return savings > 0 ? (result.target - current) / savings : Infinity;
  }

  const numerator = result.target * rate + savings;
  const denominator = current * rate + savings;

  if (denominator <= 0 || numerator <= 0 || numerator <= denominator) {
    return Infinity;
  }

  return Math.log(numerator / denominator) / Math.log(1 + rate);
}

function updateRoute(result) {
  const income = calculateIncome();
  const progress = Number.isFinite(result.progress) ? result.progress : 0;
  const visualProgress = clamp(progress, 0, 100);
  const years = calculateYearsToFreedom(result, income);

  elements.routeAssets.textContent = formatCurrency(state.assets);
  elements.routeTarget.textContent = formatCurrency(result.target);
  elements.routeRate.textContent = result.hasPositiveRealReturn
    ? formatPercent(result.realRate)
    : "无效";
  elements.annualSalaryValue.textContent = formatCurrency(income.annualSalary);
  elements.annualOtherValue.textContent = formatCurrency(income.annualOther);
  elements.annualIncomeValue.textContent = formatCurrency(income.annualIncome);
  elements.annualSavingsValue.textContent = formatCurrency(income.annualSavings);
  elements.otherIncomeFrequencyLabel.textContent =
    state.otherIncomeFrequency === "yearly" ? "按每年收入计入" : "按每月收入折算";
  elements.savingsRateValue.textContent = `结余率 ${formatPercent(income.savingsRate, 0)}`;
  elements.routeFill.style.width = `${visualProgress}%`;
  elements.routeCurrentMarker.style.left = `${visualProgress}%`;
  elements.routeProgressLabel.textContent =
    progress > 999 ? "999%+" : formatPercent(progress, progress < 10 ? 1 : 0);

  if (state.assets >= result.target) {
    elements.yearsToFreedom.textContent = "0";
    elements.yearsUnit.textContent = "年 · 已抵达";
    elements.routeNarrative.textContent = `当前资产已越过目标线，并多出 ${formatCurrency(
      result.surplus,
    )} 的缓冲。`;
    return;
  }

  if (!Number.isFinite(result.target)) {
    elements.yearsToFreedom.textContent = "—";
    elements.yearsUnit.textContent = "无法估算";
    elements.routeNarrative.textContent = "请先让名义回报高于通胀，模型才能形成正的实际收益。";
    return;
  }

  if (!Number.isFinite(years)) {
    elements.yearsToFreedom.textContent = "80+";
    elements.yearsUnit.textContent = "年以上";
    elements.routeNarrative.textContent =
      income.annualSavings === 0
        ? "收入不足以形成新的结余，单纯等待资产复利很难抵达目标。先提高收入或压缩当前支出。"
        : "按当前结余速度，抵达目标超过 80 年。提高结余、降低大项投入或重新评估目标会更有效。";
    return;
  }

  if (years < 0.05) {
    elements.yearsToFreedom.textContent = "< 1";
    elements.yearsUnit.textContent = "个月";
  } else if (years < 1) {
    elements.yearsToFreedom.textContent = Math.max(Math.round(years * 12), 1).toString();
    elements.yearsUnit.textContent = "个月";
  } else {
    elements.yearsToFreedom.textContent = years.toFixed(years >= 10 ? 0 : 1);
    elements.yearsUnit.textContent = "年";
  }

  const shortfallNote =
    income.annualShortfall > 0
      ? ` 当前年收入比年支出少 ${formatCurrency(income.annualShortfall)}。`
      : "";
  elements.routeNarrative.textContent = `按年工资 ${formatCurrency(
    income.annualSalary,
  )}、其他收入 ${formatCurrency(income.annualOther)}，每年结余 ${formatCurrency(
    income.annualSavings,
  )}，实际收益 ${formatPercent(result.realRate)} 复利估算。${shortfallNote}`;
}

function render({ animate = true } = {}) {
  const result = calculate();
  const progress = Number.isFinite(result.progress) ? result.progress : 0;
  const visualProgress = clamp(progress, 0, 100);

  elements.annualSpend.textContent = formatCurrency(result.annualSpend);
  elements.lifestyleTargetInline.textContent = formatCurrency(result.lifestyleTarget);
  elements.lifestyleValue.textContent = formatCurrency(result.lifestyleTarget);
  elements.childValue.textContent = formatCurrency(result.childTarget);
  elements.healthValue.textContent = formatCurrency(state.health);
  elements.capitalValue.textContent = formatCurrency(state.capital);
  elements.targetCompact.textContent = formatCompact(result.target);
  elements.formulaText.textContent = Number.isFinite(result.target)
    ? `${formatMultiplier(result.multiplier)} × ${Math.round(state.lifestyle).toLocaleString(
        "zh-CN",
      )} + ${Math.round(state.childCost).toLocaleString("zh-CN")} × ${
        state.childCount
      } + ${Math.round(state.health).toLocaleString("zh-CN")} + ${Math.round(
        state.capital,
      ).toLocaleString("zh-CN")}`
    : "实际收益率 ≤ 0，无法形成永续现金流";

  if (Number.isFinite(result.target)) {
    animateNumber(
      elements.targetNumber,
      animate ? lastRenderedTarget : result.target,
      result.target,
      (value) => Math.round(value).toLocaleString("zh-CN"),
    );
    lastRenderedTarget = result.target;
  } else {
    if (numberAnimationFrame) {
      cancelAnimationFrame(numberAnimationFrame);
      numberAnimationFrame = null;
    }
    elements.targetNumber.textContent = "无法计算";
  }

  elements.heroMultiplier.textContent = formatMultiplier(result.multiplier);
  elements.multiplierMetric.textContent = Number.isFinite(result.multiplier)
    ? `${formatMultiplier(result.multiplier)}× · 实际 ${formatPercent(result.realRate)}`
    : "—";
  elements.safeMonthly.textContent = formatCurrency(result.safeMonthly);

  elements.progressRing.style.setProperty("--progress", visualProgress);
  elements.progressRing.setAttribute(
    "aria-label",
    `当前完成度 ${formatPercent(progress, progress < 10 ? 1 : 0)}`,
  );
  elements.progressNumber.textContent =
    progress > 999 ? "999%+" : formatPercent(progress, progress < 10 ? 1 : 0);
  elements.inlineProgress.textContent =
    progress > 999 ? "999%+" : formatPercent(progress, progress < 10 ? 1 : 0);

  if (!result.hasPositiveRealReturn) {
    elements.resultBadge.textContent = "收益条件无效";
    elements.gapTitle.textContent = "目标无法形成";
    elements.gapDescription.textContent = "实际收益率需高于 0，才能让本金在覆盖支出后保持购买力。";
    elements.warningMessage.hidden = false;
  } else if (result.progress >= 100) {
    elements.resultBadge.textContent = "已越过自由线";
    elements.gapTitle.textContent = `已超过目标 ${formatCurrency(result.surplus)}`;
    elements.gapDescription.textContent = `按当前设定，你的资产已经覆盖全部目标，并留有一笔缓冲。完成度 ${formatPercent(
      result.progress,
      0,
    )}。`;
    elements.warningMessage.hidden = true;
  } else {
    elements.resultBadge.textContent = "严格版自由线";
    elements.gapTitle.textContent = `还差 ${formatCurrency(result.gap)}`;
    elements.gapDescription.textContent = `当前资产覆盖 ${formatPercent(
      result.progress,
      result.progress < 10 ? 1 : 0,
    )}。继续扩大本金，或重新校准每月支出。`;
    elements.warningMessage.hidden = true;
  }

  updateBreakdown(result);
  updateRoute(result);
  markPresetActive();
  setActiveButton("[data-child-count]", state.childCount, "childCount");
  setActiveButton("[data-health]", state.health, "health");
  setActiveButton("[data-capital]", state.capital, "capital");
  $$("[data-income-frequency]").forEach((button) => {
    const isActive = button.dataset.incomeFrequency === state.otherIncomeFrequency;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  elements.nominalOutput.textContent = formatPercent(state.nominalReturn);
  elements.inflationOutput.textContent = formatPercent(state.inflation);
  elements.realRateOutput.textContent = formatPercent(result.realRate);
  elements.realRateOutput.style.color = result.hasPositiveRealReturn ? "" : "var(--danger)";

  saveState();
}

function updateStateFromInput(input) {
  const key = input.dataset.state;
  if (!key) return;

  const fallback = defaultState[key];
  const min = toNumber(input.min, -Infinity);
  const max = toNumber(input.max, Infinity);

  if (input.value === "") {
    state[key] = min >= 0 ? min : 0;
    return;
  }

  state[key] = clamp(toNumber(input.value, fallback), min, max);
}

function handleBoundInput(input) {
  updateStateFromInput(input);

  if (input === elements.lifestyleInput) {
    elements.lifestyleRange.value = clamp(state.lifestyle, 0, 50000);
  }

  render();
}

$$("[data-state]").forEach((input) => {
  input.addEventListener("input", () => handleBoundInput(input));
  input.addEventListener("blur", () => {
    updateStateFromInput(input);
    input.value = state[input.dataset.state];
    render({ animate: false });
  });
});

elements.lifestyleRange.addEventListener("input", () => {
  state.lifestyle = Number(elements.lifestyleRange.value);
  elements.lifestyleInput.value = state.lifestyle;
  render();
});

elements.nominalRange.addEventListener("input", () => {
  state.nominalReturn = Number(elements.nominalRange.value);
  render();
});

elements.inflationRange.addEventListener("input", () => {
  state.inflation = Number(elements.inflationRange.value);
  render();
});

$$("[data-child-count]").forEach((button) => {
  button.addEventListener("click", () => {
    state.childCount = Number(button.dataset.childCount);
    render();
  });
});

$$("[data-health]").forEach((button) => {
  button.addEventListener("click", () => {
    state.health = Number(button.dataset.health);
    elements.healthInput.value = state.health;
    render();
  });
});

$$("[data-capital]").forEach((button) => {
  button.addEventListener("click", () => {
    state.capital = Number(button.dataset.capital);
    elements.capitalInput.value = state.capital;
    render();
  });
});

$$("[data-income-frequency]").forEach((button) => {
  button.addEventListener("click", () => {
    state.otherIncomeFrequency = button.dataset.incomeFrequency;
    render();
  });
});

$$(".preset-button").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.preset];
    Object.assign(state, preset);
    syncControlsFromState();
    render();
    showToast(`已切换为「${button.textContent.trim()}」情景`);
  });
});

$("#resetButton").addEventListener("click", () => {
  Object.assign(state, defaultState);
  syncControlsFromState();
  lastRenderedTarget = 0;
  render();
  showToast("已恢复默认参数");
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
});

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function buildSummary() {
  const result = calculate();
  const income = calculateIncome();
  return [
    "自由刻度｜财富自由测算结果",
    `目标临界值：${formatCurrency(result.target)}`,
    `月生活开销：${formatCurrency(state.lifestyle)} / 实际收益率：${formatPercent(result.realRate)}`,
    `日常自由底座：${formatCurrency(result.lifestyleTarget)}`,
    `育儿计划：${formatCurrency(result.childTarget)}`,
    `健康储备：${formatCurrency(state.health)}`,
    `重大投入：${formatCurrency(state.capital)}`,
    `当前资产：${formatCurrency(state.assets)}（完成度 ${formatPercent(result.progress, 1)}）`,
    `税后月薪：${formatCurrency(state.salary)} / 年工资：${formatCurrency(
      income.annualSalary,
    )}`,
    `其他收入：${formatCurrency(income.annualOther)} / 年度总收入：${formatCurrency(
      income.annualIncome,
    )}`,
    `每年可投资结余：${formatCurrency(income.annualSavings)}（结余率 ${formatPercent(
      income.savingsRate,
      0,
    )}）`,
    `预计抵达目标：${elements.yearsToFreedom.textContent} ${elements.yearsUnit.textContent}`,
    "口径：本金不缩水、购买力不下降，仅作规划参考。",
  ].join("\n");
}

elements.copyButton.addEventListener("click", async () => {
  const summary = buildSummary();

  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = summary;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  elements.copyLabel.textContent = "已复制";
  showToast("测算结果已复制");
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    elements.copyLabel.textContent = "复制结果";
  }, 2200);
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

$$(".reveal").forEach((element) => revealObserver.observe(element));

const cursorGlow = $(".cursor-glow");
window.addEventListener(
  "pointermove",
  (event) => {
    cursorGlow.style.opacity = "1";
    cursorGlow.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  },
  { passive: true },
);

document.addEventListener("pointerleave", () => {
  cursorGlow.style.opacity = "0";
});

const now = new Date();
$("#headerDate").textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .format(now)
  .replaceAll("/", ".");
$("#footerYear").textContent = now.getFullYear();

readStoredState();
syncControlsFromState();
render({ animate: false });
