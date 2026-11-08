// Supabase Edge Function: EA MT5 (KeoSLDuoiNen trên VPS) báo lệnh mới khớp → hộp chờ của nhật ký.
//
//   POST .../functions/v1/mt5-journal?key=<ALERT_RELAY_KEY>
//   {"login": 213566823, "accountName": "1. Trading - Dài", "ticket": 123456789,
//    "symbol": "EURUSDm", "side": "buy", "time": 1761700000}      (time = giây UTC lúc khớp)
//   Lệnh đóng hẳn: thêm "event": "close", "volume": 0.5 (lot lúc vào), "fees": -1.2 (hoa hồng + qua đêm),
//   "closes": [{"time": 1761800000, "lots": 0.2, "profit": 30.5}, ...] (mỗi lần đóng / chốt bớt một dòng).
//   Lệnh có SL thì cả hai gói kèm "risk": 146.2 (tiền mất nếu chạm SL ban đầu), "currency": "USD".
//
// Dùng chung khoá với alert-relay (EA lấy địa chỉ alert-relay trong KeoSL_telegram.txt rồi đổi tên
// function), nên không phải dán thêm khoá nào lên VPS.
//
// Không ghi thẳng vào "trades": app đang mở giữ cả danh sách trong bộ nhớ và ghi đè nguyên khối,
// lệnh chèn từ đây sẽ mất ở lần lưu kế tiếp. Ghi vào app_data "mt5Inbox", app tự lấy ra tạo lệnh
// (src/lib/mt5Inbox.js) và đánh dấu đã nhận ở khoá riêng "mt5InboxSeen".
// Gửi trùng (EA khởi động lại, mạng chập chờn) thì trả ok + dup, không thêm lần hai.
// Thêm "test": true vào JSON để thử khoá + đường đi mà không ghi lệnh nào.
//
// Lệnh mới khớp → tin "📥 Vào lệnh" vào nhóm riêng (_shared/mt5Fill.ts). Còn kịp nhắc trước lần EA tự kéo
// thì kèm nút "🔁 Nến re-entry" (rn|<login>-<ticket>|<khung>, telegram-webhook xử lý): EA bỏ qua nến vào lệnh,
// nến vào là re-entry thì bấm để được nhắc dời SL tay 1 lần lúc nến đó đóng. Khung lấy ở Tài khoản
// (ô Số MT5 + Khung). Gói đến muộn quá 30 phút (quét bù lịch sử lúc gắn EA) thì không báo.
// Tắt: supabase secrets set MT5_FILL_TELEGRAM=off
//
// Bảng dời SL (EA v2.90+): "event": "sl" — mỗi lệnh mỗi nến một dòng (status moved/be/keep/skip/wait/closed,
// slOld, slNew, pnl nếu chạm SL…). Ghi ô riêng slMove:<login>:<ticket>:<bar>; alert-relay tick gom theo tài khoản
// thành một tin Telegram — xem _shared/slBoard.ts. Gói khớp mới / gói đóng còn ghi mốc slMove:<login>:<ticket>:0
// ("open" / "gone") cho canh chừng EA + lịch sử SL (_shared/eaWatch.ts).
//
// Deploy: supabase functions deploy mt5-journal --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isCryptoSymbol, normTf, reentryPlan, vnTime } from "../_shared/alertRecheck.ts";
import { fillChat, shortSymbol } from "../_shared/mt5Fill.ts";
import { parseSlRow, SL_MOVE_PREFIX, slReplaces, slRowKey, type SlRow } from "../_shared/slBoard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RELAY_KEY = Deno.env.get("ALERT_RELAY_KEY") || "";
const INBOX_KEY = "mt5Inbox";
const KEEP = 1000; // giữ 1000 lệnh gần nhất — đủ để lệnh nào cũng kịp được app nhận
const FILL_TG = (Deno.env.get("MT5_FILL_TELEGRAM") || "").toLowerCase() !== "off";
const FILL_FRESH_MS = 30 * 60 * 1000; // gói vào lệnh đến muộn hơn thế = quét bù lịch sử, không báo

type Close = { time: number; lots: number; profit: number };
type Item = {
  id: string; login: string; accountName: string; ticket: string; symbol: string; side: string; time: number; receivedAt: string;
  event?: "close"; volume?: number; fees?: number; closes?: Close[]; risk?: number; currency?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const clean = (v: unknown, max = 64) => String(v ?? "").trim().slice(0, max);

// Chủ nhật ký = người đã cài bot Telegram (app một người dùng), giống alert-relay
async function ownerId(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.from("app_data").select("user_id, value").eq("key", "slReminderSettings");
  if (error) throw new Error(error.message);
  const row = (data || []).find((r) => (r.value as { telegramBotToken?: string })?.telegramBotToken) || (data || [])[0];
  return row ? (row.user_id as string) : null;
}

async function readInbox(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", INBOX_KEY).maybeSingle();
  return (Array.isArray(data?.value) ? data!.value : []) as Item[];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const url = new URL(req.url);
  if (!RELAY_KEY || url.searchParams.get("key") !== RELAY_KEY) return json({ ok: false, error: "bad key" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { return json({ ok: false, error: "bad json" }, 400); }
  if (body.event === "sl") return await slEvent(body);
  const login = clean(body.login).replace(/\D/g, "");
  const ticket = clean(body.ticket).replace(/\D/g, "");
  const symbol = clean(body.symbol, 32);
  const time = Math.round(Number(body.time));
  if (!login || !ticket || !symbol || !Number.isFinite(time) || time <= 0) return json({ ok: false, error: "missing login/ticket/symbol/time" }, 400);

  const item: Item = {
    id: `${login}-${ticket}`, login, ticket, symbol, time,
    accountName: clean(body.accountName, 120),
    side: clean(body.side).toLowerCase() === "sell" ? "sell" : "buy",
    receivedAt: new Date().toISOString(),
  };
  const risk = Number(body.risk);
  if (Number.isFinite(risk) && risk > 0) {
    item.risk = Math.round(risk * 100) / 100;
    item.currency = clean(body.currency, 8).toUpperCase();
  }
  if (body.event === "close") {
    const closes = (Array.isArray(body.closes) ? body.closes : []).slice(0, 100).map((c: Record<string, unknown>) => ({
      time: Math.round(Number(c?.time)), lots: Number(c?.lots), profit: Number(c?.profit),
    })).filter((c: Close) => c.time > 0 && Number.isFinite(c.lots) && Number.isFinite(c.profit));
    if (!closes.length) return json({ ok: false, error: "close without closes" }, 400);
    item.id = `${login}-${ticket}-close`;
    item.event = "close";
    item.closes = closes;
    item.volume = Number.isFinite(Number(body.volume)) ? Number(body.volume) : 0;
    item.fees = Number.isFinite(Number(body.fees)) ? Number(body.fees) : 0;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userId = await ownerId(supabase);
  if (!userId) return json({ ok: false, error: "no owner" }, 500);
  // "test": true → chỉ kiểm khoá + dữ liệu, không ghi gì (thử đường đi mà không đẻ lệnh giả)
  if (body.test === true) return json({ ok: true, test: true, item });
  // "test": "fill" → không ghi hộp chờ, chỉ gửi thử tin 📥 Vào lệnh (bỏ qua luật gói cũ) và trả lý do
  // nếu không gửi được — để soát cấu hình (Số MT5, Khung, Telegram) mà không phải chờ lệnh thật.
  if (body.test === "fill") return json({ ok: true, test: "fill", ...(await fillMessage(supabase, userId, item, true)) });

  // Đọc-sửa-ghi cả khối: hai MT5 báo cùng lúc thì một bên có thể ghi đè bên kia, nên ghi xong đọc
  // lại kiểm, mất thì ghi lại (tối đa 3 lần).
  let stored = false;
  let dup = false;
  for (let attempt = 0; attempt < 3 && !stored; attempt++) {
    const inbox = await readInbox(supabase, userId);
    if (inbox.some((x) => x.id === item.id)) {
      dup = attempt === 0;
      stored = true;
      break;
    }
    const next = [...inbox, item].slice(-KEEP);
    const { error } = await supabase.from("app_data").upsert(
      { user_id: userId, key: INBOX_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
    if (error) return json({ ok: false, error: error.message }, 500);
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));
  }
  if (!stored) stored = (await readInbox(supabase, userId)).some((x) => x.id === item.id);
  if (!stored) return json({ ok: false, error: "write lost" }, 503);
  // Mốc khớp / đóng lệnh cho canh chừng EA + lịch sử SL (_shared/eaWatch.ts). Gói khớp gửi lại (EA khởi động lại) hay đến
  // muộn (quét bù lịch sử — gói đóng theo sau vài giây) thì không ghi "open": ghi là canh nhầm lệnh đã đóng. Lệnh quét bù mà
  // còn mở thì EA vừa khởi động cũng gửi ngay bảng "SL hiện tại".
  const pre = !item.event && !dup ? await accountTf(supabase, userId, item).catch(() => null) : null;
  if (item.event === "close" || (!dup && Date.now() - item.time * 1000 <= FILL_FRESH_MS)) {
    try { await writeMark(supabase, userId, item, pre?.tf || null); } catch (e) { console.error("mark failed", item.id, String((e as Error).message || e)); }
  }
  if (dup) return json({ ok: true, dup: true, id: item.id });
  let fill: unknown;
  if (!item.event && FILL_TG) {
    try { fill = (await fillMessage(supabase, userId, item, false, pre)).fill; } catch (e) { fill = String((e as Error).message || e); }
    console.log("fill", item.id, item.symbol, item.accountName, JSON.stringify(fill)); // EA không in khi thành công → xem ở Logs
  }
  return json({ ok: true, id: item.id, fill });
});

// ───────────── Tin khớp lệnh + nút 🔁 Nến re-entry ─────────────

type Account = { name?: string; mt5Login?: string; timeframes?: string[] };

async function readKey(supabase: ReturnType<typeof createClient>, userId: string, key: string) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  return data?.value ?? null;
}

// Khung của tài khoản: ô Khung ở Tài khoản; chưa chọn thì khung của lệnh gần nhất trong nhật ký (như app)
async function accountTf(supabase: ReturnType<typeof createClient>, userId: string, item: Item) {
  const res = (await readKey(supabase, userId, "resources")) as { accounts?: Account[] } | null;
  const list = (res?.accounts || []).filter((a) => a && a.name);
  const acc = list.find((a) => String(a.mt5Login || "").replace(/\D/g, "") === item.login) ||
    list.find((a) => a.name!.trim().toLowerCase() === item.accountName.trim().toLowerCase());
  if (!acc) return { acc: null, tf: null };
  const own = (acc.timeframes || []).map(normTf).find(Boolean);
  if (own) return { acc, tf: own };
  const trades = (await readKey(supabase, userId, "trades")) as { account?: string; timeframe?: string; entryDate?: string; entryTime?: string }[] | null;
  const last = (Array.isArray(trades) ? trades : [])
    .filter((t) => t && t.account === acc.name && normTf(t.timeframe))
    .sort((a, b) => `${b.entryDate || ""} ${b.entryTime || ""}`.localeCompare(`${a.entryDate || ""} ${a.entryTime || ""}`))[0];
  return { acc, tf: last ? normTf(last.timeframe) : null };
}

async function fillMessage(supabase: ReturnType<typeof createClient>, userId: string, item: Item, test = false,
  pre?: Awaited<ReturnType<typeof accountTf>> | null) {
  const { acc, tf } = pre || await accountTf(supabase, userId, item);
  const info: Record<string, unknown> = { account: acc?.name || null, mt5Login: acc?.mt5Login || null, timeframes: acc?.timeframes || null, tf };
  const now = Date.now();
  const fillMs = item.time * 1000;
  if (!test && now - fillMs > FILL_FRESH_MS) return { ...info, fill: "old" };
  const plan = tf ? reentryPlan(tf, fillMs, isCryptoSymbol(item.symbol)) : null;
  // Nút 🔁 chỉ khi nhắc còn kịp trước lần EA tự kéo (nến vào đóng lúc nghỉ đêm thì thường EA kéo trước 8h45)
  const canRemind = !!plan && plan.useful && now < plan.eaAt;
  if (plan) Object.assign(info, { close: vnTime(plan.close, now), remindAt: vnTime(plan.at, now), eaAt: vnTime(plan.eaAt, now), button: canRemind });
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", "slReminderSettings").maybeSingle();
  const settings = (data?.value || {}) as { telegramBotToken?: string };
  const { chatId, topic } = fillChat();
  if (!settings.telegramBotToken || !chatId) return { ...info, fill: "no telegram" };

  // 📥 XAUUSD 🟢 BUY
  // Trading - Ngắn · H4 · 14:05
  // 🔁 Re-entry? Bấm → nhắc dời SL 17:01
  const side = item.side === "sell" ? "🔴 SELL" : "🟢 BUY";
  const meta = [acc?.name || item.accountName || item.login, tf, vnTime(fillMs, now)];
  const lines = [
    `${test ? "🧪 THỬ · " : ""}📥 ${shortSymbol(item.symbol)} ${side}`,
    meta.filter(Boolean).join(" · "),
  ];
  if (canRemind) lines.push(`🔁 Re-entry? Bấm → nhắc dời SL ${vnTime(plan!.at, now)}`);
  const payload: Record<string, unknown> = { chat_id: chatId, text: lines.join("\n") };
  if (canRemind) {
    payload.reply_markup = { inline_keyboard: [[{ text: "🔁 Nến re-entry", callback_data: `rn|${item.login}-${item.ticket}|${tf}` }]] };
  }
  if (topic) payload.message_thread_id = topic;
  const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  if (res.ok) return { ...info, fill: "sent" };
  const why = await res.text().catch(() => "");
  return { ...info, fill: `telegram ${res.status}`, telegram: why.slice(0, 300) };
}

// ───────────── Bảng dời SL ─────────────

// Mốc slMove:<login>:<ticket>:0 — "open" lúc khớp (khung của tài khoản, đã có SL chưa), "gone" lúc đóng hẳn. Bảng Telegram
// bỏ qua ô bar = 0; canh chừng EA biết lệnh mới khớp chưa có dòng nến nào và lệnh đã đóng; lịch sử SL lấy giờ vào / đóng.
async function writeMark(supabase: ReturnType<typeof createClient>, userId: string, item: Item, tf: string | null) {
  const close = item.event === "close";
  const at = new Date().toISOString();
  const row: SlRow = {
    login: item.login, accountName: item.accountName, ticket: item.ticket, symbol: item.symbol,
    side: item.side === "sell" ? "sell" : "buy", status: close ? "gone" : "open", no: "", tf: tf || "", bar: 0,
    slOld: 0, slNew: 0, level: 0, open: 0, digits: 0, currency: item.currency || "", note: "", at, openedAt: item.time,
    ...(close ? { closedAt: Math.max(...(item.closes || []).map((c) => c.time)) } : { hasSl: !!item.risk }),
  };
  const { error } = await supabase.from("app_data").upsert(
    { user_id: userId, key: `${SL_MOVE_PREFIX}${item.login}:${item.ticket}:0`, value: row, updated_at: at },
    { onConflict: "user_id,key" },
  );
  if (error) throw new Error(error.message);
}

async function slEvent(body: Record<string, unknown>) {
  const row = parseSlRow(body);
  if (!row) return json({ ok: false, error: "bad sl row" }, 400);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userId = await ownerId(supabase);
  if (!userId) return json({ ok: false, error: "no owner" }, 500);
  if (body.test === true) return json({ ok: true, test: true, row, key: slRowKey(row) });
  const key = slRowKey(row);
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  const prev = data?.value as SlRow | null;
  if (!slReplaces(prev, row)) return json({ ok: true, kept: prev!.status });
  // EA khởi động lại gửi lại y hệt dòng cũ: khỏi ghi, để giờ của dòng vẫn là lúc nội dung đổi lần cuối
  if (prev && JSON.stringify({ ...prev, at: "" }) === JSON.stringify({ ...row, at: "" })) return json({ ok: true, same: true, key });
  const { error } = await supabase.from("app_data").upsert(
    { user_id: userId, key, value: row, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, key });
}
