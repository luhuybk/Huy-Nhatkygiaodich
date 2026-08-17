// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Thông báo → Nhắc dời SL), và bắn tin nhắn Telegram nhắc dời SL.
// Đồng thời kiểm tra các nhắc nhở chung (tab "Hôm nay"/"Tất cả") có bật "Nhắc qua Telegram" và đến hạn hôm nay,
// và lịch nhắc kiểm tra setup theo tài khoản (Thông báo → Kiểm tra setup) để tránh miss setup vì không theo dõi kịp.
// Deploy: supabase functions deploy sl-reminder
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY — Supabase tự cấp sẵn cho mọi Edge Function.
// Kích hoạt gọi định kỳ bằng file supabase-sl-reminder-cron.sql (pg_cron + pg_net) ở thư mục gốc repo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VN_TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không có DST — nhưng vẫn dùng Intl để tránh tự tính offset thủ công
const MATCH_TOLERANCE_MIN = 2; // dung sai so khớp giờ, phù hợp với cron chạy mỗi 5 phút
const LOG_RETENTION_DAYS = 3;
const MAX_INCOMPLETE_LINES = 15; // tránh tin nhắn dài quá giới hạn Telegram

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

async function sendTelegram(botToken: string, chatId: string, text: string, threadId?: string, replyMarkup?: unknown) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  const thread = threadId ? Number(threadId) : undefined;
  if (thread && !Number.isNaN(thread)) payload.message_thread_id = thread;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// Bản rút gọn của tradeCompletionFields() ở src/lib/helpers.js — giữ đúng danh sách trường
// để % ở Telegram khớp với cột "Tiến độ" trên web.
function completionPercent(t: Record<string, unknown>) {
  const filled = (v: unknown) => v !== "" && v !== null && v !== undefined && v !== 0;
  const checks = [
    !!t.entryDate, !!t.account, !!t.timeframe, !!(t.entryImage || t.entryLink),
    filled(t.riskPercent), filled(t.riskAmount), !!t.riskAction, !!t.ratingRisk,
    !!t.setup, !!t.setupNote, !!t.ratingKnowledge,
    !!t.exitDate, filled(t.profit), !!(t.exitImage || t.exitLink),
    !!t.entrySkill, !!t.inTradeSkill, !!t.exitSkill, !!t.ratingSkill,
    !!t.psychology, !!t.ratingPsychology, !!t.tradeGrade,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
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
      setupCheckEnabled?: boolean;
      setupCheckSchedules?: { accountId: string; accountName?: string; enabled?: boolean; hours?: string[]; threadId?: string; activeDays?: string[] }[];
      incompleteReminder?: { enabled?: boolean; weekday?: string; time?: string; threadId?: string };
      symbolWatchEnabled?: boolean;
      symbolWatchThreadId?: string;
    };
    // Bot Token + Chat ID dùng chung cho cả nhắc dời SL, nhắc kiểm tra setup và nhắc việc chung — thiếu 1 trong 2 thì bỏ qua toàn bộ.
    if (!settings?.telegramBotToken || !settings.telegramChatId) continue;

    const schedules = settings.enabled ? (settings.schedules || []).filter((s) => s.enabled && (s.hours || []).length) : [];
    const setupCheckSchedules = settings.setupCheckEnabled ? (settings.setupCheckSchedules || []).filter((s) => s.enabled && (s.hours || []).length) : [];

    // Bỏ qua tài khoản có activeDays nhưng hôm nay không nằm trong đó (VD: Forex nghỉ T7/CN).
    // activeDays không tồn tại (dữ liệu cũ trước khi có tính năng này) → mặc định coi như chạy mọi ngày.
    const isDueNow = (s: { activeDays?: string[]; hours?: string[] }) => {
      const activeDays = Array.isArray(s.activeDays) ? s.activeDays : null;
      if (activeDays && !activeDays.includes(todayWeekdayCode)) return false;
      return (s.hours || []).some((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
    };
    const dueSchedules = schedules.filter(isDueNow);
    const dueSetupChecks = setupCheckSchedules.filter(isDueNow);

    const [{ data: resourcesRow }, { data: tradesRow }, { data: logRow }, { data: remindersRow }, { data: watchesRow }] = await Promise.all([
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "resources").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "trades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slReminderLog").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "reminders").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "symbolWatches").maybeSingle(),
    ]);

    const accounts = (resourcesRow?.value?.accounts || []) as { id: string; name: string }[];
    const trades = (tradesRow?.value || []) as {
      account?: string; symbol?: string; entryDate?: string; entryTime?: string; exitDate?: string;
      [key: string]: unknown;
    }[];
    const log = (logRow?.value || {}) as Record<string, boolean>;
    const reminders = (remindersRow?.value || []) as {
      id?: string; title?: string; frequency?: string; weekday?: number; dayOfMonth?: number; date?: string;
      active?: boolean; doneDates?: string[]; notifyTelegram?: boolean; notifyTime?: string;
    }[];
    const watches = (watchesRow?.value || []) as {
      id?: string; symbol?: string; note?: string; enabled?: boolean; done?: boolean;
      hours?: string[]; activeDays?: string[]; snoozeUntil?: string; lastNotifiedAt?: string;
    }[];
    let logChanged = false;
    let watchesChanged = false;

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

      if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId)) {
        log[logKey] = true;
        logChanged = true;
        sent++;
      }
    }

    for (const sched of dueSetupChecks) {
      const account = accounts.find((a) => a.id === sched.accountId);
      const accountName = account ? account.name : sched.accountName;
      if (!accountName) continue;

      const matchedHour = (sched.hours || []).find((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
      // Giữ vị trí "ngày" ở phần tử thứ 2 của key để logic dọn log cũ bên dưới hoạt động đúng.
      const logKey = `setup_${today}_${sched.accountId}_${matchedHour}`;
      if (log[logKey]) continue;

      const text =
        `🔍 Nhắc kiểm tra setup\n` +
        `Tài khoản: [${accountName}]\n` +
        `----\n` +
        `. Đến giờ theo dõi, kiểm tra xem có setup nào không nhé!`;

      if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId)) {
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
      if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text)) {
        log[logKey] = true;
        logChanged = true;
        sent++;
      }
    }

    // Nhắc điền nốt các lệnh chưa hoàn thành 100% — mỗi tuần 1 lần vào thứ + giờ đã chọn.
    const inc = settings.incompleteReminder;
    if (inc?.enabled && (inc.weekday || "CN") === todayWeekdayCode && minutesDiff(inc.time || "20:00", currentHHMM) <= MATCH_TOLERANCE_MIN) {
      const logKey = `incomplete_${today}`;
      if (!log[logKey]) {
        const pending = trades
          .map((t) => ({ t, percent: completionPercent(t) }))
          .filter((x) => x.percent < 100)
          .sort((a, b) => a.percent - b.percent);

        if (pending.length) {
          const shown = pending.slice(0, MAX_INCOMPLETE_LINES);
          const lines = shown.map((x) => `. [${x.t.symbol || "?"}] ${x.t.entryDate || ""} — ${x.percent}%`);
          if (pending.length > shown.length) lines.push(`. ...và ${pending.length - shown.length} lệnh nữa`);
          const text =
            `📝 Lệnh chưa điền xong\n` +
            `Còn ${pending.length} lệnh dưới 100%\n` +
            `----\n` +
            lines.join("\n");
          if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, inc.threadId)) {
            log[logKey] = true;
            logChanged = true;
            sent++;
          }
        }
      }
    }

    // Symbol theo dõi — nhắc theo khung giờ, hoặc nhắc lại đúng lúc hết hạn hoãn nếu bạn đã bấm "Dời lại" trên Telegram.
    if (settings.symbolWatchEnabled && watches.length) {
      for (const w of watches) {
        if (!w.id || !w.enabled || w.done) continue;

        const snoozeUntil = w.snoozeUntil ? Date.parse(w.snoozeUntil) : NaN;
        const isSnoozed = !Number.isNaN(snoozeUntil) && snoozeUntil > now.getTime();
        if (isSnoozed) continue; // đang hoãn thì bỏ qua mọi khung giờ định kỳ
        const snoozeExpired = !Number.isNaN(snoozeUntil) && snoozeUntil <= now.getTime();

        let logKey = "";
        if (!snoozeExpired) {
          const activeDays = Array.isArray(w.activeDays) ? w.activeDays : null;
          if (activeDays && !activeDays.includes(todayWeekdayCode)) continue;
          const matchedHour = (w.hours || []).find((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
          if (!matchedHour) continue;
          logKey = `watch_${today}_${w.id}_${matchedHour}`;
          if (log[logKey]) continue;
        }

        const text =
          `👀 Symbol theo dõi\n` +
          `${w.symbol || "?"}\n` +
          `----\n` +
          `. ${w.note ? w.note : "Tới giờ soi symbol này rồi!"}`;

        const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, settings.symbolWatchThreadId, {
          inline_keyboard: [
            [{ text: "✅ Xong", callback_data: `w:${w.id}:done` }],
            [
              { text: "⏰ 3 tiếng", callback_data: `w:${w.id}:s3` },
              { text: "⏰ 8 tiếng", callback_data: `w:${w.id}:s8` },
              { text: "⏰ 1 ngày", callback_data: `w:${w.id}:s24` },
            ],
          ],
        });

        if (ok) {
          // Hoãn đã hết hạn thì phải xóa mốc, nếu không cứ 5 phút lại bắn thêm một tin.
          if (snoozeExpired) { w.snoozeUntil = ""; watchesChanged = true; }
          w.lastNotifiedAt = new Date().toISOString();
          watchesChanged = true;
          if (logKey) { log[logKey] = true; logChanged = true; }
          sent++;
        }
      }
    }

    if (watchesChanged) {
      await supabase.from("app_data").upsert(
        { user_id: row.user_id, key: "symbolWatches", value: watches, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
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
