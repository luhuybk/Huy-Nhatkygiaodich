import { supabase } from "../supabaseClient.js";
import { DEFAULT_RESOURCES, GRADE_OPTIONS, NOTE_TYPES, WEEKDAY_LABEL } from "./constants.js";

// Đang ở trang/tab nào là trạng thái riêng của thiết bị, không phải dữ liệu người dùng —
// để ở localStorage cho tức thì thay vì chờ ghi lên máy chủ mỗi lần đổi trang.
// Bọc try/catch vì trình duyệt ở chế độ ẩn danh có thể chặn localStorage.
export function readLocalUi(key, fallback) {
  try {
    const v = window.localStorage.getItem(`tj:${key}`);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function writeLocalUi(key, value) {
  try {
    window.localStorage.setItem(`tj:${key}`, value);
  } catch (e) {
    /* bỏ qua — chỉ là tiện ích, không phải dữ liệu quan trọng */
  }
}

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
    partialExits: [],
    exitDate: "", exitTime: "", exitLink: "", exitImage: "", profit: "", fees: "",
    entrySkill: "", inTradeSkill: "", exitSkill: "", ratingSkill: 0, skillNote: "",
    psychology: "", ratingPsychology: 0, psychologyNote: "",
    setupErrors: [], setupClean: false,
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

// ——— Lỗi theo setup ———
// Mỗi setup có một bộ lỗi riêng (DD: quá dốc, lỗi 2 nến... / BB: lỗi lỏng, lỗi xa...).
// setup === "" nghĩa là lỗi dùng chung cho mọi setup.
// ---- Thứ tự thủ công, dùng chung cho bộ lỗi và kỹ năng ----
// Dữ liệu cũ chưa có `order`: xếp sau các mục đã sắp, giữ nguyên thứ tự đã nhập.
// Không tự đánh số hàng loạt vì như thế mỗi lần mở app lại ghi đè dữ liệu mà người dùng không làm gì.
function orderKey(item, idx) {
  return item && Number.isFinite(item.order) ? item.order : 1e6 + idx;
}

export function sortedByOrder(list) {
  return (list || [])
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => orderKey(a.item, a.idx) - orderKey(b.item, b.idx) || a.idx - b.idx)
    .map((x) => x.item);
}

export function nextOrder(group) {
  const nums = (group || []).map((x) => x && x.order).filter((v) => Number.isFinite(v));
  return nums.length ? Math.max(...nums) + 1 : (group || []).length;
}

// Đổi chỗ một mục với hàng xóm trong cùng nhóm, rồi đánh số lại cả nhóm. Phải đánh số lại
// thì lần sau mới có mốc để so — chỉ ghi `order` cho một mục thì các mục cũ vẫn trôi về cuối.
export function moveByOrder(list, id, delta, groupOf = () => "") {
  const all = list || [];
  const target = all.find((x) => x && x.id === id);
  if (!target) return { items: all, changed: false };
  const key = groupOf(target);
  const group = sortedByOrder(all.filter((x) => x && groupOf(x) === key));
  const at = group.findIndex((x) => x.id === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= group.length) return { items: all, changed: false };
  const next = [...group];
  [next[at], next[to]] = [next[to], next[at]];
  const orderById = new Map(next.map((x, i) => [x.id, i]));
  return {
    items: all.map((x) => (x && orderById.has(x.id) ? { ...x, order: orderById.get(x.id) } : x)),
    changed: true,
  };
}

export function emptySetupError(setup) {
  return { id: null, setup: setup || "", name: "", note: "", order: null };
}

const errorGroupOf = (e) => (e && e.setup) || "";

export function sortSetupErrors(list) {
  return sortedByOrder(list);
}

export function moveSetupError(errors, id, delta) {
  return moveByOrder(errors, id, delta, errorGroupOf);
}

export function errorsForSetup(errors, setupName) {
  // Không có setup thì chưa biết bộ lỗi nào — trả rỗng để nơi gọi hiện lời nhắc chọn setup,
  // chứ không đổ hết mọi lỗi của mọi setup ra.
  if (!setupName) return [];
  const named = (errors || []).filter((e) => e && e.name);
  // Lỗi riêng của setup lên trước, lỗi dùng chung xuống sau — mỗi nhóm theo thứ tự đã sắp.
  // Trộn chung rồi sắp một lượt thì hai nhóm đánh số từ 0 sẽ cài răng lược vào nhau.
  return [
    ...sortedByOrder(named.filter((e) => e.setup === setupName)),
    ...sortedByOrder(named.filter((e) => !e.setup)),
  ];
}

export function allSetupErrors(errors) {
  return (errors || []).filter((e) => e && e.name);
}

// Ba trạng thái, và phải phân biệt được "đã soi, sạch lỗi" với "chưa soi bao giờ" —
// nếu gộp hai cái đó thì mẫu số của mọi tỷ trọng bên dưới đều sai.
export function tradeErrorState(trade) {
  if (!trade) return "unreviewed";
  if ((trade.setupErrors || []).length > 0) return "errors";
  if (trade.setupClean) return "clean";
  return "unreviewed";
}

// Chọn "Không lỗi" thì bỏ hết lỗi đang tick, và ngược lại — hai thứ này loại trừ nhau.
export function toggleTradeError(trade, errorId) {
  const cur = trade.setupErrors || [];
  const next = cur.includes(errorId) ? cur.filter((x) => x !== errorId) : [...cur, errorId];
  return { ...trade, setupErrors: next, setupClean: next.length ? false : trade.setupClean };
}

export function setTradeClean(trade, clean) {
  return { ...trade, setupClean: !!clean, setupErrors: clean ? [] : trade.setupErrors || [] };
}

// Xóa một lỗi khỏi bộ lỗi thì phải gỡ nó khỏi các lệnh đã tick, không thì lệnh đó
// mãi mãi đứng ở nhóm "có lỗi" mà không hiện lỗi nào.
export function stripSetupError(trades, errorId) {
  let changed = false;
  const items = (trades || []).map((t) => {
    if (!(t.setupErrors || []).includes(errorId)) return t;
    changed = true;
    return { ...t, setupErrors: t.setupErrors.filter((x) => x !== errorId) };
  });
  return { items, changed };
}

function errorPerf(list, resources) {
  const closed = list.filter((t) => computeResult(t).status === "closed");
  const wins = closed.filter((t) => computeResult(t).outcome === "win").length;
  const rrs = closed.map((t) => computeResult(t).rr).filter((v) => v !== null && Number.isFinite(v));
  const profit = closed.reduce((sum, t) => sum + (tradeProfitUSD(t, resources) || 0), 0);
  return {
    count: list.length,
    closed: closed.length,
    wins,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null,
    profit,
  };
}

// Thống kê cho một setup (setupName rỗng = mọi setup). Mẫu số là số lệnh ĐÃ SOI,
// nên tỷ trọng đọc được là "trong những lần đã ngồi soi lại, lỗi này chiếm bao nhiêu".
// Một lệnh dính nhiều lỗi thì được đếm ở nhiều dòng — tổng các dòng vượt 100% là bình thường.
export function setupErrorStats(trades, errors, setupName, resources) {
  const items = (trades || []).filter((t) => t && (!setupName || t.setup === setupName));
  const reviewed = items.filter((t) => tradeErrorState(t) !== "unreviewed");
  const clean = items.filter((t) => tradeErrorState(t) === "clean");
  const dirty = items.filter((t) => tradeErrorState(t) === "errors");
  const catalog = setupName ? errorsForSetup(errors, setupName) : allSetupErrors(errors);
  const rows = catalog.map((e) => {
    const hit = items.filter((t) => (t.setupErrors || []).includes(e.id));
    return {
      ...e,
      ...errorPerf(hit, resources),
      share: reviewed.length ? (hit.length / reviewed.length) * 100 : null,
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    total: items.length,
    reviewed: reviewed.length,
    unreviewed: items.length - reviewed.length,
    clean: errorPerf(clean, resources),
    dirty: errorPerf(dirty, resources),
    rows,
  };
}

// Đổi tên setup trong Tài nguyên thì bộ lỗi phải đi theo, không thì bộ lỗi của DD
// vẫn treo ở cái tên cũ và lệnh mang tên mới sẽ không thấy lỗi nào để chọn.
export function renameSetupInErrors(errors, from, to) {
  let changed = false;
  const items = (errors || []).map((e) => {
    if (e.setup !== from) return e;
    changed = true;
    return { ...e, setup: to };
  });
  return { items, changed };
}

// ---- Kỹ năng ----
// Kỹ năng là thứ đem ra thực thi ngay tại bàn, nên phần "cách làm" tách thành từng bước rời
// chứ không phải một đoạn văn — lúc đang có lệnh chạy thì không ai đọc hết đoạn văn.
export const SKILL_MAX_IMAGES = 8;

export const SKILL_LEVELS = [
  { id: "learning", label: "Đang học", tone: "" },
  { id: "practicing", label: "Đang luyện", tone: "warn" },
  { id: "solid", label: "Thành thạo", tone: "win" },
];

export function skillLevel(id) {
  return SKILL_LEVELS.find((x) => x.id === id) || SKILL_LEVELS[0];
}

export function emptySkill() {
  return {
    id: null, name: "", level: "learning", setups: [],
    summary: "", steps: [], watchOut: "",
    images: [{ link: "", image: "" }], order: null,
  };
}

export function skillAttachments(skill) {
  return ((skill && skill.images) || []).filter((it) => it && ((it.link && it.link.trim()) || it.image));
}

export function moveSkill(skills, id, delta) {
  return moveByOrder(skills, id, delta);
}

export function applySkillFilters(items, filters) {
  const f = filters || {};
  const q = (f.q || "").trim().toLowerCase();
  return (items || []).filter((s) => {
    if (f.level && (s.level || "learning") !== f.level) return false;
    if (f.setup && !(s.setups || []).includes(f.setup)) return false;
    if (q) {
      const hay = [s.name, s.summary, s.watchOut, ...(s.steps || [])].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function skillStats(items) {
  const list = items || [];
  const by = (id) => list.filter((s) => (s.level || "learning") === id).length;
  return {
    total: list.length,
    learning: by("learning"),
    practicing: by("practicing"),
    solid: by("solid"),
    // Kỹ năng khai ra mà chưa ghi bước thực thi thì mới là ý định, chưa dùng được.
    noSteps: list.filter((s) => !(s.steps || []).length).length,
  };
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
    weeklySummary: emptyWeeklySummary(),
    mutedFillReminder: emptyMutedFillReminder(),
    reconcileReminder: emptyReconcileReminder(),
    taskDurations: emptyTaskDurations(),
    symbolWatchEnabled: false, symbolWatchThreadId: "",
  };
}

// Nhắc điền nốt các lệnh chưa hoàn thành 100% — mặc định tối Chủ nhật.
export function emptyIncompleteReminder() {
  return { enabled: false, weekday: "CN", time: "20:00", threadId: "" };
}

// Tổng kết 7 ngày gần nhất gửi qua Telegram — mặc định tối Chủ nhật.
export function emptyWeeklySummary() {
  return { enabled: false, weekday: "CN", time: "19:00", threadId: "" };
}

// Bấm "Kết thúc lệnh" trên Telegram là hẹn sẽ điền nhật ký sau. Quá số ngày này mà
// lệnh vẫn chưa có ngày thoát thì nhắc lại, mỗi lệnh mỗi ngày một lần.
export function emptyMutedFillReminder() {
  return { enabled: true, days: 3, time: "20:00", threadId: "" };
}

// Đối chiếu file sàn chỉ có tác dụng nếu nhớ chạy — mỗi tuần một lần, sau khi thị trường
// đóng cửa, nhắc xuất CSV rồi quét ở tab Nhật ký → Đối chiếu sàn.
export function emptyReconcileReminder() {
  return { enabled: false, weekday: "CN", time: "10:00", threadId: "" };
}

export const MUTED_FILL_DEFAULT_DAYS = 3;

export function mutedFillDays(cfg) {
  const n = Number(cfg && cfg.days);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : MUTED_FILL_DEFAULT_DAYS;
}

// Số ngày kể từ lúc bấm "Kết thúc lệnh", để hiện trên web cho khớp với tin nhắn.
export function daysSince(iso, nowMs) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return Math.floor(((nowMs || Date.now()) - t) / 86400000);
}

export const SYMBOL_WATCH_DEFAULT_HOURS = ["09:00", "14:00", "20:00"];

// Một nhóm theo dõi = một khung giờ nhắc + nhiều symbol. Thường đặt theo timeframe
// ("H4", "Khung ngày") nhưng dùng cho watchlist hay phiên giao dịch đều được.
// Mỗi symbol có trạng thái done riêng để bấm "Ngừng theo dõi" cho từng symbol trên Telegram.
export function emptySymbolWatch() {
  return {
    id: uid(), label: "", symbols: [], note: "", enabled: true,
    hours: [...SYMBOL_WATCH_DEFAULT_HOURS], activeDays: [...WEEKDAY_CODES],
  };
}

export function parseSymbolList(text) {
  // Bỏ ký tự "|" vì nó là dấu phân cách trong callback_data của nút bấm Telegram.
  return [...new Set(
    (text || "").split(",").map((x) => x.replace(/\|/g, "").trim().toUpperCase()).filter(Boolean)
  )];
}

// Giữ nguyên id và trạng thái done của những symbol không đổi tên, để lần sửa danh sách
// không làm mất trạng thái đã bấm trên Telegram và không làm hỏng nút của tin nhắn cũ.
export function mergeSymbolList(text, existing) {
  const current = existing || [];
  return parseSymbolList(text).map((name) => {
    const old = current.find((x) => x.name === name);
    return old || { id: uid(), name, done: false };
  });
}

export function symbolWatchText(w) {
  return (w.symbols || []).map((x) => x.name).join(", ");
}

// Dữ liệu cũ: mỗi bản ghi là một symbol duy nhất ở trường `symbol`, done nằm ở cấp bản ghi.
// Chuyển sang dạng nhóm, tách luôn chuỗi "A, B, C" nếu người dùng đã gõ nhiều symbol vào một ô.
export function normalizeSymbolWatch(w) {
  const base = { ...emptySymbolWatch(), ...w };
  if (Array.isArray(w.symbols)) return { ...base, symbols: w.symbols };
  const names = parseSymbolList(w.symbol);
  return {
    ...base,
    label: w.label || "",
    symbols: names.map((name) => ({ id: uid(), name, done: !!w.done })),
  };
}

export function symbolWatchActiveCount(watches) {
  return (watches || []).reduce(
    (n, w) => n + (w.enabled ? (w.symbols || []).filter((x) => !x.done).length : 0),
    0
  );
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

export function shiftDate(dateStr, days) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Chuỗi ngày hoàn thành đủ: một ngày chỉ tính là xong khi MỌI lần nhắc hôm đó đều đã bấm.
// Chuỗi đếm theo những ngày CÓ nhắc, nên cuối tuần tắt lịch không làm đứt chuỗi.
// Hôm nay đang dở thì chưa cộng vào chuỗi nhưng cũng không làm đứt.
export function setupCheckStreak(log, fromToday) {
  const list = Array.isArray(log) ? log : [];
  const byDate = new Map();
  list.forEach((e) => {
    if (!e.date) return;
    const cur = byDate.get(e.date) || { total: 0, done: 0 };
    cur.total += 1;
    if (e.checkedAt) cur.done += 1;
    byDate.set(e.date, cur);
  });

  const today = fromToday || todayStr();
  const full = (d) => { const x = byDate.get(d); return !!x && x.total > 0 && x.done === x.total; };
  const asc = [...byDate.keys()].sort();
  const desc = [...asc].reverse();

  let i = 0;
  if (desc[0] === today && !full(today)) i = 1;
  let current = 0;
  for (; i < desc.length; i += 1) {
    if (!full(desc[i])) break;
    current += 1;
  }

  let best = 0;
  let run = 0;
  asc.forEach((d) => {
    if (full(d)) { run += 1; if (run > best) best = run; } else { run = 0; }
  });

  return { current, best, todayDone: byDate.has(today) ? full(today) : null };
}

// Tỷ lệ hoàn thành nhắc kiểm tra setup: đã bấm "Đã kiểm tra" trên Telegram bao nhiêu lần
// trên tổng số lần được nhắc. setupCheckLog do Edge Function ghi, web chỉ đọc.
export function setupCheckStats(log, days = 7, fromToday) {
  const list = Array.isArray(log) ? log : [];
  const from = shiftDate(fromToday || todayStr(), -(days - 1));
  const inRange = list.filter((e) => (e.date || "") >= from);
  const byAccount = new Map();
  inRange.forEach((e) => {
    const name = e.accountName || e.accountId || "?";
    const cur = byAccount.get(name) || { name, total: 0, done: 0 };
    cur.total += 1;
    if (e.checkedAt) cur.done += 1;
    byAccount.set(name, cur);
  });
  const done = inRange.filter((e) => e.checkedAt).length;
  return {
    from,
    days,
    total: inRange.length,
    done,
    percent: inRange.length ? Math.round((done / inRange.length) * 100) : null,
    accounts: [...byAccount.values()].sort((a, b) => b.total - a.total),
  };
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

// ---- Timeline làm việc ------------------------------------------------------
// Lịch nhắc nằm rải ở 3-4 khối cài đặt khác nhau nên không nhìn ra được một ngày
// thật sự phải làm bao nhiêu việc, và hai việc dài có trùng giờ nhau hay không.
// Phần dưới gom hết mọi lịch về cùng một trục thời gian của một thứ trong tuần.
export const TASK_KINDS = [
  { key: "sl", label: "Dời SL", defaultMinutes: 5, color: "#e0615a" },
  { key: "setupCheck", label: "Kiểm tra setup", defaultMinutes: 30, color: "#d4a24e" },
  { key: "symbolWatch", label: "Symbol theo dõi", defaultMinutes: 10, color: "#4a90e2" },
  { key: "reminder", label: "Nhắc nhở riêng", defaultMinutes: 10, color: "#9b7fe0" },
  { key: "report", label: "Tổng kết / nhắc điền", defaultMinutes: 15, color: "#4caf7d" },
];

export function taskKind(key) {
  return TASK_KINDS.find((k) => k.key === key) || TASK_KINDS[0];
}

export function emptyTaskDurations() {
  const out = {};
  TASK_KINDS.forEach((k) => { out[k.key] = k.defaultMinutes; });
  return out;
}

// Thứ tự ưu tiên: số riêng của lịch đó → số chung của loại việc → mặc định.
// Bỏ trống hoặc điền số vô lý thì rơi xuống mức sau, để timeline không bao giờ vỡ.
export function taskMinutes(durations, kind, override) {
  const clean = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 12 * 60) : null;
  };
  return clean(override)
    ?? clean((durations || {})[kind])
    ?? ((TASK_KINDS.find((k) => k.key === kind) || {}).defaultMinutes || 10);
}

export function hhmmToMinutes(hhmm) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesToHhmm(mins) {
  const v = Math.max(0, Math.round(mins));
  return `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

export function fmtDuration(mins) {
  const v = Math.max(0, Math.round(mins));
  if (v < 60) return `${v}p`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Nhắc nhở riêng lưu thứ theo số của Date.getDay() (0 = Chủ nhật), còn các lịch
// khác lưu theo mã "T2".."CN" — quy về cùng một mã trước khi so.
export function weekdayCodeFromNumber(n) {
  return WEEKDAY_CODES[(Number(n) + 6) % 7];
}

// Nhắc dời SL chỉ được gửi khi tài khoản còn lệnh đang mở (xem supabase/functions/
// sl-reminder/index.ts) — đếm y hệt ở đây để timeline hiện mờ đúng những mốc mà thực tế
// sẽ không có tin nào chạy. Lệnh đã bấm "Kết thúc lệnh" trên Telegram cũng không tính.
export function openTradeCounter({ accounts, trades, mutedTrades } = {}) {
  const mutedIds = new Set((mutedTrades || []).map((m) => m && m.tradeId).filter(Boolean));
  const byName = {};
  (trades || []).forEach((t) => {
    if (!t || !t.id || !t.entryDate || t.exitDate || mutedIds.has(t.id)) return;
    const name = t.account || "";
    if (name) byName[name] = (byName[name] || 0) + 1;
  });
  const nameById = {};
  (accounts || []).forEach((a) => { if (a && a.id) nameById[a.id] = a.name; });
  // Lịch trỏ tới tài khoản đã xoá thì lấy tên đã lưu trong lịch, giống hàm gửi tin.
  return (accountId, fallbackName) => {
    const name = nameById[accountId] || fallbackName || "";
    return name ? byName[name] || 0 : 0;
  };
}

// Một lịch dùng chung một danh sách giờ cho MỌI ngày đang bật, nhưng đời thật không đều
// như vậy: 22h thứ 6 khỏi kiểm tra setup vì sáng chủ nhật đã kiểm tra rồi, còn 22h chủ nhật
// thì thị trường chưa mở lại. `skip` ghi đúng những ô lẻ đó, dạng "T6@22:00".
export function skipKey(day, hour) {
  return `${day}@${hour}`;
}

export function skipListOf(x) {
  return Array.isArray(x && x.skip) ? x.skip : [];
}

export function toggleSkip(list, day, hour, off) {
  const key = skipKey(day, hour);
  const cur = Array.isArray(list) ? list : [];
  if (off) return cur.includes(key) ? cur : [...cur, key].sort();
  return cur.filter((k) => k !== key);
}

// Giờ hoặc thứ bị bỏ ở nơi khác thì ô lẻ trỏ tới nó thành rác — dọn để nó không âm thầm
// sống lại khi bạn thêm lại đúng mốc giờ đó.
export function pruneSkip(list, hours, activeDays) {
  const days = Array.isArray(activeDays) && activeDays.length ? activeDays : WEEKDAY_CODES;
  return (Array.isArray(list) ? list : []).filter((k) => {
    const [d, h] = String(k).split("@");
    return days.includes(d) && (hours || []).includes(h);
  });
}

// Những thứ mà một mốc giờ thật sự chạy — đã trừ các ô lẻ đã bỏ.
export function daysOfHour(x, hour) {
  const days = Array.isArray(x && x.activeDays) && x.activeDays.length ? x.activeDays : WEEKDAY_CODES;
  const skip = skipListOf(x);
  return days.filter((d) => !skip.includes(skipKey(d, hour)));
}

function pushHours(out, { hours, activeDays, day, kind, title, sub, enabled, minutes, sourceId, id, skip }) {
  const days = Array.isArray(activeDays) && activeDays.length ? activeDays : WEEKDAY_CODES;
  if (!days.includes(day)) return;
  const off = Array.isArray(skip) ? skip : [];
  (hours || []).forEach((h) => {
    if (off.includes(skipKey(day, h))) return;
    const start = hhmmToMinutes(h);
    if (start === null) return;
    // `source` cho biết đổi giờ thì phải ghi ngược vào bản ghi nào, và `days` để
    // nhắc rằng giờ này dùng chung cho mọi thứ mà lịch đó đang bật.
    out.push({
      id: `${sourceId}_${h}`, kind, title, sub, start, minutes, enabled,
      source: { kind, key: sourceId, id, hour: h }, days,
    });
  });
}

// Trả về mọi việc của một thứ trong tuần, kể cả việc đang tắt (để hiện mờ) —
// bên dùng tự lọc theo `enabled` khi cần cộng tổng.
export function buildDayTimeline(day, { settings, watches, reminders, durations, openTrades }) {
  const st = settings || {};
  const out = [];
  const mins = (kind, override) => taskMinutes(durations, kind, override);
  // Không truyền danh sách lệnh vào thì để nguyên trạng thái bật/tắt của lịch —
  // thà không làm mờ còn hơn làm mờ nhầm vì thiếu dữ liệu.
  const countOpen = typeof openTrades === "function" ? openTrades : null;

  (st.schedules || []).forEach((s) => {
    const open = countOpen ? countOpen(s.accountId, s.accountName) : null;
    const name = s.accountName || "";
    pushHours(out, {
      hours: s.hours, activeDays: s.activeDays, day, kind: "sl",
      title: "Dời SL",
      sub: open === null ? name : `${name}${name ? " · " : ""}${open ? `${open} lệnh mở` : "không có lệnh mở"}`,
      minutes: mins("sl", s.minutes),
      enabled: !!st.enabled && !!s.enabled && open !== 0, sourceId: `sl_${s.accountId}`, id: s.accountId,
      skip: s.skip,
    });
  });

  (st.setupCheckSchedules || []).forEach((s) => {
    pushHours(out, {
      hours: s.hours, activeDays: s.activeDays, day, kind: "setupCheck",
      title: "Kiểm tra setup", sub: s.accountName || "", minutes: mins("setupCheck", s.minutes),
      enabled: !!st.setupCheckEnabled && !!s.enabled, sourceId: `sc_${s.accountId}`, id: s.accountId,
      skip: s.skip,
    });
  });

  (watches || []).forEach((w) => {
    const live = (w.symbols || []).filter((x) => !x.done).length;
    pushHours(out, {
      hours: w.hours, activeDays: w.activeDays, day, kind: "symbolWatch",
      title: "Symbol theo dõi", sub: `${w.label || "Nhóm chưa đặt tên"} · ${live} symbol`,
      minutes: mins("symbolWatch", w.minutes),
      enabled: !!st.symbolWatchEnabled && !!w.enabled && live > 0, sourceId: `w_${w.id}`, id: w.id,
      skip: w.skip,
    });
  });

  const weeklyJobs = [
    { cfg: st.incompleteReminder, title: "Nhắc điền nốt lệnh", id: "incomplete" },
    { cfg: st.weeklySummary, title: "Tổng kết tuần", id: "weekly" },
    { cfg: st.reconcileReminder, title: "Đối chiếu file sàn", id: "reconcile" },
  ];
  weeklyJobs.forEach(({ cfg, title, id }) => {
    if (!cfg) return;
    pushHours(out, {
      hours: [cfg.time], activeDays: [cfg.weekday], day, kind: "report",
      title, sub: "Hằng tuần", minutes: mins("report", cfg.minutes),
      enabled: !!cfg.enabled, sourceId: id, id,
    });
  });

  (reminders || []).forEach((r) => {
    if (r.frequency !== "weekly" || !r.notifyTelegram) return;
    pushHours(out, {
      hours: [r.notifyTime || "08:00"], activeDays: [weekdayCodeFromNumber(r.weekday)], day,
      kind: "reminder", title: r.title || "Nhắc nhở", sub: "Hằng tuần",
      minutes: mins("reminder", r.minutes), enabled: r.active !== false, sourceId: `r_${r.id}`, id: r.id,
    });
  });

  return out.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

// Hai việc chồng nhau khi khoảng [bắt đầu, bắt đầu + dự kiến) giao nhau.
// Việc đang tắt không tính — nó không thật sự chiếm thời gian của bạn.
export function timelineConflicts(items) {
  const live = (items || []).filter((x) => x.enabled);
  const ids = new Set();
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (b.start < a.start + a.minutes && a.start < b.start + b.minutes) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

export function timelineDayLoad(items) {
  const live = (items || []).filter((x) => x.enabled);
  return {
    count: live.length,
    minutes: live.reduce((n, x) => n + x.minutes, 0),
    conflicts: timelineConflicts(live).size,
  };
}

export function buildWeekTimeline(args) {
  return WEEKDAY_CODES.map((day) => {
    const items = buildDayTimeline(day, args);
    return { day, items, load: timelineDayLoad(items) };
  });
}

// Việc trong ngày mà bạn đã tự làm xong trước khi Telegram kịp nhắc. Lưu theo ngày để
// sáng hôm sau danh sách tự sạch, và giữ lại vài ngày phòng khi cần nhìn lại hôm qua.
// CHỈ web ghi khoá này; Edge Function chỉ đọc để biết mốc nào khỏi gửi.
export const TASK_DONE_RETENTION_DAYS = 14;

// Một "mốc việc" = một lịch tại một giờ, đúng đơn vị mà Telegram bắn tin. Dấu "@" ngăn
// nhầm với dấu "_" đã có sẵn trong khoá lịch (sl_<accountId>, w_<groupId>...).
export function taskSlotKey(source) {
  if (!source || !source.key || !source.hour) return "";
  return `${source.key}@${source.hour}`;
}

export function taskDoneAt(doneMap, date, key) {
  const day = doneMap && doneMap[date];
  return (day && day[key]) || "";
}

export function setTaskDone(doneMap, date, key, done) {
  const next = { ...(doneMap || {}) };
  const day = { ...(next[date] || {}) };
  if (done) day[key] = new Date().toISOString();
  else delete day[key];
  if (Object.keys(day).length) next[date] = day;
  else delete next[date];
  // app_data chỉ có một ô cho khoá này nên phải tự dọn, không thì nó phình mãi.
  const cutoff = shiftDate(date, -TASK_DONE_RETENTION_DAYS);
  Object.keys(next).forEach((d) => { if (d < cutoff) delete next[d]; });
  return next;
}

// Việc của hôm nay, kèm trạng thái đã xong — dùng cho danh sách tích việc ở tab timeline.
// Lịch đang tắt không đưa vào: nó không gửi tin thì cũng không có gì để làm.
export function todayChecklist({ day, date, items, doneMap, setupCheckLog }) {
  const checked = {};
  (setupCheckLog || []).forEach((e) => {
    if (e && e.date === date && e.checkedAt) checked[`sc_${e.accountId}@${e.hour}`] = e.checkedAt;
  });
  return (items || [])
    .filter((x) => x.enabled)
    .map((x) => {
      const key = taskSlotKey(x.source);
      // Bấm "Đã kiểm tra" trên Telegram cũng là làm xong — hiện đã tích cho khớp.
      const at = taskDoneAt(doneMap, date, key) || checked[key] || "";
      return { ...x, slotKey: key, done: !!at, doneAt: at, day };
    });
}

// Tab "Kiểm tra setup" tính tỷ lệ hoàn thành từ setupCheckLog, mà log đó chỉ sinh ra lúc
// Telegram gửi tin. Tự tay tích trước giờ nhắc thì phải ghi vào đây, không thì việc đã làm
// lại biến mất khỏi thống kê. `via: "web"` để lúc bỏ tích còn biết dòng nào do web tạo ra.
export function markSetupCheckDone(log, { accountId, accountName, date, hour }, done) {
  const list = Array.isArray(log) ? [...log] : [];
  const i = list.findIndex((e) => e && e.accountId === accountId && e.date === date && e.hour === hour);
  if (!done) {
    if (i < 0) return list;
    if (list[i].via === "web") return list.filter((_, n) => n !== i);
    return list.map((e, n) => (n === i ? { ...e, checkedAt: "" } : e));
  }
  const at = new Date().toISOString();
  if (i < 0) return [...list, { accountId, accountName, date, hour, checkedAt: at, via: "web" }];
  return list.map((e, n) => (n === i ? { ...e, checkedAt: e.checkedAt || at } : e));
}

// Danh sách mọi lịch đang tồn tại, để chỉnh thời gian dự kiến riêng cho từng cái —
// kiểm tra setup của Forex-H3 tốn 40 phút trong khi VN Stock chỉ 10.
export function timelineSources({ settings, watches, reminders, durations, openTrades }) {
  const st = settings || {};
  const out = [];
  const add = (kind, id, key, name, hours, activeDays, enabled, override, skip) => {
    out.push({
      key, kind, id, name, hours: hours || [], activeDays: activeDays || WEEKDAY_CODES,
      enabled, override: override === undefined || override === null ? "" : override,
      minutes: taskMinutes(durations, kind, override),
      // Chỉ lịch nhiều giờ/nhiều thứ mới bỏ được ô lẻ; nhắc nhở và báo cáo tuần chỉ có
      // đúng một giờ một thứ nên không có gì để bỏ.
      skip: Array.isArray(skip) ? skip : [],
      canSkip: kind === "sl" || kind === "setupCheck" || kind === "symbolWatch",
    });
  };

  const countOpen = typeof openTrades === "function" ? openTrades : null;
  (st.schedules || []).forEach((x) => add("sl", x.accountId, `sl_${x.accountId}`, x.accountName || "—", x.hours, x.activeDays, !!st.enabled && !!x.enabled && (!countOpen || countOpen(x.accountId, x.accountName) > 0), x.minutes, x.skip));
  (st.setupCheckSchedules || []).forEach((x) => add("setupCheck", x.accountId, `sc_${x.accountId}`, x.accountName || "—", x.hours, x.activeDays, !!st.setupCheckEnabled && !!x.enabled, x.minutes, x.skip));
  (watches || []).forEach((w) => add("symbolWatch", w.id, `w_${w.id}`, w.label || "Nhóm chưa đặt tên", w.hours, w.activeDays, !!st.symbolWatchEnabled && !!w.enabled, w.minutes, w.skip));
  if (st.incompleteReminder) add("report", "incomplete", "incomplete", "Nhắc điền nốt lệnh", [st.incompleteReminder.time], [st.incompleteReminder.weekday], !!st.incompleteReminder.enabled, st.incompleteReminder.minutes);
  if (st.weeklySummary) add("report", "weekly", "weekly", "Tổng kết tuần", [st.weeklySummary.time], [st.weeklySummary.weekday], !!st.weeklySummary.enabled, st.weeklySummary.minutes);
  if (st.reconcileReminder) add("report", "reconcile", "reconcile", "Đối chiếu file sàn", [st.reconcileReminder.time], [st.reconcileReminder.weekday], !!st.reconcileReminder.enabled, st.reconcileReminder.minutes);
  (reminders || []).forEach((r) => {
    if (r.frequency !== "weekly" || !r.notifyTelegram) return;
    add("reminder", r.id, `r_${r.id}`, r.title || "Nhắc nhở", [r.notifyTime || "08:00"], [weekdayCodeFromNumber(r.weekday)], r.active !== false, r.minutes);
  });
  return out;
}

// Đổi một mốc giờ: giữ danh sách không trùng và luôn sắp xếp, để lần sau đọc ra
// vẫn theo đúng thứ tự trong ngày.
function replaceHour(hours, oldHour, newHour) {
  const next = (hours || []).map((h) => (h === oldHour ? newHour : h));
  return [...new Set(next)].sort();
}

function patchItem(item, source, patch) {
  const next = { ...item };
  if (patch.hour) {
    next.hours = replaceHour(item.hours, source.hour, patch.hour);
    // Dời giờ thì ô lẻ đã bỏ phải đi theo, không thì nó nằm lại ở mốc giờ không còn tồn tại.
    next.skip = skipListOf(item).map((k) => {
      const [d, h] = String(k).split("@");
      return h === source.hour ? skipKey(d, patch.hour) : k;
    });
  }
  if ("minutes" in patch) next.minutes = patch.minutes;
  if ("skip" in patch) next.skip = pruneSkip(patch.skip, next.hours, next.activeDays);
  return next;
}

// Mỗi báo cáo tuần nằm ở một khoá riêng trong cài đặt — bảng này để timeline biết sửa vào đâu.
const REPORT_KEYS = { weekly: "weeklySummary", incomplete: "incompleteReminder", reconcile: "reconcileReminder" };

// Ghi một thay đổi (dời giờ hoặc đổi thời gian dự kiến) ngược về đúng bản ghi gốc.
// `changed` cho biết phải lưu khoá nào, để không ghi đè những khoá không liên quan.
export function applyTaskPatch({ settings, watches, reminders }, source, patch) {
  const st = settings || {};
  const mapList = (list, match) => (list || []).map((x) => (match(x) ? patchItem(x, source, patch) : x));

  if (source.kind === "sl") {
    return { settings: { ...st, schedules: mapList(st.schedules, (x) => x.accountId === source.id) }, changed: "settings" };
  }
  if (source.kind === "setupCheck") {
    return { settings: { ...st, setupCheckSchedules: mapList(st.setupCheckSchedules, (x) => x.accountId === source.id) }, changed: "settings" };
  }
  if (source.kind === "symbolWatch") {
    return { watches: mapList(watches, (x) => x.id === source.id), changed: "watches" };
  }
  if (source.kind === "report") {
    const key = REPORT_KEYS[source.id] || "incompleteReminder";
    const cfg = st[key] || {};
    const next = { ...cfg };
    if (patch.hour) next.time = patch.hour;
    if ("minutes" in patch) next.minutes = patch.minutes;
    return { settings: { ...st, [key]: next }, changed: "settings" };
  }
  if (source.kind === "reminder") {
    return {
      reminders: (reminders || []).map((r) => {
        if (r.id !== source.id) return r;
        const next = { ...r };
        if (patch.hour) next.notifyTime = patch.hour;
        if ("minutes" in patch) next.minutes = patch.minutes;
        return next;
      }),
      changed: "reminders",
    };
  }
  return { changed: null };
}

// Kéo khối trên timeline nhích theo từng 5 phút — đủ mượt mà vẫn ra giờ tròn trịa.
export const TIMELINE_SNAP = 5;

export function snapMinutes(mins) {
  const v = Math.round(mins / TIMELINE_SNAP) * TIMELINE_SNAP;
  return Math.max(0, Math.min(v, 23 * 60 + 55));
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

// Forex/hàng hoá vào ra trong ngày nên giờ khớp lệnh mới là thứ đáng tin; cổ phiếu giữ
// nhiều ngày thì chỉ cần đúng ngày. Bỏ trống = có đồng bộ giờ, để tài khoản cũ giữ nguyên
// hành vi mặc định.
export function accountSyncsTime(account) {
  return !account || account.syncBrokerTime !== false;
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

// ---- Thoát lệnh từng phần ---------------------------------------------------
// Chốt bớt 25-50% rồi trailing phần còn lại là một lệnh chứ không phải hai, nên
// mỗi lần chốt là một dòng con của lệnh đó. R của mỗi lần vẫn chia cho rủi ro ban
// đầu của cả lệnh — chốt 50% được 300$ với rủi ro 100$ là 3R, không phải 6R.
export const PARTIAL_MAX = 4;

export function emptyPartialExit() {
  return { id: uid(), date: "", time: "", percent: "", profit: "", link: "", image: "", note: "" };
}

export function partialExitsOf(t) {
  return Array.isArray(t && t.partialExits) ? t.partialExits.filter(Boolean) : [];
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// R của một lần chốt bớt = giá đã chạy được bao nhiêu R tại lúc chốt, không phải phần
// đóng góp vào R tổng. Rủi ro chỉ ứng với đúng phần vị thế đã đóng: chốt 50% của lệnh
// rủi ro 100$ thì phần đó chỉ gánh 50$, lãi 200$ nghĩa là giá đã chạy 4R. Chia cho cả
// 100$ sẽ ra 2R và làm mọi lần chốt bớt trông tệ hơn thực tế đúng bằng tỷ lệ đã đóng.
// Giả định SL của cả vị thế là một mức — rủi ro trên mỗi cổ phiếu/lot là như nhau.
export function partialExitR(row, riskAmount) {
  const profit = numOrNull(row && row.profit);
  const risk = numOrNull(riskAmount);
  const pct = numOrNull(row && row.percent);
  if (profit === null || !risk || !pct || pct <= 0) return null;
  return profit / (risk * (pct / 100));
}

// Phần đóng góp vào R tổng của lệnh. Cộng hết các lần chốt cộng với lần đóng cuối
// thì đúng bằng R của cả lệnh — đây mới là con số ăn vào tài khoản.
export function partialExitShareR(row, riskAmount) {
  const profit = numOrNull(row && row.profit);
  const risk = numOrNull(riskAmount);
  return profit === null || !risk ? null : profit / risk;
}

export function partialExitStats(t) {
  const rows = partialExitsOf(t);
  const risk = numOrNull(t && t.riskAmount);
  let profit = 0;
  let percent = 0;
  let filled = 0;
  rows.forEach((row) => {
    const p = numOrNull(row.profit);
    if (p !== null) { profit += p; filled += 1; }
    const pc = numOrNull(row.percent);
    if (pc !== null) percent += pc;
  });
  return {
    count: rows.length, filled, profit, percent,
    remainingPercent: 100 - percent,
    rr: filled && risk ? profit / risk : null,
  };
}

export function computeResult(trade) {
  const finalProfit = numOrNull(trade.profit);
  const riskAmount = numOrNull(trade.riskAmount);
  const partial = partialExitStats(trade);
  // Lệnh chỉ tính là đã đóng khi điền lợi nhuận lần đóng cuối. Chốt bớt vài phần
  // mà chưa đóng hẳn thì vẫn là lệnh đang mở — mọi thống kê "lệnh đã đóng" đang
  // dựa vào đây, và tiền của phần còn lại thì vẫn đang chạy.
  const status = finalProfit !== null ? "closed" : "open";
  // Phí hoa hồng + qua đêm giữ dấu đúng như sàn xuất (bị trừ là số âm) nên cứ cộng thẳng.
  // Cổ phiếu giữ nhiều ngày thì khoản này ăn hẳn vào kết quả, bỏ qua là sai số thật.
  const fees = numOrNull(trade.fees) || 0;
  const profit = status === "closed" ? finalProfit + partial.profit + fees : null;
  let rr = null;
  if (profit !== null && riskAmount) rr = profit / riskAmount;
  const outcome = profit !== null ? (profit > 0 ? "win" : profit < 0 ? "loss" : "be") : null;
  return {
    profit, riskAmount, rr, outcome, status, fees,
    finalProfit, partialProfit: partial.profit, partialCount: partial.count, partialFilled: partial.filled,
  };
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

// ——— Chuỗi thắng / thua liên tiếp ———
// Lệnh hòa không làm đứt chuỗi và cũng không kéo dài nó: R của nó bằng 0 nên bỏ qua
// hẳn cũng không mất gì, mà chuỗi thì đọc đúng như lúc ngồi trade.
function sortedByCloseDate(closed) {
  return [...closed].sort((a, b) =>
    (dateKey(a.t) || "").localeCompare(dateKey(b.t) || "") || (a.t.createdAt || 0) - (b.t.createdAt || 0));
}

// Đường cong cộng dồn: mỗi lệnh thắng +1, mỗi lệnh thua -1. Mỗi đoạn đi lên hoặc đi
// xuống liền mạch chính là một chuỗi, nên đỉnh và đáy của đường cong đúng là chỗ chuỗi
// kết thúc — không cần dò lại lần nữa.
export function buildStreakCurve(closed) {
  const sorted = sortedByCloseDate(closed);
  const points = [{ i: 0, date: "", symbol: "", net: 0, cumR: 0, outcome: "", streak: 0, streakType: "", rr: null }];
  const streaks = [];
  let net = 0;
  let cumR = 0;
  let cur = null;
  let beCount = 0;
  let rCovered = 0;

  sorted.forEach((x) => {
    const outcome = x.r.outcome;
    if (outcome !== "win" && outcome !== "loss") { beCount += 1; return; }
    const rr = x.r.rr !== null && Number.isFinite(x.r.rr) ? x.r.rr : null;
    net += outcome === "win" ? 1 : -1;
    if (rr !== null) { cumR += rr; rCovered += 1; }

    if (!cur || cur.type !== outcome) {
      cur = { type: outcome, length: 0, r: 0, rCount: 0, profit: 0, from: dateKey(x.t) || "", to: "", endIndex: 0, items: [] };
      streaks.push(cur);
    }
    cur.length += 1;
    cur.items.push(x);
    if (rr !== null) { cur.r += rr; cur.rCount += 1; }
    cur.profit += x.r.profit || 0;
    cur.to = dateKey(x.t) || "";

    points.push({
      i: points.length, date: dateKey(x.t) || "", symbol: x.t.symbol || "", net, cumR,
      outcome, streak: cur.length, streakType: cur.type, rr,
    });
    cur.endIndex = points.length - 1;
  });

  const wins = streaks.filter((s) => s.type === "win");
  const losses = streaks.filter((s) => s.type === "loss");
  const longest = (list) => list.reduce((best, s) => (!best || s.length > best.length ? s : best), null);
  // Chuỗi thua tốn kém nhất tính theo R, chỉ xét những chuỗi có ghi rủi ro — dài nhất
  // chưa chắc đã đắt nhất, và đó mới là điều đáng biết.
  const costliest = losses
    .filter((s) => s.rCount > 0)
    .reduce((worst, s) => (!worst || s.r < worst.r ? s : worst), null);

  return {
    points, streaks, beCount,
    total: points.length - 1,
    rCovered,
    longestWin: longest(wins),
    longestLoss: longest(losses),
    costliestLoss: costliest,
    current: streaks.length ? streaks[streaks.length - 1] : null,
  };
}

// ——— Báo cáo tuần theo tài khoản ———
// Tuần tính từ Thứ 2 đến Chủ nhật, đúng nhịp làm việc — không phải 7 ngày trôi từ hôm nay.
export function weekStart(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const offset = (d.getDay() + 6) % 7; // T2 = 0, CN = 6
  return shiftDate(dateStr || todayStr(), -offset);
}

export function weekLabel(from, to) {
  const dm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
  return `${dm(from)} – ${dm(to)}/${(to || "").slice(0, 4)}`;
}

// Tách R thắng và R thua chứ không chỉ R ròng: +2R có thể là "thắng 3R thua 1R" (ổn)
// hoặc "thắng 12R thua 10R" (đánh nhiều, giữ lại được ít) — hai chuyện hoàn toàn khác.
function accountRTotals(items) {
  let rWin = 0, rLoss = 0, rCount = 0, wins = 0, losses = 0, be = 0, profit = 0;
  items.forEach((x) => {
    const rr = x.r.rr;
    if (rr !== null && Number.isFinite(rr)) {
      rCount += 1;
      if (rr > 0) rWin += rr; else rLoss += rr;
    }
    if (x.r.outcome === "win") wins += 1;
    else if (x.r.outcome === "loss") losses += 1;
    else be += 1;
    profit += x.r.profit || 0;
  });
  return {
    count: items.length, wins, losses, be, profit,
    rWin, rLoss, rNet: rWin + rLoss, rCount,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
  };
}

// Lệnh thuộc về tuần nào tính theo ngày ĐÓNG — đó là lúc kết quả thành hình.
export function weeklyAccountReport(trades, resources, from, to) {
  const inWeek = (trades || []).filter((t) => {
    const d = t && t.exitDate;
    return d && d >= from && d <= to;
  });
  const names = new Set(((resources && resources.accounts) || []).map((a) => a.name).filter(Boolean));
  inWeek.forEach((t) => { if (t.account) names.add(t.account); });

  const rows = Array.from(names).map((name) => {
    const acc = ((resources && resources.accounts) || []).find((a) => a.name === name);
    const items = closedOf(inWeek.filter((t) => t.account === name));
    return { account: name, currency: (acc && acc.currency) || "USD", ...accountRTotals(items) };
  }).filter((r) => r.count > 0).sort((a, b) => b.rNet - a.rNet || b.count - a.count);

  // Tổng quy USD vì mỗi tài khoản một loại tiền; riêng R thì cộng thẳng được.
  const total = { ...accountRTotals(closedOfUSD(inWeek, resources)), accounts: rows.length };
  return { from, to, rows, total, opened: (trades || []).filter((t) => t.entryDate >= from && t.entryDate <= to).length };
}

// Vài tuần gần nhất để nhìn xu hướng — một tuần dương giữa bốn tuần âm thì chưa phải tin vui.
export function weeklyRTrend(trades, resources, endWeekStart, weeks = 8) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = shiftDate(endWeekStart, -7 * i);
    const to = shiftDate(from, 6);
    const rep = weeklyAccountReport(trades, resources, from, to);
    out.push({ from, to, label: `${from.slice(8, 10)}/${from.slice(5, 7)}`, rNet: rep.total.rNet, count: rep.total.count });
  }
  return out;
}

// Chuỗi thua là "xui" hay có nguyên nhân? So tỷ lệ mắc từng lỗi ở các lệnh NẰM TRONG
// chuỗi thua dài với các lệnh còn lại. Lỗi nào vọt lên hẳn trong chuỗi thua thì chuỗi đó
// không phải xui — nó có một nguyên nhân lặp lại và sửa được.
// Mẫu số hai bên đều là số lệnh ĐÃ SOI LỖI, nếu không thì bên nào soi kỹ hơn sẽ trông tệ hơn.
export function streakErrorBreakdown(curve, errors, minLen) {
  const inIds = new Set();
  (curve.streaks || []).forEach((s) => {
    if (s.type === "loss" && s.length >= minLen) (s.items || []).forEach((x) => inIds.add(x.t.id));
  });
  const all = (curve.streaks || []).flatMap((s) => s.items || []);
  const inside = all.filter((x) => inIds.has(x.t.id));
  const outside = all.filter((x) => !inIds.has(x.t.id));
  const reviewed = (list) => list.filter((x) => tradeErrorState(x.t) !== "unreviewed");
  const revIn = reviewed(inside);
  const revOut = reviewed(outside);
  const share = (hit, base) => (base.length ? (hit / base.length) * 100 : null);
  const hits = (list, id) => list.filter((x) => (x.t.setupErrors || []).includes(id)).length;

  const rows = allSetupErrors(errors).map((e) => {
    const inHit = hits(revIn, e.id);
    const outHit = hits(revOut, e.id);
    const inShare = share(inHit, revIn);
    const outShare = share(outHit, revOut);
    return {
      ...e, inHit, outHit, inShare, outShare,
      lift: inShare === null || outShare === null ? null : inShare - outShare,
    };
  }).filter((r) => r.inHit > 0 || r.outHit > 0)
    .sort((a, b) => (b.lift === null ? -Infinity : b.lift) - (a.lift === null ? -Infinity : a.lift) || b.inHit - a.inHit);

  const cleanIn = revIn.filter((x) => tradeErrorState(x.t) === "clean").length;
  const cleanOut = revOut.filter((x) => tradeErrorState(x.t) === "clean").length;
  return {
    rows,
    inside: inside.length, outside: outside.length,
    reviewedIn: revIn.length, reviewedOut: revOut.length,
    clean: {
      inHit: cleanIn, outHit: cleanOut,
      inShare: share(cleanIn, revIn), outShare: share(cleanOut, revOut),
    },
  };
}

export const STREAK_LADDER_CAP = 3;

export function streakLadderLabel(key) {
  if (key === 0) return "Lệnh mở đầu (chưa có chuỗi)";
  const n = Math.abs(key);
  const plus = n >= STREAK_LADDER_CAP ? "+" : "";
  return key > 0 ? `Sau ${n}${plus} lệnh thắng` : `Sau ${n}${plus} lệnh thua`;
}

// Ngưỡng tâm lý: cùng một người, nhưng chất lượng lệnh sau 3 lần thua liên tiếp thường
// khác hẳn lúc vừa thắng. Xếp mọi lệnh theo trạng thái NGAY TRƯỚC khi vào lệnh đó.
export function streakLadder(closed) {
  const sorted = sortedByCloseDate(closed);
  const buckets = new Map();
  let run = 0;
  sorted.forEach((x) => {
    const outcome = x.r.outcome;
    if (outcome !== "win" && outcome !== "loss") return;
    const key = Math.max(-STREAK_LADDER_CAP, Math.min(STREAK_LADDER_CAP, run));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(x);
    run = outcome === "win" ? (run > 0 ? run + 1 : 1) : (run < 0 ? run - 1 : -1);
  });

  const rows = [];
  for (let key = STREAK_LADDER_CAP; key >= -STREAK_LADDER_CAP; key--) {
    const list = buckets.get(key) || [];
    if (!list.length) continue;
    const wins = list.filter((x) => x.r.outcome === "win").length;
    const rrs = list.map((x) => x.r.rr).filter((v) => v !== null && Number.isFinite(v));
    const psych = list.map((x) => Number(x.t.ratingPsychology) || 0).filter((v) => v > 0);
    const graded = list.filter((x) => x.t.tradeGrade);
    const bad = graded.filter((x) => {
      const g = GRADE_OPTIONS.find((o) => o.id === x.t.tradeGrade);
      return g && g.tone === "loss";
    }).length;
    rows.push({
      key, label: streakLadderLabel(key), count: list.length,
      winRate: (wins / list.length) * 100,
      avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null,
      rCount: rrs.length,
      avgPsych: psych.length ? psych.reduce((a, b) => a + b, 0) / psych.length : null,
      badRate: graded.length ? (bad / graded.length) * 100 : null,
      gradedCount: graded.length,
    });
  }
  return rows;
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
    // Phí cũng phải quy đổi cùng tỷ giá với lãi lỗ, không thì gộp nhiều tài khoản sẽ ra
    // con số vô nghĩa: phí tài khoản cent cộng thẳng vào phí tài khoản USD.
    return { t: x.t, r: { ...x.r,
      profit: toUSD(x.r.profit, currency, resources.fxRates),
      fees: toUSD(x.r.fees || 0, currency, resources.fxRates) } };
  });
}

// Phí hoa hồng + qua đêm gộp lại. Chỉ những lệnh ĐÃ điền phí mới có ý nghĩa, nên đếm riêng
// số lệnh đó — nhìn "tổng phí $33" mà không biết nó gom từ mấy lệnh thì dễ tưởng đã đủ.
export function feeStats(items) {
  let fees = 0;
  let withFee = 0;
  let net = 0;
  (items || []).forEach(({ r }) => {
    const f = r.fees || 0;
    fees += f;
    if (f) withFee += 1;
    net += r.profit || 0;
  });
  // Lãi gộp = kết quả trước khi trừ phí. Tỷ lệ chỉ có nghĩa khi lãi gộp dương.
  const gross = net - fees;
  return {
    fees, withFee, count: (items || []).length, gross, net,
    share: gross > 0 ? Math.abs(fees) / gross : null,
    avg: withFee ? fees / withFee : null,
  };
}

export function groupFeeStats(items, keyFn) {
  const out = {};
  (items || []).forEach(({ t, r }) => {
    const key = keyFn(t) || "—";
    if (!out[key]) out[key] = { key, count: 0, withFee: 0, fees: 0, net: 0 };
    out[key].count += 1;
    if (r.fees) out[key].withFee += 1;
    out[key].fees += r.fees || 0;
    out[key].net += r.profit || 0;
  });
  return Object.values(out)
    .map((g) => ({ ...g, gross: g.net - g.fees }))
    .sort((a, b) => Math.abs(b.fees) - Math.abs(a.fees));
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

// Kiểu sắp xếp là một DANH SÁCH cấp: cấp 1 quyết định trước, hòa mới xét cấp 2...
// Dữ liệu cũ lưu một object {key, dir} nên bọc lại thành mảng cho tương thích.
export function normalizeSort(sort) {
  if (!sort) return [];
  const list = Array.isArray(sort) ? sort : [sort];
  const seen = new Set();
  return list
    .filter((s) => s && s.key && !seen.has(s.key) && seen.add(s.key) !== false)
    .map((s) => ({ key: s.key, dir: s.dir === "asc" ? "asc" : "desc" }));
}

export function sortTrades(trades, sort, resources) {
  const levels = normalizeSort(sort);
  if (!levels.length) return trades;
  return [...trades].sort((a, b) => {
    for (const { key, dir } of levels) {
      const mul = dir === "asc" ? 1 : -1;
      const av = tradeSortValue(a, key, resources);
      const bv = tradeSortValue(b, key, resources);
      if (av === null && bv === null) continue; // cùng trống thì để cấp sau phân định
      if (av === null) return 1; // ô trống luôn xuống cuối, bất kể chiều sắp xếp
      if (bv === null) return -1;
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
    }
    return (b.createdAt || 0) - (a.createdAt || 0); // hòa hết thì lệnh nhập sau lên trước
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
  ["Phí (hoa hồng + qua đêm)", (t) => (t.fees === "" || t.fees === undefined || t.fees === null ? "" : t.fees)],
  ["Lãi/Lỗ (tổng)", (t) => { const { profit } = computeResult(t); return profit === null ? "" : profit; }],
  ["Số lần chốt bớt", (t) => partialExitsOf(t).length || ""],
  ["Lãi/Lỗ chốt bớt", (t) => { const st = partialExitStats(t); return st.filled ? st.profit : ""; }],
  ["% vị thế đã chốt bớt", (t) => { const st = partialExitStats(t); return st.count ? st.percent : ""; }],
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
  ["Cảm nghĩ trong lệnh", (t) => t.inTradeNote],
  ["Cảm nhận kỹ năng", (t) => t.skillNote],
  ["Cảm nghĩ tâm lý", (t) => t.psychologyNote],
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

// Lọc theo chất lượng lệnh: "good"/"bad" gộp cả thắng lẫn thua để soi riêng cách vào lệnh,
// còn 4 id trong GRADE_OPTIONS thì khớp đúng một ô.
export function gradeMatches(tradeGrade, want) {
  const g = tradeGrade || "";
  if (!want) return true;
  if (want === "none") return !g;
  const opt = GRADE_OPTIONS.find((x) => x.id === g);
  if (!opt) return false;
  if (want === "good") return opt.tone === "win";
  if (want === "bad") return opt.tone === "loss";
  return g === want;
}

// Khoảng RR: điền một đầu là mở về phía còn lại, điền cả hai thì thứ tự nào cũng được
// (gõ "-0.7 đến -1" cũng hiểu như "-1 đến -0.7"). Nới 1e-6 để lệnh đúng -1R không bị
// phép chia lẻ ra -1.0000000000000002 rồi rơi khỏi khoảng.
const RR_EPSILON = 1e-6;

export function rrInRange(rr, fromRaw, toRaw) {
  // Bàn phím tiếng Việt hay ra dấu phẩy thập phân — nhận cả "-0,7" lẫn "-0.7",
  // không thì ô lọc trông như đang có số mà thật ra không lọc gì.
  const rrNum = (v) => numOrNull(typeof v === "string" ? v.trim().replace(",", ".") : v);
  const a = rrNum(fromRaw);
  const b = rrNum(toRaw);
  if (a === null && b === null) return true;
  // Lệnh đang mở hoặc không ghi số tiền rủi ro thì không có RR để so — lọc RR là loại chúng ra.
  if (rr === null || !isFinite(rr)) return false;
  const lo = a !== null && b !== null ? Math.min(a, b) : a;
  const hi = a !== null && b !== null ? Math.max(a, b) : b;
  if (lo !== null && rr < lo - RR_EPSILON) return false;
  if (hi !== null && rr > hi + RR_EPSILON) return false;
  return true;
}

// ---- Bộ lọc đã lưu ở Nhật ký ----
// Chỉ giữ những mục thật sự đang lọc. Ô rỗng lẫn vào thì hai bộ lọc y hệt nhau lại so ra
// khác nhau, và chip "đang dùng" sẽ không bao giờ sáng lên.
export function cleanFilters(filters) {
  const out = {};
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v === "" || v === null || v === undefined) return;
    out[k] = v;
  });
  return out;
}

export function filterFingerprint(filters) {
  const c = cleanFilters(filters);
  return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
}

export function countActiveFilters(filters) {
  return Object.keys(cleanFilters(filters)).length;
}

// Trùng tên thì ghi đè bộ lọc cũ. Cho phép hai bộ lọc cùng tên là tự chuốc lấy một danh sách
// chip không phân biệt nổi cái nào ra cái nào.
export function saveFilterPreset(presets, name, filters) {
  const clean = (name || "").trim();
  if (!clean) return { items: presets || [], saved: null, replaced: false };
  const list = presets || [];
  const existing = list.find((p) => (p.name || "").trim().toLowerCase() === clean.toLowerCase());
  const payload = { id: existing ? existing.id : uid(), name: clean, filters: cleanFilters(filters) };
  return {
    items: existing ? list.map((p) => (p.id === existing.id ? payload : p)) : [...list, payload],
    saved: payload,
    replaced: !!existing,
  };
}

export function applyFilters(trades, filters, resources) {
  return trades.filter((t) => {
    const r = computeResult(t);
    if (filters.q && !t.symbol.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.account && t.account !== filters.account) return false;
    if (filters.year && yearKey(t.entryDate) !== filters.year) return false;
    if (filters.month && (t.entryDate || "").slice(5, 7) !== filters.month) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.psychology && t.psychology !== filters.psychology) return false;
    if (filters.grade && !gradeMatches(t.tradeGrade, filters.grade)) return false;
    if (filters.setupError) {
      const state = tradeErrorState(t);
      if (filters.setupError === "clean" && state !== "clean") return false;
      if (filters.setupError === "any" && state !== "errors") return false;
      if (filters.setupError === "unreviewed" && state !== "unreviewed") return false;
      if (!["clean", "any", "unreviewed"].includes(filters.setupError) && !(t.setupErrors || []).includes(filters.setupError)) return false;
    }
    if (!rrInRange(r.rr, filters.rrFrom, filters.rrTo)) return false;
    if (filters.result) {
      if (filters.result === "open" && r.status !== "open") return false;
      if (filters.result === "closed" && r.status !== "closed") return false;
      if (["win", "loss", "be"].includes(filters.result) && r.outcome !== filters.result) return false;
    }
    if (filters.score) {
      const s = avgPillarScore(t);
      // "Chưa chấm" phải xét trước, không thì cái chốt chặn null bên dưới loại sạch đúng
      // những lệnh mà nó cần tìm.
      if (filters.score === "none") { if (s !== null) return false; }
      else if (s === null) return false;
      else if (filters.score === "under5" && s >= 5) return false;
      else if (filters.score === "low" && s > 2) return false;
      else if (filters.score === "mid" && (s <= 2 || s >= 4)) return false;
      else if (filters.score === "high" && s < 4) return false;
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
      if (filters.completion === "under100" && percent >= 100) return false;
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
