// Kiểm lại setup theo nến: cảnh báo TradingView bắn khi setup chưa đủ (thiếu nến…) thì bấm
// "⏳ Kiểm lại nến sau" — máy chủ gửi lại tin đúng lúc nến kế tiếp của khung đó đóng.
// Dùng chung cho alert-relay (gắn nút, gửi lại lúc tới hạn) và telegram-webhook (bấm nút).
//
// Khung lấy từ tiền tố trong tin: [H4] → H4, [H8] → H8, [Re-Entry] → không nhắc nến,
// còn lại (kể cả [D] và tin không ghi tiền tố) → D.
// Nến dựng theo giờ New York như TradingView (mốc 17:00 NY, tự đổi giờ mùa hè/đông). Nến đóng trong
// giờ nghỉ (sau 0h tới trước 8h45 giờ VN) thì dồn sang 8h45; khung D chỉ nhắc lúc 8h45.

export type Tf = "H4" | "H8" | "D";

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

// Lúc gửi tin kiểm lại kế tiếp (ms UTC) và giờ nến đóng tương ứng
export function nextRecheck(tf: Tf, nowMs: number): { at: number; close: number } {
  const step = tf === "H4" ? 4 * HOUR : tf === "H8" ? 8 * HOUR : 24 * HOUR;
  // "Giờ treo tường" New York biểu diễn bằng ms như thể là UTC; mốc nến = 17:00 NY hôm trước
  const nyNow = nowMs - nyOffsetHours(nowMs) * HOUR;
  let wall = Math.floor(nyNow / (24 * HOUR)) * 24 * HOUR - 7 * HOUR; // 17:00 NY hôm trước
  for (let i = 0; i < 200; i++, wall += step) {
    const close = wall + nyOffsetHours(wall + 5 * HOUR) * HOUR;
    if (close <= nowMs || closesInWeekend(new Date(wall))) continue;
    const vn = new Date(close + VN_OFFSET);
    const vnMin = vn.getUTCHours() * 60 + vn.getUTCMinutes();
    if (vnMin > 0 && vnMin < MORNING_MIN) {
      const morning = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) + MORNING_MIN * 60 * 1000 - VN_OFFSET;
      return { at: morning, close };
    }
    return { at: close + 60 * 1000, close }; // chừa 1 phút cho nến đóng hẳn
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

export function alertButtons(id: string, tf: Tf | null | undefined) {
  const row: { text: string; callback_data: string }[] = [{ text: "✅ Đã thấy", callback_data: `ta|${id}` }];
  if (tf) row.push({ text: "⏳ Kiểm lại", callback_data: `tr|${id}` }); // ngắn cho vừa màn hình điện thoại
  return { inline_keyboard: [row] };
}
