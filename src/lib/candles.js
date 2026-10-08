// Giờ đóng nến tự tính, để nhắc dời SL đúng lúc nến của CHÍNH lệnh đó đóng.
//
// Nến H4/H8/D trên TradingView xếp từ giờ MỞ PHIÊN của từng mã chứ không xếp từ 0h: forex mở
// 17h New York nên H4 đóng 4h-8h-12h-16h-20h-0h giờ VN; vàng/kim loại mở 18h New York, nghỉ
// 1 tiếng trước khi mở phiên sau, nên cùng H4 mà đóng lệch một tiếng và nến cuối ngày bị cụt.
// New York đổi giờ mùa hè/mùa đông (tháng 3 và tháng 11) nên mọi mốc giờ VN nhích 1 tiếng —
// tính bằng múi giờ thật thay vì gõ giờ cố định là để khỏi phải nhớ sửa lịch hai lần một năm.
//
// BẢN CHÉP Y HỆT nằm ở supabase/functions/sl-reminder/index.ts (bot) — sửa một bên phải sửa bên kia.

export const VN_TZ = "Asia/Ho_Chi_Minh";
export const NY_TZ = "America/New_York";

// week: "fx" = phiên mở từ Chủ nhật đến thứ 5 (giờ của múi phiên), thứ 6/thứ 7 không mở phiên mới —
// đúng lịch forex/kim loại. "all" = ngày nào cũng có phiên (crypto, hoặc tự đặt).
export const SESSION_PRESETS = [
  { id: "fx", name: "Forex", note: "mở 17h New York, chạy liền 24 tiếng", tz: NY_TZ, open: "17:00", length: 24, week: "fx", preset: true },
  { id: "cme", name: "Kim loại · năng lượng", note: "mở 18h New York, 23 tiếng, nghỉ 1 tiếng cuối ngày", tz: NY_TZ, open: "18:00", length: 23, week: "fx", preset: true },
];

export const DEFAULT_AUTO_QUIET = { from: "23:00", to: "07:00" };

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

// Mọi mốc nến khung `hours` đóng trong ngày `vnDate` (giờ VN), theo phiên `session`. Nến cuối
// phiên đóng ở giờ hết phiên dù chưa đủ độ dài — đó là chỗ kim loại khác forex.
export function candleClosesVN(hours, session, vnDate) {
  if (!hours || !session || !/^\d{2}:\d{2}$/.test(String(session.open || ""))) return [];
  const length = Math.min(24, Math.max(1, Number(session.length) || 24));
  const tz = session.tz || NY_TZ;
  const out = new Set();
  for (let k = -2; k <= 1; k += 1) {
    const day = shiftDay(vnDate, k);
    const start = wallToMs(tz, day, session.open);
    if (session.week !== "all" && !FX_WEEK_START.has(partsIn(tz, start).weekday)) continue;
    const end = start + length * 3600000;
    const marks = [];
    for (let t = start + hours * 3600000; t < end - 60000; t += hours * 3600000) marks.push(t);
    marks.push(end);
    marks.forEach((t) => {
      const p = partsIn(VN_TZ, t);
      if (p.date === vnDate) out.add(p.time);
    });
  }
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
  const id = map[normSymbol(symbol)] || (settings && settings.defaultSession) || "fx";
  return list.find((x) => x.id === id) || list[0];
}

// Giờ nhắc dời SL của MỘT lệnh trong ngày: giờ đóng nến khung của lệnh theo phiên của mã.
// Nến đóng trong giờ ngủ thì DỒN về giờ thức dậy (cuối khoảng ngủ) chứ không bỏ — nến D forex
// đóng 4h sáng, bỏ đi là lệnh khung D không bao giờ được nhắc. Mấy nến đóng trong đêm gộp
// thành một lần nhắc lúc dậy. Khung không tự tính được (W, M15…) thì null → dùng giờ gõ tay.
export function tradeAutoHours(trade, settings, vnDate) {
  const h = tfHours(trade && trade.timeframe);
  if (!h) return null;
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

export function fmtSessionOpenVN(session, vnDate) {
  if (!session) return "";
  return session.tz === VN_TZ ? session.open : zoneTimeToVn(session.tz, vnDate, session.open);
}

