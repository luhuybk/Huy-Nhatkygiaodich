import { useMemo, useState } from "react";
import { Send, Bell, CheckCircle2, XCircle, Eye, PlusCircle } from "lucide-react";
import { ConfirmButton, Field, StatCard } from "./ui.jsx";
import {
  emptyIncompleteReminder, emptyReminderSchedule, emptySymbolWatch, mergeSymbolList, parseHoursInput,
  parseSymbolList, setupCheckStats, setupCheckStreak, symbolWatchText,
  SL_REMINDER_DEFAULT_HOURS, SYMBOL_WATCH_DEFAULT_HOURS, WEEKDAY_CODES,
} from "../lib/helpers.js";

const WEEKDAY_FULL_LABEL = { T2: "Thứ 2", T3: "Thứ 3", T4: "Thứ 4", T5: "Thứ 5", T6: "Thứ 6", T7: "Thứ 7", CN: "Chủ nhật" };

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

export function SlReminderPanel({ settings, resources, onChange, trades, mutedTrades, onMutedTradesChange }) {
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

  const muted = mutedTrades || [];
  const mutedList = useMemo(
    () => muted.map((m) => ({ ...m, trade: (trades || []).find((t) => t.id === m.tradeId) })),
    [muted, trades]
  );
  const unmute = (tradeId) => onMutedTradesChange(muted.filter((m) => m.tradeId !== tradeId));

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Nhắc dời SL qua Telegram</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Khi tài khoản đang có lệnh mở, hệ thống sẽ tự bắn tin nhắn Telegram vào đúng khung giờ bạn đặt bên dưới để nhắc kiểm tra dời SL.
        <b> Mỗi symbol một tin riêng</b>, kèm 2 nút: <b>Đã dời</b> (vẫn nhắc tiếp ở khung giờ sau) và <b>Kết thúc lệnh</b> (ngừng nhắc lệnh đó — dùng khi lệnh đã chạm SL/TP mà bạn chưa kịp ghi nhật ký).
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

      <h3 className="block-title">Lệnh đang tắt nhắc</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Các lệnh bạn đã bấm "Kết thúc lệnh" trên Telegram. Lệnh vẫn nguyên trong Nhật ký, chỉ là không nhắc dời SL nữa —
        bấm "Nhắc lại" nếu lỡ tay. Khi bạn điền ngày thoát cho lệnh, nó tự rời khỏi danh sách này.
      </p>
      {mutedList.length === 0 ? (
        <p className="empty-note">Không có lệnh nào đang tắt nhắc.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mutedList.map((m) => (
            <div key={m.tradeId} className="backup-row">
              <span style={{ fontWeight: 600 }}>{m.trade ? (m.trade.symbol || "?") : "(lệnh không còn)"}</span>
              <span className="field-hint" style={{ flex: 1 }}>
                {m.trade ? `${m.trade.account || ""} · vào lệnh ${m.trade.entryDate || "—"}` : "Lệnh đã bị xóa hoặc đã đóng"}
                {m.mutedAt ? ` · tắt lúc ${new Date(m.mutedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}
              </span>
              <button type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => unmute(m.tradeId)}>
                <Bell size={13} /> Nhắc lại
              </button>
            </div>
          ))}
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

export function SetupCheckPanel({ settings, resources, onChange, checkLog }) {
  const s = settings;
  const set = (k) => (v) => onChange({ ...s, [k]: v });
  const telegramReady = !!(s.telegramBotToken && s.telegramChatId);
  const { testState, sendTest } = useTelegramTest(s, "✅ Kết nối Telegram thành công — nhắc kiểm tra setup sẽ gửi vào đây.");
  const setupCheckSchedules = s.setupCheckSchedules || [];
  const inc = { ...emptyIncompleteReminder(), ...(s.incompleteReminder || {}) };
  const setInc = (patch) => onChange({ ...s, incompleteReminder: { ...inc, ...patch } });

  const week = useMemo(() => setupCheckStats(checkLog, 7), [checkLog]);
  const month = useMemo(() => setupCheckStats(checkLog, 30), [checkLog]);
  const streak = useMemo(() => setupCheckStreak(checkLog), [checkLog]);

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

      <h3 className="block-title">Tỷ lệ hoàn thành</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mỗi tin nhắc kiểm tra setup có nút <b>Đã kiểm tra</b>. Bấm nút đó là một lần hoàn thành —
        phần trăm bên dưới cho biết bạn thực sự ngồi soi bảng giá được bao nhiêu trên tổng số lần được nhắc.
        <b> Chuỗi</b> chỉ cộng thêm khi một ngày bấm đủ mọi lần nhắc, và chỉ đếm những ngày có lịch nhắc —
        nên cuối tuần tắt lịch không làm đứt chuỗi.
      </p>
      {week.total === 0 && month.total === 0 ? (
        <p className="empty-note">Chưa có lần nhắc nào được ghi nhận — số liệu sẽ xuất hiện sau lần nhắc đầu tiên.</p>
      ) : (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <StatCard
              label="Chuỗi hiện tại"
              value={`${streak.current} ngày`}
              tone={streak.current > 0 ? "win" : ""}
              sub={streak.todayDone === false ? "hôm nay còn lần chưa bấm" : streak.todayDone ? "hôm nay đã đủ" : "hôm nay chưa có lịch nhắc"}
            />
            <StatCard label="Kỷ lục" value={`${streak.best} ngày`} sub="chuỗi dài nhất từ trước tới nay" />
            <StatCard label="Bỏ lỡ 7 ngày" value={week.total - week.done} sub="lần chưa bấm" />
            <StatCard label="7 ngày qua" value={week.percent === null ? "—" : `${week.percent}%`} sub={`${week.done}/${week.total} lần`} />
            <StatCard label="30 ngày qua" value={month.percent === null ? "—" : `${month.percent}%`} sub={`${month.done}/${month.total} lần`} />
          </div>
          {week.accounts.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {week.accounts.map((a) => {
                const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
                return (
                  <div key={a.name} className="backup-row">
                    <span style={{ fontWeight: 600, minWidth: 120 }}>{a.name}</span>
                    <div className="completion-bar-track" style={{ flex: 1 }}>
                      <div className="completion-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="mono field-hint">{a.done}/{a.total} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      <h3 className="block-title">Nhắc điền nốt lệnh chưa hoàn thành</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mỗi tuần một lần, liệt kê các lệnh có Tiến độ dưới 100% trong Nhật ký để bạn điền cho đủ trước khi quên mất bối cảnh.
      </p>
      <div className="account-form">
        <button
          type="button"
          className={`lesson-toggle-btn ${inc.enabled ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => setInc({ enabled: !inc.enabled })}
        >
          <Bell size={15} /> {inc.enabled ? "🔔 Đang bật nhắc điền nốt lệnh" : "Bật nhắc điền nốt lệnh (tùy chọn)"}
        </button>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <Field label="Vào thứ">
            <select className="input" value={inc.weekday} onChange={(e) => setInc({ weekday: e.target.value })}>
              {WEEKDAY_CODES.map((d) => <option key={d} value={d}>{WEEKDAY_FULL_LABEL[d]}</option>)}
            </select>
          </Field>
          <Field label="Giờ nhắc (giờ Việt Nam)">
            <input type="time" className="input" value={inc.time || "20:00"} onChange={(e) => setInc({ time: e.target.value })} />
          </Field>
          <Field label="Topic (Thread ID)" hint="Bỏ trống nếu gửi vào chat chính">
            <input className="input mono" defaultValue={inc.threadId || ""} placeholder="Thread ID" onBlur={(e) => setInc({ threadId: e.target.value.trim() })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function SymbolWatchPanel({ settings, watches, onSettingsChange, onWatchesChange }) {
  const [draft, setDraft] = useState({ label: "", symbols: "", note: "", hours: SYMBOL_WATCH_DEFAULT_HOURS.join(", ") });
  const s = settings;
  const telegramReady = !!(s.telegramBotToken && s.telegramChatId);
  const { testState, sendTest } = useTelegramTest(s, "✅ Kết nối Telegram thành công — cảnh báo symbol theo dõi sẽ gửi vào đây.");

  const updateWatch = (id, patch) => onWatchesChange(watches.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const removeWatch = (id) => onWatchesChange(watches.filter((w) => w.id !== id));
  const addWatch = () => {
    const symbols = mergeSymbolList(draft.symbols, []);
    if (!symbols.length) return;
    const hours = parseHoursInput(draft.hours);
    onWatchesChange([...watches, {
      ...emptySymbolWatch(),
      label: draft.label.trim(),
      note: draft.note.trim(),
      symbols,
      hours: hours.length ? hours : [...SYMBOL_WATCH_DEFAULT_HOURS],
    }]);
    setDraft({ label: "", symbols: "", note: "", hours: SYMBOL_WATCH_DEFAULT_HOURS.join(", ") });
  };
  const toggleDay = (w, day) => {
    const days = w.activeDays && w.activeDays.length ? w.activeDays : [...WEEKDAY_CODES];
    updateWatch(w.id, { activeDays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  };
  const toggleSymbol = (w, symId) => {
    updateWatch(w.id, { symbols: (w.symbols || []).map((x) => (x.id === symId ? { ...x, done: !x.done } : x)) });
  };

  return (
    <div>
      <h3 className="block-title" style={{ marginTop: 0 }}>Symbol theo dõi</h3>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mỗi nhóm là <b>một khung giờ nhắc dùng chung cho nhiều symbol</b> — thường đặt theo timeframe (H4, khung ngày),
        nhưng dùng cho watchlist hay phiên giao dịch đều được. Đến giờ, mỗi symbol trong nhóm được gửi thành
        <b> một tin Telegram riêng</b> kèm 2 nút: <b>Tiếp tục theo dõi</b> (nhắc lại ở khung giờ kế tiếp) và
        <b> Ngừng theo dõi</b> (chỉ tắt riêng symbol đó, các symbol còn lại vẫn nhắc bình thường).
      </p>
      {!telegramReady ? (
        <p className="field-hint" style={{ color: "var(--loss)", marginBottom: 12 }}>
          Chưa cấu hình Bot Token / Chat ID — điền ở tab "Nhắc dời SL" trước (dùng chung cho mọi loại nhắc nhở Telegram).
        </p>
      ) : null}
      <div className="account-form">
        <button
          type="button"
          className={`lesson-toggle-btn ${s.symbolWatchEnabled ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
          onClick={() => onSettingsChange({ ...s, symbolWatchEnabled: !s.symbolWatchEnabled })}
        >
          <Eye size={15} /> {s.symbolWatchEnabled ? "🔔 Đang bật cảnh báo symbol theo dõi" : "Bật cảnh báo symbol theo dõi (tùy chọn)"}
        </button>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <Field label="Topic (Thread ID)" hint="Bỏ trống nếu gửi vào chat chính">
            <input className="input mono" defaultValue={s.symbolWatchThreadId || ""} placeholder="Thread ID"
              onBlur={(e) => onSettingsChange({ ...s, symbolWatchThreadId: e.target.value.trim() })} />
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => sendTest(s.symbolWatchThreadId)} disabled={testState === "sending" || !telegramReady}>
            <Send size={13} /> {testState === "sending" ? "Đang gửi..." : "Gửi thử"}
          </button>
          {testState === "ok" ? <span className="field-hint" style={{ color: "var(--win)", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> Đã gửi, kiểm tra Telegram</span> : null}
          {testState === "error" ? <span className="field-hint" style={{ color: "var(--loss)", display: "flex", alignItems: "center", gap: 4 }}><XCircle size={13} /> Gửi thất bại — kiểm tra lại Token/Chat ID</span> : null}
        </div>
      </div>

      <h3 className="block-title">Thêm nhóm theo dõi</h3>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Tên nhóm" hint="VD: H4, Khung ngày, Watchlist sáng">
            <input className="input" value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} placeholder="H4" />
          </Field>
          <Field label="Khung giờ nhắc" hint="HH:mm, giờ Việt Nam, cách nhau bằng dấu phẩy">
            <input className="input" value={draft.hours} onChange={(e) => setDraft((p) => ({ ...p, hours: e.target.value }))} placeholder="09:00, 14:00, 20:00" />
          </Field>
        </div>
        <Field label="Các symbol" hint="Cách nhau bằng dấu phẩy — mỗi symbol sẽ là một tin nhắn riêng khi tới giờ">
          <input className="input" value={draft.symbols} onChange={(e) => setDraft((p) => ({ ...p, symbols: e.target.value }))}
            placeholder="XAUUSD, EURUSD, GBPJPY" onKeyDown={(e) => { if (e.key === "Enter") addWatch(); }} />
        </Field>
        <Field label="Ghi chú (tùy chọn)" hint="Gửi kèm trong mọi tin của nhóm này">
          <input className="input" value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} placeholder="Đang chờ gì ở nhóm này?" />
        </Field>
        <div className="form-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={addWatch} disabled={!parseSymbolList(draft.symbols).length}>
            <PlusCircle size={14} /> Thêm nhóm
          </button>
        </div>
      </div>

      <h3 className="block-title">Các nhóm đang theo dõi</h3>
      {watches.length === 0 ? (
        <p className="empty-note">Chưa có nhóm nào — thêm ở trên để bắt đầu nhận cảnh báo.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {watches.map((w) => {
            const activeDays = w.activeDays && w.activeDays.length ? w.activeDays : [...WEEKDAY_CODES];
            const symbols = w.symbols || [];
            const remaining = symbols.filter((x) => !x.done).length;
            return (
              <div key={w.id} className={`account-form sl-reminder-card ${remaining === 0 ? "symbol-watch-done" : ""}`}>
                <div className="sl-reminder-row">
                  <label className={`checklist-item ${w.enabled ? "checklist-checked" : ""}`} style={{ flex: "0 0 auto" }}
                    title={w.enabled ? "Đang bật cảnh báo" : "Đang tắt cảnh báo"}>
                    <input type="checkbox" checked={!!w.enabled} onChange={(e) => updateWatch(w.id, { enabled: e.target.checked })} />
                  </label>
                  <input className="input input-inline" style={{ width: 132, fontWeight: 600 }} defaultValue={w.label || ""}
                    placeholder="Tên nhóm" title="Bấm để sửa tên nhóm"
                    onBlur={(e) => updateWatch(w.id, { label: e.target.value.trim() })} />
                  <input className="input input-inline" style={{ flex: 1, minWidth: 140 }} defaultValue={w.note || ""} placeholder="Ghi chú"
                    onBlur={(e) => updateWatch(w.id, { note: e.target.value })} />
                  <input className="input input-inline" style={{ flex: 1, minWidth: 150 }}
                    defaultValue={(w.hours && w.hours.length ? w.hours : SYMBOL_WATCH_DEFAULT_HOURS).join(", ")}
                    placeholder="09:00, 14:00, 20:00"
                    onBlur={(e) => updateWatch(w.id, { hours: parseHoursInput(e.target.value) })} />
                  <ConfirmButton onConfirm={() => removeWatch(w.id)} />
                </div>

                {/* Sửa cả danh sách bằng một ô chữ; bấm từng chip để bật/tắt riêng một symbol. */}
                <input className="input input-inline" style={{ width: "100%", marginTop: 8 }}
                  defaultValue={symbolWatchText(w)} placeholder="XAUUSD, EURUSD, GBPJPY"
                  title="Danh sách symbol, cách nhau bằng dấu phẩy"
                  onBlur={(e) => {
                    const next = mergeSymbolList(e.target.value, symbols);
                    if (!next.length) { e.target.value = symbolWatchText(w); return; }
                    e.target.value = next.map((x) => x.name).join(", ");
                    updateWatch(w.id, { symbols: next });
                  }} />
                {symbols.length ? (
                  <div className="watch-symbol-chips">
                    {symbols.map((x) => (
                      <button key={x.id} type="button"
                        className={`watch-symbol-chip ${x.done ? "watch-symbol-chip-done" : ""}`}
                        title={x.done ? "Đã ngừng theo dõi — bấm để theo dõi lại" : "Đang theo dõi — bấm để ngừng"}
                        onClick={() => toggleSymbol(w, x.id)}>
                        {x.done ? <CheckCircle2 size={11} /> : <Eye size={11} />} {x.name}
                      </button>
                    ))}
                    <span className="field-hint" style={{ marginLeft: 4 }}>
                      {remaining === 0 ? "Cả nhóm đã ngừng theo dõi" : `${remaining}/${symbols.length} symbol đang theo dõi`}
                    </span>
                  </div>
                ) : null}

                <div className="sl-reminder-days">
                  {WEEKDAY_CODES.map((day) => (
                    <label key={day} className={`sl-day-chip ${activeDays.includes(day) ? "sl-day-chip-active" : ""}`}>
                      <input type="checkbox" checked={activeDays.includes(day)} onChange={() => toggleDay(w, day)} />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details style={{ marginTop: 18 }}>
        <summary className="field-hint" style={{ cursor: "pointer", color: "var(--accent)" }}>Bật các nút bấm trong tin nhắn Telegram (làm 1 lần)</summary>
        <ol className="field-hint" style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Deploy function xử lý nút bấm: <code>supabase functions deploy telegram-webhook --no-verify-jwt</code>.</li>
          <li>Trỏ Telegram vào function đó bằng cách mở đường dẫn sau trên trình duyệt (thay <code>&lt;BOT_TOKEN&gt;</code> bằng token của bạn):<br />
            <code>https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/setWebhook?url=https://&lt;PROJECT_REF&gt;.supabase.co/functions/v1/telegram-webhook</code>
          </li>
          <li>Xong — từ giờ mọi nút bấm trong Telegram (Tiếp tục / Ngừng theo dõi, Đã kiểm tra, Đã dời / Kết thúc lệnh) sẽ tự cập nhật vào ứng dụng.</li>
        </ol>
        <p className="field-hint" style={{ marginTop: 8 }}>
          Nếu chưa làm bước này thì tin nhắn vẫn gửi bình thường, chỉ là bấm nút sẽ không có tác dụng — bạn vẫn bật/tắt thủ công được ở danh sách trên.
        </p>
      </details>
    </div>
  );
}
