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
// Deploy: supabase functions deploy mt5-journal --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RELAY_KEY = Deno.env.get("ALERT_RELAY_KEY") || "";
const INBOX_KEY = "mt5Inbox";
const KEEP = 1000; // giữ 1000 lệnh gần nhất — đủ để lệnh nào cũng kịp được app nhận

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

  // Đọc-sửa-ghi cả khối: hai MT5 báo cùng lúc thì một bên có thể ghi đè bên kia, nên ghi xong đọc
  // lại kiểm, mất thì ghi lại (tối đa 3 lần).
  for (let attempt = 0; attempt < 3; attempt++) {
    const inbox = await readInbox(supabase, userId);
    if (inbox.some((x) => x.id === item.id)) return json({ ok: true, dup: attempt === 0, id: item.id });
    const next = [...inbox, item].slice(-KEEP);
    const { error } = await supabase.from("app_data").upsert(
      { user_id: userId, key: INBOX_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
    if (error) return json({ ok: false, error: error.message }, 500);
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));
  }
  const final = await readInbox(supabase, userId);
  return final.some((x) => x.id === item.id) ? json({ ok: true, id: item.id }) : json({ ok: false, error: "write lost" }, 503);
});
