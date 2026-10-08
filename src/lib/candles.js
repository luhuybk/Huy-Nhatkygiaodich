// Giờ đóng nến tự tính, để nhắc dời SL đúng lúc nến của CHÍNH lệnh đó đóng.
//
// Nến H4/H8/D trên TradingView xếp từ giờ MỞ PHIÊN của từng mã chứ không xếp từ 0h, và mỗi NGUỒN
// dữ liệu một phiên khác nhau — đo thật trên chart (10/2026):
//   - FX:, OANDA: (vàng, bạc, XPD, XPT), FXTF:XNGUSD — "1700-1700" New York → H4 đóng 0-4-8-12-16-20h VN
//   - FUSIONMARKETS: đồng/nhôm/niken/chì/kẽm (LME) — "0100-1850" London → 11-15-19-23h, nến cuối đóng 0h50
//   - FOREXCOM:USOIL — theo UTC, liền từ tối CN tới tối T6 → 3-7-11-15-19-23h, KHÔNG đổi giờ mùa
//   - FOREXCOM:UKOIL — theo UTC, nghỉ 22h–24h UTC mỗi đêm → 11-15-19-23-3h, nến cuối đóng 5h
// Nên lưu đúng CHUỖI PHIÊN TradingView + múi giờ, và tính bằng múi giờ thật: New York đổi giờ
// tháng 3/11, London đổi sớm hơn một tuần (cuối tháng 3/10), UTC thì không đổi.
//
// BẢN CHÉP Y HỆT nằm ở supabase/functions/sl-reminder/index.ts (bot) — sửa một bên phải sửa bên kia.

export const VN_TZ = "Asia/Ho_Chi_Minh";
export const NY_TZ = "America/New_York";
export const LONDON_TZ = "Europe/London";
export const UTC_TZ = "Etc/UTC";

// `spec` là chuỗi phiên đúng như TradingView (Symbol info → Session): "HHMM-HHMM[:thứ]" nối bằng "|".
// Thứ đánh số 1 = Chủ nhật … 7 = Thứ 7; bỏ trống = thứ 2–thứ 6. Giờ kết thúc ≤ giờ bắt đầu nghĩa là
// phiên qua đêm, bắt đầu từ hôm trước ("1700-1700" của thứ 2 mở từ 17h Chủ nhật). "0000" ở cuối = 24h.
export const SESSION_PRESETS = [
  { id: "fx", name: "Forex · OANDA kim loại · FXTF", note: "FX:, OANDA: vàng/bạc/XPD/XPT, FXTF:XNGUSD", tz: NY_TZ, spec: "1700-1700", preset: true },
  { id: "lme", name: "Kim loại LME · FUSIONMARKETS", note: "đồng XCU, nhôm XAL, niken XNI, chì XPB, kẽm XZN", tz: LONDON_TZ, spec: "0100-1850", preset: true },
  { id: "usoil", name: "Dầu WTI · FOREXCOM:USOIL", note: "theo giờ UTC, không đổi giờ mùa", tz: UTC_TZ, spec: "2200-0000:1|0000-0000:2345|0000-2100:6", preset: true },
  { id: "ukoil", name: "Dầu Brent · FOREXCOM:UKOIL", note: "theo giờ UTC, nghỉ 2 tiếng mỗi đêm", tz: UTC_TZ, spec: "2200-2200:2|0000-2200:3456", preset: true },
];

// Mã chưa tự gán phiên thì đoán theo tên — đúng với các nguồn đang dùng trên chart, sửa được ở
// bảng "Mã nào thuộc phiên nào".
export const DEFAULT_SYMBOL_RULES = [
  [/^X(CU|AL|NI|PB|ZN)/, "lme"],
  [/^(US?OIL|WTI|XTI)/, "usoil"],
  [/^(UKOIL|BRENT|XBR)/, "ukoil"],
];

// Giờ nghỉ: sau lần dời cuối lúc 0h tới 8h30 mới ngồi lại máy — nến đóng trong khoảng này dồn về 8h30.
export const DEFAULT_AUTO_QUIET = { from: "00:30", to: "08:30" };

// Chỉ nhắc ở vài mốc cố định trong ngày: mỗi lệnh được nhắc ở MỐC ĐẦU TIÊN sau khi nến của nó
// đóng. Đồng/dầu đóng 11h-15h-19h-23h còn vàng/forex 12h-16h-20h-0h — gộp cả hai vào 12-16-20-0
// thì một ngày chỉ ngồi vào máy 5 lần thay vì 9; dời SL trễ một tiếng sau khi nến đóng vẫn đúng.
export const DEFAULT_AUTO_SLOTS = { enabled: false, hours: ["00:00", "08:30", "12:00", "16:00", "20:00"] };

function toMin(hhmm) {
  return +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
}

export function slotHours(settings) {
  const sl = (settings && settings.autoSlots) || DEFAULT_AUTO_SLOTS;
  if (!sl.enabled) return null;
  const list = [...new Set((sl.hours || []).filter((h) => /^\d{2}:\d{2}$/.test(h)))].sort();
  return list.length ? list : null;
}

// "H4" "4H" "h4" → 4; "D" "D1" "1D" → 24; "H1" → 1. Khung tuần/tháng hay phút lẻ thì null —
// không tự tính, lệnh đó rơi về giờ gõ tay của lịch.
export function tfHours(tf) {
  const s = String(tf || "").trim().toUpperCase();
  let m = /^H(\d{1,2})$/.exec(s) || /^(\d{1,2})H$/.exec(s);
  if (m) { const n = Number(m[1]); return n >= 1 && n <= 24 ? n : null; }
  if (/^(D|D1|1D)$/.test(s)) return 24;
  return null;
}

const dtfCache = new Map();
function partsIn(tz, ms) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short",
    }));
  }
  const p = Object.fromEntries(dtfCache.get(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, weekday: p.weekday };
}

// Lệch giờ (phút) của múi `tz` so với UTC tại thời điểm `ms` — New York ra −240 mùa hè, −300 mùa đông.
function offsetMin(tz, ms) {
  const p = partsIn(tz, ms);
  const asUtc = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), +p.time.slice(0, 2), +p.time.slice(3, 5));
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

// Giờ đồng hồ treo tường ở múi `tz` → thời điểm tuyệt đối. Lặp hai lần cho đúng cả ngày đổi giờ.
export function wallToMs(tz, dateStr, hhmm) {
  const base = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), +hhmm.slice(0, 2), +hhmm.slice(3, 5));
  let ms = base - offsetMin(tz, base) * 60000;
  ms = base - offsetMin(tz, ms) * 60000;
  return ms;
}

function shiftDay(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FX_WEEK_START = new Set(["Sun", "Mon", "Tue", "Wed", "Thu"]);

function hhmmOf(x) {
  return `${x.slice(0, 2)}:${x.slice(2, 4)}`;
}

// "1700-1700" → [{ days, start, end }] — `days` theo kiểu TradingView (1 = CN … 7 = T7).
export function parseSessionSpec(spec) {
  const str = String(spec || "").trim();
  if (!str) return [];
  if (/^24x7$/i.test(str)) return [{ days: "1234567", start: "0000", end: "0000" }];
  return str.split("|").map((seg) => {
    const m = /^(\d{4})-(\d{4})(?::([1-7]+))?$/.exec(seg.trim());
    return m ? { days: m[3] || "23456", start: m[1], end: m[2] } : null;
  }).filter(Boolean);
}

// Thứ của một ngày lịch theo đánh số TradingView: 1 = Chủ nhật … 7 = Thứ 7.
function tvWeekday(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 1;
}

// Các khoảng phiên [bắt đầu, kết thúc] (ms) có thể chạm ngày `vnDate`.
function sessionRanges(session, vnDate) {
  const tz = session.tz || NY_TZ;
  const out = [];
  if (session.spec) {
    const segs = parseSessionSpec(session.spec);
    for (let k = -2; k <= 2; k += 1) {
      const day = shiftDay(vnDate, k);
      const wd = String(tvWeekday(day));
      segs.forEach((g) => {
        if (!g.days.includes(wd)) return;
        const startMin = +g.start.slice(0, 2) * 60 + +g.start.slice(2);
        const endMin = g.end === "0000" ? 1440 : +g.end.slice(0, 2) * 60 + +g.end.slice(2);
        const overnight = endMin <= startMin;
        const start = wallToMs(tz, overnight ? shiftDay(day, -1) : day, hhmmOf(g.start));
        const end = g.end === "0000" ? wallToMs(tz, shiftDay(day, 1), "00:00") : wallToMs(tz, day, hhmmOf(g.end));
        if (end > start) out.push([start, end]);
      });
    }
    return out;
  }
  // Phiên tự đặt kiểu cũ: giờ mở + độ dài (giờ) + nghỉ cuối tuần hay không.
  if (!/^\d{2}:\d{2}$/.test(String(session.open || ""))) return out;
  const length = Math.min(24, Math.max(1, Number(session.length) || 24));
  for (let k = -2; k <= 1; k += 1) {
    const start = wallToMs(tz, shiftDay(vnDate, k), session.open);
    if (session.week !== "all" && !FX_WEEK_START.has(partsIn(tz, start).weekday)) continue;
    out.push([start, start + length * 3600000]);
  }
  return out;
}

// Mọi mốc nến khung `hours` đóng trong ngày `vnDate` (giờ VN), theo phiên `session`. Nến xếp từ
// đầu mỗi phiên; nến cuối phiên đóng ở giờ hết phiên dù chưa đủ độ dài (đồng đóng 0h50, Brent 5h).
export function candleClosesVN(hours, session, vnDate) {
  if (!hours || !session) return [];
  const out = new Set();
  sessionRanges(session, vnDate).forEach(([start, end]) => {
    const marks = [];
    for (let t = start + hours * 3600000; t < end - 60000; t += hours * 3600000) marks.push(t);
    marks.push(end);
    marks.forEach((t) => {
      const p = partsIn(VN_TZ, t);
      if (p.date === vnDate) out.add(p.time);
    });
  });
  return [...out].sort();
}

export function inQuiet(hhmm, quiet) {
  const q = quiet || DEFAULT_AUTO_QUIET;
  const from = q.from || "";
  const to = q.to || "";
  if (!from || !to || from === to) return false;
  return from < to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to;
}

export function normSymbol(s) {
  return String(s || "").trim().toUpperCase();
}

export function allSessions(settings) {
  const custom = Array.isArray(settings && settings.sessions) ? settings.sessions.filter((x) => x && x.id) : [];
  return [...SESSION_PRESETS, ...custom];
}

// Mã chưa gán phiên thì theo phiên mặc định (forex) — đổi được ở phần cài đặt phiên.
export function sessionFor(settings, symbol) {
  const list = allSessions(settings);
  const map = (settings && settings.symbolSessions) || {};
  const sym = normSymbol(symbol);
  const rule = DEFAULT_SYMBOL_RULES.find(([re]) => re.test(sym));
  const id = map[sym] || (rule && rule[1]) || (settings && settings.defaultSession) || "fx";
  return list.find((x) => x.id === id) || list[0];
}

// Giờ nhắc dời SL của MỘT lệnh trong ngày: giờ đóng nến khung của lệnh theo phiên của mã.
// Nến đóng trong giờ ngủ thì DỒN về giờ thức dậy (cuối khoảng ngủ) chứ không bỏ — nến D forex
// đóng 4h sáng, bỏ đi là lệnh khung D không bao giờ được nhắc. Mấy nến đóng trong đêm gộp
// thành một lần nhắc lúc dậy. Khung không tự tính được (W, M15…) thì null → dùng giờ gõ tay.
export function tradeAutoHours(trade, settings, vnDate) {
  const h = tfHours(trade && trade.timeframe);
  if (!h) return null;
  const slots = slotHours(settings);
  if (slots) {
    // Mốc S nhắc lệnh này nếu có nến đóng trong (mốc liền trước, S] — mốc đầu ngày lấy mốc cuối hôm qua.
    const ses = sessionFor(settings, trade.symbol);
    const prev = new Date(`${vnDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const closes = [
      ...candleClosesVN(h, ses, prev.toISOString().slice(0, 10)).map((x) => toMin(x) - 1440),
      ...candleClosesVN(h, ses, vnDate).map(toMin),
    ];
    const mins = slots.map(toMin);
    return slots.filter((x, i) => {
      const lo = i ? mins[i - 1] : mins[mins.length - 1] - 1440;
      return closes.some((c) => c > lo && c <= mins[i]);
    });
  }
  const quiet = (settings && settings.autoQuiet) || DEFAULT_AUTO_QUIET;
  const wake = quiet.to || DEFAULT_AUTO_QUIET.to;
  const out = new Set();
  candleClosesVN(h, sessionFor(settings, trade.symbol), vnDate).forEach((x) => {
    if (!inQuiet(x, quiet)) { out.add(x); return; }
    // Nến đóng sau giờ đi ngủ (vd 23h30) thì sáng HÔM SAU mới nhắc — ngày đó tự lo phần của nó.
    if (x < wake) out.add(wake);
  });
  // Nến đóng từ giờ đi ngủ tới nửa đêm HÔM QUA cũng dồn về giờ dậy hôm nay.
  if (quiet.from > wake) {
    const prev = new Date(`${vnDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const y = prev.toISOString().slice(0, 10);
    if (candleClosesVN(h, sessionFor(settings, trade.symbol), y).some((x) => x >= quiet.from)) out.add(wake);
  }
  return [...out].sort();
}

// Giờ VN hôm nay → giờ đồng hồ ở múi phiên, để lưu phiên tự đặt đúng múi (tự đổi theo mùa).
export function vnTimeToZone(tz, vnDate, hhmm) {
  return partsIn(tz, wallToMs(VN_TZ, vnDate, hhmm)).time;
}

export function zoneTimeToVn(tz, vnDate, hhmm) {
  // Mốc mở phiên rơi vào ngày nào ở múi kia không quan trọng — chỉ cần giờ VN tương ứng hôm nay.
  const ms = wallToMs(tz, partsIn(tz, wallToMs(VN_TZ, vnDate, "12:00")).date, hhmm);
  return partsIn(VN_TZ, ms).time;
}

export function vnToday(ms = Date.now()) {
  return partsIn(VN_TZ, ms).date;
}

// Lịch dời SL bật "tự tính": giờ của cả lịch trong ngày = gộp giờ của mọi lệnh đang mở thuộc
// lịch. Lệnh khung không tự tính được thì góp giờ gõ tay của lịch.
export function autoScheduleHours(sched, settings, trades, vnDate) {
  const set = new Set();
  (trades || []).forEach((t) => {
    const hrs = tradeAutoHours(t, settings, vnDate);
    (hrs || sched.hours || []).forEach((x) => set.add(x));
  });
  return [...set].sort();
}

// Phiên hôm nay mở/đóng lúc mấy giờ VN — để đọc nhanh, không cần hiểu chuỗi phiên.
export function sessionTodayVN(session, vnDate) {
  if (!session) return "";
  // Chỉ phiên MỞ trong hôm nay — phiên qua đêm từ hôm qua đã nằm ở dòng của hôm qua.
  const ranges = sessionRanges(session, vnDate)
    .map(([a, b]) => [partsIn(VN_TZ, a), partsIn(VN_TZ, b)])
    .filter(([a]) => a.date === vnDate)
    .map(([a, b]) => `mở ${a.time} → đóng ${b.time}${b.date === vnDate ? "" : " hôm sau"}`);
  return ranges.length ? [...new Set(ranges)].join(", ") : "hôm nay không mở phiên mới";
}

export const TZ_LABEL = { [NY_TZ]: "giờ New York", [LONDON_TZ]: "giờ London", [UTC_TZ]: "giờ UTC", [VN_TZ]: "giờ VN" };

