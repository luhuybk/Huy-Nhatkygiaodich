// Supabase Edge Function: chuyển tin cảnh báo sang Telegram, dùng chung bot + nhóm chat của
// Thông báo → Nhắc dời SL (app_data.slReminderSettings), nên không phải chép mã bot đi chỗ khác.
//
//   TradingView  Webhook URL = .../functions/v1/alert-relay?from=tv[&repeat=1][&topic=<ID>]
//                (không cần key: chỉ nhận khi tin tới từ IP máy chủ webhook của TradingView)
//                Ô "Tin nhắn" viết chữ bình thường — app TradingView trên điện thoại vẫn hiện dễ đọc,
//                còn trang này gửi nguyên văn sang Telegram.
//   EA MT5       POST JSON {"text": "...", "topic": "...", "silent": false} lên cùng địa chỉ (?key=<KEY>).
//
// Tham số (trên địa chỉ hoặc trong JSON, JSON thắng):
//   key     bắt buộc, phải trùng biến ALERT_RELAY_KEY — không có thì ai biết địa chỉ cũng spam được
//   topic   ID topic trong nhóm (message_thread_id), trống = topic chung
//   from    "tv" thì thêm 📈 ở đầu cho dễ phân biệt với tin của EA
//   silent  1/true = gửi không chuông
//   repeat  1/true = kèm nút "✅ Đã thấy" và gửi lại tin mới mỗi `every` phút (mặc định 2) cho tới khi
//           bấm nút, tối đa `times` lần kể cả lần đầu (mặc định 5) — để lỡ lần đầu vẫn còn lần sau
//
// Gửi lại do pg_cron gọi ?tick=1 mỗi phút (supabase-alert-relay-cron.sql). Tick không cần khoá: nó chỉ
// gửi các tin đã tới hạn, ai gọi thêm cũng không làm tin bị gửi dày hơn.
// Nút "✅ Đã thấy" (callback ta|<id>) do function telegram-webhook xử lý.
//
// Tắt tạm tin của EA (tin TradingView vẫn gửi): supabase secrets set ALERT_RELAY_EA=off  (bật lại: =on)
//
// Deploy: supabase functions deploy alert-relay --no-verify-jwt
//   (TradingView, MT5 và pg_cron gọi vào mà không mang JWT của Supabase)
// Tạo khoá 1 lần: bash scripts/alert-relay-key.sh

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RELAY_KEY = Deno.env.get("ALERT_RELAY_KEY") || "";
const EA_OFF = (Deno.env.get("ALERT_RELAY_EA") || "").toLowerCase() === "off";
const MAX_TEXT = 4000; // Telegram giới hạn 4096 ký tự, chừa chỗ cho dòng "Nhắc lần…"
const REPEAT_KEY = "alertRepeats";
const KEEP_HOURS = 24; // tin nhắc lại đã xong giữ thêm 1 ngày để bấm nút cũ vẫn ra đúng thông báo
// Máy chủ gửi webhook của TradingView (TradingView công bố, mục "About webhooks")
const TV_WEBHOOK_IPS = ["52.89.214.238", "34.212.75.30", "54.218.53.128", "52.32.178.7"];

type Settings = { telegramBotToken?: string; telegramChatId?: string };
type Repeat = {
  id: string; text: string; topic?: number; every: number; times: number; sent: number;
  nextAt: string; createdAt: string; messageIds: number[]; ackedAt?: string; doneAt?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const truthy = (v: unknown) => v === true || v === 1 || ["1", "true", "yes"].includes(String(v ?? "").toLowerCase());
const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : def;
};

// Trả về message_id khi gửi được, hoặc chuỗi lỗi
async function sendTelegram(botToken: string, payload: Record<string, unknown>): Promise<number | string> {
  // Nhiều MT5 cùng báo lúc nến đóng dễ dính 429 "retry after N": đợi đúng N giây rồi thử lại một lần
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    let info: { result?: { message_id?: number }; description?: string; parameters?: { retry_after?: number } } = {};
    try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
    if (res.ok) return info.result?.message_id ?? 0;
    const wait = info.parameters?.retry_after;
    if (res.status === 429 && wait && wait <= 10 && attempt === 0) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    return info.description || `HTTP ${res.status}`;
  }
  return "Telegram từ chối sau khi thử lại";
}

const seenButton = (id: string) => ({ inline_keyboard: [[{ text: "✅ Đã thấy", callback_data: `ta|${id}` }]] });

async function loadOwner(supabase: ReturnType<typeof createClient>) {
  const { data: rows, error } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
  if (error) throw new Error(error.message);
  const row = (rows || []).find((r) => {
    const s = r.value as Settings;
    return s?.telegramBotToken && s.telegramChatId;
  });
  return row ? { userId: row.user_id as string, settings: row.value as Settings } : null;
}

async function readRepeats(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", REPEAT_KEY).maybeSingle();
  return (Array.isArray(data?.value) ? data!.value : []) as Repeat[];
}

async function writeRepeats(supabase: ReturnType<typeof createClient>, userId: string, list: Repeat[]) {
  const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;
  const kept = list.filter((r) => !(r.ackedAt || r.doneAt) || Date.parse(r.ackedAt || r.doneAt!) > cutoff);
  return await supabase.from("app_data").upsert(
    { user_id: userId, key: REPEAT_KEY, value: kept, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
}

// Gửi lại các tin chưa bấm "Đã thấy" đã tới hạn. Mỗi lần là một tin mới (có chuông), tin trước
// bỏ nút để chỉ còn một nút bấm ở tin mới nhất.
async function tick(supabase: ReturnType<typeof createClient>) {
  const owner = await loadOwner(supabase);
  if (!owner) return json({ ok: true, skipped: "no settings" });
  const list = await readRepeats(supabase, owner.userId);
  const now = Date.now();
  const due = list.filter((r) => !r.ackedAt && !r.doneAt && Date.parse(r.nextAt) <= now);
  if (!due.length) return json({ ok: true, due: 0 });

  const token = owner.settings.telegramBotToken!;
  for (const r of due) {
    r.sent += 1;
    const last = r.sent >= r.times;
    const payload: Record<string, unknown> = {
      chat_id: owner.settings.telegramChatId,
      text: `🔔 Nhắc lần ${r.sent}/${r.times}${last ? " (lần cuối)" : ""}\n${r.text}`,
      reply_markup: seenButton(r.id),
    };
    if (r.topic) payload.message_thread_id = r.topic;
    const sent = await sendTelegram(token, payload);
    if (typeof sent === "number") {
      const prev = r.messageIds[r.messageIds.length - 1];
      if (prev) {
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: owner.settings.telegramChatId, message_id: prev, reply_markup: { inline_keyboard: [] } }),
        }).catch(() => {});
      }
      if (sent) r.messageIds.push(sent);
    } else {
      console.error("repeat send failed", r.id, sent);
    }
    if (last) r.doneAt = new Date().toISOString();
    else r.nextAt = new Date(now + r.every * 60 * 1000).toISOString();
  }

  // Đọc lại trước khi ghi: lúc gửi có thể người dùng vừa bấm "Đã thấy" hoặc có cảnh báo mới
  const fresh = await readRepeats(supabase, owner.userId);
  const merged = fresh.map((f) => {
    const mine = due.find((d) => d.id === f.id);
    return mine && !f.ackedAt ? { ...mine } : f;
  });
  const { error } = await writeRepeats(supabase, owner.userId, merged);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, due: due.length });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Chỉ nhận POST" }, 405);
  const url = new URL(req.url);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (url.searchParams.get("tick")) return await tick(supabase);

  // TradingView gửi chữ thường (text/plain) khi ô Tin nhắn không phải JSON; EA gửi JSON
  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "text" in parsed) body = parsed;
  } catch (_e) { /* chữ thường */ }
  const pick = (name: string) => (body[name] ?? url.searchParams.get(name) ?? "") as unknown;

  const fromTv = String(pick("from")).toLowerCase() === "tv";
  // Tin từ máy chủ webhook của TradingView thì không cần khoá, nên địa chỉ dán vào cảnh báo không có gì
  // bí mật. IP lấy từ cf-connecting-ip do Cloudflare tự đặt — gửi kèm header giả thì bị ghi đè hoặc chặn.
  const fromTvServer = fromTv && TV_WEBHOOK_IPS.includes(req.headers.get("cf-connecting-ip") || "");
  if (!fromTvServer && (!RELAY_KEY || String(pick("key")) !== RELAY_KEY)) return json({ error: "Sai khoá" }, 401);
  if (!fromTv && EA_OFF) return json({ ok: true, muted: true }); // EA coi là gửi xong, khỏi báo lỗi

  let text = String("text" in body ? body.text ?? "" : raw).trim();
  if (!text) return json({ error: "Tin nhắn trống" }, 400);
  if (fromTv) text = `📈 ${text}`;
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT - 1) + "…";

  let owner;
  try {
    owner = await loadOwner(supabase);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
  if (!owner) return json({ error: "Chưa điền Bot Token / Chat ID ở Thông báo → Nhắc dời SL" }, 500);

  const payload: Record<string, unknown> = { chat_id: owner.settings.telegramChatId, text };
  const topic = Number(pick("topic"));
  if (topic && !Number.isNaN(topic)) payload.message_thread_id = topic;
  if (truthy(pick("silent"))) payload.disable_notification = true;

  const repeat = truthy(pick("repeat"));
  const id = repeat ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : "";
  if (repeat) payload.reply_markup = seenButton(id);

  const sent = await sendTelegram(owner.settings.telegramBotToken!, payload);
  if (typeof sent !== "number") {
    console.error("sendMessage failed", sent);
    return json({ error: sent }, 502);
  }

  if (repeat) {
    const every = clampInt(pick("every"), 2, 1, 60);
    const times = clampInt(pick("times"), 5, 2, 20);
    const list = await readRepeats(supabase, owner.userId);
    list.push({
      id, text, every, times, sent: 1,
      topic: topic && !Number.isNaN(topic) ? topic : undefined,
      nextAt: new Date(Date.now() + every * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      messageIds: sent ? [sent] : [],
    });
    const { error } = await writeRepeats(supabase, owner.userId, list);
    if (error) console.error("save repeat failed", error.message);
  }
  return json({ ok: true, repeat: repeat ? id : undefined });
});
