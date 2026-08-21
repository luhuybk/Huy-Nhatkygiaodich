import { useState, useMemo } from "react";
import { PlusCircle, Pencil, Check, Bell, BellRing, Clock, Send, Search, Eye, CalendarClock } from "lucide-react";
import { ConfirmButton, Field, useStickyTab } from "./ui.jsx";
import { REMINDER_FREQS, WEEKDAY_LABEL, WEEKDAY_ORDER } from "../lib/constants.js";
import { buildWeekTimeline, emptyReminder, openTradeCounter, reminderDueToday, reminderScheduleLabel, symbolWatchActiveCount, todayStr, uid } from "../lib/helpers.js";
import { SlReminderPanel, SetupCheckPanel, SymbolWatchPanel } from "./SlReminders.jsx";
import { TimelinePanel } from "./Timeline.jsx";

export function ReminderForm({ initial, onSave, onCancel, telegramReady }) {
  const [r, setR] = useState(initial || emptyReminder());
  const [error, setError] = useState("");
  const set = (k) => (v) => setR((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!r.title.trim()) { setError("Nhập nội dung nhắc nhở."); return; }
    if (r.frequency === "once" && !r.date) { setError("Chọn ngày cụ thể."); return; }
    setError("");
    onSave({ ...r, id: r.id || uid() });
  };
  return (
    <div className="reminder-form">
      <Field label="Nội dung nhắc nhở">
        <input className="input" value={r.title} onChange={(e) => set("title")(e.target.value)} placeholder="VD: Cập nhật đường cong vốn" />
      </Field>
      <div className="grid-2">
        <Field label="Tần suất">
          <select className="input" value={r.frequency} onChange={(e) => set("frequency")(e.target.value)}>
            {REMINDER_FREQS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
        {r.frequency === "weekly" ? (
          <Field label="Vào thứ">
            <select className="input" value={r.weekday} onChange={(e) => set("weekday")(Number(e.target.value))}>
              {WEEKDAY_ORDER.map((w) => <option key={w} value={w}>{WEEKDAY_LABEL[w]}</option>)}
            </select>
          </Field>
        ) : r.frequency === "monthly" ? (
          <Field label="Vào ngày (trong tháng)">
            <select className="input" value={r.dayOfMonth} onChange={(e) => set("dayOfMonth")(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Ngày cụ thể">
            <input type="date" className="input" value={r.date} onChange={(e) => set("date")(e.target.value)} />
          </Field>
        )}
      </div>
      <label className={`checklist-item ${r.notifyTelegram ? "checklist-checked" : ""}`} style={{ marginTop: 4 }}>
        <input type="checkbox" checked={!!r.notifyTelegram} onChange={(e) => set("notifyTelegram")(e.target.checked)} />
        <span>Nhắc qua Telegram vào ngày đến hạn</span>
      </label>
      {r.notifyTelegram ? (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <Field label="Giờ nhắc (giờ Việt Nam)">
            <input type="time" className="input" value={r.notifyTime || "08:00"} onChange={(e) => set("notifyTime")(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {r.notifyTelegram && !telegramReady ? (
        <p className="field-hint" style={{ color: "var(--loss)" }}>Chưa cấu hình Bot Token / Chat ID ở tab "Nhắc dời SL" — điền trước để tin nhắn gửi được.</p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={submit}>{r.id ? "Cập nhật" : "Thêm nhắc nhở"}</button>
      </div>
    </div>
  );
}

export function ReminderBell({ reminders, onOpen }) {
  const ts = todayStr();
  const dueList = useMemo(() => reminders.filter((r) => reminderDueToday(r, ts)), [reminders, ts]);

  return (
    <button
      type="button"
      className={`bell-btn ${dueList.length ? "bell-btn-active" : ""}`}
      onClick={onOpen}
      title={dueList.length ? `${dueList.length} thông báo cần làm hôm nay` : "Thông báo"}
    >
      {dueList.length ? <BellRing size={17} /> : <Bell size={17} />}
      {dueList.length ? <span className="bell-badge">{dueList.length}</span> : null}
    </button>
  );
}

export function RemindersPage({ reminders, onChange, resources, slReminderSettings, onSlReminderSettingsChange, symbolWatches, onSymbolWatchesChange, trades, setupCheckLog, slMutedTrades, onSlMutedTradesChange }) {
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useStickyTab("remindersTab", "today", ["today", "all", "sl", "setupcheck", "symbolwatch", "timeline"]);
  const ts = todayStr();
  const dueList = useMemo(() => reminders.filter((r) => reminderDueToday(r, ts)), [reminders, ts]);
  const list = tab === "today" ? dueList : reminders;
  const telegramReady = !!(slReminderSettings.telegramBotToken && slReminderSettings.telegramChatId);
  const activeWatchCount = symbolWatchActiveCount(symbolWatches);
  // Số việc bị chồng giờ trong tuần — hiện luôn trên nhãn tab để không phải mở ra mới biết.
  const openTrades = useMemo(
    () => openTradeCounter({ accounts: resources.accounts, trades, mutedTrades: slMutedTrades }),
    [resources.accounts, trades, slMutedTrades]
  );
  const weekConflicts = useMemo(
    () => buildWeekTimeline({ settings: slReminderSettings, watches: symbolWatches, reminders, durations: slReminderSettings.taskDurations, openTrades })
      .reduce((n, d) => n + d.load.conflicts, 0),
    [slReminderSettings, symbolWatches, reminders, openTrades]
  );

  const markDone = (r) => {
    onChange(reminders.map((x) => (x.id === r.id ? { ...x, doneDates: [...(x.doneDates || []), ts] } : x)));
  };
  const saveReminder = (r) => {
    const exists = reminders.some((x) => x.id === r.id);
    onChange(exists ? reminders.map((x) => (x.id === r.id ? r : x)) : [...reminders, r]);
    setEditing(null);
  };
  const removeReminder = (id) => onChange(reminders.filter((x) => x.id !== id));

  if (editing) {
    return (
      <div className="reminders-page">
        <div className="reminders-page-head">
          <h2 style={{ fontSize: 19 }}>{editing.id ? "Sửa nhắc nhở" : "Nhắc nhở mới"}</h2>
        </div>
        <ReminderForm initial={editing.id ? editing : null} onSave={saveReminder} onCancel={() => setEditing(null)} telegramReady={telegramReady} />
      </div>
    );
  }

  return (
    <div className="reminders-page">
      <div className="reminders-page-head">
        <h2 style={{ fontSize: 19 }}>Thông báo &amp; nhắc nhở</h2>
        {tab === "today" || tab === "all" ? (
          <button type="button" className="btn btn-primary" onClick={() => setEditing(emptyReminder())}>
            <PlusCircle size={15} /> Thêm nhắc nhở
          </button>
        ) : null}
      </div>
      <div className="subtabs">
        <button className={`subtab ${tab === "today" ? "subtab-active" : ""}`} onClick={() => setTab("today")}>
          Hôm nay {dueList.length ? <span className="subtab-badge">{dueList.length}</span> : null}
        </button>
        <button className={`subtab ${tab === "all" ? "subtab-active" : ""}`} onClick={() => setTab("all")}>Tất cả</button>
        <button className={`subtab ${tab === "sl" ? "subtab-active" : ""}`} onClick={() => setTab("sl")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Send size={12} /> Nhắc dời SL</span>
        </button>
        <button className={`subtab ${tab === "setupcheck" ? "subtab-active" : ""}`} onClick={() => setTab("setupcheck")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Search size={12} /> Kiểm tra setup</span>
        </button>
        <button className={`subtab ${tab === "symbolwatch" ? "subtab-active" : ""}`} onClick={() => setTab("symbolwatch")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Eye size={12} /> Symbol theo dõi
            {activeWatchCount ? <span className="subtab-badge">{activeWatchCount}</span> : null}
          </span>
        </button>
        <button className={`subtab ${tab === "timeline" ? "subtab-active" : ""}`} onClick={() => setTab("timeline")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CalendarClock size={12} /> Timeline làm việc
            {weekConflicts ? <span className="subtab-badge subtab-badge-warn">{weekConflicts}</span> : null}
          </span>
        </button>
      </div>
      {tab === "sl" ? (
        <SlReminderPanel settings={slReminderSettings} resources={resources} onChange={onSlReminderSettingsChange}
          trades={trades} mutedTrades={slMutedTrades} onMutedTradesChange={onSlMutedTradesChange} />
      ) : tab === "setupcheck" ? (
        <SetupCheckPanel settings={slReminderSettings} resources={resources} onChange={onSlReminderSettingsChange} checkLog={setupCheckLog} />
      ) : tab === "symbolwatch" ? (
        <SymbolWatchPanel settings={slReminderSettings} watches={symbolWatches} onSettingsChange={onSlReminderSettingsChange} onWatchesChange={onSymbolWatchesChange} />
      ) : tab === "timeline" ? (
        <TimelinePanel settings={slReminderSettings} watches={symbolWatches} reminders={reminders}
          accounts={resources.accounts} trades={trades} mutedTrades={slMutedTrades}
          onSettingsChange={onSlReminderSettingsChange} onWatchesChange={onSymbolWatchesChange} onRemindersChange={onChange} />
      ) : (
      <div className="reminder-list">
        {list.length === 0 ? (
          <p className="empty-note" style={{ padding: "16px 0" }}>
            {tab === "today" ? "Không có việc gì cần làm hôm nay." : "Chưa có nhắc nhở nào — bấm \"Thêm nhắc nhở\" để tạo mới."}
          </p>
        ) : list.map((r) => {
          const isDue = reminderDueToday(r, ts);
          return (
            <div key={r.id} className={`reminder-item ${isDue ? "reminder-item-due" : ""}`}>
              <div className="reminder-item-main">
                <Clock size={14} color="var(--text-dim)" />
                <div>
                  <div className="reminder-item-title">{r.title}</div>
                  <div className="reminder-item-sub">
                    {reminderScheduleLabel(r)}{r.active ? "" : " · Tạm tắt"}
                    {r.notifyTelegram ? <span className="watch-badge" style={{ marginLeft: 6 }}><Send size={10} /> Telegram {r.notifyTime || "08:00"}</span> : null}
                  </div>
                </div>
              </div>
              <div className="reminder-item-actions">
                {isDue ? <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => markDone(r)}><Check size={13} /> Đã làm</button> : null}
                <button type="button" className="row-btn" onClick={() => setEditing(r)}><Pencil size={13} /></button>
                <ConfirmButton onConfirm={() => removeReminder(r.id)} />
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
