// Supabase Edge Function: nhận các cú bấm nút trên tin nhắn nhắc nhở gửi từ Telegram.
//
//   Symbol theo dõi   w|<watchId>|keep      giữ nguyên lịch, tiếp tục nhắc ở khung giờ kế tiếp
//                     w|<watchId>|stop      đánh dấu xong, ngừng nhắc symbol này
//   Kiểm tra setup    sc|<accountId>|<date>|<hour>   ghi nhận đã kiểm tra, dùng để tính % hoàn thành tuần
//   Dời SL            sl|<tradeId>|moved    đã dời, tiếp tục nhắc ở khung giờ kế tiếp
//                     sl|<tradeId>|closed   lệnh đã kết thúc thật, ngừng nhắc (không đụng vào bản ghi lệnh)
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
//   (bắt buộc có --no-verify-jwt vì Telegram gọi vào đây mà không mang JWT của Supabase)
// Đăng ký webhook 1 lần, mở đường dẫn sau trên trình duyệt:
//   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Watch = {
  id?: string; symbol?: string; note?: string; enabled?: boolean; done?: boolean;
  hours?: string[]; activeDays?: string[]; lastNotifiedAt?: string;
};

type CheckLogEntry = { accountId?: string; accountName?: string; date?: string; hour?: string; checkedAt?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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

async function readValue(supabase: ReturnType<typeof createClient>, userId: string, key: string) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function writeValue(supabase: ReturnType<typeof createClient>, userId: string, key: string, value: unknown) {
  return await supabase.from("app_data").upsert(
    { user_id: userId, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
}

// Các tin nhắn cũ (trước khi đổi sang 2 nút) vẫn còn nằm trong lịch sử chat — chuyển về hành động
// tương đương thay vì báo lỗi khó hiểu khi người dùng bấm nhầm vào chúng.
function parseCallback(raw: string) {
  if (raw.includes("|")) {
    const [kind, ...rest] = raw.split("|");
    return { kind, rest };
  }
  const [kind, id, action] = raw.split(":");
  if (kind === "w" && id) return { kind: "w", rest: [id, action === "done" ? "stop" : "keep"] };
  return { kind: "", rest: [] };
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
  if (!cb?.data) return json({ ok: true, skipped: "not a callback" });

  const { kind, rest } = parseCallback(String(cb.data));
  if (!kind || !rest.length) return json({ ok: true, skipped: "unknown data" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const fromChatId = cb.message?.chat?.id;

  // Xác định chủ sở hữu bằng chính Chat ID đã cấu hình — vừa tìm đúng người, vừa chặn
  // người lạ đoán được callback_data từ nhóm khác.
  const { data: settingsRows, error } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
  if (error) return json({ error: error.message }, 500);

  const ownerRow = (settingsRows || []).find((r) => {
    const chatId = (r.value as { telegramChatId?: string })?.telegramChatId;
    return chatId && String(chatId) === String(fromChatId);
  });
  if (!ownerRow) return json({ ok: true, skipped: "chat mismatch" });

  const userId = ownerRow.user_id as string;
  const botToken = (ownerRow.value as { telegramBotToken?: string })?.telegramBotToken;
  if (!botToken) return json({ ok: true, skipped: "no bot token" });

  let notice = "";
  let messageSuffix = "";

  if (kind === "w") {
    const [watchId, action] = rest;
    const watches = (await readValue(supabase, userId, "symbolWatches")) as Watch[] | null;
    const watch = Array.isArray(watches) ? watches.find((w) => w.id === watchId) : undefined;
    if (!watch) {
      await answerCallback(botToken, cb.id, "Không tìm thấy symbol này nữa.");
      return json({ ok: true, skipped: "watch not found" });
    }

    if (action === "stop") {
      watch.done = true;
      watch.enabled = false;
      const { error: saveErr } = await writeValue(supabase, userId, "symbolWatches", watches);
      if (saveErr) {
        await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
        return json({ error: saveErr.message }, 500);
      }
      notice = `🛑 Ngừng theo dõi ${watch.symbol || ""}`.trim();
      messageSuffix = "\n\n🛑 Đã ngừng theo dõi symbol này.";
    } else {
      // "Tiếp tục theo dõi" không đổi dữ liệu gì — lịch nhắc vốn đã tự chạy tiếp ở khung giờ sau.
      notice = "👀 Tiếp tục theo dõi, sẽ nhắc lại ở khung giờ kế tiếp.";
      messageSuffix = "\n\n👀 Tiếp tục theo dõi — nhắc lại ở khung giờ kế tiếp.";
    }
  } else if (kind === "sc") {
    const [accountId, date, hour] = rest;
    const logs = ((await readValue(supabase, userId, "setupCheckLog")) || []) as CheckLogEntry[];
    const entry = logs.find((e) => e.accountId === accountId && e.date === date && e.hour === hour);
    if (!entry) {
      await answerCallback(botToken, cb.id, "Lần nhắc này đã quá cũ, không ghi nhận được.");
      return json({ ok: true, skipped: "check entry not found" });
    }
    if (entry.checkedAt) {
      await answerCallback(botToken, cb.id, "Lần này đã ghi nhận rồi.");
      return json({ ok: true, skipped: "already checked" });
    }
    entry.checkedAt = new Date().toISOString();
    const { error: saveErr } = await writeValue(supabase, userId, "setupCheckLog", logs);
    if (saveErr) {
      await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
      return json({ error: saveErr.message }, 500);
    }
    const doneCount = logs.filter((e) => e.checkedAt).length;
    notice = `✅ Đã ghi nhận (${doneCount}/${logs.length} lần gần đây)`;
    messageSuffix = "\n\n✅ Đã kiểm tra.";
  } else if (kind === "sl") {
    const [tradeId, action] = rest;
    if (action === "closed") {
      const muted = ((await readValue(supabase, userId, "slMutedTrades")) || []) as { tradeId?: string; mutedAt?: string }[];
      if (!muted.some((m) => m.tradeId === tradeId)) muted.push({ tradeId, mutedAt: new Date().toISOString() });
      const { error: saveErr } = await writeValue(supabase, userId, "slMutedTrades", muted);
      if (saveErr) {
        await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
        return json({ error: saveErr.message }, 500);
      }
      notice = "🏁 Đã ngừng nhắc lệnh này. Nhớ điền ngày thoát vào nhật ký nhé.";
      messageSuffix = "\n\n🏁 Lệnh đã kết thúc — ngừng nhắc. Nhớ điền ngày thoát vào nhật ký.";
    } else {
      // "Đã dời" chỉ để xác nhận — lệnh vẫn mở nên khung giờ sau vẫn nhắc tiếp như thường.
      notice = "✅ Đã ghi nhận, sẽ nhắc lại ở khung giờ kế tiếp.";
      messageSuffix = "\n\n✅ Đã dời SL — nhắc lại ở khung giờ kế tiếp.";
    }
  } else {
    await answerCallback(botToken, cb.id, "Lệnh không hợp lệ.");
    return json({ ok: true, skipped: "unknown kind" });
  }

  await answerCallback(botToken, cb.id, notice);
  if (cb.message?.message_id && fromChatId) {
    await clearButtons(botToken, fromChatId, cb.message.message_id, (cb.message.text || "") + messageSuffix);
  }

  return json({ ok: true, kind, rest });
});
