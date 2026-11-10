// Kiểm lại setup theo nến: cảnh báo TradingView bắn khi setup chưa đủ (thiếu nến…) thì bấm
// "⏳ Kiểm lại nến sau" — máy chủ gửi lại tin đúng lúc nến kế tiếp của khung đó đóng.
// Dùng chung cho alert-relay (gắn nút, gửi lại lúc tới hạn) và telegram-webhook (bấm nút).
//
// Khung lấy từ tiền tố trong tin: [H4] → H4, [H8] → H8, [Re-Entry] → không nhắc nến,
// còn lại (kể cả [D] và tin không ghi tiền tố) → D.
// Nến dựng như TradingView: mặc định mốc 17:00 New York (tự đổi giờ mùa hè/đông), crypto từ 0h UTC, còn kim loại
// LME / bạch kim-paladi / dầu chia từ giờ MỞ PHIÊN của nguồn dữ liệu (SESSION_RULES — cùng bảng với EA KeoSLDuoiNen
// v2.92+, sửa một bên phải sửa bên kia). Nến đóng trong giờ nghỉ (sau 0h tới trước 8h45 giờ VN) thì dồn sang 8h45.

export type Tf = "H1" | "H2" | "H3" | "H4" | "H6" | "H8" | "H12" | "D";
const TF_HOURS: Record<Tf, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H6: 6, H8: 8, H12: 12, D: 24 };

// Ô Khung của tài khoản có thể ghi "H3", "4H", "D1", "Daily"… → khung chuẩn; khung không chia hết 24 giờ
// (H5, M15…) thì null — mốc nến của nó không trùng mốc ngày nên không tính giờ đóng được
export function normTf(v: unknown): Tf | null {
  const t = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (["D", "D1", "1D", "DAILY", "NGÀY", "NGAY"].includes(t)) return "D";
  const m = t.match(/^H(\d{1,2})$/) || t.match(/^(\d{1,2})H$/);
  const k = m ? `H${Number(m[1])}` : "";
  return k in TF_HOURS ? (k as Tf) : null;
}

export const RECHECK_DAYS = 7; // quá 7 ngày kể từ lúc cảnh báo bắn thì thôi, không nhắc nến nữa

const HOUR = 3600 * 1000;
const VN_OFFSET = 7 * HOUR;
const MORNING_MIN = 8 * 60 + 45; // 8h45 sáng giờ VN

export function tfOf(text: string): Tf | null {
  const head = text.replace(/^\s*📈\s*/u, "");
  if (/^\[\s*re-?entry\s*\]/i.test(head)) return null;
  const m = head.match(/^\[\s*(H4|H8)\s*\]/i);
  return m ? (m[1].toUpperCase() as Tf) : "D";
}

// Giờ mùa hè Mỹ: 2h sáng Chủ nhật thứ 2 tháng 3 → 2h sáng Chủ nhật đầu tháng 11 (giờ NY)
function nthSundayUtc(year: number, month: number, nth: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Date.UTC(year, month, 1 + ((7 - first) % 7) + (nth - 1) * 7);
}
function nyOffsetHours(utcMs: number) {
  const y = new Date(utcMs).getUTCFullYear();
  const from = nthSundayUtc(y, 2, 2) + 7 * HOUR;  // 2:00 EST = 7:00 UTC
  const to = nthSundayUtc(y, 10, 1) + 6 * HOUR;   // 2:00 EDT = 6:00 UTC
  return utcMs >= from && utcMs < to ? 4 : 5;
}

// Nến FX không có từ sau 17:00 NY thứ Sáu tới 17:00 NY Chủ nhật
function closesInWeekend(nyWall: Date) {
  const day = nyWall.getUTCDay();
  const min = nyWall.getUTCHours() * 60 + nyWall.getUTCMinutes();
  return day === 6 || (day === 5 && min > 17 * 60) || (day === 0 && min <= 17 * 60);
}

// Crypto giao dịch cả tuần, TradingView (Binance) và EA chia nến từ 0h UTC — không theo mốc New York
export function isCryptoSymbol(symbol: string) {
  return /^(BTC|ETH|SOL|XRP|LTC|BCH|ADA|DOGE|DOT|LINK|BNB|AVAX|TRX|XLM|UNI|ATOM|TON|SHIB)/i.test(String(symbol || "").trim());
}

// ───── Phiên riêng theo mã ─────
// TradingView chia nến H2–D từ giờ mở phiên của nguồn dữ liệu, nến cuối phiên đóng lúc hết phiên dù chưa đủ độ dài.
// Đo trên chart 10/11/2026 (3 danh sách theo dõi Forex - D / H8 / H4), giờ VN mùa đông:
//   FUSIONMARKETS: đồng, nhôm, niken, chì, kẽm   0100-1850 London          H4 đóng 12-16-20-0h, 1h50
//   PEPPERSTONE:XPT, XPD · FPMARKETS:XTIUSD      1800-1700 New York        H4 đóng 10-14-18-22-2h, 5h
//   FPMARKETS:XBRUSD                             T2 1800-1700, T3–T6 2000-1700 New York
// `spec` đúng chuỗi phiên TradingView: HHMM-HHMM[:thứ] nối bằng "|", thứ 1 = Chủ nhật … 7 = thứ Bảy, không ghi = T2–T6;
// giờ kết thúc ≤ giờ bắt đầu = phiên qua đêm, mở từ hôm trước. Mã không khớp dòng nào → mốc 17:00 New York.
export type SessTz = "NY" | "LON" | "UTC";
export type SessionRule = { id: string; re: RegExp; tz: SessTz; spec: string; label: string };
export const SESSION_RULES: SessionRule[] = [
  { id: "lme", re: /^X(CU|AL|NI|PB|ZN)/, tz: "LON", spec: "0100-1850", label: "kim loại LME · 01:00–18:50 London" },
  { id: "pgm-wti", re: /^(XPT|XPD|USOIL|XTI)/, tz: "NY", spec: "1800-1700", label: "XPT, XPD, dầu WTI · 18:00–17:00 New York" },
  { id: "brent", re: /^(UKOIL|XBR)/, tz: "NY", spec: "1800-1700:2|2000-1700:3456", label: "dầu Brent · T2 18:00, T3–T6 20:00 → 17:00 New York" },
];
const symKeyOf = (symbol: unknown) => String(symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export function sessionRuleOf(symbol: unknown): SessionRule | null {
  const s = symKeyOf(symbol);
  return (s && SESSION_RULES.find((r) => r.re.test(s))) || null;
}

// Giờ mùa hè Anh: 1h UTC Chủ nhật cuối tháng 3 → 1h UTC Chủ nhật cuối tháng 10
function lastSundayUtc(year: number, month: number) {
  const last = Date.UTC(year, month + 1, 0);
  return last - new Date(last).getUTCDay() * 24 * HOUR;
}
function tzOffsetMs(tz: SessTz, utcMs: number) {
  if (tz === "NY") return -nyOffsetHours(utcMs) * HOUR;
  if (tz === "LON") {
    const y = new Date(utcMs).getUTCFullYear();
    return utcMs >= lastSundayUtc(y, 2) + HOUR && utcMs < lastSundayUtc(y, 9) + HOUR ? HOUR : 0;
  }
  return 0;
}
function localToUtc(tz: SessTz, local: number) {
  const utc = local - tzOffsetMs(tz, local);
  return local - tzOffsetMs(tz, utc);
}
type Seg = { a: number; b: number; days: string };
const segCache = new Map<string, Seg[]>();
function segsOf(spec: string): Seg[] {
  if (!segCache.has(spec)) {
    segCache.set(spec, spec.split("|").map((x) => {
      const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::([1-7]+))?$/.exec(x.trim());
      if (!m) return null;
      const b = +m[3] * 60 + +m[4];
      return { a: +m[1] * 60 + +m[2], b: b === 0 ? 1440 : b, days: m[5] || "23456" };
    }).filter(Boolean) as Seg[]);
  }
  return segCache.get(spec)!;
}
const DAY_MS = 24 * HOUR;
// Phiên chứa mốc utcMs; mốc rơi vào giờ nghỉ thì trả phiên gần nhất đã mở trước đó (bản chép SessionAt của EA)
export function sessionAt(rule: { tz: SessTz; spec: string }, utcMs: number): { start: number; end: number } | null {
  const local = utcMs + tzOffsetMs(rule.tz, utcMs);
  const day0 = Math.floor(local / DAY_MS) * DAY_MS;
  let best: { start: number; end: number } | null = null;
  let foundK = 0;
  for (let k = 1; k >= -8; k--) {
    if (best && k < foundK - 1) break;
    const day = day0 + k * DAY_MS;
    const wd = String(new Date(day).getUTCDay() + 1);
    for (const g of segsOf(rule.spec)) {
      if (!g.days.includes(wd)) continue;
      const start = localToUtc(rule.tz, (g.b <= g.a ? day - DAY_MS : day) + g.a * 60000);
      const end = localToUtc(rule.tz, day + g.b * 60000);
      if (start <= utcMs && (!best || start > best.start)) { best = { start, end }; foundK = k; }
    }
  }
  return best;
}
// Nến khung `step` (ms) đóng kế tiếp sau mốc afterMs theo phiên riêng
export function nextSessionClose(rule: { tz: SessTz; spec: string }, step: number, afterMs: number): number {
  let s = sessionAt(rule, afterMs);
  if (!s) return afterMs + step;
  if (afterMs < s.end) return Math.min(s.start + (Math.floor((afterMs - s.start) / step) + 1) * step, s.end);
  // Đang giờ nghỉ: dò tới phiên kế tiếp (nghỉ dài nhất là cuối tuần + lễ)
  for (let t = Math.floor(afterMs / HOUR) * HOUR + HOUR, i = 0; i < 24 * 9; i++, t += HOUR) {
    const n = sessionAt(rule, t);
    if (n && n.start > s.start) return Math.min(n.start + step, n.end);
  }
  return afterMs + step;
}

// Giờ VN rơi vào giờ nghỉ (sau 0h tới trước 8h45) thì dồn sang 8h45 cùng sáng
function restShift(close: number) {
  const vn = new Date(close + VN_OFFSET);
  const vnMin = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  if (vnMin > 0 && vnMin < MORNING_MIN) {
    return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) + MORNING_MIN * 60 * 1000 - VN_OFFSET;
  }
  return close + 60 * 1000; // chừa 1 phút cho nến đóng hẳn
}

// Lúc gửi tin kiểm lại kế tiếp (ms UTC) và giờ nến đóng tương ứng. `sym` = tên mã (tự nhận crypto / phiên riêng);
// true = crypto (nến 0h UTC, có cuối tuần); bỏ trống / false = nến 17:00 New York.
export function nextRecheck(tf: Tf, nowMs: number, sym: boolean | string = false): { at: number; close: number } {
  const step = (TF_HOURS[tf] || 24) * HOUR;
  const allWeek = sym === true || (typeof sym === "string" && isCryptoSymbol(symKeyOf(sym)));
  const rule = typeof sym === "string" && !allWeek ? sessionRuleOf(sym) : null;
  if (rule) {
    const close = nextSessionClose(rule, step, nowMs);
    return { at: restShift(close), close };
  }
  if (allWeek) {
    const close = Math.floor(nowMs / step) * step + step; // mọi khung đều chia hết 24 giờ nên mốc 0h UTC luôn trùng
    return { at: restShift(close), close };
  }
  // "Giờ treo tường" New York biểu diễn bằng ms như thể là UTC; mốc nến = 17:00 NY hôm trước
  const nyNow = nowMs - nyOffsetHours(nowMs) * HOUR;
  let wall = Math.floor(nyNow / (24 * HOUR)) * 24 * HOUR - 7 * HOUR; // 17:00 NY hôm trước
  for (let i = 0; i < 200; i++, wall += step) {
    const close = wall + nyOffsetHours(wall + 5 * HOUR) * HOUR;
    if (close <= nowMs || closesInWeekend(new Date(wall))) continue;
    return { at: restShift(close), close };
  }
  return { at: nowMs + 24 * HOUR, close: nowMs + 24 * HOUR };
}

// Giờ kiểm lại của một cảnh báo / mã: crypto (BTCUSDT…) nến chia từ 0h UTC và chạy cả tuần, kim loại LME / XPT-XPD /
// dầu theo phiên riêng, còn lại nến New York. `text` = nội dung tin hoặc tên mã. Mọi chỗ hẹn ⏳ Kiểm lại (bot, web)
// đi qua đây để giờ nhắc khớp nhau.
export function recheckFor(tf: Tf, nowMs: number, text?: string) {
  return nextRecheck(tf, nowMs, alertSymbol(text));
}

// 16:00 hoặc 08:45 30/10 (giờ VN) — kèm ngày khi không phải hôm nay
export function vnTime(ms: number, nowMs = Date.now()) {
  const t = new Date(ms + VN_OFFSET);
  const n = new Date(nowMs + VN_OFFSET);
  const pad = (x: number) => String(x).padStart(2, "0");
  const hm = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  const sameDay = t.getUTCDate() === n.getUTCDate() && t.getUTCMonth() === n.getUTCMonth();
  return sameDay ? hm : `${hm} ${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}`;
}

// Nến re-entry: lệnh vừa khớp mà nến vào lệnh là nến re-entry thì SL dời được ngay khi nến đó đóng,
// nhưng EA cố ý bỏ qua nến vào lệnh (InpSkipBars = 1) và chỉ tự kéo từ nến đóng kế tiếp. Bấm 🔁 ở tin
// khớp lệnh (mt5-journal gửi) → lúc nến vào lệnh đóng thì nhắc dời SL tay 1 lần.
//   close = nến vào lệnh đóng, at = lúc nhắc (giờ nghỉ → 8h45), eaAt = nến kế tiếp đóng (EA tự kéo)
// Nhắc chỉ có ích khi at < eaAt: nến vào lệnh đóng lúc 1h mà nến sau đóng 5h thì EA kéo trước 8h45.
export function reentryPlan(tf: Tf, fillMs: number, sym: boolean | string = false) {
  const first = nextRecheck(tf, fillMs, sym);
  const eaAt = nextRecheck(tf, first.close, sym).close;
  return { close: first.close, at: first.at, eaAt, useful: first.at < eaAt };
}

export const reentryId = (login: string, ticket: string) => `re-${login}-${ticket}`;

export function alertButtons(id: string, tf: Tf | null | undefined, kind?: string) {
  if (kind === "reentry") return { inline_keyboard: [[{ text: "✅ Đã dời", callback_data: `ta|${id}` }]] };
  const row: { text: string; callback_data: string }[] = [{ text: "✅ Đã thấy", callback_data: `ta|${id}` }];
  if (tf) row.push({ text: "⏳ Kiểm lại", callback_data: `tr|${id}` }); // ngắn cho vừa màn hình điện thoại
  return { inline_keyboard: [row] };
}

// ───── Gộp tin: nhiều cảnh báo cùng khung tới hạn cùng lượt tick → 1 tin, mỗi mã một hàng nút ─────
// Hàng nút của mã: ✅ <mã> (ta|id) · ⏳ <mã> (tr|id). Cuối tin: ✅ Thấy hết (ga|all) · ⏳ Kiểm lại hết
// (gr|all) — telegram-webhook tìm các cảnh báo theo id tin được bấm. Mã đã xử lý thì hàng nút đổi thành
// ô trạng thái (n|), các mã khác giữ nút.
export type GroupRec = {
  id?: string; text?: string; tf?: Tf | null; ackedAt?: string; recheckAt?: string; messageIds?: number[];
};
type Btn = { text: string; callback_data: string };

// Tên mã trong tin: "📈 [H4] - EUR/AUD — …" → EUR/AUD; "📈 OANDA:XAUUSD vượt…" → XAUUSD
export function alertSymbol(text: string | undefined) {
  const line = String(text || "").split("\n").find((x) => x.trim()) || "";
  const body = line.replace(/^\s*📈\s*/u, "").replace(/^\s*\[[^\]]*\]\s*-?\s*/, "");
  const m = body.match(/[A-Z0-9][A-Z0-9._:\/!-]*/);
  const tok = m ? m[0] : (body.trim().split(/\s+/)[0] || "?");
  return (tok.includes(":") ? tok.split(":").pop() || tok : tok).slice(0, 16);
}

// Nội dung một mã trong tin gộp: bỏ 📈 và "[H4] - " ở đầu (đầu tin đã ghi khung)
export function alertBody(text: string | undefined, tf: Tf | null | undefined) {
  const t = String(text || "").replace(/^\s*📈\s*/u, "");
  return tf ? t.replace(new RegExp(`^\\s*\\[\\s*${tf}\\s*\\]\\s*-?\\s*`, "i"), "") || t : t;
}

const symKey = (r: GroupRec) => alertSymbol(r.text).replace(/[^A-Z0-9]/gi, "").toUpperCase();
export function sortGroup<T extends GroupRec>(list: T[]): T[] {
  return [...list].sort((a, b) => symKey(a).localeCompare(symKey(b)) || String(a.id).localeCompare(String(b.id)));
}

const lastMid = (r: GroupRec) => Math.max(0, ...(r.messageIds || []));

export function liveRow(r: GroupRec): Btn[] {
  const sym = alertSymbol(r.text);
  const row = [{ text: `✅ ${sym}`, callback_data: `ta|${r.id}` }];
  if (r.tf) row.push({ text: `⏳ ${sym}`, callback_data: `tr|${r.id}` });
  return row;
}
export function allRow(members: GroupRec[]): Btn[] {
  const row = [{ text: "✅ Thấy hết", callback_data: "ga|all" }];
  if (members.some((r) => r.tf)) row.push({ text: "⏳ Kiểm lại hết", callback_data: "gr|all" });
  return row;
}

// Bàn phím của tin `mid` dựng lại từ danh sách cảnh báo. Tin cũ (không còn là tin mới nhất của mã nào)
// → [] gỡ hết nút. Trả live = số mã còn chờ bấm.
export function groupKeyboard(all: GroupRec[], mid: number, nowMs = Date.now()): { rows: Btn[][]; live: number; members: number } {
  const members = sortGroup(all.filter((r) => (r.messageIds || []).includes(mid)));
  if (!members.some((r) => lastMid(r) === mid)) return { rows: [], live: 0, members: members.length };
  const rows: Btn[][] = [];
  const liveOnes: GroupRec[] = [];
  for (const r of members) {
    const sym = alertSymbol(r.text);
    if (lastMid(r) !== mid) rows.push([{ text: `↪️ ${sym} · đã gửi tin mới`, callback_data: "n|" }]);
    else if (!r.ackedAt) { rows.push(liveRow(r)); liveOnes.push(r); }
    else if (r.recheckAt) rows.push([{ text: `⏳ ${sym} · kiểm lại ${vnTime(Date.parse(r.recheckAt), nowMs)}`, callback_data: "n|" }]);
    else rows.push([{ text: `✅ ${sym} · đã thấy`, callback_data: "n|" }]);
  }
  if (liveOnes.length > 1) rows.push(allRow(liveOnes));
  return { rows, live: liveOnes.length, members: members.length };
}
