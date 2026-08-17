// Supabase Edge Function: nhận các cú bấm nút trên tin nhắn "Symbol theo dõi" gửi từ Telegram.
// Nút "Xong" tắt theo dõi symbol đó; nút "Dời lại" đẩy mốc nhắc tiếp theo ra 3/8/24 giờ (cộng dồn nếu bấm nhiều lần).
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
//   (bắt buộc có --no-verify-jwt vì Telegram gọi vào đây mà không mang JWT của Supabase)
// Đăng ký webhook 1 lần, mở đường dẫn sau trên trình duyệt:
//   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SNOOZE_HOURS: Record<string, number> = { s3: 3, s8: 8, s24: 24 };

type Watch = {
  id?: string; symbol?: string; note?: string; enabled?: boolean; done?: boolean;
  hours?: string[]; activeDays?: string[]; snoozeUntil?: string; lastNotifiedAt?: string;
};

function vnTimeLabel(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  });
}

async function answerCallback(botToken: string, callbackId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

// Gỡ hàng nút đi sau khi đã xử lý, để không bấm nhầm lần nữa vào tin nhắn cũ.
async function clearButtons(botToken: string, chatId: number, messageId: number, newText: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: newText }),
  });
}

Deno.serve(async (req) => {
  // Telegram luôn POST. Trả 200 cho mọi thứ khác để nó không thử lại vô tận.
  if (req.method !== "POST") return new Response("ok");

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch (_e) {
    return new Response("ok");
  }

  const cb = update.callback_query;
  if (!cb?.data) return new Response(JSON.stringify({ ok: true, skipped: "not a callback" }), { headers: { "content-type": "application/json" } });

  const [prefix, watchId, action] = String(cb.data).split(":");
  if (prefix !== "w" || !watchId || !action) return new Response(JSON.stringify({ ok: true, skipped: "unknown data" }), { headers: { "content-type": "application/json" } });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Tìm chủ sở hữu của symbol này. App chỉ có một người dùng nên quét toàn bộ là đủ nhanh.
  const { data: rows, error } = await supabase.from("app_data").select("user_id, value").eq("key", "symbolWatches");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const owner = (rows || []).find((r) => Array.isArray(r.value) && (r.value as Watch[]).some((w) => w.id === watchId));
  if (!owner) return new Response(JSON.stringify({ ok: true, skipped: "watch not found" }), { headers: { "content-type": "application/json" } });

  const { data: settingsRow } = await supabase
    .from("app_data").select("value").eq("user_id", owner.user_id).eq("key", "slReminderSettings").maybeSingle();
  const settings = (settingsRow?.value || {}) as { telegramBotToken?: string; telegramChatId?: string };
  if (!settings.telegramBotToken) return new Response(JSON.stringify({ ok: true, skipped: "no bot token" }), { headers: { "content-type": "application/json" } });

  // Chỉ chấp nhận cú bấm đến từ đúng nhóm chat đã cấu hình — chặn người lạ đoán được callback_data.
  const fromChatId = cb.message?.chat?.id;
  if (settings.telegramChatId && String(fromChatId) !== String(settings.telegramChatId)) {
    await answerCallback(settings.telegramBotToken, cb.id, "Không có quyền.");
    return new Response(JSON.stringify({ ok: true, skipped: "chat mismatch" }), { headers: { "content-type": "application/json" } });
  }

  const watches = owner.value as Watch[];
  const watch = watches.find((w) => w.id === watchId)!;
  let notice = "";
  let messageSuffix = "";

  if (action === "done") {
    watch.done = true;
    watch.enabled = false;
    watch.snoozeUntil = "";
    notice = `✅ Đã đánh dấu xong ${watch.symbol || ""}`.trim();
    messageSuffix = "\n\n✅ Đã xong — dừng nhắc symbol này.";
  } else if (SNOOZE_HOURS[action]) {
    const hours = SNOOZE_HOURS[action];
    // Cộng dồn: nếu đang hoãn thì cộng tiếp vào mốc hiện tại, chưa hoãn thì tính từ bây giờ.
    const base = watch.snoozeUntil && new Date(watch.snoozeUntil) > new Date() ? new Date(watch.snoozeUntil) : new Date();
    const next = new Date(base.getTime() + hours * 3600000).toISOString();
    watch.snoozeUntil = next;
    watch.done = false;
    watch.enabled = true;
    notice = `⏰ Sẽ nhắc lại lúc ${vnTimeLabel(next)}`;
    messageSuffix = `\n\n⏰ Đã dời ${hours === 24 ? "1 ngày" : `${hours} tiếng`} — nhắc lại lúc ${vnTimeLabel(next)}.`;
  } else {
    await answerCallback(settings.telegramBotToken, cb.id, "Lệnh không hợp lệ.");
    return new Response(JSON.stringify({ ok: true, skipped: "unknown action" }), { headers: { "content-type": "application/json" } });
  }

  const { error: saveErr } = await supabase.from("app_data").upsert(
    { user_id: owner.user_id, key: "symbolWatches", value: watches, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
  if (saveErr) {
    await answerCallback(settings.telegramBotToken, cb.id, "Lưu thất bại, thử lại nhé.");
    return new Response(JSON.stringify({ error: saveErr.message }), { status: 500 });
  }

  await answerCallback(settings.telegramBotToken, cb.id, notice);
  if (cb.message?.message_id && fromChatId) {
    await clearButtons(settings.telegramBotToken, fromChatId, cb.message.message_id, (cb.message.text || "") + messageSuffix);
  }

  return new Response(JSON.stringify({ ok: true, action, watchId }), { headers: { "content-type": "application/json" } });
});
