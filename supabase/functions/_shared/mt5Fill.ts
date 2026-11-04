// Nhóm Telegram nhận tin "📥 Vào lệnh" của mt5-journal và tin "✋ dời SL tay" nhắc theo nút 🔁 Nến re-entry
// (tách khỏi nhóm cảnh báo TradingView cho đỡ lẫn). Đổi nhóm không cần sửa mã:
//   supabase secrets set MT5_FILL_CHAT_ID=-100… MT5_FILL_TOPIC=<id topic, 0 = topic chung>
// Bot phải là thành viên của nhóm này.

export function fillChat() {
  const chatId = (Deno.env.get("MT5_FILL_CHAT_ID") || "-1003955222065").trim();
  const t = Deno.env.get("MT5_FILL_TOPIC");
  return { chatId, topic: t == null || t === "" ? 2 : Number(t) || 0 };
}

// Exness gắn đuôi chữ thường vào mã (XAUUSDm, EURUSDc) — bỏ đi cho dễ đọc
export const shortSymbol = (s: unknown) => {
  const v = String(s ?? "").trim();
  return v.replace(/[a-z]+$/, "") || v;
};
