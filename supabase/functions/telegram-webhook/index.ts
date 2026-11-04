// Supabase Edge Function: nhận các cú bấm nút trên tin nhắn nhắc nhở gửi từ Telegram.
//
//   Symbol theo dõi   w|<groupId>|<symId>|keep   tiếp tục nhắc symbol đó ở khung giờ kế tiếp
//                     w|<groupId>|<symId>|stop   ngừng nhắc riêng symbol đó, các symbol khác giữ nguyên
//   Kiểm tra setup    sc|<accountId>|<date>|<hour>   ghi nhận đã kiểm tra, dùng để tính % hoàn thành tuần
//   Dời SL            sl|<tradeId>|moved    đã dời, tiếp tục nhắc ở khung giờ kế tiếp
//                     sl|<tradeId>|closed   lệnh đã kết thúc thật, ngừng nhắc (không đụng vào bản ghi lệnh)
//   Nhãn              n|<chữ>               ô tên mã ở đầu mỗi dòng của tin dạng bảng — không làm gì
//   Cảnh báo nhắc lại ta|<id>               "✅ Đã thấy" ở tin của alert-relay — ngừng gửi lại
//                     tr|<id>               "⏳ Kiểm lại" — setup chưa đủ, gửi lại lúc nến kế tiếp đóng
//   Khớp lệnh MT5     rn|<login>-<ticket>|<khung>  "🔁 Nến re-entry" ở tin của mt5-journal — hẹn nhắc dời SL tay
//                                                  1 lần lúc nến vào lệnh đóng (bản ghi re-<login>-<ticket>
//                                                  trong alertRepeats, alert-relay tick gửi, ✅ Đã dời = ta|)
//                     rx|<login>-<ticket>|<khung>  "↩️ Bỏ nhắc" — huỷ hẹn vừa đặt
//   Gõ chữ (tin thường, không phải nút) — trả lời ngay từ thông báo trên màn hình khoá:
//                     "ok"                  như "✅ Đã thấy"
//                     "n" (next)            như "⏳ Kiểm lại"
//     Trả lời (reply) đúng tin cảnh báo thì áp cho cảnh báo đó, không thì cho cảnh báo vừa gửi gần nhất.
//     Nhóm cảnh báo riêng mà bot bật privacy mode thì bot chỉ thấy tin reply — chat riêng với bot thì gõ thẳng được.
//
// Tin dạng bảng (symbol theo dõi, dời SL): mỗi dòng một mã. Bấm nút thì chỉ dòng đó đổi trạng thái,
// các dòng khác giữ nguyên nút. Tin cũ mỗi mã một tin thì vẫn gỡ nút và ghi thêm dòng kết quả.
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
//   (bắt buộc có --no-verify-jwt vì Telegram gọi vào đây mà không mang JWT của Supabase)
// Đăng ký webhook 1 lần, mở đường dẫn sau trên trình duyệt:
//   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isCryptoSymbol, nextRecheck, normTf, RECHECK_DAYS, reentryId, reentryPlan, type Tf, vnTime } from "../_shared/alertRecheck.ts";
import { fillChat, shortSymbol } from "../_shared/mt5Fill.ts";

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

  if (update.message?.text) return await handleText(update.message);
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
  // — và nhóm vào lệnh MT5 (_shared/mt5Fill.ts: 🔁 Nến re-entry, ✅ Đã dời)
  const alertChat = (Deno.env.get("ALERT_RELAY_CHAT_ID") || "").trim();
  const fillChatId = fillChat().chatId;
  const ownerRow = (settingsRows || []).find((r) => {
    const v = r.value as { telegramChatId?: string; telegramBotToken?: string };
    if (v?.telegramChatId && String(v.telegramChatId) === String(fromChatId)) return true;
    if (!["ta", "tr", "rn", "rx"].includes(kind) || !v?.telegramBotToken) return false;
    return (alertChat !== "" && alertChat === String(fromChatId)) || (fillChatId !== "" && fillChatId === String(fromChatId));
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
  } else if (kind === "rn" || kind === "rx") {
    // Tin khớp lệnh: không gỡ chữ, chỉ đổi nút — 🔁 ↔ ↩️ để bấm nhầm còn đổi lại được
    const res = await reentryAction(supabase, userId, rest[0], rest[1], kind, fromChatId, cb.message?.message_thread_id);
    if ("error" in res) {
      await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
      return json({ error: res.error }, 500);
    }
    if (cb.message?.message_id && fromChatId) {
      const ref = `${rest[0]}|${rest[1] || ""}`;
      const keyboard = res.state === "armed" ? [[{ text: `↩️ Bỏ nhắc (${res.when})`, callback_data: `rx|${ref}` }]]
        : res.state === "idle" ? [[{ text: "🔁 Nến re-entry", callback_data: `rn|${ref}` }]] : [];
      await editMarkup(botToken, fromChatId, cb.message.message_id, keyboard);
    }
    await answerCallback(botToken, cb.id, res.notice, res.state === "final");
    return json({ ok: true, kind, rest, state: res.state });
  } else if (kind === "ta" || kind === "tr") {
    const res = await alertAction(supabase, userId, botToken, fromChatId, rest[0], kind, cb.message?.message_id);
    if ("error" in res) {
      await answerCallback(botToken, cb.id, "Lưu thất bại, thử lại nhé.");
      return json({ error: res.error }, 500);
    }
    notice = res.notice;
    messageSuffix = res.suffix;
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

// ───────────── Cảnh báo nhắc lại (function alert-relay) ─────────────

type AlertRepeat = {
  id?: string; text?: string; ackedAt?: string; doneAt?: string; messageIds?: number[]; createdAt?: string;
  tf?: Tf | null; recheckAt?: string; recheckClose?: string; rechecks?: number; rev?: number;
  every?: number; times?: number; sent?: number; nextAt?: string;
  kind?: "reentry"; candleTf?: Tf; ref?: string; // nhắc dời SL tay nến re-entry: khung nến, <login>-<ticket>
  chat?: string; topic?: number; // nhóm/topic gửi nhắc (nhóm của tin vào lệnh); trống = nhóm cảnh báo
};

type InboxItem = { id?: string; login?: string; ticket?: string; symbol?: string; side?: string; time?: number; accountName?: string };

// 🔁 Nến re-entry / ↩️ Bỏ nhắc. state: armed = đã hẹn, idle = chưa hẹn (còn nút 🔁), final = hết nút
async function reentryAction(
  supabase: ReturnType<typeof createClient>, userId: string, ref: string, tfRaw: string | undefined, kind: "rn" | "rx",
  chatId?: number, threadId?: number,
): Promise<{ notice: string; state: "armed" | "idle" | "final"; when?: string } | { error: string }> {
  const [login, ticket] = String(ref || "").split("-");
  if (!login || !ticket) return { notice: "Nút không hợp lệ.", state: "final" };
  const id = reentryId(login, ticket);
  const list = ((await readValue(supabase, userId, "alertRepeats")) || []) as AlertRepeat[];
  const existing = list.find((r) => r.id === id);
  const now = Date.now();

  if (kind === "rx") {
    if (!existing?.recheckAt) {
      return existing ? { notice: "Đã nhắc rồi, không bỏ được nữa.", state: "final" } : { notice: "↩️ Chưa hẹn nhắc nào.", state: "idle" };
    }
    const { error } = await writeValue(supabase, userId, "alertRepeats", list.filter((r) => r.id !== id));
    if (error) return { error: error.message };
    return { notice: "↩️ Đã bỏ nhắc dời SL tay.", state: "idle" };
  }

  if (existing?.recheckAt) {
    const when = vnTime(Date.parse(existing.recheckAt), now);
    return { notice: `Đã hẹn nhắc lúc ${when} rồi.`, state: "armed", when };
  }
  const inbox = ((await readValue(supabase, userId, "mt5Inbox")) || []) as InboxItem[];
  const it = inbox.find((x) => x.id === `${login}-${ticket}`);
  if (!it?.time) return { notice: "Không tìm thấy lệnh này trong hộp chờ nữa.", state: "final" };
  if (inbox.some((x) => x.id === `${login}-${ticket}-close`)) return { notice: "Lệnh này đã đóng rồi.", state: "final" };
  const tf = normTf(tfRaw) || "H4";
  const plan = reentryPlan(tf, it.time * 1000, isCryptoSymbol(it.symbol || ""));
  if (now >= plan.eaAt) {
    return { notice: `EA đã tự kéo SL từ nến đóng ${vnTime(plan.eaAt, now)} rồi — không cần dời tay nữa.`, state: "final" };
  }
  const at = Math.max(plan.at, now); // bấm muộn (nến vào lệnh đã đóng) → nhắc ngay ở lượt tick kế
  const iso = (ms: number) => new Date(ms).toISOString();
  const side = it.side === "sell" ? "🔴 SELL" : "🟢 BUY";
  const record: AlertRepeat = {
    id, kind: "reentry", ref: `${login}-${ticket}`, candleTf: tf, tf: null,
    text: `${shortSymbol(it.symbol)} ${side} · ${it.accountName || login} · vào ${vnTime(it.time * 1000, now)}`,
    every: 2, times: 5, sent: 0, rev: 0, createdAt: iso(now), messageIds: [],
    ...(chatId ? { chat: String(chatId) } : {}), ...(threadId ? { topic: threadId } : {}),
    ackedAt: iso(now), nextAt: iso(at), recheckAt: iso(at), recheckClose: iso(plan.close),
  };
  const { error } = await writeValue(supabase, userId, "alertRepeats", [...list.filter((r) => r.id !== id), record]);
  if (error) return { error: error.message };
  const when = vnTime(at, now);
  return { notice: `🔁 Sẽ nhắc dời SL tay lúc ${when} (nến ${tf} vào lệnh đóng ${vnTime(plan.close, now)}).`, state: "armed", when };
}

// "✅ Đã thấy" (ta): ngừng gửi lại, bỏ luôn lịch kiểm lại. "⏳ Kiểm lại" (tr): ngừng nhắc vòng này, hẹn
// gửi lại lúc nến kế tiếp của khung đóng. Cả hai gỡ nút ở các tin của cùng cảnh báo (trừ `keepMid` —
// tin vừa bấm, phần hiển thị của nó do chỗ gọi lo).
async function alertAction(
  supabase: ReturnType<typeof createClient>, userId: string, botToken: string, chatId: number | undefined,
  alertId: string, kind: "ta" | "tr", keepMid?: number,
): Promise<{ notice: string; suffix: string; item?: AlertRepeat } | { error: string }> {
  const list = ((await readValue(supabase, userId, "alertRepeats")) || []) as AlertRepeat[];
  const item = list.find((r) => r.id === alertId);
  const now = Date.now();
  if (!item) return { notice: "Cảnh báo này đã quá cũ, không còn nhắc nữa.", suffix: "\n\n☑️ Đã xong." };
  const tooOld = Date.parse(item.createdAt || "") < now - RECHECK_DAYS * 24 * 3600 * 1000;
  const recheck = kind === "tr" && !tooOld ? nextRecheck(item.tf || "D", now) : null;
  item.ackedAt = item.ackedAt || new Date(now).toISOString();
  item.recheckAt = recheck ? new Date(recheck.at).toISOString() : undefined;
  item.recheckClose = recheck ? new Date(recheck.close).toISOString() : undefined;
  if (recheck) item.rechecks = (item.rechecks || 0) + 1;
  item.rev = (item.rev || 0) + 1;
  const { error: saveErr } = await writeValue(supabase, userId, "alertRepeats", list);
  if (saveErr) return { error: saveErr.message };
  for (const mid of item.messageIds || []) {
    if (mid !== keepMid && chatId) await editMarkup(botToken, chatId, mid, []);
  }
  if (recheck) {
    const when = vnTime(recheck.at, now);
    return {
      item,
      notice: `⏳ Sẽ nhắc kiểm lại lúc ${when} (nến ${item.tf || "D"} đóng ${vnTime(recheck.close, now)}).`,
      suffix: `\n\n⏳ Chưa đủ setup — kiểm lại lúc ${when}.`,
    };
  }
  if (kind === "tr") {
    return { item, notice: `Cảnh báo đã quá ${RECHECK_DAYS} ngày, ngừng nhắc.`, suffix: `\n\n☑️ Quá ${RECHECK_DAYS} ngày, ngừng nhắc.` };
  }
  if (item.kind === "reentry") {
    return { item, notice: `✅ Đã dời SL lúc ${vnClock()} — từ nến sau EA tự kéo.`, suffix: `\n\n✅ Đã dời SL lúc ${vnClock()}.` };
  }
  return { item, notice: `✅ Đã thấy lúc ${vnClock()}, ngừng nhắc.`, suffix: `\n\n✅ Đã thấy lúc ${vnClock()}.` };
}

// Chữ gõ tay → hành động. Bỏ dấu, dấu câu để "OK.", "Ok!", "N" đều nhận.
function textCommand(raw: string): "ta" | "tr" | null {
  const t = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (["n", "next", "nn", "kl", "kiem lai"].includes(t)) return "tr";
  if (["ok", "oke", "okay", "k", "da thay", "dt"].includes(t)) return "ta";
  return null;
}

async function sendReply(botToken: string, chatId: number, text: string, replyTo?: number, threadId?: number) {
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_notification: true };
  if (replyTo) body.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
  if (threadId) body.message_thread_id = threadId;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

// Cảnh báo còn "sống" để nhận chữ gõ: đang nhắc, hoặc vừa nhắc hết lượt trong 12 tiếng mà chưa bấm gì.
const LIVE_HOURS = 12;

// Gõ "n" / "ok" thay cho bấm nút — từ thông báo trên màn hình khoá trả lời được bằng chữ nhưng không bấm
// được nút. Chữ khác thì im lặng bỏ qua (chat này còn dùng cho việc khác).
async function handleText(msg: Record<string, any>): Promise<Response> {
  const kind = textCommand(String(msg.text || ""));
  if (!kind) return json({ ok: true, skipped: "text" });
  const chatId = msg.chat?.id;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: settingsRows, error } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
  if (error) return json({ error: error.message }, 500);
  const alertChat = (Deno.env.get("ALERT_RELAY_CHAT_ID") || "").trim();
  const ownerRow = (settingsRows || []).find((r) => {
    const v = r.value as { telegramChatId?: string; telegramBotToken?: string };
    if (!v?.telegramBotToken) return false;
    return String(v.telegramChatId || "") === String(chatId) || (alertChat !== "" && alertChat === String(chatId));
  });
  if (!ownerRow) return json({ ok: true, skipped: "chat mismatch" });
  const userId = ownerRow.user_id as string;
  const botToken = (ownerRow.value as { telegramBotToken: string }).telegramBotToken;
  const thread = msg.is_topic_message ? msg.message_thread_id : undefined;

  const list = ((await readValue(supabase, userId, "alertRepeats")) || []) as AlertRepeat[];
  const lastMid = (r: AlertRepeat) => Math.max(0, ...(r.messageIds || []));
  const replyTo = msg.reply_to_message?.message_id;
  let target = replyTo ? list.find((r) => (r.messageIds || []).includes(replyTo)) : undefined;
  const cutoff = Date.now() - LIVE_HOURS * 3600 * 1000;
  const live = list.filter((r) => !r.ackedAt && !r.recheckAt && (!r.doneAt || Date.parse(r.doneAt) > cutoff) && lastMid(r) > 0)
    .sort((a, b) => lastMid(b) - lastMid(a));
  if (!target) target = live[0];
  if (!target) {
    await sendReply(botToken, chatId, "Không có cảnh báo nào đang chờ — gõ n/ok chỉ dùng cho tin cảnh báo đang nhắc.", msg.message_id, thread);
    return json({ ok: true, skipped: "no live alert" });
  }
  if (kind === "tr" && !target.tf) {
    await sendReply(botToken, chatId, "Cảnh báo này không có khung nến để kiểm lại — gõ ok để ngừng nhắc.", msg.message_id, thread);
    return json({ ok: true, skipped: "no tf" });
  }
  const res = await alertAction(supabase, userId, botToken, chatId, target.id!, kind);
  if ("error" in res) {
    await sendReply(botToken, chatId, "⚠️ Lưu thất bại, gõ lại nhé.", msg.message_id, thread);
    return json({ error: res.error }, 500);
  }
  // Nói rõ là cảnh báo nào (dòng đầu của tin), và còn cảnh báo khác đang nhắc không
  const title = String(target.text || "").split("\n").find((x) => x.trim()) || "";
  const others = live.filter((r) => r.id !== target!.id).length;
  const lines = [title ? `${res.notice}\n› ${title.slice(0, 120)}` : res.notice];
  if (others) lines.push(`Còn ${others} cảnh báo khác đang nhắc — gõ tiếp n/ok, hoặc trả lời đúng tin muốn xử lý.`);
  await sendReply(botToken, chatId, lines.join("\n"), msg.message_id, thread);
  return json({ ok: true, kind, id: target.id });
}
