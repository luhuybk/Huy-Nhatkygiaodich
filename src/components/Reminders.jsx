import { useState, useMemo } from "react";
import { PlusCircle, Pencil, Check, Bell, BellRing, Clock, Send, CalendarClock, CalendarCheck, ListTodo, Settings2 } from "lucide-react";
import { ConfirmButton, Field, useStickyTab } from "./ui.jsx";
import { REMINDER_FREQS, WEEKDAY_LABEL, WEEKDAY_ORDER } from "../lib/constants.js";
import { buildWeekTimeline, emptyReminder, openTradeCounter, reminderDueToday, reminderScheduleLabel, todayStr, uid } from "../lib/helpers.js";
import { NotifySettingsPanel, PlansPanel } from "./SlReminders.jsx";
import { TodayPanel, WeekPanel } from "./Timeline.jsx";

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
        <p className="field-hint" style={{ color: "var(--loss)" }}>Chưa cấu hình Bot Token / Chat ID ở tab Cài đặt — điền trước để tin nhắn gửi được.</p>
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

// Danh sách nhắc nhở riêng (do bạn tự tạo) — dùng ở tab Hôm nay (chỉ việc tới hạn) và trong Việc định kỳ.
function ReminderList({ list, ts, onDone, onEdit, onRemove, empty }) {
  if (!list.length) return empty ? <p className="field-hint">{empty}</p> : null;
  return (
    <div className="reminder-list">
      {list.map((r) => {
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
              {isDue ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => onDone(r)}><Check size={13} /> Đã làm</button> : null}
              <button type="button" className="row-btn" onClick={() => onEdit(r)}><Pencil size={13} /></button>
              <ConfirmButton onConfirm={() => onRemove(r.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TABS = ["today", "plans", "week", "settings"];
// Tab cũ (trước khi gộp) → tab mới, để lần mở đầu không rơi về chỗ lạ.
const OLD_TAB = { all: "plans", sl: "plans", setupcheck: "plans", symbolwatch: "plans", timeline: "week" };

export function RemindersPage({ reminders, onChange, resources, slReminderSettings, onSlReminderSettingsChange, symbolWatches, onSymbolWatchesChange, trades, setupCheckLog, onSetupCheckLogChange, slMutedTrades, onSlMutedTradesChange, taskDone, onTaskDoneChange }) {
  const [editing, setEditing] = useState(null);
  const [tabRaw, setTab] = useStickyTab("remindersTab", "today", [...TABS, ...Object.keys(OLD_TAB)]);
  const tab = OLD_TAB[tabRaw] || tabRaw;
  const ts = todayStr();
  const dueList = useMemo(() => reminders.filter((r) => reminderDueToday(r, ts)), [reminders, ts]);
  const telegramReady = !!(slReminderSettings.telegramBotToken && slReminderSettings.telegramChatId);
  // Số việc chồng giờ trong tuần — hiện trên nhãn tab Tuần để không phải mở ra mới biết.
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

  const listProps = { ts, onDone: markDone, onEdit: setEditing, onRemove: removeReminder };
  const addBtn = (
    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(emptyReminder())}>
      <PlusCircle size={13} /> Thêm nhắc nhở
    </button>
  );
  const TabBtn = ({ id, icon: Icon, label, badge, warn }) => (
    <button className={`subtab ${tab === id ? "subtab-active" : ""}`} onClick={() => setTab(id)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Icon size={13} /> {label}
        {badge ? <span className={`subtab-badge ${warn ? "subtab-badge-warn" : ""}`}>{badge}</span> : null}
      </span>
    </button>
  );

  return (
    <div className="reminders-page">
      <div className="reminders-page-head">
        <h2 style={{ fontSize: 19 }}>Thông báo &amp; nhắc nhở</h2>
      </div>
      <div className="subtabs">
        <TabBtn id="today" icon={CalendarCheck} label="Hôm nay" badge={dueList.length} />
        <TabBtn id="plans" icon={ListTodo} label="Lịch nhắc" />
        <TabBtn id="week" icon={CalendarClock} label="Tuần" badge={weekConflicts} warn />
        <TabBtn id="settings" icon={Settings2} label="Cài đặt" badge={telegramReady ? 0 : "!"} warn />
      </div>
      {tab === "today" ? (
        <TodayPanel settings={slReminderSettings} watches={symbolWatches} reminders={reminders}
          accounts={resources.accounts} trades={trades} mutedTrades={slMutedTrades}
          taskDone={taskDone} setupCheckLog={setupCheckLog}
          onTaskDoneChange={onTaskDoneChange} onSetupCheckLogChange={onSetupCheckLogChange}
          extra={(
            <>
              <div className="today-extra-head">
                <h4 className="plan-sub" style={{ margin: 0 }}>Nhắc riêng hôm nay</h4>
                {addBtn}
              </div>
              <ReminderList list={dueList} {...listProps} empty="Không có nhắc riêng nào tới hạn hôm nay." />
            </>
          )} />
      ) : tab === "plans" ? (
        <PlansPanel settings={slReminderSettings} onSettingsChange={onSlReminderSettingsChange} resources={resources} trades={trades}
          watches={symbolWatches} onWatchesChange={onSymbolWatchesChange}
          mutedTrades={slMutedTrades} onMutedTradesChange={onSlMutedTradesChange}
          checkLog={setupCheckLog} reminders={reminders} onGoSettings={() => setTab("settings")}
          remindersNode={(
            <>
              <ReminderList list={reminders} {...listProps} empty="Chưa có nhắc nhở riêng nào." />
              <div style={{ marginTop: 8 }}>{addBtn}</div>
            </>
          )} />
      ) : tab === "week" ? (
        <WeekPanel settings={slReminderSettings} watches={symbolWatches} reminders={reminders}
          accounts={resources.accounts} trades={trades} mutedTrades={slMutedTrades}
          onSettingsChange={onSlReminderSettingsChange} onWatchesChange={onSymbolWatchesChange} onRemindersChange={onChange} />
      ) : (
        <NotifySettingsPanel settings={slReminderSettings} onChange={onSlReminderSettingsChange} resources={resources}
          trades={trades} watches={symbolWatches} reminders={reminders} />
      )}
    </div>
  );
}
