// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Cài đặt → Nhắc dời SL qua Telegram), và bắn tin nhắn Telegram nhắc dời SL.
// Deploy: supabase functions deploy sl-reminder
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY — Supabase tự cấp sẵn cho mọi Edge Function.
// Kích hoạt gọi định kỳ bằng file supabase-sl-reminder-cron.sql (pg_cron + pg_net) ở thư mục gốc repo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VN_TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không có DST — nhưng vẫn dùng Intl để tránh tự tính offset thủ công
const MATCH_TOLERANCE_MIN = 2; // dung sai so khớp giờ, phù hợp với cron chạy mỗi 5 phút
const LOG_RETENTION_DAYS = 3;

const vnFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Trả về ngày + giờ hiện tại theo múi giờ Việt Nam, bất kể server chạy ở UTC hay múi giờ nào khác.
function vnNowParts(date: Date) {
  const parts = Object.fromEntries(vnFormatter.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  let hour = parts.hour;
  if (hour === "24") hour = "00"; // một số runtime trả "24:00" thay vì "00:00" cho nửa đêm với hour12:false
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

function minutesDiff(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const { date: today, time: currentHHMM } = vnNowParts(now);

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
      schedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[]; threadId?: string }[];
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

      const lines = openTrades.map((t) => `[${t.symbol}] - Dời SL`);
      const text =
        `⏰ <b>Nhắc dời SL</b>\n` +
        `Tài khoản: <b>${accountName}</b>\n\n` +
        lines.join("\n");

      const threadId = sched.threadId ? Number(sched.threadId) : undefined;
      const payload: Record<string, unknown> = { chat_id: settings.telegramChatId, text, parse_mode: "HTML" };
      if (threadId && !Number.isNaN(threadId)) payload.message_thread_id = threadId;

      const tgRes = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (tgRes.ok) {
        log[logKey] = true;
        logChanged = true;
        sent++;
      }
    }

    if (logChanged) {
      const cutoffDate = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60000);
      const cutoffStr = vnNowParts(cutoffDate).date;
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

  return new Response(JSON.stringify({ ok: true, sent, vnTime: currentHHMM, vnDate: today }), { headers: { "content-type": "application/json" } });
});
