import { useState } from "react";
import { Send, Bell, CheckCircle2, XCircle } from "lucide-react";
import { Field } from "./ui.jsx";
import { emptyReminderSchedule, parseHoursInput, SL_REMINDER_DEFAULT_HOURS, WEEKDAY_CODES } from "../lib/helpers.js";

function AccountScheduleCards({ schedules, resources, onUpdate, onSendTest }) {
  const scheduleFor = (accountId) => schedules.find((sc) => sc.accountId === accountId);
  const toggleDay = (account, sched, day) => {
    const days = sched.activeDays && sched.activeDays.length ? sched.activeDays : [...WEEKDAY_CODES];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    onUpdate(account, { activeDays: next });
  };

  if (resources.accounts.length === 0) {
    return <p className="empty-note">Chưa có tài khoản nào — thêm ở mục Tài khoản trước.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {resources.accounts.map((acc) => {
        const sched = scheduleFor(acc.id) || emptyReminderSchedule(acc.id, acc.name);
        const activeDays = sched.activeDays && sched.activeDays.length ? sched.activeDays : [...WEEKDAY_CODES];
        return (
          <div key={acc.id} className="account-form sl-reminder-card">
            <div className="sl-reminder-row">
              <label className={`checklist-item ${sched.enabled ? "checklist-checked" : ""}`} style={{ minWidth: 200 }}>
                <input type="checkbox" checked={!!sched.enabled} onChange={(e) => onUpdate(acc, { enabled: e.target.checked })} />
                <span>{acc.name}</span>
              </label>
              <input
                className="input input-inline"
                style={{ flex: 1 }}
                defaultValue={(sched.hours && sched.hours.length ? sched.hours : SL_REMINDER_DEFAULT_HOURS).join(", ")}
                placeholder="09:00, 12:00, 15:00, 18:00, 21:00"
                onBlur={(e) => onUpdate(acc, { hours: parseHoursInput(e.target.value) })}
              />
              <input
                className="input input-inline mono"
                style={{ width: 90 }}
                defaultValue={sched.threadId || ""}
                placeholder="Thread ID"
                onBlur={(e) => onUpdate(acc, { threadId: e.target.value.trim() })}
              />
              <button type="button" className="row-btn" title="Gửi thử vào Topic này" onClick={() => onSendTest(sched.threadId)}>
                <Send size={13} />
              </button>
            </div>
            <div className="sl-reminder-days">
              {WEEKDAY_CODES.map((day) => (
                <label key={day} className={`sl-day-chip ${activeDays.includes(day) ? "sl-day-chip-active" : ""}`}>
                  <input type="checkbox" checked={activeDays.includes(day)} onChange={() => toggleDay(acc, sched, day)} />
                  {day}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useTelegramTest(settings, defaultText) {
  const [testState, setTestState] = useState(null); // null | "sending" | "ok" | "error"
  const sendTest = async (threadId, text) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      setTestState("error");
      return;
    }
    setTestState("sending");
    try {
      const body = { chat_id: settings.telegramChatId, text: text || defaultText };
      if (threadId) body.message_thread_id = Number(threadId);
      const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setTestState(res.ok ? "ok" : "error");
    } catch (e) {
      setTestState("error");
    }
    setTimeout(() => setTestState(null), 4000);
  };
  return { testState, sendTest };
}

export function SlReminderPanel({ settings, resources, onChange }) {
  const s = settings;
  const set = (k) => (v) => onChange({ ...s, [k]: v });
  const { testState, sendTest } = useTelegramTest(s, "✅ Kết nối Telegram thành công — nhắc dời SL sẽ gửi vào đây.");

  const updateSchedule = (account, patch) => {
    const exists = s.schedules.find((sc) => sc.accountId === account.id);
    const next = exists
      ? s.schedules.map((sc) => (sc.accountId === account.id ? { ...sc, ...patch } : sc))
      : [...s.schedules, { ...emptyReminderSchedule(account.id, account.name), ...patch }];
    onChange({ ...s, schedules: next });
  };

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Nhắc dời SL qua Telegram</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Khi tài khoản đang có lệnh mở, hệ thống sẽ tự bắn tin nhắn Telegram vào đúng khung giờ bạn đặt bên dưới để nhắc kiểm tra dời SL.
        Việc gửi tin chạy nền trên server (Supabase Edge Function + Cron) nên hoạt động dù bạn không mở web — cần cài đặt 1 lần, xem hướng dẫn cuối trang.
      </p>
      <div className="account-form">
        <button
          type="button"
          className={`lesson-toggle-btn ${s.enabled ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => set("enabled")(!s.enabled)}
        >
          <Bell size={15} /> {s.enabled ? "🔔 Đang bật nhắc dời SL" : "Bật nhắc dời SL (tùy chọn)"}
        </button>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <Field label="Telegram Bot Token" hint="Lấy từ @BotFather trên Telegram">
            <input className="input mono" value={s.telegramBotToken} onChange={(e) => set("telegramBotToken")(e.target.value.trim())} placeholder="123456789:AA...xyz" />
          </Field>
          <Field label="Main Chat ID" hint="ID nhóm/cuộc trò chuyện chính sẽ nhận tin nhắn (Supergroup nếu dùng Topics)">
            <input className="input mono" value={s.telegramChatId} onChange={(e) => set("telegramChatId")(e.target.value.trim())} placeholder="-100123456789" />
          </Field>
        </div>
        <p className="field-hint" style={{ marginTop: 6 }}>Bot Token và Main Chat ID này dùng chung cho mọi loại nhắc nhở qua Telegram trong ứng dụng (nhắc dời SL, kiểm tra setup, nhắc việc chung).</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => sendTest()} disabled={testState === "sending"}>
            <Send size={13} /> {testState === "sending" ? "Đang gửi..." : "Gửi thử (chat chính)"}
          </button>
          {testState === "ok" ? <span className="field-hint" style={{ color: "var(--win)", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> Đã gửi, kiểm tra Telegram</span> : null}
          {testState === "error" ? <span className="field-hint" style={{ color: "var(--loss)", display: "flex", alignItems: "center", gap: 4 }}><XCircle size={13} /> Gửi thất bại — kiểm tra lại Token/Chat ID</span> : null}
        </div>
      </div>

      <h3 className="block-title">Lịch nhắc theo tài khoản</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Chọn tài khoản cần nhắc, các khung giờ trong ngày (định dạng HH:mm, giờ Việt Nam, cách nhau bằng dấu phẩy), Topic (Thread ID) nếu nhóm Telegram có chia Topics riêng, và các ngày trong tuần được phép nhắc (VD bỏ T7/CN cho tài khoản Forex nghỉ cuối tuần). Chỉ gửi tin khi tài khoản đó đang có lệnh chưa đóng.
      </p>
      <AccountScheduleCards schedules={s.schedules} resources={resources} onUpdate={updateSchedule} onSendTest={(threadId) => sendTest(threadId)} />

      <details style={{ marginTop: 18 }}>
        <summary className="field-hint" style={{ cursor: "pointer", color: "var(--accent)" }}>Hướng dẫn kích hoạt gửi nền (làm 1 lần trong Supabase Dashboard)</summary>
        <ol className="field-hint" style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Deploy function <code>supabase/functions/sl-reminder</code> (đã có sẵn trong repo) bằng Supabase CLI: <code>supabase functions deploy sl-reminder</code>.</li>
          <li>Vào Supabase Dashboard → Database → Extensions, bật <code>pg_cron</code> và <code>pg_net</code>.</li>
          <li>Chạy file <code>supabase-sl-reminder-cron.sql</code> (đã có sẵn trong repo) trong SQL Editor để tạo cron job gọi function mỗi 5 phút.</li>
          <li>Điền Bot Token + Main Chat ID ở trên, bật lịch cho tài khoản cần theo dõi, điền Thread ID nếu nhóm có chia Topics, bấm nút gửi thử để xác nhận đúng chỗ.</li>
        </ol>
        <p className="field-hint" style={{ marginTop: 8 }}>
          Khung giờ bạn nhập luôn được hiểu theo giờ Việt Nam (Asia/Ho_Chi_Minh) — Edge Function tự quy đổi giờ máy chủ (UTC) sang giờ VN trước khi so khớp, nên nhập "09:00" là đúng 9 giờ sáng VN.
        </p>
      </details>
    </div>
  );
}

export function SetupCheckPanel({ settings, resources, onChange }) {
  const s = settings;
  const set = (k) => (v) => onChange({ ...s, [k]: v });
  const telegramReady = !!(s.telegramBotToken && s.telegramChatId);
  const { testState, sendTest } = useTelegramTest(s, "✅ Kết nối Telegram thành công — nhắc kiểm tra setup sẽ gửi vào đây.");
  const setupCheckSchedules = s.setupCheckSchedules || [];

  const updateSchedule = (account, patch) => {
    const exists = setupCheckSchedules.find((sc) => sc.accountId === account.id);
    const next = exists
      ? setupCheckSchedules.map((sc) => (sc.accountId === account.id ? { ...sc, ...patch } : sc))
      : [...setupCheckSchedules, { ...emptyReminderSchedule(account.id, account.name), ...patch }];
    onChange({ ...s, setupCheckSchedules: next });
  };

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Nhắc kiểm tra setup qua Telegram</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Hay bị miss setup vì không kịp theo dõi? Vào đúng khung giờ bạn đặt bên dưới, hệ thống sẽ bắn tin nhắc kiểm tra setup theo từng tài khoản —
        không phụ thuộc lệnh đang mở hay đóng, chỉ đơn giản là lời nhắc "tới giờ ngồi soi bảng giá".
      </p>
      {!telegramReady ? (
        <p className="field-hint" style={{ color: "var(--loss)", marginBottom: 12 }}>
          Chưa cấu hình Bot Token / Chat ID — điền ở tab "Nhắc dời SL" trước (dùng chung cho mọi loại nhắc nhở Telegram).
        </p>
      ) : null}
      <div className="account-form">
        <button
          type="button"
          className={`lesson-toggle-btn ${s.setupCheckEnabled ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => set("setupCheckEnabled")(!s.setupCheckEnabled)}
        >
          <Bell size={15} /> {s.setupCheckEnabled ? "🔔 Đang bật nhắc kiểm tra setup" : "Bật nhắc kiểm tra setup (tùy chọn)"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => sendTest()} disabled={testState === "sending" || !telegramReady}>
            <Send size={13} /> {testState === "sending" ? "Đang gửi..." : "Gửi thử (chat chính)"}
          </button>
          {testState === "ok" ? <span className="field-hint" style={{ color: "var(--win)", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> Đã gửi, kiểm tra Telegram</span> : null}
          {testState === "error" ? <span className="field-hint" style={{ color: "var(--loss)", display: "flex", alignItems: "center", gap: 4 }}><XCircle size={13} /> Gửi thất bại — kiểm tra lại Token/Chat ID</span> : null}
        </div>
      </div>

      <h3 className="block-title">Lịch nhắc theo tài khoản</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Chọn tài khoản cần nhắc, khung giờ trong ngày (HH:mm, giờ Việt Nam, cách nhau bằng dấu phẩy), Topic (Thread ID) nếu cần, và ngày trong tuần được phép nhắc.
      </p>
      <AccountScheduleCards schedules={setupCheckSchedules} resources={resources} onUpdate={updateSchedule} onSendTest={(threadId) => sendTest(threadId)} />
    </div>
  );
}
