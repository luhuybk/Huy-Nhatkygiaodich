// Supabase Edge Function: kiểm tra định kỳ tài khoản nào đang có lệnh mở đúng vào khung giờ
// người dùng đã đặt (Thông báo → Nhắc dời SL), và bắn tin nhắn Telegram nhắc dời SL cho TỪNG lệnh.
// Đồng thời kiểm tra các nhắc nhở chung (tab "Hôm nay"/"Tất cả") có bật "Nhắc qua Telegram" và đến hạn hôm nay,
// và lịch nhắc kiểm tra setup theo tài khoản (Thông báo → Kiểm tra setup) để tránh miss setup vì không theo dõi kịp.
// Deploy: supabase functions deploy sl-reminder
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY — Supabase tự cấp sẵn cho mọi Edge Function.
// Kích hoạt gọi định kỳ bằng file supabase-sl-reminder-cron.sql (pg_cron + pg_net) ở thư mục gốc repo.
// Các nút bấm trong tin nhắn do function telegram-webhook xử lý.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VN_TZ = "Asia/Ho_Chi_Minh"; // UTC+7, không có DST — nhưng vẫn dùng Intl để tránh tự tính offset thủ công
const MATCH_TOLERANCE_MIN = 2; // dung sai so khớp giờ, phù hợp với cron chạy mỗi 5 phút
const LOG_RETENTION_DAYS = 3;
const CHECK_LOG_RETENTION_DAYS = 90; // đủ dài để xem tỷ lệ hoàn thành nhiều tuần liền
const MAX_INCOMPLETE_LINES = 15; // tránh tin nhắn dài quá giới hạn Telegram
const MAX_SL_MESSAGES_PER_RUN = 20; // chặn trường hợp mở quá nhiều lệnh làm spam Telegram

// Ký tự Braille rỗng (U+2800). Telegram cắt khoảng trắng ở đầu tin nhắn nhưng giữ ký tự này,
// nhờ đó dòng tiêu đề nằm riêng một dòng thay vì dính vào tên bot ở phần xem trước thông báo.
const LEAD = "⠀";

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

// Khuôn tin nhắn chung: dòng trống → tiêu đề → chủ thể được làm nổi bật.
function buildMessage(titleIcon: string, title: string, mark: string, subject: string, extra?: string) {
  const lines = [LEAD, `${titleIcon} ${title}`, `${mark} ${subject} ${mark}`];
  if (extra) lines.push(extra);
  return lines.join("\n");
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

    const [{ data: resourcesRow }, { data: tradesRow }, { data: logRow }, { data: remindersRow }, { data: watchesRow }, { data: mutedRow }, { data: checkLogRow }] = await Promise.all([
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "resources").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "trades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slReminderLog").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "reminders").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "symbolWatches").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "slMutedTrades").maybeSingle(),
      supabase.from("app_data").select("value").eq("user_id", row.user_id).eq("key", "setupCheckLog").maybeSingle(),
    ]);

    const accounts = (resourcesRow?.value?.accounts || []) as { id: string; name: string }[];
    const trades = (tradesRow?.value || []) as {
      id?: string; account?: string; symbol?: string; entryDate?: string; entryTime?: string; exitDate?: string;
      [key: string]: unknown;
    }[];
    const log = (logRow?.value || {}) as Record<string, boolean>;
    const reminders = (remindersRow?.value || []) as {
      id?: string; title?: string; frequency?: string; weekday?: number; dayOfMonth?: number; date?: string;
      active?: boolean; doneDates?: string[]; notifyTelegram?: boolean; notifyTime?: string;
    }[];
    const watches = (watchesRow?.value || []) as {
      id?: string; symbol?: string; note?: string; enabled?: boolean; done?: boolean;
      hours?: string[]; activeDays?: string[]; lastNotifiedAt?: string;
    }[];
    // Lệnh người dùng đã bấm "Kết thúc lệnh" trên Telegram — thật sự đã chạm SL/TP nhưng
    // chưa kịp điền ngày thoát vào nhật ký, nên ngừng nhắc mà không đụng vào bản ghi lệnh.
    let muted = (mutedRow?.value || []) as { tradeId?: string; mutedAt?: string }[];
    const checkLog = (checkLogRow?.value || []) as {
      accountId?: string; accountName?: string; date?: string; hour?: string; checkedAt?: string;
    }[];
    let logChanged = false;
    let watchesChanged = false;
    let mutedChanged = false;
    let checkLogChanged = false;

    // Lệnh đã đóng hoặc đã bị xóa thì không cần giữ trong danh sách tắt nhắc nữa.
    const openTradeIds = new Set(trades.filter((t) => t.entryDate && !t.exitDate && t.id).map((t) => t.id as string));
    const prunedMuted = muted.filter((m) => m.tradeId && openTradeIds.has(m.tradeId));
    if (prunedMuted.length !== muted.length) { muted = prunedMuted; mutedChanged = true; }
    const mutedIds = new Set(muted.map((m) => m.tradeId));

    let slMessages = 0;
    for (const sched of dueSchedules) {
      const account = accounts.find((a) => a.id === sched.accountId);
      const accountName = account ? account.name : sched.accountName;
      if (!accountName) continue;

      const openTrades = trades.filter((t) => t.account === accountName && t.entryDate && !t.exitDate && t.id && !mutedIds.has(t.id));
      if (!openTrades.length) continue;

      const matchedHour = (sched.hours || []).find((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);

      // Mỗi lệnh một tin riêng để nút bấm gắn đúng lệnh — gộp chung thì không biết bấm cho symbol nào.
      for (const t of openTrades) {
        if (slMessages >= MAX_SL_MESSAGES_PER_RUN) break;
        // Giữ vị trí "ngày" ở phần tử thứ 2 của key để logic dọn log cũ bên dưới hoạt động đúng.
        const logKey = `${sched.accountId}_${today}_${matchedHour}_${t.id}`;
        if (log[logKey]) continue; // đã gửi khung giờ này rồi, tránh gửi trùng

        const text = buildMessage("⏰", "DỜI SL", "🔴", t.symbol || "?");
        const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId, {
          inline_keyboard: [[
            { text: "✅ Đã dời", callback_data: `sl|${t.id}|moved` },
            { text: "🏁 Kết thúc lệnh", callback_data: `sl|${t.id}|closed` },
          ]],
        });

        if (ok) {
          log[logKey] = true;
          logChanged = true;
          slMessages++;
          sent++;
        }
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

      const text = buildMessage("🔍", "KIỂM TRA SETUP", "⚡", accountName);
      const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, sched.threadId, {
        inline_keyboard: [[
          { text: "✅ Đã kiểm tra", callback_data: `sc|${sched.accountId}|${today}|${matchedHour}` },
        ]],
      });

      if (ok) {
        log[logKey] = true;
        logChanged = true;
        // Ghi lại lần nhắc này để tính tỷ lệ hoàn thành theo tuần trên web.
        // checkedAt để trống, telegram-webhook sẽ điền khi bấm "Đã kiểm tra".
        checkLog.push({ accountId: sched.accountId, accountName, date: today, hour: matchedHour, checkedAt: "" });
        checkLogChanged = true;
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

      const text = buildMessage("🔔", "NHẮC NHỞ", "📌", r.title || "(không có tiêu đề)");
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
          const text = buildMessage("📝", "LỆNH CHƯA ĐIỀN XONG", "📌", `${pending.length} lệnh dưới 100%`, lines.join("\n"));
          if (await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, inc.threadId)) {
            log[logKey] = true;
            logChanged = true;
            sent++;
          }
        }
      }
    }

    // Symbol theo dõi — nhắc đều đặn theo khung giờ cho tới khi bấm "Ngừng theo dõi".
    if (settings.symbolWatchEnabled && watches.length) {
      for (const w of watches) {
        if (!w.id || !w.enabled || w.done) continue;

        const activeDays = Array.isArray(w.activeDays) ? w.activeDays : null;
        if (activeDays && !activeDays.includes(todayWeekdayCode)) continue;
        const matchedHour = (w.hours || []).find((h) => minutesDiff(h, currentHHMM) <= MATCH_TOLERANCE_MIN);
        if (!matchedHour) continue;
        const logKey = `watch_${today}_${w.id}_${matchedHour}`;
        if (log[logKey]) continue;

        const text = buildMessage("👀", "SYMBOL THEO DÕI", "⭐", w.symbol || "?", w.note || undefined);
        const ok = await sendTelegram(settings.telegramBotToken!, settings.telegramChatId!, text, settings.symbolWatchThreadId, {
          inline_keyboard: [[
            { text: "👀 Tiếp tục theo dõi", callback_data: `w|${w.id}|keep` },
            { text: "🛑 Ngừng theo dõi", callback_data: `w|${w.id}|stop` },
          ]],
        });

        if (ok) {
          w.lastNotifiedAt = new Date().toISOString();
          watchesChanged = true;
          log[logKey] = true;
          logChanged = true;
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

    if (mutedChanged) {
      await supabase.from("app_data").upsert(
        { user_id: row.user_id, key: "slMutedTrades", value: muted, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    }

    if (checkLogChanged) {
      const checkCutoff = vnNowParts(new Date(now.getTime() - CHECK_LOG_RETENTION_DAYS * 24 * 60 * 60000)).date;
      const kept = checkLog.filter((e) => (e.date || "") >= checkCutoff);
      await supabase.from("app_data").upsert(
        { user_id: row.user_id, key: "setupCheckLog", value: kept, updated_at: new Date().toISOString() },
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
