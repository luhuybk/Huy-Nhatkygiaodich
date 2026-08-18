import { supabase } from "../supabaseClient.js";
import { DEFAULT_RESOURCES, GRADE_OPTIONS, NOTE_TYPES, WEEKDAY_LABEL } from "./constants.js";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const IN_TRADE_MAX_IMAGES = 2;

export function emptyTrade() {
  return {
    id: uid(),
    createdAt: Date.now(),
    symbol: "", entryDate: "", entryTime: "", entryLink: "", entryImage: "",
    direction: "buy", account: "", timeframe: "", session: "",
    inTradeImages: [{ link: "", image: "" }], inTradeNote: "",
    riskPercent: "", riskAmount: "", riskAction: "", riskActionReason: "", ratingRisk: 0,
    setup: "", setupBonus: "", setupNote: "", entryReason: "", ratingKnowledge: 0, structureScore: "",
    exitDate: "", exitTime: "", exitLink: "", exitImage: "", profit: "",
    entrySkill: "", inTradeSkill: "", exitSkill: "", ratingSkill: 0,
    psychology: "", ratingPsychology: 0,
    tradeGrade: "", reviewNote: "", checklist: {},
    hasLesson: false, lessonNote: "",
  };
}

export function emptyFlow(date) {
  return { id: uid(), type: "deposit", accountId: "", toAccountId: "", amount: "", date: date || "", note: "" };
}

export function emptyNote(date) {
  return { id: uid(), date: date || "", type: NOTE_TYPES[0], content: "" };
}

export function emptyLesson(date) {
  return { id: null, date: date || todayStr(), categories: [], symbol: "", tradeId: "", title: "", content: "", link: "", image: "", images: [{ link: "", image: "" }] };
}

export const LESSON_MAX_IMAGES = 4;

export function lessonAttachments(lesson) {
  if (lesson.images && lesson.images.length) return lesson.images;
  if (lesson.link || lesson.image) return [{ link: lesson.link || "", image: lesson.image || "" }];
  return [];
}

export function lessonTitle(lesson) {
  if (lesson.title && lesson.title.trim()) return lesson.title.trim();
  const c = (lesson.content || "").trim();
  return c.length > 70 ? `${c.slice(0, 70)}…` : c;
}

export function emptySetupDef() {
  return { id: null, name: "", note: "", link: "", image: "", checklist: [], variants: [] };
}

export function emptySetupVariant() {
  return { id: null, name: "", note: "", link: "", image: "", checklist: [] };
}

export const PROBLEM_MAX_IMAGES = 4;

export function emptyProblemLog(date) {
  return { id: null, date: date || todayStr(), problem: "", solution: "", images: [{ link: "", image: "" }], resolved: false };
}

export const MISS_MAX_IMAGES = 4;
export const SKIP_MAX_IMAGES = 4;

export function emptyMissed() {
  return {
    id: null, symbol: "", missDate: "", timeframe: "", setup: "", link: "", image: "", images: [{ link: "", image: "" }], reason: "", note: "",
    watch: false, watchDone: false, reviewDate: "", reviewDirection: "", reviewNote: "",
  };
}

export function emptySkipped() {
  return {
    id: null, symbol: "", skipDate: "", timeframe: "", setup: "", link: "", image: "", images: [{ link: "", image: "" }], reason: "", note: "",
    watch: false, watchDone: false, reviewDate: "", reviewDirection: "", reviewNote: "",
  };
}

export const VARIANT_MAX_IMAGES = 4;

// Setup biến thể: vẫn là setup quen thuộc nhưng nến chạy khác đi nên lúc đang giao dịch
// không nhận ra, xong lệnh nhìn lại mới thấy. Lưu ảnh lại để lần sau nhận diện sớm hơn.
export function emptyVariant() {
  return { id: null, symbol: "", variantDate: "", timeframe: "", setup: "", images: [{ link: "", image: "" }], note: "" };
}

export const SL_REMINDER_DEFAULT_HOURS = ["09:00", "12:00", "15:00", "18:00", "21:00"];

// Thứ 2 → Chủ nhật — dùng trực tiếp làm value lưu trong activeDays, khớp với nhãn hiển thị trên UI
export const WEEKDAY_CODES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function emptySlReminderSettings() {
  return {
    enabled: false, telegramBotToken: "", telegramChatId: "",
    schedules: [], setupCheckEnabled: false, setupCheckSchedules: [],
    incompleteReminder: emptyIncompleteReminder(),
    symbolWatchEnabled: false, symbolWatchThreadId: "",
  };
}

// Nhắc điền nốt các lệnh chưa hoàn thành 100% — mặc định tối Chủ nhật.
export function emptyIncompleteReminder() {
  return { enabled: false, weekday: "CN", time: "20:00", threadId: "" };
}

export const SYMBOL_WATCH_DEFAULT_HOURS = ["09:00", "14:00", "20:00"];

export function emptySymbolWatch() {
  return {
    id: uid(), symbol: "", note: "", enabled: true, done: false,
    hours: [...SYMBOL_WATCH_DEFAULT_HOURS], activeDays: [...WEEKDAY_CODES],
    snoozeUntil: "", // ISO UTC — khi người dùng bấm "Dời lại" trên Telegram
    lastNotifiedAt: "",
  };
}

export function emptyReminderSchedule(accountId, accountName) {
  return { accountId, accountName, enabled: false, hours: [...SL_REMINDER_DEFAULT_HOURS], threadId: "", activeDays: [...WEEKDAY_CODES] };
}

export function parseHoursInput(text) {
  return (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
}

// Toàn bộ dữ liệu nằm trong vài blob JSON, không có lịch sử phiên bản.
// Một lần nhập nhầm file hoặc bấm "Xóa toàn bộ" là mất sạch — nên tự giữ vài bản chụp gần nhất.
export const BACKUP_KEEP = 4;
export const BACKUP_INTERVAL_DAYS = 7;

export function shouldSnapshot(backups, nowMs) {
  if (!backups || !backups.length) return true;
  const latest = backups.reduce((a, b) => ((a.createdAt || 0) > (b.createdAt || 0) ? a : b));
  return (nowMs - (latest.createdAt || 0)) >= BACKUP_INTERVAL_DAYS * 24 * 3600000;
}

// Ảnh dán trực tiếp được lưu thành chuỗi base64 ngay trong bản ghi (tối đa 1.5MB/ảnh).
// Giữ nguyên chúng trong bản sao lưu thì 4 bản sẽ phình gấp 5 lần dữ liệu gốc và có thể
// làm hỏng cả việc đọc/ghi. Bản sao lưu chỉ giữ phần chữ + link, bỏ ảnh base64.
function stripInlineImages(value) {
  if (Array.isArray(value)) return value.map(stripInlineImages);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === "string" && v.startsWith("data:image") ? "" : stripInlineImages(v);
    }
    return out;
  }
  return value;
}

export function makeSnapshot(data, nowMs) {
  const slim = stripInlineImages(data);
  return {
    id: uid(),
    createdAt: nowMs,
    counts: {
      trades: (data.trades || []).length,
      lessons: (data.lessons || []).length,
      missedSetups: (data.missedSetups || []).length,
      skippedSetups: (data.skippedSetups || []).length,
      setupVariants: (data.setupVariants || []).length,
    },
    sizeKB: Math.round(JSON.stringify(slim).length / 1024),
    data: slim,
  };
}

export function pruneBackups(backups) {
  return [...backups].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, BACKUP_KEEP);
}

export const NEWS_MAX_IMAGES = 4;

export function emptyNewsLog(date) {
  return { id: null, date: date || todayStr(), title: "", currencies: [], content: "", images: [{ link: "", image: "" }] };
}

export function applyNewsLogFilters(items, filters) {
  return items.filter((n) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(n.title || "").toLowerCase().includes(q) && !(n.content || "").toLowerCase().includes(q)) return false;
    }
    if (filters.currency && !(n.currencies || []).includes(filters.currency)) return false;
    if (filters.from && (n.date || "") < filters.from) return false;
    if (filters.to && (n.date || "") > filters.to) return false;
    return true;
  });
}

export function startOfWeek(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyProcessImprovement() {
  return { id: null, weekStart: startOfWeek(), doneWell: "", mistakes: "", improveNext: "", violatedPrinciples: [] };
}

export function emptyReminder() {
  return { id: null, title: "", frequency: "weekly", weekday: 0, dayOfMonth: 1, date: "", active: true, doneDates: [], notifyTelegram: false, notifyTime: "08:00" };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reminderDueToday(r, ts) {
  if (!r.active) return false;
  if ((r.doneDates || []).includes(ts)) return false;
  const d = new Date(ts + "T00:00:00");
  if (r.frequency === "weekly") return Number(r.weekday) === d.getDay();
  if (r.frequency === "monthly") return Number(r.dayOfMonth) === d.getDate();
  if (r.frequency === "once") return r.date === ts;
  return false;
}

export function reminderScheduleLabel(r) {
  if (r.frequency === "weekly") return `Hằng tuần · ${WEEKDAY_LABEL[Number(r.weekday)]}`;
  if (r.frequency === "monthly") return `Hằng tháng · ngày ${r.dayOfMonth}`;
  if (r.frequency === "once") return `Một lần · ${r.date || "—"}`;
  return "—";
}

export function emptyCapitalAccount() {
  return { id: null, name: "", currency: "USD" };
}

export function emptyCapitalEntry(date, reserveCapital) {
  return { id: null, accountId: "", date: date || "", reserveCapital: reserveCapital ?? "", tradeCapital: "", note: "" };
}

export function emptyCapitalFlow(date) {
  return { id: null, accountId: "", type: "deposit", amount: "", direction: "reserveToTrade", date: date || "", note: "" };
}

export function buildCapitalIndexCurve(entries, flows) {
  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (!sorted.length) return [];
  const points = [];
  let index = 100;
  let prevDate = null, prevTotal = null;
  sorted.forEach((e, i) => {
    const total = (Number(e.reserveCapital) || 0) + (Number(e.tradeCapital) || 0);
    if (i === 0) {
      index = 100;
    } else {
      const netCF = flows
        .filter((f) => (f.type === "deposit" || f.type === "withdraw") && f.date > prevDate && f.date <= e.date)
        .reduce((s, f) => s + (f.type === "deposit" ? Number(f.amount) || 0 : -(Number(f.amount) || 0)), 0);
      const growth = prevTotal ? (total - netCF) / prevTotal : 1;
      index = index * growth;
    }
    points.push({ date: e.date, index: Number(index.toFixed(2)), total, reserve: Number(e.reserveCapital) || 0, trade: Number(e.tradeCapital) || 0 });
    prevDate = e.date; prevTotal = total;
  });
  return points;
}

export let currentUserId = null;

export function setCurrentUserId(id) { currentUserId = id; }

export async function safeGet(key, fallback) {
  if (!currentUserId) return fallback;
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("value")
      .eq("user_id", currentUserId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch (e) {
    return fallback;
  }
}

export async function safeSet(key, value) {
  if (!currentUserId) return false;
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert({ user_id: currentUserId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) { console.error("storage set failed", key, error); return false; }
    return true;
  } catch (e) {
    console.error("storage set failed", key, e);
    return false;
  }
}

export function normalizeResources(rs) {
  const merged = { ...DEFAULT_RESOURCES, ...(rs || {}) };
  merged.accounts = (merged.accounts || []).map((a) =>
    typeof a === "string"
      ? { id: uid(), name: a, broker: "", currency: "USD", initialBalance: 0, parentId: "" }
      : { initialBalance: 0, parentId: "", ...a }
  );
  if (!merged.sessions || !merged.sessions.length) merged.sessions = DEFAULT_RESOURCES.sessions;
  merged.fxRates = { ...DEFAULT_RESOURCES.fxRates, ...(merged.fxRates || {}), USD: 1 };
  return merged;
}

export function toUSD(amount, currency, fxRates) {
  if (!currency || currency === "USD") return amount;
  const rate = (fxRates && fxRates[currency]) || 1;
  return amount / rate;
}

// Lãi/lỗ của một lệnh quy đổi sang USD theo tiền tệ của tài khoản.
// Bắt buộc dùng khi gộp nhiều tài khoản lại (lịch, tổng quan, sắp xếp) — nếu không
// một lệnh VNĐ sẽ nuốt trọn tổng của cả tháng vì con số lớn gấp hàng chục nghìn lần.
export function tradeProfitUSD(t, resources) {
  const { profit } = computeResult(t);
  if (profit === null) return null;
  const acc = ((resources && resources.accounts) || []).find((a) => a.name === t.account);
  return toUSD(profit, acc ? acc.currency : "USD", resources && resources.fxRates);
}

export function tradeCurrency(t, resources) {
  const acc = ((resources && resources.accounts) || []).find((a) => a.name === t.account);
  return acc && acc.currency ? acc.currency : "USD";
}

// Với mỗi loại tài nguyên: đổi tên nó thì phải đổi theo ở những trường nào của lệnh / setup miss / skip.
// Thiếu bảng này là đổi tên xong toàn bộ dữ liệu cũ rơi ra khỏi thống kê và bộ lọc.
export const RESOURCE_TRADE_FIELDS = {
  symbols: { trade: ["symbol"], missed: ["symbol"], skipped: ["symbol"], variant: ["symbol"] },
  setups: { trade: ["setup"], missed: ["setup"], skipped: ["setup"], variant: ["setup"] },
  setupBonus: { trade: ["setupBonus"] },
  setupNotes: { trade: ["setupNote"] },
  entrySkills: { trade: ["entrySkill"] },
  inTradeSkills: { trade: ["inTradeSkill"] },
  exitSkills: { trade: ["exitSkill"] },
  psychologies: { trade: ["psychology"] },
  riskActions: { trade: ["riskAction"] },
  timeframes: { trade: ["timeframe"], missed: ["timeframe"], skipped: ["timeframe"], variant: ["timeframe"] },
  sessions: { trade: ["session"] },
  missReasons: { missed: ["reason"] },
  skipReasons: { skipped: ["reason"] },
  checklistItems: { checklistKey: true },
  lessonCategories: { lessonArray: ["categories"] },
};

export function renameInList(items, fields, oldName, newName) {
  if (!fields || !fields.length) return { items, changed: false };
  let changed = false;
  const next = items.map((item) => {
    let copy = item;
    fields.forEach((f) => {
      if (copy[f] === oldName) {
        if (copy === item) copy = { ...item };
        copy[f] = newName;
        changed = true;
      }
    });
    return copy;
  });
  return { items: changed ? next : items, changed };
}

// Checklist lưu theo dạng { "Tên mục": true } nên đổi tên mục phải đổi cả khóa,
// nếu không mọi lệnh đã tick sẽ bị coi như chưa tick.
export function renameChecklistKey(trades, oldName, newName) {
  let changed = false;
  const next = trades.map((t) => {
    if (!t.checklist || !(oldName in t.checklist)) return t;
    const checklist = { ...t.checklist };
    checklist[newName] = checklist[oldName];
    delete checklist[oldName];
    changed = true;
    return { ...t, checklist };
  });
  return { items: changed ? next : trades, changed };
}

export function renameInArrayField(items, fields, oldName, newName) {
  let changed = false;
  const next = items.map((item) => {
    let copy = item;
    fields.forEach((f) => {
      const arr = item[f];
      if (Array.isArray(arr) && arr.includes(oldName)) {
        if (copy === item) copy = { ...item };
        copy[f] = arr.map((v) => (v === oldName ? newName : v));
        changed = true;
      }
    });
    return copy;
  });
  return { items: changed ? next : items, changed };
}

export function computeResult(trade) {
  const profit = trade.profit === "" || trade.profit === null || trade.profit === undefined ? null : Number(trade.profit);
  const riskAmount = trade.riskAmount === "" || trade.riskAmount === null || trade.riskAmount === undefined ? null : Number(trade.riskAmount);
  let rr = null;
  if (profit !== null && riskAmount && riskAmount !== 0) rr = profit / riskAmount;
  let outcome = null;
  if (profit !== null) outcome = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
  const status = profit !== null ? "closed" : "open";
  return { profit, riskAmount, rr, outcome, status };
}

export function accountBalance(account, ledger, trades) {
  let bal = Number(account.initialBalance) || 0;
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") bal += amt;
      else if (e.type === "withdraw") bal -= amt;
      else if (e.type === "transfer") bal -= amt;
    }
    if (e.type === "transfer" && e.toAccountId === account.id) bal += amt;
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) bal += r.profit;
    }
  });
  return bal;
}

export function accountOpenRisk(account, ledger, trades) {
  const openTrades = trades.filter((t) => t.account === account.name && computeResult(t).status === "open");
  if (!openTrades.length) return { pct: 0, count: 0 };
  const balance = accountBalance(account, ledger, trades);
  let pct = 0;
  openTrades.forEach((t) => {
    if (t.riskPercent !== "" && t.riskPercent !== null && t.riskPercent !== undefined && !Number.isNaN(Number(t.riskPercent))) {
      pct += Number(t.riskPercent);
    } else if (t.riskAmount !== "" && t.riskAmount !== null && t.riskAmount !== undefined && balance && !Number.isNaN(Number(t.riskAmount))) {
      pct += (Number(t.riskAmount) / balance) * 100;
    }
  });
  return { pct, count: openTrades.length };
}

const RISK_ALERT_LOSS_STREAK = 10;
const RISK_ALERT_DRAWDOWN_PCT = 7;

export function accountRiskAlert(account, ledger, trades) {
  const closed = closedOf(trades)
    .filter((x) => x.t.account === account.name)
    .sort((a, b) => (dateKey(a.t) || "").localeCompare(dateKey(b.t) || "") || (a.t.createdAt || 0) - (b.t.createdAt || 0));

  let consecutiveLosses = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (closed[i].r.outcome === "loss") consecutiveLosses++;
    else break;
  }

  const curve = buildBalanceCurve(account, ledger, trades);
  let peak = -Infinity;
  curve.forEach((p) => { if (p.balance > peak) peak = p.balance; });
  const current = curve.length ? curve[curve.length - 1].balance : 0;
  const drawdownPercent = peak > 0 ? Math.max(0, ((peak - current) / peak) * 100) : 0;

  const streakTriggered = consecutiveLosses >= RISK_ALERT_LOSS_STREAK;
  const drawdownTriggered = drawdownPercent >= RISK_ALERT_DRAWDOWN_PCT;
  const reasons = [];
  if (streakTriggered) reasons.push(`${consecutiveLosses} lệnh thua liên tiếp`);
  if (drawdownTriggered) reasons.push(`Sụt giảm ${drawdownPercent.toFixed(1)}% từ đỉnh vốn`);

  return {
    accountName: account.name,
    consecutiveLosses,
    drawdownPercent,
    streakTriggered,
    drawdownTriggered,
    triggered: streakTriggered || drawdownTriggered,
    reasons,
  };
}

export function computeRiskAlerts(resources, trades, ledger) {
  const accounts = (resources && resources.accounts) || [];
  return accounts
    .map((a) => accountRiskAlert(a, ledger || [], trades || []))
    .filter((a) => a.triggered);
}

export function avgPillarScore(t) {
  const vals = [t.ratingRisk, t.ratingKnowledge, t.ratingSkill, t.ratingPsychology].filter((v) => v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function checklistProgress(t, resources) {
  const items = (resources && resources.checklistItems) || [];
  if (items.length === 0) return null;
  const checked = items.filter((item) => t.checklist && t.checklist[item]).length;
  return { checked, total: items.length };
}

// Không tính vào % hoàn thành: Phiên, Bonus, Điểm cấu trúc (tùy chọn theo cặp/loại lệnh),
// Lý do (quản trị vốn), Lý do vào lệnh (kiến thức), Nhận xét/Review (đánh giá giao dịch) và Checklist
// — đây đều là các mục điền hoặc không tùy ý, không phản ánh mức độ điền đầy đủ của một lệnh.
export function tradeCompletionFields(t) {
  const filled = (v) => v !== "" && v !== null && v !== undefined && v !== 0;
  return [
    ["entryDate", !!t.entryDate],
    ["account", !!t.account],
    ["timeframe", !!t.timeframe],
    ["entryVisual", !!(t.entryImage || t.entryLink)],
    ["riskPercent", filled(t.riskPercent)],
    ["riskAmount", filled(t.riskAmount)],
    ["riskAction", !!t.riskAction],
    ["ratingRisk", !!t.ratingRisk],
    ["setup", !!t.setup],
    ["setupNote", !!t.setupNote],
    ["ratingKnowledge", !!t.ratingKnowledge],
    ["exitDate", !!t.exitDate],
    ["profit", filled(t.profit)],
    ["exitVisual", !!(t.exitImage || t.exitLink)],
    ["entrySkill", !!t.entrySkill],
    ["inTradeSkill", !!t.inTradeSkill],
    ["exitSkill", !!t.exitSkill],
    ["ratingSkill", !!t.ratingSkill],
    ["psychology", !!t.psychology],
    ["ratingPsychology", !!t.ratingPsychology],
    ["tradeGrade", !!t.tradeGrade],
  ];
}

export function tradeCompletion(t) {
  const items = tradeCompletionFields(t);
  const total = items.length;
  const done = items.filter(([, ok]) => ok).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const COMPLETION_FIELD_LABELS = {
  entryDate: "Ngày entry",
  account: "Tài khoản",
  timeframe: "Khung thời gian",
  entryVisual: "Ảnh/link vào lệnh",
  riskPercent: "Rủi ro (%)",
  riskAmount: "Rủi ro (tiền)",
  riskAction: "Quản trị vốn",
  ratingRisk: "Chấm điểm quản trị vốn",
  setup: "Setup",
  setupNote: "Nhận xét Setup",
  ratingKnowledge: "Chấm điểm kiến thức",
  exitDate: "Ngày exit",
  profit: "Lợi nhuận",
  exitVisual: "Ảnh/link thoát lệnh",
  entrySkill: "Kỹ năng vào lệnh",
  inTradeSkill: "Kỹ năng trong lệnh",
  exitSkill: "Kỹ năng thoát lệnh",
  ratingSkill: "Chấm điểm kỹ năng",
  psychology: "Tâm lý",
  ratingPsychology: "Chấm điểm tâm lý",
  tradeGrade: "Đánh giá giao dịch",
};

export function missingCompletionFields(t) {
  return tradeCompletionFields(t).filter(([, ok]) => !ok).map(([key]) => COMPLETION_FIELD_LABELS[key] || key);
}

export function isFieldMissing(t, key) {
  const entry = tradeCompletionFields(t).find(([k]) => k === key);
  return entry ? !entry[1] : false;
}

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function dateKey(t) { return t.exitDate || t.entryDate || ""; }

const FX_CURRENCIES = ["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD", "XAU", "XAG"];

export function isForexSymbol(symbol) {
  if (!symbol) return false;
  // Chấp nhận cả 2 cách viết: "USDJPY" và "USD/JPY".
  const s = symbol.toUpperCase().replace(/\//g, "");
  if (s.length !== 6) return false;
  return FX_CURRENCIES.includes(s.slice(0, 3)) && FX_CURRENCIES.includes(s.slice(3, 6));
}

// Quy đổi phiên theo giờ Việt Nam (UTC+7) từ khung giờ phiên chuẩn quốc tế (UTC):
// Tokyo 00:00–09:00, London 07:00–16:00, New York 12:00–21:00, London/NY chồng lấn 12:00–16:00.
export function sessionFromTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const mins = h * 60 + (Number.isNaN(m) ? 0 : m);
  if (mins >= 7 * 60 && mins < 14 * 60) return "Á (Tokyo)";
  if (mins >= 14 * 60 && mins < 19 * 60) return "Âu (London)";
  if (mins >= 19 * 60 && mins < 23 * 60) return "Âu-Mỹ chồng lấn";
  return "Mỹ (New York)";
}

export function holdHours(t) {
  if (!t.entryDate || !t.exitDate) return null;
  const entry = new Date(`${t.entryDate}T${t.entryTime || "00:00"}:00`);
  const exit = new Date(`${t.exitDate}T${t.exitTime || "00:00"}:00`);
  const diff = (exit - entry) / 3600000;
  return diff >= 0 ? diff : null;
}

export function monthKey(d) { return d ? d.slice(0, 7) : ""; }

export function yearKey(d) { return d ? d.slice(0, 4) : ""; }

export function weekdayIndex(d) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").getDay(); } catch (e) { return null; }
}

export function closedOf(trades) {
  return trades
    .map((t) => ({ t, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed" && x.r.profit !== null);
}

export function closedOfUSD(trades, resources) {
  return closedOf(trades).map((x) => {
    const acc = resources.accounts.find((a) => a.name === x.t.account);
    const currency = acc ? acc.currency : "USD";
    return { t: x.t, r: { ...x.r, profit: toUSD(x.r.profit, currency, resources.fxRates) } };
  });
}

export function groupStats(items, keyFn) {
  const out = {};
  items.forEach(({ t, r }) => {
    const key = keyFn(t) || "—";
    if (!out[key]) out[key] = { count: 0, wins: 0, losses: 0, totalR: 0, pnl: 0 };
    out[key].count += 1;
    if (r.outcome === "win") out[key].wins += 1;
    if (r.outcome === "loss") out[key].losses += 1;
    out[key].totalR += r.rr || 0;
    out[key].pnl += r.profit || 0;
  });
  return out;
}

export function heatColor(value, max) {
  if (!value || !max) return "transparent";
  const alpha = Math.min(0.85, 0.18 + 0.67 * (Math.abs(value) / max));
  const base = value >= 0 ? "76,175,125" : "224,97,90";
  return `rgba(${base},${alpha.toFixed(2)})`;
}

export function formatVN(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(n);
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

export function buildBalanceCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, delta: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, delta: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, delta: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, delta: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), delta: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = Number(account.initialBalance) || 0;
  const points = [{ date: "Bắt đầu", balance: Number(bal.toFixed(2)) }];
  events.forEach((e) => { bal += e.delta; points.push({ date: e.date || "—", balance: Number(bal.toFixed(2)) }); });
  return points;
}

export function buildTWRCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, cashflow: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, cashflow: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, cashflow: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, cashflow: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), pnl: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let periodStartBalance = Number(account.initialBalance) || 0;
  let periodStartIndex = 100;
  let runningBalance = periodStartBalance;
  const points = [{ date: "Bắt đầu", index: 100, balance: Number(runningBalance.toFixed(2)) }];

  events.forEach((e) => {
    if (e.pnl !== undefined) {
      runningBalance += e.pnl;
      const idx = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      points.push({ date: e.date || "—", index: Number(idx.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    } else {
      const idxBeforeFlow = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      runningBalance += e.cashflow;
      periodStartBalance = runningBalance;
      periodStartIndex = idxBeforeFlow;
      points.push({ date: e.date || "—", index: Number(idxBeforeFlow.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    }
  });
  return points;
}

export function buildGrowthSeries(curve, initialBalance, granularity) {
  const dated = curve.slice(1).filter((p) => p.date && p.date !== "—");
  if (!dated.length) return [];
  const byPeriod = {};
  dated.forEach((p) => {
    let key;
    if (granularity === "month") key = p.date.slice(0, 7);
    else if (granularity === "week") {
      const d = new Date(p.date + "T00:00:00");
      const dow = (d.getDay() + 6) % 7;
      const monday = new Date(d); monday.setDate(d.getDate() - dow);
      key = monday.toISOString().slice(0, 10);
    } else key = p.date;
    byPeriod[key] = p.balance;
  });
  const keys = Object.keys(byPeriod).sort();
  return keys.map((k) => ({ period: k, growth: initialBalance ? Number((((byPeriod[k] - initialBalance) / Math.abs(initialBalance)) * 100).toFixed(2)) : 0 }));
}

// Trả về giá trị dùng để so sánh khi sắp xếp bảng nhật ký. Trả null khi ô trống —
// những dòng này luôn bị đẩy xuống cuối, dù đang sắp xếp tăng hay giảm dần.
export function tradeSortValue(t, key, resources) {
  const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  const str = (v) => (v ? String(v).toLowerCase() : null);
  const r = computeResult(t);
  switch (key) {
    case "entryDate": return t.entryDate || null;
    case "account": return str(t.account);
    case "symbol": return str(t.symbol);
    case "direction": return t.direction === "buy" ? 0 : t.direction === "sell" ? 1 : null;
    case "setup": return str(t.setup);
    case "timeframe": return str(t.timeframe);
    case "riskPercent": return num(t.riskPercent);
    // Quy đổi USD trước khi so sánh, nếu không lệnh VNĐ luôn nằm ở cực trị của cột này.
    case "profit": return tradeProfitUSD(t, resources);
    case "rr": return r.rr;
    // Lệnh đang mở luôn đứng thành một nhóm riêng để dễ soi "lệnh nào còn chạy".
    case "status": return r.status === "open" ? 0 : r.outcome === "win" ? 1 : r.outcome === "be" ? 2 : 3;
    case "score": return avgPillarScore(t);
    case "checklist": {
      const cp = checklistProgress(t, resources);
      return cp ? cp.checked / cp.total : null;
    }
    case "grade": {
      const g = GRADE_OPTIONS.find((x) => x.id === t.tradeGrade);
      return g ? (g.tone === "win" ? 0 : 1) : null;
    }
    case "completion": return tradeCompletion(t).percent;
    case "hasLesson": return t.hasLesson ? 0 : 1;
    default: return null;
  }
}

export function sortTrades(trades, sort, resources) {
  const { key, dir } = sort || {};
  if (!key) return trades;
  const mul = dir === "asc" ? 1 : -1;
  return [...trades].sort((a, b) => {
    const av = tradeSortValue(a, key, resources);
    const bv = tradeSortValue(b, key, resources);
    if (av === null && bv === null) return (b.createdAt || 0) - (a.createdAt || 0);
    if (av === null) return 1; // ô trống luôn xuống cuối
    if (bv === null) return -1;
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return (b.createdAt || 0) - (a.createdAt || 0); // hòa thì lệnh nhập sau lên trước
  });
}

const CSV_COLUMNS = [
  ["Ngày entry", (t) => t.entryDate],
  ["Giờ entry", (t) => t.entryTime],
  ["Tài khoản", (t) => t.account],
  ["Symbol", (t) => t.symbol],
  ["Hướng", (t) => (t.direction === "buy" ? "Buy" : "Sell")],
  ["Khung TG", (t) => t.timeframe],
  ["Phiên", (t) => t.session],
  ["Setup", (t) => t.setup],
  ["Bonus", (t) => t.setupBonus],
  ["Nhận xét setup", (t) => t.setupNote],
  ["Điểm cấu trúc", (t) => t.structureScore],
  ["Risk %", (t) => t.riskPercent],
  ["Risk tiền", (t) => t.riskAmount],
  ["Quản trị vốn", (t) => t.riskAction],
  ["Ngày exit", (t) => t.exitDate],
  ["Giờ exit", (t) => t.exitTime],
  ["Giờ giữ lệnh", (t) => { const h = holdHours(t); return h === null ? "" : h.toFixed(2); }],
  ["Lãi/Lỗ", (t) => t.profit],
  ["RR", (t) => { const { rr } = computeResult(t); return rr === null ? "" : rr.toFixed(2); }],
  ["Kết quả", (t) => { const { status, outcome } = computeResult(t); return status === "open" ? "Đang mở" : outcome === "win" ? "Thắng" : outcome === "loss" ? "Thua" : "Hòa"; }],
  ["Vào lệnh", (t) => t.entrySkill],
  ["Trong lệnh", (t) => t.inTradeSkill],
  ["Thoát lệnh", (t) => t.exitSkill],
  ["Tâm lý", (t) => t.psychology],
  ["Điểm TB", (t) => { const s = avgPillarScore(t); return s === null ? "" : s.toFixed(2); }],
  ["Đánh giá", (t) => (GRADE_OPTIONS.find((g) => g.id === t.tradeGrade) || {}).label || ""],
  ["Tiến độ %", (t) => tradeCompletion(t).percent],
  ["Có bài học", (t) => (t.hasLesson ? "Có" : "")],
  ["Bài học", (t) => t.lessonNote],
  ["Lý do vào lệnh", (t) => t.entryReason],
  ["Nhận xét/Review", (t) => t.reviewNote],
];

export function tradesToCsv(trades) {
  // Bọc mọi ô trong dấu nháy kép và nhân đôi nháy bên trong — an toàn với dấu phẩy, xuống dòng, tiếng Việt.
  const cell = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const lines = [CSV_COLUMNS.map(([label]) => cell(label)).join(",")];
  trades.forEach((t) => lines.push(CSV_COLUMNS.map(([, get]) => cell(get(t))).join(",")));
  // BOM để Excel nhận đúng UTF-8, nếu không tiếng Việt sẽ hiện thành ký tự lạ.
  return "﻿" + lines.join("\r\n");
}

export function applyFilters(trades, filters, resources) {
  return trades.filter((t) => {
    const r = computeResult(t);
    if (filters.q && !t.symbol.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.account && t.account !== filters.account) return false;
    if (filters.year && yearKey(t.entryDate) !== filters.year) return false;
    if (filters.month && (t.entryDate || "").slice(5, 7) !== filters.month) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.session && t.session !== filters.session) return false;
    if (filters.psychology && t.psychology !== filters.psychology) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.result) {
      if (filters.result === "open" && r.status !== "open") return false;
      if (["win", "loss", "be"].includes(filters.result) && r.outcome !== filters.result) return false;
    }
    if (filters.score) {
      const s = avgPillarScore(t);
      if (s === null) return false;
      if (filters.score === "low" && s > 2) return false;
      if (filters.score === "mid" && (s <= 2 || s >= 4)) return false;
      if (filters.score === "high" && s < 4) return false;
    }
    if (filters.checklist) {
      const cp = checklistProgress(t, resources);
      if (cp === null) return false;
      if (filters.checklist === "complete" && cp.checked !== cp.total) return false;
      if (filters.checklist === "none" && cp.checked !== 0) return false;
      if (filters.checklist === "partial" && (cp.checked === 0 || cp.checked === cp.total)) return false;
    }
    if (filters.hasLesson === "yes" && !t.hasLesson) return false;
    if (filters.hasLesson === "no" && t.hasLesson) return false;
    if (filters.completion) {
      const percent = tradeCompletion(t).percent;
      if (filters.completion === "low" && percent >= 40) return false;
      if (filters.completion === "mid" && (percent < 40 || percent >= 80)) return false;
      if (filters.completion === "high" && (percent < 80 || percent >= 100)) return false;
      if (filters.completion === "full" && percent !== 100) return false;
    }
    return true;
  });
}

export function inRange(dateStr, range, customFrom, customTo) {
  if (!range || !dateStr) return true;
  if (range === "custom") {
    if (customFrom && dateStr < customFrom) return false;
    if (customTo && dateStr > customTo) return false;
    return true;
  }
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (range === "7d") { const from = new Date(now); from.setDate(from.getDate() - 7); return d >= from; }
  if (range === "30d") { const from = new Date(now); from.setDate(from.getDate() - 30); return d >= from; }
  if (range === "90d") { const from = new Date(now); from.setDate(from.getDate() - 90); return d >= from; }
  if (range === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (range === "quarter") return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

export function buildInsights(closed) {
  const insights = [];
  const MIN = 3;
  const bySetup = groupStats(closed, (t) => t.setup || "Chưa gắn setup");
  const setupEntries = Object.entries(bySetup).filter(([, s]) => s.count >= MIN);
  if (setupEntries.length) {
    const best = [...setupEntries].sort((a, b) => b[1].totalR - a[1].totalR)[0];
    const worst = [...setupEntries].sort((a, b) => a[1].totalR - b[1].totalR)[0];
    if (best[1].totalR > 0) insights.push(`Setup "${best[0]}" đang hiệu quả nhất: tổng ${best[1].totalR.toFixed(2)}R sau ${best[1].count} lệnh, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
    if (worst[0] !== best[0] && worst[1].totalR < 0) insights.push(`Setup "${worst[0]}" đang kéo hiệu suất xuống: ${worst[1].totalR.toFixed(2)}R sau ${worst[1].count} lệnh — cân nhắc xem lại điều kiện vào lệnh của setup này.`);
  }
  const byWeekday = {};
  closed.forEach((x) => {
    const wd = weekdayIndex(x.t.entryDate);
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { count: 0, wins: 0, pnl: 0 };
    byWeekday[wd].count += 1; byWeekday[wd].pnl += x.r.profit;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const wdEntries = Object.entries(byWeekday).filter(([, s]) => s.count >= MIN);
  if (wdEntries.length) {
    const best = wdEntries.sort((a, b) => b[1].pnl - a[1].pnl)[0];
    insights.push(`Bạn giao dịch tốt nhất vào ${WEEKDAY_LABEL[best[0]]}: lãi ${fmt(best[1].pnl)}, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
  }
  const highRisk = closed.filter((x) => x.t.ratingRisk >= 4);
  const lowRisk = closed.filter((x) => x.t.ratingRisk > 0 && x.t.ratingRisk <= 2);
  if (highRisk.length >= MIN && lowRisk.length >= MIN) {
    const wrHigh = (highRisk.filter((x) => x.r.outcome === "win").length / highRisk.length) * 100;
    const wrLow = (lowRisk.filter((x) => x.r.outcome === "win").length / lowRisk.length) * 100;
    if (Math.abs(wrHigh - wrLow) >= 10) {
      insights.push(`Khi tự đánh giá quản trị vốn 4-5 sao, tỷ lệ thắng của bạn là ${wrHigh.toFixed(0)}%, so với chỉ ${wrLow.toFixed(0)}% khi tự chấm 1-2 sao — kỷ luật rủi ro đang ảnh hưởng rõ tới kết quả.`);
    }
  }
  const buys = closed.filter((x) => x.t.direction === "buy");
  const sells = closed.filter((x) => x.t.direction === "sell");
  if (buys.length >= MIN && sells.length >= MIN) {
    const wrBuy = (buys.filter((x) => x.r.outcome === "win").length / buys.length) * 100;
    const wrSell = (sells.filter((x) => x.r.outcome === "win").length / sells.length) * 100;
    if (Math.abs(wrBuy - wrSell) >= 15) {
      insights.push(`Lệnh ${wrBuy > wrSell ? "Buy" : "Sell"} đang có tỷ lệ thắng cao hơn hẳn (${Math.max(wrBuy, wrSell).toFixed(0)}% so với ${Math.min(wrBuy, wrSell).toFixed(0)}%).`);
    }
  }
  if (insights.length === 0) insights.push("Chưa đủ dữ liệu để đưa ra phân tích tự động đáng tin cậy — cần thêm lệnh đã đóng ở mỗi nhóm (tối thiểu 3 lệnh/nhóm).");
  return insights.slice(0, 5);
}

export function keyForDim(t, dim) {
  if (dim === "symbol") return t.symbol || "—";
  if (dim === "setup") return t.setup || "Chưa gắn setup";
  // Theo ngày mở lệnh (entryDate), không phải ngày đóng — winrate theo thứ phục vụ quyết định vào lệnh.
  if (dim === "weekday") { const wd = weekdayIndex(t.entryDate); return wd === null ? "—" : WEEKDAY_LABEL[wd]; }
  if (dim === "structure") return t.structureScore !== "" && t.structureScore !== undefined && t.structureScore !== null ? `ĐCT ${t.structureScore}` : "Chưa chấm";
  return "—";
}

export function computeAdvancedMetrics(closed) {
  const sorted = [...closed].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
  const withR = sorted.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const wins = sorted.filter((x) => x.r.outcome === "win");
  const losses = sorted.filter((x) => x.r.outcome === "loss");
  const winsR = wins.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const lossesR = losses.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));

  const netProfit = sorted.reduce((s, x) => s + x.r.profit, 0);
  const netProfitR = withR.reduce((s, x) => s + x.r.rr, 0);
  const grossWin = wins.reduce((s, x) => s + x.r.profit, 0);
  const grossLoss = losses.reduce((s, x) => s + x.r.profit, 0);
  const profitFactor = grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgWinR = winsR.length ? winsR.reduce((s, x) => s + x.r.rr, 0) / winsR.length : 0;
  const avgLossR = lossesR.length ? lossesR.reduce((s, x) => s + x.r.rr, 0) / lossesR.length : 0;
  const largestWin = wins.length ? Math.max(...wins.map((x) => x.r.profit)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map((x) => x.r.profit)) : 0;
  const largestWinR = winsR.length ? Math.max(...winsR.map((x) => x.r.rr)) : 0;
  const largestLossR = lossesR.length ? Math.min(...lossesR.map((x) => x.r.rr)) : 0;

  let cum = 0, peak = 0, maxDD = 0;
  sorted.forEach((x) => { cum += x.r.profit; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; });
  let cumR = 0, peakR = 0, maxDDR = 0;
  withR.forEach((x) => { cumR += x.r.rr; if (cumR > peakR) peakR = cumR; const dd = peakR - cumR; if (dd > maxDDR) maxDDR = dd; });

  let curWin = 0, maxWinStreak = 0, curLoss = 0, maxLossStreak = 0;
  sorted.forEach((x) => {
    if (x.r.outcome === "win") { curWin += 1; maxWinStreak = Math.max(maxWinStreak, curWin); curLoss = 0; }
    else if (x.r.outcome === "loss") { curLoss += 1; maxLossStreak = Math.max(maxLossStreak, curLoss); curWin = 0; }
    else { curWin = 0; curLoss = 0; }
  });

  const winHolds = wins.map((x) => holdHours(x.t)).filter((v) => v !== null);
  const lossHolds = losses.map((x) => holdHours(x.t)).filter((v) => v !== null);
  const avgHoldWin = winHolds.length ? winHolds.reduce((a, b) => a + b, 0) / winHolds.length : null;
  const avgHoldLoss = lossHolds.length ? lossHolds.reduce((a, b) => a + b, 0) / lossHolds.length : null;

  const longs = sorted.filter((x) => x.t.direction === "buy");
  const shorts = sorted.filter((x) => x.t.direction === "sell");
  const longWinrate = longs.length ? (longs.filter((x) => x.r.outcome === "win").length / longs.length) * 100 : null;
  const shortWinrate = shorts.length ? (shorts.filter((x) => x.r.outcome === "win").length / shorts.length) * 100 : null;
  const longsPnl = longs.reduce((s, x) => s + x.r.profit, 0);
  const shortsPnl = shorts.reduce((s, x) => s + x.r.profit, 0);
  const winRate = sorted.length ? (wins.length / sorted.length) * 100 : null;
  const rrRatioMoney = avgLoss ? avgWin / Math.abs(avgLoss) : null;
  const rrRatioR = avgLossR ? avgWinR / Math.abs(avgLossR) : null;
  const expectancyMoney = sorted.length ? netProfit / sorted.length : null;
  const expectancyR = sorted.length ? netProfitR / sorted.length : null;

  return {
    netProfit, netProfitR, profitFactor, grossWin, grossLoss, avgWin, avgLoss, avgWinR, avgLossR,
    largestWin, largestLoss, largestWinR, largestLossR, maxDD, maxDDR, maxWinStreak, maxLossStreak,
    avgHoldWin, avgHoldLoss, longsCount: longs.length, shortsCount: shorts.length, longWinrate, shortWinrate,
    longsPnl, shortsPnl, winRate, rrRatioMoney, rrRatioR, expectancyMoney, expectancyR,
  };
}

export function fmtR(v) { return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}R`; }

// SQN (System Quality Number - Van Tharp): sqrt(n) * kỳ vọng(R) / độ lệch chuẩn(R).
// Cần R-multiple mỗi lệnh (profit / riskAmount), nên chỉ tính được trên các lệnh có điền riskAmount.
export function computeSystemQuality(closed) {
  const withR = closed.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const n = withR.length;
  if (n < 5) return null;
  const rs = withR.map((x) => x.r.rr);
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(variance);
  const sqn = stdev ? (Math.sqrt(n) * mean) / stdev : null;
  // SQN100: chuẩn hóa về cỡ mẫu 100 lệnh (khuyến nghị của Van Tharp) để so sánh công bằng giữa các giai đoạn/hệ thống có số lệnh khác nhau.
  const sqn100 = stdev ? (10 * mean) / stdev : null;

  const wins = withR.filter((x) => x.r.outcome === "win");
  const losses = withR.filter((x) => x.r.outcome === "loss");
  const winRate = wins.length / n;
  const avgWinR = wins.length ? wins.reduce((s, x) => s + x.r.rr, 0) / wins.length : 0;
  const avgLossR = losses.length ? losses.reduce((s, x) => s + x.r.rr, 0) / losses.length : 0;
  const payoffRatio = avgLossR ? avgWinR / Math.abs(avgLossR) : null;

  // Kelly Criterion: f* = p - (1-p)/b, với p = winrate, b = tỷ lệ lãi TB / lỗ TB (theo R).
  let kellyFull = null;
  if (payoffRatio) kellyFull = winRate - (1 - winRate) / payoffRatio;

  // Hệ số "burn" cho xấp xỉ nguy cơ cháy tài khoản (Brownian motion có drift, xem hàm riskOfRuin bên dưới).
  const burnX = variance ? Math.exp((-2 * mean) / variance) : null;

  return { n, mean, stdev, variance, sqn, sqn100, winRate, avgWinR, avgLossR, payoffRatio, kellyFull, burnX };
}

export function sqnRating(sqn) {
  if (sqn === null || sqn === undefined || !Number.isFinite(sqn)) return "—";
  if (sqn < 1.0) return "Kém";
  if (sqn < 2.0) return "Dưới trung bình";
  if (sqn < 3.0) return "Trung bình";
  if (sqn < 5.0) return "Tốt";
  if (sqn < 7.0) return "Xuất sắc";
  if (sqn < 10.0) return "Tuyệt vời (hiếm)";
  return "Chén Thánh (nên kiểm tra lại dữ liệu)";
}

// Xấp xỉ nguy cơ cháy tài khoản (Risk of Ruin) theo mô hình random walk có drift:
// RoR ≈ burnX ^ U, với U = số "đơn vị vốn" chịu được trước khi cháy = 100 / % risk mỗi lệnh.
// Đây là công thức xấp xỉ liên tục (giả định lệnh độc lập, phân phối R ổn định) — chỉ mang tính tham khảo.
export function riskOfRuin(burnX, riskPercent) {
  if (burnX === null || burnX === undefined || !riskPercent || riskPercent <= 0) return null;
  if (burnX >= 1) return 1;
  const units = 100 / riskPercent;
  return Math.pow(burnX, units);
}

export function fmtHold(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} phút`;
  if (hours < 24) return `${hours.toFixed(1)} giờ`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  return remHours > 0 ? `${days} ngày ${remHours} giờ` : `${days} ngày`;
}

export function fmtMoney(value, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const cur = currency || "USD";
  const neg = value < 0;
  const numStr = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (cur === "USD") return `${neg ? "-" : ""}$${numStr}`;
  if (cur === "VND") return `${neg ? "-" : ""}${numStr}₫`;
  return `${neg ? "-" : ""}${numStr} ${cur}`;
}

export function applyMissSkipFilters(items, filters, dateField) {
  return items.filter((n) => {
    if (filters.q && !(n.symbol || "").toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.timeframe && n.timeframe !== filters.timeframe) return false;
    if (filters.setup && n.setup !== filters.setup) return false;
    if (filters.reason && n.reason !== filters.reason) return false;
    if (filters.from && (n[dateField] || "") < filters.from) return false;
    if (filters.to && (n[dateField] || "") > filters.to) return false;
    return true;
  });
}

export function applyProblemLogFilters(items, filters) {
  return items.filter((n) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(n.problem || "").toLowerCase().includes(q) && !(n.solution || "").toLowerCase().includes(q)) return false;
    }
    if (filters.status === "resolved" && !n.resolved) return false;
    if (filters.status === "unresolved" && n.resolved) return false;
    if (filters.from && (n.date || "") < filters.from) return false;
    if (filters.to && (n.date || "") > filters.to) return false;
    return true;
  });
}

export function applyLessonFilters(items, filters) {
  return items.filter((n) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(n.symbol || "").toLowerCase().includes(q) && !(n.content || "").toLowerCase().includes(q) && !(n.title || "").toLowerCase().includes(q)) return false;
    }
    if (filters.category && !(n.categories || []).includes(filters.category)) return false;
    if (filters.from && (n.date || "") < filters.from) return false;
    if (filters.to && (n.date || "") > filters.to) return false;
    return true;
  });
}
