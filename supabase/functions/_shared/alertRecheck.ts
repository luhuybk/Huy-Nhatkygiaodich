// Kiểm lại setup theo nến: cảnh báo TradingView bắn khi setup chưa đủ (thiếu nến…) thì bấm
// "⏳ Kiểm lại nến sau" — máy chủ gửi lại tin đúng lúc nến kế tiếp của khung đó đóng.
// Dùng chung cho alert-relay (gắn nút, gửi lại lúc tới hạn) và telegram-webhook (bấm nút).
//
// Khung lấy từ tiền tố trong tin: [H4] → H4, [H8] → H8, [Re-Entry] → không nhắc nến,
// còn lại (kể cả [D] và tin không ghi tiền tố) → D.
// Nến dựng theo giờ New York như TradingView (mốc 17:00 NY, tự đổi giờ mùa hè/đông). Nến đóng trong
// giờ nghỉ (sau 0h tới trước 8h45 giờ VN) thì dồn sang 8h45; khung D chỉ nhắc lúc 8h45.

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

// Giờ VN rơi vào giờ nghỉ (sau 0h tới trước 8h45) thì dồn sang 8h45 cùng sáng
function restShift(close: number) {
  const vn = new Date(close + VN_OFFSET);
  const vnMin = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  if (vnMin > 0 && vnMin < MORNING_MIN) {
    return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) + MORNING_MIN * 60 * 1000 - VN_OFFSET;
  }
  return close + 60 * 1000; // chừa 1 phút cho nến đóng hẳn
}

// Lúc gửi tin kiểm lại kế tiếp (ms UTC) và giờ nến đóng tương ứng. allWeek = crypto (nến 0h UTC, có cuối tuần).
export function nextRecheck(tf: Tf, nowMs: number, allWeek = false): { at: number; close: number } {
  const step = (TF_HOURS[tf] || 24) * HOUR;
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
export function reentryPlan(tf: Tf, fillMs: number, allWeek = false) {
  const first = nextRecheck(tf, fillMs, allWeek);
  const eaAt = nextRecheck(tf, first.close, allWeek).close;
  return { close: first.close, at: first.at, eaAt, useful: first.at < eaAt };
}

export const reentryId = (login: string, ticket: string) => `re-${login}-${ticket}`;

export function alertButtons(id: string, tf: Tf | null | undefined, kind?: string) {
  if (kind === "reentry") return { inline_keyboard: [[{ text: "✅ Đã dời", callback_data: `ta|${id}` }]] };
  const row: { text: string; callback_data: string }[] = [{ text: "✅ Đã thấy", callback_data: `ta|${id}` }];
  if (tf) row.push({ text: "⏳ Kiểm lại", callback_data: `tr|${id}` }); // ngắn cho vừa màn hình điện thoại
  return { inline_keyboard: [row] };
}
