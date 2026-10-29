// Supabase Edge Function: nhận các cú bấm nút trên tin nhắn nhắc nhở gửi từ Telegram.
//
//   Symbol theo dõi   w|<groupId>|<symId>|keep   tiếp tục nhắc symbol đó ở khung giờ kế tiếp
//                     w|<groupId>|<symId>|stop   ngừng nhắc riêng symbol đó, các symbol khác giữ nguyên
//   Kiểm tra setup    sc|<accountId>|<date>|<hour>   ghi nhận đã kiểm tra, dùng để tính % hoàn thành tuần
//   Dời SL            sl|<tradeId>|moved    đã dời, tiếp tục nhắc ở khung giờ kế tiếp
//                     sl|<tradeId>|closed   lệnh đã kết thúc thật, ngừng nhắc (không đụng vào bản ghi lệnh)
//   Nhãn              n|<chữ>               ô tên mã ở đầu mỗi dòng của tin dạng bảng — không làm gì
//   Cảnh báo nhắc lại ta|<id>               "✅ Đã thấy" ở tin của alert-relay — ngừng gửi lại
//
// Tin dạng bảng (symbol theo dõi, dời SL): mỗi dòng một mã. Bấm nút thì chỉ dòng đó đổi trạng thái,
// các dòng khác giữ nguyên nút. Tin cũ mỗi mã một tin thì vẫn gỡ nút và ghi thêm dòng kết quả.
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
//   (bắt buộc có --no-verify-jwt vì Telegram gọi vào đây mà không mang JWT của Supabase)
// Đăng ký webhook 1 lần, mở đường dẫn sau trên trình duyệt:
//   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type WatchSymbol = { id?: string; name?: string; done?: boolean };
type Watch = {
  id?: string; label?: string; note?: string; enabled?: boolean; symbols?: WatchSymbol[];
  hours?: string[]; activeDays?: string[];
  symbol?: string; done?: boolean; // dạng cũ: mỗi bản ghi một symbol
};

type CheckLogEntry = { accountId?: string; accountName?: string; date?: string; hour?: string; checkedAt?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function answerCallback(botToken: string, callbackId: string, text: string, alert = false) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text, show_alert: alert }),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gọi API sửa tin của Telegram. Bấm liên tiếp nhiều nút trên cùng một tin trong nhóm dễ dính
// giới hạn tốc độ (429 "retry after N") — đợi đúng N giây rồi thử lại một lần thay vì bỏ cuộc.
// Trả về "" khi xong, hoặc mô tả lỗi của Telegram để hiện cho người bấm.
async function telegramEdit(botToken: string, method: string, body: unknown): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return "";
    let info: { description?: string; parameters?: { retry_after?: number } } = {};
    try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
    const desc = info.description || `HTTP ${res.status}`;
    console.error(method, "failed", res.status, desc);
    // Tin không đổi gì (bấm lại đúng nút cũ) thì coi như xong.
    if (/message is not modified/i.test(desc)) return "";
    const wait = info.parameters?.retry_after;
    if (res.status === 429 && wait && wait <= 8 && attempt === 0) { await sleep(wait * 1000 + 300); continue; }
    return desc;
  }
  return "Telegram từ chối sửa tin";
}

type Button = { text: string; callback_data?: string };

function editMarkup(botToken: string, chatId: number, messageId: number, keyboard: Button[][]) {
  return telegramEdit(botToken, "editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
}

// Giờ Việt Nam dạng 14:05 — ghi lên nút để biết đã bấm lúc nào.
function vnClock(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

const doneCell = (text: string) => ({ text, callback_data: "n|" });

// Dòng của tin dạng bảng sau khi bấm: giữ ô tên mã, đổi nút vừa bấm thành trạng thái. "Tiếp tục" /
// "Đã dời" vẫn để lại nút còn lại (sau đó vẫn có thể ngừng / kết thúc); "Ngừng" / "Kết thúc" thì
// dòng đó xong hẳn. Chữ trạng thái PHẢI khác chữ nút gốc — trước đây "✅ Đã dời" đổi thành đúng
// "✅ Đã dời", nút bị khoá mà nhìn vào không thấy gì đổi, tưởng bấm không ăn.
function rowAfter(row: Button[], kind: string, action: string): Button[] {
  const label = row[0];
  const find = (suffix: string) => row.find((b) => String(b.callback_data || "").endsWith(suffix));
  if (kind === "w") {
    if (action === "stop") return [label, doneCell("🛑 Đã ngừng")];
    const stop = find("|stop");
    return stop ? [label, doneCell("👀 Đang theo dõi"), stop] : [label, doneCell("👀 Đang theo dõi")];
  }
  if (kind === "sl") {
    if (action === "closed") return [label, doneCell("🏁 Đã kết thúc")];
    const closed = find("|closed");
    const moved = doneCell(`☑️ Dời ${vnClock()}`);
    return closed ? [label, moved, closed] : [label, moved];
  }
  return row;
}

// Gỡ hàng nút đi sau khi đã xử lý, để không bấm nhầm lần nữa vào tin nhắn cũ.
function clearButtons(botToken: string, chatId: number, messageId: number, newText: string) {
  return telegramEdit(botToken, "editMessageText", { chat_id: chatId, message_id: messageId, text: newText });
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
  // (tin cũ hơn nữa: w:<id>:s3/s8/s24 là các nút hoãn đã bỏ — coi như "tiếp tục theo dõi")
  return { kind: "", rest: [] };
}

// Lỗi bất ngờ thì vẫn trả 200 và báo cho người bấm — trả 500 thì Telegram gửi lại cú bấm nhiều
// lần, còn nút thì quay mãi không dừng.
Deno.serve(async (req) => {
  const raw = await req.text();
  try {
    return await handle(raw);
  } catch (e) {
    console.error("webhook crashed", e);
    try {
      const cb = JSON.parse(raw)?.callback_query;
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
      const owner = (data || []).find((r) => String((r.value as { telegramChatId?: string })?.telegramChatId) === String(cb?.message?.chat?.id));
      const token = (owner?.value as { telegramBotToken?: string })?.telegramBotToken;
      if (cb?.id && token) await answerCallback(token, cb.id, `⚠️ Bot gặp lỗi: ${String((e as Error)?.message || e).slice(0, 150)}`, true);
    } catch (_e) { /* không báo được thì thôi */ }
    return json({ ok: false, error: String(e) });
  }
});

async function handle(raw: string): Promise<Response> {
  // Telegram luôn POST; thân rỗng / không phải JSON thì trả 200 để nó không thử lại vô tận.
  let update: Record<string, any>;
  try {
    update = JSON.parse(raw);
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

  // Nút "✅ Đã thấy" của alert-relay có thể nằm ở nhóm cảnh báo riêng (ALERT_RELAY_CHAT_ID)
  const alertChat = (Deno.env.get("ALERT_RELAY_CHAT_ID") || "").trim();
  const ownerRow = (settingsRows || []).find((r) => {
    const v = r.value as { telegramChatId?: string; telegramBotToken?: string };
    if (v?.telegramChatId && String(v.telegramChatId) === String(fromChatId)) return true;
    return kind === "ta" && alertChat !== "" && alertChat === String(fromChatId) && !!v?.telegramBotToken;
  });
  if (!ownerRow) return json({ ok: true, skipped: "chat mismatch" });

  const userId = ownerRow.user_id as string;
  const botToken = (ownerRow.value as { telegramBotToken?: string })?.telegramBotToken;
  if (!botToken) return json({ ok: true, skipped: "no bot token" });

  // Ô tên mã / ô trạng thái: không đổi gì, chỉ tắt vòng quay trên nút.
  if (kind === "n") {
    await answerCallback(botToken, cb.id, "");
    return json({ ok: true, skipped: "label" });
  }

  let notice = "";
  let messageSuffix = "";

  if (kind === "w") {
    // Tin cũ chỉ có 2 phần (w|<id>|action) — khi đó tác động lên cả nhóm.
    const watchId = rest[0];
    const symId = rest.length >= 3 ? rest[1] : "";
    const action = rest[rest.length - 1];
    const watches = (await readValue(supabase, userId, "symbolWatches")) as Watch[] | null;
    const watch = Array.isArray(watches) ? watches.find((w) => w.id === watchId) : undefined;
    if (!watch) {
      await answerCallback(botToken, cb.id, "Không tìm thấy nhóm theo dõi này nữa.");
      return json({ ok: true, skipped: "watch not found" });
    }

    // Bản ghi cũ vẫn có thể chưa được web chuyển sang dạng nhóm — khi đó khớp theo tên symbol.
    const list = Array.isArray(watch.symbols) ? watch.symbols : [];
    const target = symId ? list.find((x) => x && (x.id === symId || x.name === symId)) : undefined;
    if (symId && !target && list.length) {
      await answerCallback(botToken, cb.id, "Symbol này không còn trong nhóm.");
      return json({ ok: true, skipped: "symbol not found" });
    }
    const label = target?.name || watch.symbol || watch.label || "";

    if (action === "stop") {
      if (target) target.done = true;
      else if (list.length) list.forEach((x) => { if (x) x.done = true; });
      else { watch.done = true; watch.enabled = false; } // bản ghi dạng cũ
      const { error: saveErr } = await writeValue(supabase, userId, "symbolWatches", watches);
      if (saveErr) {
        await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
        return json({ error: saveErr.message }, 500);
      }
      notice = `🛑 Ngừng theo dõi ${label}`.trim();
      messageSuffix = `\n\n🛑 Đã ngừng theo dõi ${label}.`.trimEnd();
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
      notice = `☑️ Đã ghi nhận dời SL lúc ${vnClock()}, sẽ nhắc lại ở khung giờ kế tiếp.`;
      messageSuffix = `\n\n☑️ Đã dời SL lúc ${vnClock()} — nhắc lại ở khung giờ kế tiếp.`;
    }
  } else if (kind === "mf") {
    // Nhắc điền nhật ký cho lệnh đã bấm "Kết thúc lệnh" — tắt riêng nhắc này,
    // vẫn giữ lệnh trong danh sách tắt nhắc dời SL.
    const [tradeId] = rest;
    const muted = ((await readValue(supabase, userId, "slMutedTrades")) || []) as { tradeId?: string; mutedAt?: string; fillDone?: boolean }[];
    const entry = muted.find((m) => m.tradeId === tradeId);
    if (!entry) {
      await answerCallback(botToken, cb.id, "Lệnh này không còn trong danh sách nữa.");
      return json({ ok: true, skipped: "muted entry gone" });
    }
    entry.fillDone = true;
    const { error: saveErr } = await writeValue(supabase, userId, "slMutedTrades", muted);
    if (saveErr) {
      await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
      return json({ error: saveErr.message }, 500);
    }
    notice = "🔕 Đã ngừng nhắc điền cho lệnh này.";
    messageSuffix = "\n\n🔕 Ngừng nhắc điền lệnh này.";
  } else if (kind === "ta") {
    // Cảnh báo nhắc lại (function alert-relay): bấm "Đã thấy" thì ngừng gửi lại,
    // và gỡ nút ở các tin nhắc trước của cùng cảnh báo.
    const [alertId] = rest;
    const list = ((await readValue(supabase, userId, "alertRepeats")) || []) as { id?: string; ackedAt?: string; doneAt?: string; messageIds?: number[] }[];
    const item = list.find((r) => r.id === alertId);
    if (!item) {
      notice = "Cảnh báo này đã quá cũ, không còn nhắc nữa.";
      messageSuffix = "\n\n☑️ Đã xong.";
    } else {
      if (!item.ackedAt) {
        item.ackedAt = new Date().toISOString();
        const { error: saveErr } = await writeValue(supabase, userId, "alertRepeats", list);
        if (saveErr) {
          await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
          return json({ error: saveErr.message }, 500);
        }
      }
      for (const mid of item.messageIds || []) {
        if (mid !== cb.message?.message_id && fromChatId) await editMarkup(botToken, fromChatId, mid, []);
      }
      notice = `✅ Đã thấy lúc ${vnClock()}, ngừng nhắc.`;
      messageSuffix = `\n\n✅ Đã thấy lúc ${vnClock()}.`;
    }
  } else {
    await answerCallback(botToken, cb.id, "Lệnh không hợp lệ.");
    return json({ ok: true, skipped: "unknown kind" });
  }

  // Sửa nút TRƯỚC rồi mới trả lời cú bấm: có lỗi thì thông báo nói đúng lý do, thay vì báo
  // "đã ghi nhận" trong khi nút vẫn y nguyên. Dữ liệu (nếu có) đã lưu ở trên, lỗi ở đây chỉ là
  // phần hiển thị trên Telegram.
  let editError = "";
  if (cb.message?.message_id && fromChatId) {
    const keyboard = (cb.message.reply_markup?.inline_keyboard || []) as Button[][];
    const isTable = keyboard.some((row) => row.some((b) => String(b.callback_data || "").startsWith("n|")));
    if (isTable) {
      const action = rest[rest.length - 1];
      const next = keyboard.map((row) => (row.some((b) => b.callback_data === cb.data) ? rowAfter(row, kind, action) : row));
      editError = await editMarkup(botToken, fromChatId, cb.message.message_id, next);
    } else {
      editError = await clearButtons(botToken, fromChatId, cb.message.message_id, (cb.message.text || "") + messageSuffix);
    }
  }
  if (editError) {
    await answerCallback(botToken, cb.id, `${notice}\n\n⚠️ Đã ghi nhận nhưng Telegram không cho đổi nút: ${editError}`, true);
  } else {
    await answerCallback(botToken, cb.id, notice);
  }

  return json({ ok: true, kind, rest, editError });
}
