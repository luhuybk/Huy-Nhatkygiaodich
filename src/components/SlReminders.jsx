import { useState } from "react";
import { Send, Bell, CheckCircle2, XCircle } from "lucide-react";
import { Field } from "./ui.jsx";
import { emptyReminderSchedule, parseHoursInput, SL_REMINDER_DEFAULT_HOURS } from "../lib/helpers.js";

export function SlReminderPanel({ settings, resources, onChange }) {
  const [testState, setTestState] = useState(null); // null | "sending" | "ok" | "error"
  const s = settings;
  const set = (k) => (v) => onChange({ ...s, [k]: v });

  const scheduleFor = (accountId) => s.schedules.find((sc) => sc.accountId === accountId);
  const updateSchedule = (account, patch) => {
    const exists = scheduleFor(account.id);
    const next = exists
      ? s.schedules.map((sc) => (sc.accountId === account.id ? { ...sc, ...patch } : sc))
      : [...s.schedules, { ...emptyReminderSchedule(account.id, account.name), ...patch }];
    onChange({ ...s, schedules: next });
  };

  const sendTest = async (threadId) => {
    if (!s.telegramBotToken || !s.telegramChatId) {
      setTestState("error");
      return;
    }
    setTestState("sending");
    try {
      const body = { chat_id: s.telegramChatId, text: "✅ Kết nối Telegram thành công — nhắc dời SL sẽ gửi vào đây." };
      if (threadId) body.message_thread_id = Number(threadId);
      const res = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
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
        Chọn tài khoản cần nhắc, các khung giờ trong ngày (định dạng HH:mm, giờ Việt Nam, cách nhau bằng dấu phẩy) và Topic (Thread ID) nếu nhóm Telegram có chia Topics riêng cho từng tài khoản. Chỉ gửi tin khi tài khoản đó đang có lệnh chưa đóng.
      </p>
      {resources.accounts.length === 0 ? (
        <p className="empty-note">Chưa có tài khoản nào — thêm ở mục Tài khoản trước.</p>
      ) : (
        <div className="account-form" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="sl-reminder-row sl-reminder-row-head">
            <span className="field-hint" style={{ minWidth: 200, margin: 0 }}>Tài khoản</span>
            <span className="field-hint" style={{ flex: 1, margin: 0 }}>Khung giờ (HH:mm, giờ VN)</span>
            <span className="field-hint" style={{ width: 110, margin: 0 }}>Thread ID</span>
            <span style={{ width: 32 }} />
          </div>
          {resources.accounts.map((acc) => {
            const sched = scheduleFor(acc.id) || emptyReminderSchedule(acc.id, acc.name);
            return (
              <div key={acc.id} className="sl-reminder-row">
                <label className={`checklist-item ${sched.enabled ? "checklist-checked" : ""}`} style={{ minWidth: 200 }}>
                  <input type="checkbox" checked={!!sched.enabled} onChange={(e) => updateSchedule(acc, { enabled: e.target.checked })} />
                  <span>{acc.name}</span>
                </label>
                <input
                  className="input input-inline"
                  style={{ flex: 1 }}
                  defaultValue={(sched.hours && sched.hours.length ? sched.hours : SL_REMINDER_DEFAULT_HOURS).join(", ")}
                  placeholder="09:00, 12:00, 15:00, 18:00, 21:00"
                  onBlur={(e) => updateSchedule(acc, { hours: parseHoursInput(e.target.value) })}
                />
                <input
                  className="input input-inline mono"
                  style={{ width: 110 }}
                  defaultValue={sched.threadId || ""}
                  placeholder="VD: 2"
                  onBlur={(e) => updateSchedule(acc, { threadId: e.target.value.trim() })}
                />
                <button
                  type="button"
                  className="row-btn"
                  title="Gửi thử vào Topic này"
                  onClick={() => sendTest(sched.threadId)}
                >
                  <Send size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

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
