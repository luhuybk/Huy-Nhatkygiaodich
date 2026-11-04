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
// Mã tiềm năng (Lịch nhắc → Mã tiềm năng): tin TradingView nhắc tới mã trong danh sách thì có dòng
// "🔥🔥🔥 MÃ TIỀM NĂNG · <mã> 🔥🔥🔥" (+ ghi chú) ở đầu, bỏ qua silent và luôn nhắc lại như repeat=1.
//
// Gửi lại do pg_cron gọi ?tick=1 mỗi phút (supabase-alert-relay-cron.sql). Tick không cần khoá: nó chỉ
// gửi các tin đã tới hạn, ai gọi thêm cũng không làm tin bị gửi dày hơn.
// Nút "✅ Đã thấy" (callback ta|<id>) do function telegram-webhook xử lý.
// Tin TradingView nhắc lại có thêm nút "⏳ Kiểm lại" (tr|<id>): setup chưa đủ thì bấm,
// tới lúc nến kế tiếp của khung đó đóng (nến đóng trong giờ nghỉ thì 8h45) tick gửi lại tin, lại nhắc
// như lần đầu cho tới khi bấm một trong hai nút. Khung lấy từ tiền tố tin — xem _shared/alertRecheck.ts.
//
// Dọn tin Telegram (nút ở Lịch nhắc → Cảnh báo nhắc lại): POST ?clean=alerts|all từ web, kèm JWT của
// người dùng (chỉ chủ nhật ký mới gọi được). alerts = chỉ các tin cảnh báo bot còn nhớ id; all = mọi tin
// trong nhóm cảnh báo mà bot xoá được (Telegram chỉ cho xoá tin trong 48 giờ; tin của người khác cần bot
// là quản trị viên có quyền xoá). Cả hai đều giữ tin mới nhất của cảnh báo còn đang nhắc.
//
// Tắt tạm tin của EA (tin TradingView vẫn gửi): supabase secrets set ALERT_RELAY_EA=off  (bật lại: =on)
// Gửi sang nhóm riêng: supabase secrets set ALERT_RELAY_CHAT_ID=<chat id nhóm, dạng -100…> [ALERT_RELAY_TOPIC=<id topic>]
//   (telegram-webhook đọc cùng biến này để nút "✅ Đã thấy" trong nhóm đó vẫn bấm được)
//
// Deploy: supabase functions deploy alert-relay --no-verify-jwt
//   (TradingView, MT5 và pg_cron gọi vào mà không mang JWT của Supabase)
// Tạo khoá 1 lần: bash scripts/alert-relay-key.sh

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { alertButtons, tfOf, type Tf, vnTime } from "../_shared/alertRecheck.ts";
import { hotHead, hotList, hotMatches, type HotSettings } from "../_shared/hotSymbols.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RELAY_KEY = Deno.env.get("ALERT_RELAY_KEY") || "";
const EA_OFF = (Deno.env.get("ALERT_RELAY_EA") || "").toLowerCase() === "off";
// Nhóm Telegram riêng cho cảnh báo (bot phải là thành viên); trống = nhóm chung của Nhắc dời SL
const ALERT_CHAT_ID = (Deno.env.get("ALERT_RELAY_CHAT_ID") || "").trim();
const ALERT_TOPIC = Number(Deno.env.get("ALERT_RELAY_TOPIC") || 0); // topic mặc định khi địa chỉ không ghi topic=
const MAX_TEXT = 4000; // Telegram giới hạn 4096 ký tự, chừa chỗ cho dòng "Nhắc lần…"
const REPEAT_KEY = "alertRepeats";
const KEEP_HOURS = 24; // tin nhắc lại đã xong giữ thêm 1 ngày để bấm nút cũ vẫn ra đúng thông báo
// Máy chủ gửi webhook của TradingView (TradingView công bố, mục "About webhooks")
const TV_WEBHOOK_IPS = ["52.89.214.238", "34.212.75.30", "54.218.53.128", "52.32.178.7"];

type Settings = HotSettings & { telegramBotToken?: string; telegramChatId?: string };
type Repeat = {
  id: string; text: string; topic?: number; every: number; times: number; sent: number;
  nextAt: string; createdAt: string; messageIds: number[]; ackedAt?: string; doneAt?: string;
  tf?: Tf | null;       // khung để kiểm lại theo nến (tin TradingView); null = không có nút ⏳
  head?: string;        // dòng đầu của vòng kiểm lại, vd "🔁 Kiểm lại setup · nến H4 đóng 16:00"
  recheckAt?: string;   // đã bấm ⏳: lúc gửi lại tin kiểm lại
  recheckClose?: string; // giờ nến đóng ứng với recheckAt
  rechecks?: number;
  rev?: number;         // tăng mỗi lần sửa — tick chỉ ghi đè bản ghi chưa bị telegram-webhook sửa
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
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

async function loadOwner(supabase: ReturnType<typeof createClient>) {
  const { data: rows, error } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
  if (error) throw new Error(error.message);
  const row = (rows || []).find((r) => {
    const s = r.value as Settings;
    return s?.telegramBotToken && s.telegramChatId;
  });
  if (!row) return null;
  const settings = row.value as Settings;
  return { userId: row.user_id as string, settings, chatId: ALERT_CHAT_ID || String(settings.telegramChatId) };
}

async function readRepeats(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", REPEAT_KEY).maybeSingle();
  return (Array.isArray(data?.value) ? data!.value : []) as Repeat[];
}

async function writeRepeats(supabase: ReturnType<typeof createClient>, userId: string, list: Repeat[]) {
  const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;
  const kept = list.filter((r) => r.recheckAt || !(r.ackedAt || r.doneAt) || Date.parse(r.ackedAt || r.doneAt!) > cutoff);
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
  const revOf = new Map(list.map((r) => [r.id, r.rev || 0]));
  // Tới giờ kiểm lại theo nến: mở lại vòng nhắc như cảnh báo mới (lần 1 gửi ngay trong lượt này)
  for (const r of list) {
    if (!r.recheckAt || Date.parse(r.recheckAt) > now) continue;
    r.head = `🔁 Kiểm lại setup · nến ${r.tf || "D"} đóng ${vnTime(Date.parse(r.recheckClose || r.recheckAt), now)}`;
    r.recheckAt = undefined;
    r.recheckClose = undefined;
    r.ackedAt = undefined;
    r.doneAt = undefined;
    r.sent = 0;
    r.nextAt = new Date(now).toISOString();
  }
  const due = list.filter((r) => !r.ackedAt && !r.doneAt && Date.parse(r.nextAt) <= now);
  if (!due.length) return json({ ok: true, due: 0 });

  const token = owner.settings.telegramBotToken!;
  const hot = hotList(owner.settings);
  for (const r of due) {
    r.sent += 1;
    const last = r.sent >= r.times;
    // Dòng 🔥 tính lại theo danh sách hiện tại: bỏ mã khỏi danh sách thì lần nhắc sau thôi nổi bật
    const hotLine = hotHead(hotMatches(r.text, hot));
    const lines = hotLine ? [hotLine] : [];
    if (r.sent > 1) lines.push(`🔔 Nhắc lần ${r.sent}/${r.times}${last ? " (lần cuối)" : ""}`);
    if (r.head) lines.push(r.head);
    lines.push(r.text);
    const payload: Record<string, unknown> = {
      chat_id: owner.chatId,
      text: lines.join("\n"),
      reply_markup: alertButtons(r.id, r.tf),
    };
    // Bản ghi thêm từ web (Lịch nhắc → Cảnh báo nhắc lại) không có topic → topic cảnh báo mặc định
    const topic = r.topic || ALERT_TOPIC;
    if (topic) payload.message_thread_id = topic;
    const sent = await sendTelegram(token, payload);
    if (typeof sent === "number") {
      const prev = r.messageIds[r.messageIds.length - 1];
      if (prev) {
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: owner.chatId, message_id: prev, reply_markup: { inline_keyboard: [] } }),
        }).catch(() => {});
      }
      if (sent) r.messageIds.push(sent);
    } else {
      console.error("repeat send failed", r.id, sent);
    }
    if (last) r.doneAt = new Date().toISOString();
    else r.nextAt = new Date(now + r.every * 60 * 1000).toISOString();
    r.rev = (r.rev || 0) + 1;
  }

  // Đọc lại trước khi ghi: lúc gửi có thể người dùng vừa bấm nút (telegram-webhook tăng rev)
  // hoặc có cảnh báo mới — bản ghi đã bị sửa thì giữ bản mới, chỉ ghi đè bản ghi còn nguyên
  const fresh = await readRepeats(supabase, owner.userId);
  const merged = fresh.map((f) => {
    const mine = due.find((d) => d.id === f.id);
    return mine && (f.rev || 0) === revOf.get(f.id) ? { ...mine } : f;
  });
  const { error } = await writeRepeats(supabase, owner.userId, merged);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, due: due.length });
}

const CLEAN_SCAN = 1500; // dọn sạch: lùi tối đa ngần này id tính từ tin mới nhất

async function tgCall(botToken: string, method: string, body: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    let info: { ok?: boolean; description?: string; parameters?: { retry_after?: number } } = {};
    try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
    if (res.ok) return { ok: true, desc: "" };
    const wait = info.parameters?.retry_after;
    if (res.status === 429 && wait && wait <= 15) { await new Promise((r) => setTimeout(r, wait * 1000 + 200)); continue; }
    return { ok: false, desc: info.description || `HTTP ${res.status}` };
  }
  return { ok: false, desc: "Telegram giới hạn tốc độ" };
}

// Xoá theo lô 100 id (deleteMessages bỏ qua id không có). Lô bị từ chối (có tin quá 48 giờ / không có
// quyền) thì chia đôi dần để vẫn xoá được phần xoá được. Trả về số id bị từ chối hẳn.
async function deleteBatch(botToken: string, chatId: string, ids: number[]): Promise<{ failed: number; reason: string }> {
  if (!ids.length) return { failed: 0, reason: "" };
  const r = await tgCall(botToken, "deleteMessages", { chat_id: chatId, message_ids: ids });
  if (r.ok) return { failed: 0, reason: "" };
  if (ids.length === 1) return { failed: 1, reason: r.desc };
  const mid = Math.ceil(ids.length / 2);
  const a = await deleteBatch(botToken, chatId, ids.slice(0, mid));
  const b = await deleteBatch(botToken, chatId, ids.slice(mid));
  return { failed: a.failed + b.failed, reason: a.reason || b.reason };
}

async function clean(req: Request, supabase: ReturnType<typeof createClient>, mode: string) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
  const owner = await loadOwner(supabase);
  if (!owner) return json({ error: "Chưa điền Bot Token / Chat ID" }, 400);
  if (!who?.user || who.user.id !== owner.userId) return json({ error: "Không có quyền" }, 401);
  const token = owner.settings.telegramBotToken!;
  const list = await readRepeats(supabase, owner.userId);
  const keep = new Set<number>();
  for (const r of list) {
    if (!r.ackedAt && !r.doneAt && r.messageIds.length) keep.add(r.messageIds[r.messageIds.length - 1]);
  }

  let failed = 0;
  let reason = "";
  let tried = 0;
  if (mode === "all") {
    // Lấy id mới nhất của nhóm bằng một tin tạm (bị xoá luôn trong lượt dọn)
    const probe = await sendTelegram(token, { chat_id: owner.chatId, text: "🧹 Đang dọn tin…", disable_notification: true });
    if (typeof probe !== "number" || !probe) return json({ error: `Không gửi được tin vào nhóm: ${probe}` }, 502);
    for (let top = probe; top > Math.max(0, probe - CLEAN_SCAN); top -= 100) {
      const ids: number[] = [];
      for (let id = top; id > Math.max(0, top - 100); id--) if (!keep.has(id)) ids.push(id);
      tried += ids.length;
      const res = await deleteBatch(token, owner.chatId, ids);
      failed += res.failed;
      reason = reason || res.reason;
      // Cả lô không xoá được tin nào = đã lùi tới tin quá 48 giờ, phía trước còn cũ hơn → dừng
      if (ids.length && res.failed === ids.length) break;
    }
  } else {
    const ids = [...new Set(list.flatMap((r) => r.messageIds || []))].filter((id) => !keep.has(id)).sort((a, b) => b - a);
    tried = ids.length;
    for (let i = 0; i < ids.length; i += 100) {
      const res = await deleteBatch(token, owner.chatId, ids.slice(i, i + 100));
      failed += res.failed;
      reason = reason || res.reason;
    }
  }
  return json({ ok: true, mode, tried, failed, reason, kept: keep.size, separateGroup: !!ALERT_CHAT_ID });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Chỉ nhận POST" }, 405);
  const url = new URL(req.url);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (url.searchParams.get("tick")) return await tick(supabase);
  const cleanMode = url.searchParams.get("clean");
  if (cleanMode) {
    try {
      return await clean(req, supabase, cleanMode === "all" ? "all" : "alerts");
    } catch (e) {
      return json({ error: String((e as Error).message || e) }, 500);
    }
  }

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

  // Mã tiềm năng: dòng 🔥 lên đầu, luôn có chuông và luôn nhắc lại tới khi bấm ✅ / ⏳ (hoặc gõ ok / n)
  const hits = fromTv ? hotMatches(text, hotList(owner.settings)) : [];
  const hotLine = hotHead(hits);
  const payload: Record<string, unknown> = { chat_id: owner.chatId, text: hotLine ? `${hotLine}\n${text}` : text };
  const topic = Number(pick("topic")) || ALERT_TOPIC;
  if (topic && !Number.isNaN(topic)) payload.message_thread_id = topic;
  if (truthy(pick("silent")) && !hotLine) payload.disable_notification = true;

  const repeat = truthy(pick("repeat")) || !!hotLine;
  const id = repeat ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : "";
  const tf = fromTv ? tfOf(text) : null;
  if (repeat) payload.reply_markup = alertButtons(id, tf);

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
      id, text, every, times, sent: 1, tf, rev: 0,
      topic: topic && !Number.isNaN(topic) ? topic : undefined,
      nextAt: new Date(Date.now() + every * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      messageIds: sent ? [sent] : [],
    });
    const { error } = await writeRepeats(supabase, owner.userId, list);
    if (error) console.error("save repeat failed", error.message);
  }
  return json({ ok: true, repeat: repeat ? id : undefined, hot: hits.length ? hits.map((h) => h.name) : undefined });
});
