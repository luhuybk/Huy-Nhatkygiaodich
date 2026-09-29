// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Thông báo → Nhắc dời SL), và bắn tin nhắn Telegram nhắc dời SL cho TỪNG lệnh.
// Đồng thời kiểm tra các nhắc nhở chung (tab "Hôm nay"/"Tất cả") có bật "Nhắc qua Telegram" và đến hạn hôm nay,
// và lịch nhắc kiểm tra setup theo tài khoản (Thông báo → Kiểm tra setup) để tránh miss setup vì không theo dõi kịp.
// Deploy: supabase functions deploy sl-reminder
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY — Supabase tự cấp sẵn cho mọi Edge Function.
// Kích hoạt gọi định kỳ bằng file supabase-sl-reminder-cron.sql (pg_cron + pg_net) ở thư mục gốc repo.
// Các nút bấm trong tin nhắn do function telegram-webhook xử lý.
// Việc đã tự tích "xong" ở tab Timeline làm việc trên web (khoá timelineDone) thì bỏ qua, không gửi.
// Ngoài ra còn nhắc hằng tuần: điền nốt lệnh dở, tổng kết tuần, và đối chiếu file sàn.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VN_TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không có DST — nhưng vẫn dùng Intl để tránh tự tính offset thủ công
const MATCH_TOLERANCE_MIN = 2; // dung sai so khớp giờ, phù hợp với cron chạy mỗi 5 phút
const LOG_RETENTION_DAYS = 3;
const CHECK_LOG_RETENTION_DAYS = 90; // đủ dài để xem tỷ lệ hoàn thành nhiều tuần liền
const MAX_INCOMPLETE_LINES = 15; // tránh tin nhắn dài quá giới hạn Telegram
const MAX_SL_MESSAGES_PER_RUN = 20; // chặn trường hợp mở quá nhiều lệnh làm spam Telegram
const MAX_WATCH_MESSAGES_PER_RUN = 20; // tương tự cho nhóm symbol theo dõi
const MAX_FILL_MESSAGES_PER_RUN = 10; // nhắc điền nhật ký cho lệnh đã bấm "Kết thúc lệnh"
const MUTED_FILL_DEFAULT_DAYS = 3;

// Ký tự Braille rỗng (U+2800). Telegram cắt khoảng trắng ở đầu tin nhắn nhưng giữ ký tự này,
// nhờ đó dòng tiêu đề nằm riêng một dòng thay vì dính vào tên bot ở phần xem trước thông báo.
const LEAD = "⠀";

const vnFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const vnWeekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: VN_TZ, weekday: "short" });

// Khớp với WEEKDAY_CODES ở src/lib/helpers.js — Thứ 2 → Chủ nhật
const WEEKDAY_CODE_BY_EN_SHORT: Record<string, string> = {
  Mon: "T2", Tue: "T3", Wed: "T4", Thu: "T5", Fri: "T6", Sat: "T7", Sun: "CN",
};

// Khớp với Date.getDay() dùng ở reminderDueToday() trong src/lib/helpers.js — Chủ nhật = 0
const JS_WEEKDAY_NUM_BY_EN_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Trả về ngày + giờ hiện tại theo múi giờ Việt Nam, bất kể server chạy ở UTC hay múi giờ nào khác.
function vnNowParts(date: Date) {
  const parts = Object.fromEntries(vnFormatter.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  let hour = parts.hour;
  if (hour === "24") hour = "00"; // một số runtime trả "24:00" thay vì "00:00" cho nửa đêm với hour12:false
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

function vnWeekdayCode(date: Date) {
  return WEEKDAY_CODE_BY_EN_SHORT[vnWeekdayFormatter.format(date)] || "";
}

function vnWeekdayNum(date: Date) {
  return JS_WEEKDAY_NUM_BY_EN_SHORT[vnWeekdayFormatter.format(date)];
}

function minutesDiff(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

type WatchSymbol = { id?: string; name?: string; done?: boolean };
type WatchGroup = {
  id?: string; label?: string; note?: string; enabled?: boolean; symbols?: WatchSymbol[];
  hours?: string[]; activeDays?: string[]; skip?: string[];
  symbol?: string; done?: boolean; // dạng cũ: mỗi bản ghi một symbol
};

// Function này CHỈ ĐỌC symbolWatches. Chống gửi trùng đã có slReminderLog lo, nên không cần
// ghi lại gì — tránh luôn việc ghi đè mất thay đổi người dùng vừa thực hiện trên web.

// Bản ghi cũ (một symbol/bản ghi) vẫn có thể còn trong DB nếu cron chạy trước khi người dùng
// mở web để chuyển đổi. Dùng chính tên symbol làm id để nút bấm vẫn khớp được ở webhook.
function watchSymbols(w: WatchGroup): { id: string; name: string; done: boolean }[] {
  if (Array.isArray(w.symbols)) {
    return w.symbols
      .filter((x) => x && x.name)
      .map((x) => ({ id: String(x!.id || x!.name), name: String(x!.name), done: !!x!.done }));
  }
  return String(w.symbol || "")
    .split(",")
    .map((x) => x.replace(/\|/g, "").trim().toUpperCase()) // "|" là dấu phân cách của callback_data
    .filter(Boolean)
    .map((name) => ({ id: name, name, done: !!w.done }));
}

// Cộng/trừ ngày trên chuỗi "YYYY-MM-DD". Dùng UTC vì đây chỉ là phép tính lịch trên
// chuỗi ngày đã ở giờ Việt Nam, không phải quy đổi múi giờ.
function shiftDateStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ddmm(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function signed(n: number, digits: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
}

// Mỗi tài khoản một loại tiền — cộng thẳng sẽ ra số vô nghĩa, phải quy về USD trước.
// Khớp với toUSD() ở src/lib/helpers.js: fxRates lưu "bao nhiêu đơn vị cho 1 USD".
// Chốt bớt 25-50% rồi trailing phần còn lại: mỗi lần chốt là một dòng con của lệnh.
function partialProfitOf(t: Record<string, unknown>) {
  const rows = Array.isArray(t.partialExits) ? t.partialExits : [];
  let sum = 0;
  for (const row of rows) {
    const v = (row as { profit?: unknown })?.profit;
    if (v === "" || v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) sum += n;
  }
  return sum;
}

// Phí hoa hồng + qua đêm, giữ nguyên dấu như sàn xuất (bị trừ là số âm) nên cộng thẳng.
// computeResult() bên web luôn cộng khoản này; thiếu ở đây thì tin nhắn Telegram và số
// trong app lệch nhau đúng bằng tổng phí, mà lệnh giữ nhiều ngày thì phí không hề nhỏ.
function feesOf(t: Record<string, unknown>) {
  const v = t.fees;
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fxRate(currency: string | undefined, fxRates: Record<string, number> | undefined) {
  if (!currency || currency === "USD") return 1;
  const r = Number(fxRates && fxRates[currency]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

function toUSD(amount: number, currency: string | undefined, fxRates: Record<string, number> | undefined) {
  if (!currency || currency === "USD") return amount;
  const rate = (fxRates && fxRates[currency]) || 1;
  return amount / rate;
}

// ——— Bảng phân bổ vốn (khoá capitalPlan) ———
// Bản chép của src/lib/capital.js — sửa cách tính bên đó thì sửa luôn ở đây, không thì tin nhắn
// và app nói hai con số sụt vốn khác nhau.
type CapMarket = {
  id: string; name?: string; currency?: string; rate?: number; allocated?: number; accountCount?: number;
  tiers?: number[]; defaultTier?: number; accountIds?: string[]; holdTier?: number | null; side?: boolean;
};
type CapPlan = { startDate?: string; ddWarnPct?: number; ddCutPct?: number; markets?: CapMarket[]; picks?: Record<string, Record<string, number>> };
type CapAccount = { id: string; name: string; currency?: string; parentId?: string };

// Mảng nhiều tài khoản con: mỗi tài khoản con chọn mức riêng, khoá "fx/<id tài khoản>". Mức riêng
// thắng mức chung của mảng trong cùng một tuần; mức chung cũ vẫn là điểm xuất phát.
function capPicked(plan: CapPlan, m: CapMarket, week: string, accountId?: string) {
  const picks = plan.picks || {};
  const own = accountId ? `${m.id}/${accountId}` : null;
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  const keys = Object.keys(picks).filter((k) => k <= week).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    const row = picks[keys[i]] || {};
    const v = own && has(row[own]) ? row[own] : row[m.id];
    if (has(v)) return { pct: Number(v), explicit: keys[i] === week };
  }
  const tiers = (m.tiers || []).map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  const def = Number(m.defaultTier);
  return { pct: tiers.includes(def) ? def : (tiers[Math.floor((tiers.length - 1) / 2)] ?? null), explicit: false };
}

function capUnits(m: CapMarket, accounts: CapAccount[]) {
  if ((Number(m.accountCount) || 1) <= 1) return [] as CapAccount[];
  const names = capFamily(accounts, m);
  const leaves = accounts.filter((a) => names.has(a.name) && !accounts.some((x) => x.parentId === a.id));
  return leaves.length >= 2 ? leaves : [];
}

function capUnitBase(m: CapMarket) {
  const rate = m.currency && m.currency !== "USD" ? Number(m.rate) || 1 : 1;
  return ((Number(m.allocated) || 0) * rate) / Math.max(1, Math.round(Number(m.accountCount) || 1));
}

function capFamily(accounts: CapAccount[], m: CapMarket) {
  const names = new Set<string>();
  for (const id of m.accountIds || []) {
    const root = accounts.find((a) => a.id === id);
    if (!root) continue;
    names.add(root.name);
    const ids = new Set([root.id]);
    let added = true;
    while (added) {
      added = false;
      for (const a of accounts) {
        if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) { ids.add(a.id); names.add(a.name); added = true; }
      }
    }
  }
  return names;
}

function capDrawdown(plan: CapPlan, m: CapMarket, trades: Record<string, unknown>[], accounts: CapAccount[], fxRates: Record<string, number>) {
  const names = capFamily(accounts, m);
  const from = plan.startDate || "";
  const base = capUnitBase(m);
  const mCur = m.currency || "USD";
  const closed = trades
    .filter((t) => names.has(t.account as string) && (!from || String(t.exitDate || t.entryDate || "") >= from))
    .filter((t) => t.profit !== "" && t.profit !== null && t.profit !== undefined && !Number.isNaN(Number(t.profit)))
    .sort((a, b) => String(a.exitDate || a.entryDate || "").localeCompare(String(b.exitDate || b.entryDate || "")) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  const pnl = (t: Record<string, unknown>) => {
    const profit = Number(t.profit) + partialProfitOf(t) + feesOf(t);
    const cur = accounts.find((a) => a.name === t.account)?.currency || "USD";
    if (cur === mCur) return profit;
    const r = cur === "USD" ? 1 : Number(fxRates[cur]) || 0;
    const usd = r > 0 ? profit / r : profit;
    return usd * (mCur === "USD" ? 1 : Number(m.rate) || 1);
  };
  const curve = (list: Record<string, unknown>[]) => {
    let eq = base, peak = base;
    for (const t of list) { eq += pnl(t); if (eq > peak) peak = eq; }
    return peak > 0 ? Math.max(0, ((peak - eq) / peak) * 100) : 0;
  };
  const cut = Number(plan.ddCutPct) || 12, warn = Number(plan.ddWarnPct) || 8;
  const levelOf = (pct: number) => (pct >= cut ? "cut" : pct >= warn ? "warn" : "ok");
  const streakOf = (list: Record<string, unknown>[]) => {
    let n = 0;
    for (let i = list.length - 1; i >= 0 && Number(list[i].profit) + partialProfitOf(list[i]) + feesOf(list[i]) < 0; i--) n++;
    return n;
  };
  let worst = { name: "", pct: 0 };
  const curves: { name: string; pct: number; level: string; lossStreak: number }[] = [];
  if ((Number(m.accountCount) || 1) > 1) {
    const isGroup = (a: CapAccount) => accounts.some((x) => x.parentId === a.id);
    const list = new Set([...names].filter((n) => { const a = accounts.find((x) => x.name === n); return a && !isGroup(a); }));
    closed.forEach((t) => list.add(t.account as string));
    [...list].sort().forEach((name, i) => {
      const own = closed.filter((t) => t.account === name);
      const pct = curve(own);
      curves.push({ name, pct, level: levelOf(pct), lossStreak: streakOf(own) });
      if (i === 0 || pct > worst.pct) worst = { name, pct };
    });
  } else {
    worst = { name: "", pct: curve(closed) };
  }
  return { ...worst, level: levelOf(worst.pct), linked: names.size > 0, curves, lossStreak: streakOf(closed) };
}

const pctVN = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? "—" : `${Number(v.toFixed(digits))}%`.replace(".", ","));
function capMoney(v: number, currency?: string) {
  const s = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!currency || currency === "USD") return `$${s}`;
  if (currency === "VND") return `${s}₫`;
  return `${s} ${currency}`;
}

// Khuôn tin nhắn chung: dòng trống → tiêu đề (kèm bối cảnh) → chủ thể được làm nổi bật.
function buildMessage(titleIcon: string, title: string, mark: string, subject: string, titleSuffix?: string, extra?: string) {
  const head = titleSuffix ? `${titleIcon} ${title} | ${titleSuffix}` : `${titleIcon} ${title}`;
  const lines = [LEAD, head, `${mark} ${subject} ${mark}`];
  if (extra) lines.push(extra);
  return lines.join("\n");
}

async function sendTelegram(botToken: string, chatId: string, text: string, threadId?: string, replyMarkup?: unknown) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  const thread = threadId ? Number(threadId) : undefined;
  if (thread && !Number.isNaN(thread)) payload.message_thread_id = thread;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// Bản rút gọn của tradeCompletionFields() ở src/lib/helpers.js — giữ đúng danh sách trường
// để % ở Telegram khớp với cột "Tiến độ" trên web.
function completionPercent(t: Record<string, unknown>) {
  const filled = (v: unknown) => v !== "" && v !== null && v !== undefined && v !== 0;
  const checks = [
    !!t.entryDate, !!t.account, !!t.timeframe, !!(t.entryImage || t.entryLink),
    filled(t.riskPercent), filled(t.riskAmount), !!t.riskAction, !!t.ratingRisk,
    !!t.setup, !!t.setupNote, !!t.ratingKnowledge,
    !!t.exitDate, filled(t.profit), !!(t.exitImage || t.exitLink),
    !!t.entrySkill, !!t.inTradeSkill, !!t.exitSkill, !!t.ratingSkill,
    !!t.psychology, !!t.ratingPsychology, !!t.tradeGrade,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Tương đương reminderDueToday() ở src/lib/helpers.js, tính theo ngày/thứ VN thay vì giờ máy chủ.
function reminderDueOnVn(r: { frequency?: string; weekday?: number; dayOfMonth?: number; date?: string; active?: boolean; doneDates?: string[] }, vnDate: string, vnWeekdayN: number) {
  if (!r.active) return false;
  if ((r.doneDates || []).includes(vnDate)) return false;
  if (r.frequency === "weekly") return Number(r.weekday) === vnWeekdayN;
  if (r.frequency === "monthly") return Number(r.dayOfMonth) === Number(vnDate.split("-")[2]);
  if (r.frequency === "once") return r.date === vnDate;
  return false;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const { date: today, time: currentHHMM } = vnNowParts(now);
  const todayWeekdayCode = vnWeekdayCode(now);
  const todayWeekdayNum = vnWeekdayNum(now);

  const { data: settingsRows, error: settingsErr } = await supabase
    .from("app_data")
    .select("user_id, value")
    .eq("key", "slReminderSettings");

  if (settingsErr) {
    return new Response(JSON.stringify({ error: settingsErr.message }), { status: 500 });
  }

  let sent = 0;

  for (const row of settingsRows || []) {
    const settings = row.value as {
      enabled?: boolean;
      telegramBotToken?: string;
      telegramChatId?: string;
      schedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[]; threadId?: string; activeDays?: string[]; skip?: string[] }[];
      setupCheckEnabled?: boolean;
      setupCheckSchedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[]; threadId?: string; activeDays?: string[]; skip?: string[] }[];
      incompleteReminder?: { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
      weeklySummary?: { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
      mutedFillReminder?: { enabled?: boolean; days?: number | string; time?: string; threadId?: string };
      reconcileReminder?: { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
      capitalPickReminder?: { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
      symbolWatchEnabled?: boolean;
      symbolWatchThreadId?: string;
    };
    // Bot Token + Chat ID dùng chung cho cả nhắc dời SL, nhắc kiểm tra setup và nhắc việc chung — thiếu 1 trong 2 thì bỏ qua toàn bộ.
    if (!settings?.telegramBotToken || !settings.telegramChatId) continue;

    const schedules = settings.enabled ? (settings.schedules || []).filter((s) => s.enabled && (s.hours || []).length) : [];
    const setupCheckSchedules = settings.setupCheckEnabled ? (settings.setupCheckSchedules || []).filter((s) => s.enabled && (s.hours || []).length) : [];

    // Bỏ qua tài khoản có activeDays nhưng hôm nay không nằm trong đó (VD: Forex nghỉ T7/CN).
    // activeDays không tồn tại (dữ liệu cũ trước khi có tính năng này) → mặc định coi như chạy mọi ngày.
    // Một lịch có thể bỏ riêng vài ô giờ × thứ (VD: 22h thứ 6 khỏi kiểm tra setup vì sáng
    // chủ nhật đã kiểm tra) — khớp với `skip` trên web, dạng "T6@22:00".
    const isSkipped = (s: { skip?: string[] }, hour: string) =>
      (s.skip || []).includes(`${todayWeekdayCode}@${hour}`);
    const hoursDueNow = (s: { activeDays?: string[]; hours?: string[]; skip?: string[] }) => {
      const activeDays = Array.isArray(s.activeDays) ? s.activeDays : null;
      if (activeDays && !activeDays.includes(todayWeekdayCode)) return [];
      return (s.hours || []).filter((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN && !isSkipped(s, h));
    };
    const isDueNow = (s: { activeDays?: string[]; hours?: string[]; skip?: string[] }) => hoursDueNow(s).length > 0;
    const dueSchedules = schedules.filter(isDueNow);
    const dueSetupChecks = setupCheckSchedules.filter(isDueNow);

    const [{ data: resourcesRow }, { data: tradesRow }, { data: logRow }, { data: remindersRow }, { data: watchesRow }, { data: mutedRow }, { data: checkLogRow }, { data: doneRow }] = await Promise.all([
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "resources").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "trades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slReminderLog").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "reminders").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "symbolWatches").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slMutedTrades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "setupCheckLog").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "timelineDone").maybeSingle(),
    ]);

    const accounts = (resourcesRow?.value?.accounts || []) as { id: string; name: string }[];
    const trades = (tradesRow?.value || []) as {
      id?: string; account?: string; symbol?: string; entryDate?: string; entryTime?: string; exitDate?: string;
      [key: string]: unknown;
    }[];
    const log = (logRow?.value || {}) as Record<string, boolean>;
    const reminders = (remindersRow?.value || []) as {
      id?: string; title?: string; frequency?: string; weekday?: number; dayOfMonth?: number; date?: string;
      active?: boolean; doneDates?: string[]; notifyTelegram?: boolean; notifyTime?: string;
    }[];
    const watches = (watchesRow?.value || []) as WatchGroup[];
    // Lệnh người dùng đã bấm "Kết thúc lệnh" trên Telegram — thật sự đã chạm SL/TP nhưng
    // chưa kịp điền ngày thoát vào nhật ký, nên ngừng nhắc mà không đụng vào bản ghi lệnh.
    let muted = (mutedRow?.value || []) as { tradeId?: string; mutedAt?: string; fillDone?: boolean }[];
    const checkLog = (checkLogRow?.value || []) as {
      accountId?: string; accountName?: string; date?: string; hour?: string; checkedAt?: string;
    }[];
    // Việc người dùng đã tự tích "xong" trên web (tab Timeline làm việc) trước khi tin nhắn kịp
    // bay tới. Function này CHỈ ĐỌC khoá timelineDone — web là bên duy nhất ghi, nên không bao giờ
    // có chuyện ghi đè mất cái vừa tích trên điện thoại.
    const doneToday = ((doneRow?.value || {}) as Record<string, Record<string, string>>)[today] || {};
    const isTaskDone = (sourceKey: string, hour?: string) => !!(hour && doneToday[`${sourceKey}@${hour}`]);

    let logChanged = false;
    let mutedChanged = false;
    let checkLogChanged = false;

    // Lệnh đã đóng hoặc đã bị xóa thì không cần giữ trong danh sách tắt nhắc nữa.
    const openTradeIds = new Set(trades.filter((t) => t.entryDate && !t.exitDate && t.id).map((t) => t.id as string));
    const prunedMuted = muted.filter((m) => m.tradeId && openTradeIds.has(m.tradeId));
    if (prunedMuted.length !== muted.length) { muted = prunedMuted; mutedChanged = true; }
    const mutedIds = new Set(muted.map((m) => m.tradeId));

    let slMessages = 0;
    for (const sched of dueSchedules) {
      const account = accounts.find((a) => a.id === sched.accountId);
      const accountName = account ? account.name : sched.accountName;
      if (!accountName) continue;

      const openTrades = trades.filter((t) => t.account === accountName && t.entryDate && !t.exitDate && t.id && !mutedIds.has(t.id));
      if (!openTrades.length) continue;

      const matchedHour = hoursDueNow(sched)[0];
      if (isTaskDone(`sl_${sched.accountId}`, matchedHour)) continue;

      // Mỗi lệnh một tin riêng để nút bấm gắn đúng lệnh — gộp chung thì không biết bấm cho symbol nào.
      for (const t of openTrades) {
        if (slMessages >= MAX_SL_MESSAGES_PER_RUN) break;
        // Giữ vị trí "ngày" ở phần tử thứ 2 của key để logic dọn log cũ bên dưới hoạt động đúng.
        const logKey = `${sched.accountId}_${today}_${matchedHour}_${t.id}`;
        if (log[logKey]) continue; // đã gửi khung giờ này rồi, tránh gửi trùng

        const text = buildMessage("⏰", "DỜI SL", "🔴", t.symbol || "?", accountName);
        const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId, {
          inline_keyboard: [[
            { text: "✅ Đã dời", callback_data: `sl|${t.id}|moved` },
            { text: "🏁 Kết thúc lệnh", callback_data: `sl|${t.id}|closed` },
          ]],
        });

        if (ok) {
          log[logKey] = true;
          logChanged = true;
          slMessages++;
          sent++;
        }
      }
    }

    for (const sched of dueSetupChecks) {
      const account = accounts.find((a) => a.id === sched.accountId);
      const accountName = account ? account.name : sched.accountName;
      if (!accountName) continue;

      const matchedHour = hoursDueNow(sched)[0];
      if (isTaskDone(`sc_${sched.accountId}`, matchedHour)) continue;
      // Giữ vị trí "ngày" ở phần tử thứ 2 của key để logic dọn log cũ bên dưới hoạt động đúng.
      const logKey = `setup_${today}_${sched.accountId}_${matchedHour}`;
      if (log[logKey]) continue;

      const text = buildMessage("🔍", "KIỂM TRA SETUP", "⚡", accountName);
      const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId, {
        inline_keyboard: [[
          { text: "✅ Đã kiểm tra", callback_data: `sc|${sched.accountId}|${today}|${matchedHour}` },
        ]],
      });

      if (ok) {
        log[logKey] = true;
        logChanged = true;
        // Ghi lại lần nhắc này để tính tỷ lệ hoàn thành theo tuần trên web.
        // checkedAt để trống, telegram-webhook sẽ điền khi bấm "Đã kiểm tra".
        checkLog.push({ accountId: sched.accountId, accountName, date: today, hour: matchedHour, checkedAt: "" });
        checkLogChanged = true;
        sent++;
      }
    }

    // Nhắc việc chung (VD: cập nhật đường cong vốn) đã bật "Nhắc qua Telegram" và đến hạn hôm nay,
    // đúng khung giờ đã đặt cho từng nhắc nhở — gửi vào chat chính, không gắn Topic vì không thuộc tài khoản nào.
    const dueReminders = reminders.filter((r) => {
      if (!r.notifyTelegram || !r.id) return false;
      if (!reminderDueOnVn(r, today, todayWeekdayNum)) return false;
      return minutesDiff(r.notifyTime || "08:00", currentHHMM) <= MATCH_TOLERANCE_MIN;
    });

    for (const r of dueReminders) {
      if (isTaskDone(`r_${r.id}`, r.notifyTime || "08:00")) continue;
      // Giữ vị trí "ngày" ở phần tử thứ 2 của key (giống key nhắc dời SL) để logic dọn log cũ bên dưới hoạt động đúng.
      const logKey = `reminder_${today}_${r.id}`;
      if (log[logKey]) continue;

      const text = buildMessage("🔔", "NHẮC NHỞ", "📌", r.title || "(không có tiêu đề)");
      if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text)) {
        log[logKey] = true;
        logChanged = true;
        sent++;
      }
    }

    // Nhắc điền nốt các lệnh chưa hoàn thành 100% — mỗi tuần 1 lần vào thứ + giờ đã chọn.
    const inc = settings.incompleteReminder;
    if (inc?.enabled && (inc.weekday || "CN") === todayWeekdayCode && minutesDiff(inc.time || "20:00", currentHHMM) <= MATCH_TOLERANCE_MIN
        && !isTaskDone("incomplete", inc.time || "20:00")) {
      const logKey = `incomplete_${today}`;
      if (!log[logKey]) {
        const pending = trades
          .map((t) => ({ t, percent: completionPercent(t) }))
          .filter((x) => x.percent < 100)
          .sort((a, b) => a.percent - b.percent);

        if (pending.length) {
          const shown = pending.slice(0, MAX_INCOMPLETE_LINES);
          const lines = shown.map((x) => `. [${x.t.symbol || "?"}] ${x.t.entryDate || ""} — ${x.percent}%`);
          if (pending.length > shown.length) lines.push(`. ...và ${pending.length - shown.length} lệnh nữa`);
          const text = buildMessage("📝", "LỆNH CHƯA ĐIỀN XONG", "📌", `${pending.length} lệnh dưới 100%`, undefined, lines.join("\n"));
          if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, inc.threadId)) {
            log[logKey] = true;
            logChanged = true;
            sent++;
          }
        }
      }
    }

    // Bấm "Kết thúc lệnh" trên Telegram là hẹn sẽ ghi nhật ký sau. Quá số ngày đã đặt mà
    // lệnh vẫn chưa có ngày thoát thì nhắc riêng từng lệnh, mỗi lệnh mỗi ngày một lần.
    // Danh sách `muted` ở trên đã lọc bỏ lệnh đã đóng, nên còn ở đây tức là vẫn chưa điền.
    const fill = settings.mutedFillReminder;
    if (fill?.enabled !== false && muted.length
        && minutesDiff(fill?.time || "20:00", currentHHMM) <= MATCH_TOLERANCE_MIN) {
      const daysNum = Number(fill?.days);
      const waitDays = Number.isFinite(daysNum) && daysNum > 0 ? Math.round(daysNum) : MUTED_FILL_DEFAULT_DAYS;
      const cutoffMs = Date.now() - waitDays * 86400000;
      let fillSent = 0;
      for (const m of muted) {
        if (fillSent >= MAX_FILL_MESSAGES_PER_RUN) break;
        if (!m.tradeId || m.fillDone) continue;
        const mutedAtMs = Date.parse(m.mutedAt || "");
        if (!Number.isFinite(mutedAtMs) || mutedAtMs > cutoffMs) continue;
        const t = trades.find((x) => x.id === m.tradeId);
        if (!t) continue;
        // Giữ ngày ở phần tử thứ 2 của key để logic dọn log cũ bên dưới hoạt động đúng.
        const logKey = `mutedfill_${today}_${m.tradeId}`;
        if (log[logKey]) continue;

        const waited = Math.floor((Date.now() - mutedAtMs) / 86400000);
        const text = buildMessage(
          "📝", "CHƯA ĐIỀN NHẬT KÝ", "🔴", (t.symbol as string) || "?", (t.account as string) || undefined,
          `Đã bấm "Kết thúc lệnh" ${waited} ngày trước — lệnh vào ${t.entryDate || "?"} vẫn chưa điền ngày thoát.`,
        );
        const markup = {
          inline_keyboard: [[
            { text: "🔕 Ngừng nhắc điền", callback_data: `mf|${m.tradeId}|stop` },
          ]],
        };
        if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, fill?.threadId, markup)) {
          log[logKey] = true;
          logChanged = true;
          sent++;
          fillSent++;
        }
      }
    }

    // Nhắc đối chiếu file sàn — việc này bắt lệnh quên ghi, mà lệnh quên ghi thì không để lại
    // dấu vết nào trong nhật ký để tự nhắc được. Nên nhắc theo lịch là cách duy nhất.
    const rec = settings.reconcileReminder;
    if (rec?.enabled && (rec.weekday || "CN") === todayWeekdayCode
        && minutesDiff(rec.time || "10:00", currentHHMM) <= MATCH_TOLERANCE_MIN
        && !isTaskDone("reconcile", rec.time || "10:00")) {
      const logKey = `reconcile_${today}`;
      if (!log[logKey]) {
        const accountNames = [...new Set(trades
          .filter((t) => t.entryDate && t.entryDate >= shiftDateStr(today, -7) && t.account)
          .map((t) => t.account as string))];
        const body = accountNames.length
          ? `Tuần này có lệnh ở: ${accountNames.join(", ")}.`
          : "Tuần này chưa ghi lệnh nào — quét một lượt cho chắc.";
        const text = buildMessage(
          "📑", "ĐỐI CHIẾU FILE SÀN", "🧾", "Xuất CSV lịch sử tuần này", undefined,
          `${body}\nMở Nhật ký → Đối chiếu sàn rồi thả file vào để soi lệnh quên ghi.`,
        );
        if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, rec.threadId)) {
          log[logKey] = true;
          logChanged = true;
          sent++;
        }
      }
    }

    // Cuối tuần chọn mức đi vốn cho tuần sau (tab Phân bổ vốn). Chỉ gửi khi còn mảng chưa chọn —
    // chọn đủ rồi thì im, không thì thành tin nhắn rác mỗi tuần.
    const cap = settings.capitalPickReminder;
    if (cap?.enabled && (cap.weekday || "CN") === todayWeekdayCode
        && minutesDiff(cap.time || "20:00", currentHHMM) <= MATCH_TOLERANCE_MIN
        && !isTaskDone("capitalPick", cap.time || "20:00")) {
      const logKey = `capitalpick_${today}`;
      if (!log[logKey]) {
        const { data: planRow } = await supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "capitalPlan").maybeSingle();
        const plan = (planRow?.value || null) as CapPlan | null;
        // Tài khoản phụ (crypto, hàng hóa...) không cần chọn mức mỗi tuần — bỏ khỏi tin nhắc.
        const markets = plan && Array.isArray(plan.markets) ? plan.markets.filter((m) => m && m.id && !m.side) : [];
        if (plan && markets.length) {
          const weekNow = shiftDateStr(today, -((todayWeekdayNum + 6) % 7));
          const weekNext = shiftDateStr(weekNow, 7);
          const fxRates = (resourcesRow?.value?.fxRates || {}) as Record<string, number>;
          // Mảng nhiều tài khoản con thì mỗi tài khoản con một dòng, chọn mức riêng.
          const rows = markets.flatMap((m) => {
            const dd = capDrawdown(plan, m, trades, accounts as CapAccount[], fxRates);
            const units = capUnits(m, accounts as CapAccount[]);
            if (!units.length) {
              return [{ m, label: m.name || "?", now: capPicked(plan, m, weekNow), next: capPicked(plan, m, weekNext), dd: { pct: dd.pct, level: dd.level, name: dd.name, linked: dd.linked, lossStreak: dd.lossStreak } }];
            }
            return units.map((a) => {
              const c = dd.curves.find((x) => x.name === a.name) || { pct: 0, level: "ok", lossStreak: 0 };
              return { m, label: `${m.name || "?"} · ${a.name}`, now: capPicked(plan, m, weekNow, a.id), next: capPicked(plan, m, weekNext, a.id), dd: { ...c, name: "", linked: true } };
            });
          });
          const missing = rows.filter((r) => !r.next.explicit);
          if (missing.length) {
            const lines = rows.map(({ m, label, now, next, dd }) => {
              const money = now.pct === null ? "" : ` (${capMoney((capUnitBase(m) * now.pct) / 100, m.currency)})`;
              const ddText = !dd.linked ? "chưa gắn tài khoản"
                : `sụt ${pctVN(dd.pct, 1)}${dd.name ? ` ở ${dd.name}` : ""}${dd.level === "cut" ? " 🔴 nên giảm risk hẳn" : dd.level === "warn" ? " 🟡 cảnh báo" : " ✅"}${dd.lossStreak >= 2 ? ` · thua ${dd.lossStreak} liên tiếp` : ""}`;
              const nextText = next.explicit ? `✔ tuần sau ${pctVN(next.pct)}` : "⏳ chưa chọn";
              const holdText = now.pct !== null && Number(m.holdTier) === now.pct ? " cầm chừng" : "";
              return `• ${label}: tuần này ${pctVN(now.pct)}${holdText}${money} · ${ddText} · ${nextText}`;
            });
            const text = buildMessage(
              "💰", "CHỌN MỨC ĐI VỐN", "⭐", `Tuần ${ddmm(weekNext)} – ${ddmm(shiftDateStr(weekNext, 6))}`, undefined,
              `${lines.join("\n")}\nMở tab Phân bổ vốn để chọn — chưa chọn thì tuần sau giữ nguyên mức tuần này.`,
            );
            if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, cap.threadId)) {
              log[logKey] = true;
              logChanged = true;
              sent++;
            }
          } else {
            log[logKey] = true;
            logChanged = true;
          }
        }
      }
    }

    // Tổng kết 7 ngày gần nhất — gom số liệu rải rác trên web thành một nhịp tuần.
    const ws = settings.weeklySummary;
    if (ws?.enabled && (ws.weekday || "CN") === todayWeekdayCode && minutesDiff(ws.time || "19:00", currentHHMM) <= MATCH_TOLERANCE_MIN
        && !isTaskDone("weekly", ws.time || "19:00")) {
      const logKey = `weekly_${today}`;
      if (!log[logKey]) {
        const from = shiftDateStr(today, -6);
        const inRange = (d?: string) => !!d && d >= from && d <= today;
        const fxRates = (resourcesRow?.value?.fxRates || {}) as Record<string, number>;
        const currencyOf = (accName?: string) =>
          (accounts.find((a) => a.name === accName) as { currency?: string } | undefined)?.currency;

        const closed = trades.filter((t) => inRange(t.exitDate as string | undefined));
        let win = 0, loss = 0, be = 0, totalR = 0, rCount = 0, usd = 0, usdCount = 0;
        // Thiếu tỷ giá thì toUSD quy 1:1 và dòng "Lãi/lỗ quy USD" thành vô nghĩa mà không ai biết.
        const noRate = new Set<string>();
        // Tách R thắng và R lỗ cho từng tài khoản: +2R do "thắng 3R lỗ 1R" khác hẳn
        // +2R do "thắng 12R lỗ 10R", mà nhìn mỗi con số ròng thì không phân biệt được.
        type AccR = { win: number; loss: number; rWin: number; rLoss: number; rCount: number };
        const byAccount = new Map<string, AccR>();
        for (const t of closed) {
          const closingProfit = t.profit === "" || t.profit === null || t.profit === undefined ? null : Number(t.profit);
          if (closingProfit === null || Number.isNaN(closingProfit)) continue;
          // Lời/lỗ cả lệnh = các lần chốt bớt + lần đóng nốt + phí, giống hệt bên web.
          const profit = closingProfit + partialProfitOf(t) + feesOf(t);
          if (profit > 0) win++; else if (profit < 0) loss++; else be++;

          const name = (t.account as string | undefined) || "(chưa gán tài khoản)";
          const acc = byAccount.get(name) || { win: 0, loss: 0, rWin: 0, rLoss: 0, rCount: 0 };
          if (profit > 0) acc.win++; else if (profit < 0) acc.loss++;

          const risk = Number(t.riskAmount);
          if (t.riskAmount !== "" && t.riskAmount !== null && t.riskAmount !== undefined && risk && !Number.isNaN(risk)) {
            const rr = profit / risk;
            totalR += rr;
            rCount++;
            if (rr > 0) acc.rWin += rr; else acc.rLoss += rr;
            acc.rCount++;
          }
          byAccount.set(name, acc);

          const cur = currencyOf(t.account as string | undefined);
          if (fxRate(cur, fxRates) === null) noRate.add(cur || "—");
          const converted = toUSD(profit, cur, fxRates);
          if (!Number.isNaN(converted)) { usd += converted; usdCount++; }
        }
        const accountLines = [...byAccount.entries()]
          .map(([name, a]) => ({ name, ...a, rNet: a.rWin + a.rLoss }))
          .sort((a, b) => b.rNet - a.rNet)
          .map((a) => a.rCount
            ? `• ${a.name}: ${signed(a.rNet, 2)}R (thắng ${a.rWin.toFixed(2)}R | lỗ ${Math.abs(a.rLoss).toFixed(2)}R) · ${a.win} thắng / ${a.loss} thua`
            : `• ${a.name}: ${a.win} thắng / ${a.loss} thua · chưa lệnh nào ghi risk`);
        const graded = win + loss + be;
        const opened = trades.filter((t) => inRange(t.entryDate as string | undefined)).length;
        const stillOpen = trades.filter((t) => t.entryDate && !t.exitDate).length;
        const incompleteCount = trades.filter((t) => completionPercent(t) < 100).length;

        // Ba mục setup chỉ cần cho tin này nên đọc tại chỗ, khỏi tải mỗi 5 phút.
        const [{ data: missRow }, { data: skipRow }, { data: variantRow }] = await Promise.all([
          supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "missedSetups").maybeSingle(),
          supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "skippedSetups").maybeSingle(),
          supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "setupVariants").maybeSingle(),
        ]);
        const missCount = ((missRow?.value || []) as { missDate?: string }[]).filter((x) => inRange(x.missDate)).length;
        const skipCount = ((skipRow?.value || []) as { skipDate?: string }[]).filter((x) => inRange(x.skipDate)).length;
        const variantCount = ((variantRow?.value || []) as { variantDate?: string }[]).filter((x) => inRange(x.variantDate)).length;

        // Chuỗi kiểm tra setup: một ngày chỉ tính khi bấm đủ mọi lần nhắc hôm đó,
        // và chỉ đếm những ngày có lịch nhắc (khớp setupCheckStreak ở src/lib/helpers.js).
        const byDate = new Map<string, { total: number; done: number }>();
        for (const e of checkLog) {
          if (!e.date) continue;
          const cur = byDate.get(e.date) || { total: 0, done: 0 };
          cur.total++;
          if (e.checkedAt) cur.done++;
          byDate.set(e.date, cur);
        }
        const fullDay = (d: string) => { const x = byDate.get(d); return !!x && x.total > 0 && x.done === x.total; };
        const datesDesc = [...byDate.keys()].sort().reverse();
        let streak = 0;
        for (let i = datesDesc[0] === today && !fullDay(today) ? 1 : 0; i < datesDesc.length; i++) {
          if (!fullDay(datesDesc[i])) break;
          streak++;
        }
        const weekChecks = checkLog.filter((e) => inRange(e.date));
        const weekChecked = weekChecks.filter((e) => e.checkedAt).length;

        // Chín dòng số liệu dính liền nhau thì đọc trên điện thoại rất mệt — mắt không biết
        // dừng ở đâu. Chia theo chủ đề: kết quả → R từng tài khoản → hoạt động → kỷ luật.
        // Khối nào rỗng thì bỏ luôn cả vạch ngăn, không thì có tuần hiện ra hai vạch dính nhau.
        const blocks: string[][] = [
          [
            `Lệnh đóng: ${graded}${graded ? ` (${win} thắng / ${loss} thua${be ? ` / ${be} hòa` : ""}) · ${Math.round((win / graded) * 100)}% thắng` : ""}`,
            rCount ? `Tổng R: ${signed(totalR, 2)}R (${rCount} lệnh có risk)` : "Tổng R: — (chưa lệnh nào điền risk)",
          ],
          [
            ...(accountLines.length ? ["R từng tài khoản:", ...accountLines] : []),
            usdCount ? `Lãi/lỗ quy USD: ${signed(usd, 2)}${noRate.size ? " ⚠ chưa đáng tin" : ""}` : "",
            noRate.size ? `⚠ ${[...noRate].join(", ")} chưa có tỷ giá — đang cộng thẳng như USD. Điền ở tab Tài khoản.` : "",
          ],
          [
            `Lệnh mới mở: ${opened} · đang mở: ${stillOpen}`,
            `Setup: ${missCount} miss · ${skipCount} skip · ${variantCount} biến thể`,
          ],
          [
            weekChecks.length
              ? `Kiểm tra setup: ${weekChecked}/${weekChecks.length} (${Math.round((weekChecked / weekChecks.length) * 100)}%) · chuỗi ${streak} ngày`
              : "",
            incompleteCount ? `Còn ${incompleteCount} lệnh chưa điền xong` : "Mọi lệnh đã điền đủ 100% 🎯",
          ],
        ];
        const body = blocks
          .map((b) => b.filter(Boolean).join("\n"))
          .filter(Boolean)
          .join("\n----\n");

        const text = buildMessage("📊", "TỔNG KẾT TUẦN", "⭐", `${ddmm(from)} – ${ddmm(today)}`, undefined, body);
        if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, ws.threadId)) {
          log[logKey] = true;
          logChanged = true;
          sent++;
        }
      }
    }

    // Symbol theo dõi — mỗi nhóm là một khung giờ nhắc, mỗi symbol trong nhóm là một tin riêng
    // để bấm "Tiếp tục / Ngừng theo dõi" cho từng symbol độc lập.
    if (settings.symbolWatchEnabled && watches.length) {
      let watchMessages = 0;
      for (const w of watches) {
        if (!w.id || !w.enabled) continue;

        const activeDays = Array.isArray(w.activeDays) ? w.activeDays : null;
        if (activeDays && !activeDays.includes(todayWeekdayCode)) continue;
        const matchedHour = hoursDueNow(w)[0];
        if (!matchedHour) continue;
        if (isTaskDone(`w_${w.id}`, matchedHour)) continue;

        const groupName = (w.label || "").trim();
        for (const sym of watchSymbols(w)) {
          if (sym.done) continue;
          if (watchMessages >= MAX_WATCH_MESSAGES_PER_RUN) break;
          const logKey = `watch_${today}_${w.id}_${matchedHour}_${sym.id}`;
          if (log[logKey]) continue;

          const text = buildMessage("👀", "SYMBOL THEO DÕI", "⭐", sym.name, groupName || undefined, w.note || undefined);
          const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, settings.symbolWatchThreadId, {
            inline_keyboard: [[
              { text: "👀 Tiếp tục theo dõi", callback_data: `w|${w.id}|${sym.id}|keep` },
              { text: "🛑 Ngừng theo dõi", callback_data: `w|${w.id}|${sym.id}|stop` },
            ]],
          });

          if (ok) {
            log[logKey] = true;
            logChanged = true;
            watchMessages++;
            sent++;
          }
        }
      }
    }

    if (mutedChanged) {
      await supabase.from("app_data").upsert(
        { user_id: row.user_id, key: "slMutedTrades", value: muted, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    }

    if (checkLogChanged) {
      const checkCutoff = vnNowParts(new Date(now.getTime() - CHECK_LOG_RETENTION_DAYS * 24 * 60 * 60000)).date;
      const kept = checkLog.filter((e) => (e.date || "") >= checkCutoff);
      await supabase.from("app_data").upsert(
        { user_id: row.user_id, key: "setupCheckLog", value: kept, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    }

    if (logChanged) {
      const cutoffDate = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60000);
      const cutoffStr = vnNowParts(cutoffDate).date;
      for (const k of Object.keys(log)) {
        const d = k.split("_")[1];
        if (d && d < cutoffStr) delete log[k];
      }
      await supabase
        .from("app_data")
        .upsert(
          { user_id: row.user_id, key: "slReminderLog", value: log, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, vnTime: currentHHMM, vnDate: today, vnWeekday: todayWeekdayCode }),
    { headers: { "content-type": "application/json" } }
  );
});
