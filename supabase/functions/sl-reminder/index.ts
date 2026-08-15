// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Thông báo → Nhắc dời SL), và bắn tin nhắn Telegram nhắc dời SL.
// Đồng thời kiểm tra các nhắc nhở chung (tab "Hôm nay"/"Tất cả") có bật "Nhắc qua Telegram" và đến hạn hôm nay.
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

const vnWeekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: VN_TZ, weekday: "short" });

// Khớp với WEEKDAY_CODES ở src/lib/helpers.js — Thứ 2 → Chủ nhật
const WEEKDAY_CODE_BY_EN_SHORT: Record<string, string> = {
  Mon: "T2", Tue: "T3", Wed: "T4", Thu: "T5", Fri: "T6", Sat: "T7", Sun: "CN",
};

// Khớp với Date.getDay() dùng ở reminderDueToday() trong src/lib/helpers.js — Chủ nhật = 0
const JS_WEEKDAY_NUM_BY_EN_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

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

function vnWeekdayCode(date: Date) {
  return WEEKDAY_CODE_BY_EN_SHORT[vnWeekdayFormatter.format(date)] || "";
}

function vnWeekdayNum(date: Date) {
  return JS_WEEKDAY_NUM_BY_EN_SHORT[vnWeekdayFormatter.format(date)];
}

function minutesDiff(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

// Tương đương reminderDueToday() ở src/lib/helpers.js, tính theo ngày/thứ VN thay vì giờ máy chủ.
function reminderDueOnVn(r: { frequency?: string; weekday?: number; dayOfMonth?: number; date?: string; active?: boolean; doneDates?: string[] }, vnDate: string, vnWeekdayN: number) {
  if (!r.active) return false;
  if ((r.doneDates || []).includes(vnDate)) return false;
  if (r.frequency === "weekly") return Number(r.weekday) === vnWeekdayN;
  if (r.frequency === "monthly") return Number(r.dayOfMonth) === Number(vnDate.split("-")[2]);
  if (r.frequency === "once") return r.date === vnDate;
  return false;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const { date: today, time: currentHHMM } = vnNowParts(now);
  const todayWeekdayCode = vnWeekdayCode(now);
  const todayWeekdayNum = vnWeekdayNum(now);

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
      schedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[]; threadId?: string; activeDays?: string[] }[];
    };
    // Bot Token + Chat ID dùng chung cho cả nhắc dời SL và nhắc việc chung — thiếu 1 trong 2 thì bỏ qua toàn bộ.
    if (!settings?.telegramBotToken || !settings.telegramChatId) continue;

    const schedules = settings.enabled ? (settings.schedules || []).filter((s) => s.enabled && (s.hours || []).length) : [];

    // Bỏ qua tài khoản có activeDays nhưng hôm nay không nằm trong đó (VD: Forex nghỉ T7/CN).
    // activeDays không tồn tại (dữ liệu cũ trước khi có tính năng này) → mặc định coi như chạy mọi ngày.
    const dueSchedules = schedules.filter((s) => {
      const activeDays = Array.isArray(s.activeDays) ? s.activeDays : null;
      if (activeDays && !activeDays.includes(todayWeekdayCode)) return false;
      return (s.hours || []).some((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
    });

    const [{ data: resourcesRow }, { data: tradesRow }, { data: logRow }, { data: remindersRow }] = await Promise.all([
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "resources").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "trades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slReminderLog").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "reminders").maybeSingle(),
    ]);

    const accounts = (resourcesRow?.value?.accounts || []) as { id: string; name: string }[];
    const trades = (tradesRow?.value || []) as { account?: string; symbol?: string; entryDate?: string; entryTime?: string; exitDate?: string }[];
    const log = (logRow?.value || {}) as Record<string, boolean>;
    const reminders = (remindersRow?.value || []) as {
      id?: string; title?: string; frequency?: string; weekday?: number; dayOfMonth?: number; date?: string;
      active?: boolean; doneDates?: string[]; notifyTelegram?: boolean; notifyTime?: string;
    }[];
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

      const lines = openTrades.map((t) => `. [${t.symbol}] - Dời SL`);
      const text =
        `⏰ Nhắc dời SL\n` +
        `Tài khoản: [${accountName}]\n` +
        `----\n` +
        lines.join("\n");

      const threadId = sched.threadId ? Number(sched.threadId) : undefined;
      const payload: Record<string, unknown> = { chat_id: settings.telegramChatId, text };
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

    // Nhắc việc chung (VD: cập nhật đường cong vốn) đã bật "Nhắc qua Telegram" và đến hạn hôm nay,
    // đúng khung giờ đã đặt cho từng nhắc nhở — gửi vào chat chính, không gắn Topic vì không thuộc tài khoản nào.
    const dueReminders = reminders.filter((r) => {
      if (!r.notifyTelegram || !r.id) return false;
      if (!reminderDueOnVn(r, today, todayWeekdayNum)) return false;
      return minutesDiff(r.notifyTime || "08:00", currentHHMM) <= MATCH_TOLERANCE_MIN;
    });

    for (const r of dueReminders) {
      // Giữ vị trí "ngày" ở phần tử thứ 2 của key (giống key nhắc dời SL) để logic dọn log cũ bên dưới hoạt động đúng.
      const logKey = `reminder_${today}_${r.id}`;
      if (log[logKey]) continue;

      const text = `🔔 Nhắc nhở\n----\n${r.title || "(không có tiêu đề)"}`;
      const tgRes = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text }),
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

  return new Response(
    JSON.stringify({ ok: true, sent, vnTime: currentHHMM, vnDate: today, vnWeekday: todayWeekdayCode }),
    { headers: { "content-type": "application/json" } }
  );
});
