// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Cài đặt → Nhắc dời SL qua Telegram), và bắn tin nhắn Telegram nhắc dời SL.
// Deploy: supabase functions deploy sl-reminder
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY — Supabase tự cấp sẵn cho mọi Edge Function.
// Kích hoạt gọi định kỳ bằng file supabase-sl-reminder-cron.sql (pg_cron + pg_net) ở thư mục gốc repo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZ_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh, UTC+7
const MATCH_TOLERANCE_MIN = 2; // dung sai so khớp giờ, phù hợp với cron chạy mỗi 5 phút
const LOG_RETENTION_DAYS = 3;

function vnNow() {
  return new Date(Date.now() + TZ_OFFSET_MIN * 60000);
}

function hhmm(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function minutesDiff(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = vnNow();
  const currentHHMM = hhmm(now);
  const today = dateStr(now);

  const { data: settingsRows, error: settingsErr } = await supabase
    .from("app_data")
    .select("user_id, value")
    .eq("key", "slReminderSettings");

  if (settingsErr) {
    return new Response(JSON.stringify({ error: settingsErr.message }), { status: 500 });
  }

  let sent = 0;

  for (const row of settingsRows || []) {
    const settings = row.value as {
      enabled?: boolean;
      telegramBotToken?: string;
      telegramChatId?: string;
      schedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[] }[];
    };
    if (!settings?.enabled || !settings.telegramBotToken || !settings.telegramChatId) continue;

    const schedules = (settings.schedules || []).filter((s) => s.enabled && (s.hours || []).length);
    if (!schedules.length) continue;

    const dueSchedules = schedules.filter((s) =>
      (s.hours || []).some((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN)
    );
    if (!dueSchedules.length) continue;

    const [{ data: resourcesRow }, { data: tradesRow }, { data: logRow }] = await Promise.all([
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "resources").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "trades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slReminderLog").maybeSingle(),
    ]);

    const accounts = (resourcesRow?.value?.accounts || []) as { id: string; name: string }[];
    const trades = (tradesRow?.value || []) as { account?: string; symbol?: string; entryDate?: string; entryTime?: string; exitDate?: string }[];
    const log = (logRow?.value || {}) as Record<string, boolean>;
    let logChanged = false;

    for (const sched of dueSchedules) {
      const account = accounts.find((a) => a.id === sched.accountId);
      const accountName = account ? account.name : sched.accountName;
      if (!accountName) continue;

      const openTrades = trades.filter((t) => t.account === accountName && t.entryDate && !t.exitDate);
      if (!openTrades.length) continue;

      const matchedHour = (sched.hours || []).find((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
      const logKey = `${sched.accountId}_${today}_${matchedHour}`;
      if (log[logKey]) continue; // đã gửi khung giờ này rồi, tránh gửi trùng

      const lines = openTrades.map(
        (t) => `• ${t.symbol} — vào lệnh ${t.entryDate}${t.entryTime ? " " + t.entryTime : ""}`
      );
      const text =
        `⏰ <b>Nhắc dời SL</b>\n` +
        `Tài khoản: <b>${accountName}</b>\n` +
        `Đang có ${openTrades.length} lệnh mở, kiểm tra và dời SL nếu cần:\n` +
        lines.join("\n");

      const tgRes = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text, parse_mode: "HTML" }),
      });

      if (tgRes.ok) {
        log[logKey] = true;
        logChanged = true;
        sent++;
      }
    }

    if (logChanged) {
      const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60000);
      const cutoffStr = dateStr(cutoff);
      for (const k of Object.keys(log)) {
        const d = k.split("_")[1];
        if (d && d < cutoffStr) delete log[k];
      }
      await supabase
        .from("app_data")
        .upsert(
          { user_id: row.user_id, key: "slReminderLog", value: log, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "content-type": "application/json" } });
});
