import { useState, useEffect, useMemo, useRef } from "react";
import { PlusCircle, Pencil, Check, Bell, BellRing, Clock } from "lucide-react";
import { ConfirmButton, Field } from "./ui.jsx";
import { REMINDER_FREQS, WEEKDAY_LABEL, WEEKDAY_ORDER } from "../lib/constants.js";
import { emptyReminder, reminderDueToday, reminderScheduleLabel, todayStr, uid } from "../lib/helpers.js";

export function ReminderForm({ initial, onSave, onCancel }) {
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
      {error ? <p className="error-text">{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={submit}>{r.id ? "Cập nhật" : "Thêm nhắc nhở"}</button>
      </div>
    </div>
  );
}

export function ReminderBell({ reminders, onChange }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const boxRef = useRef(null);
  const ts = todayStr();
  const dueList = useMemo(() => reminders.filter((r) => reminderDueToday(r, ts)), [reminders, ts]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markDone = (r) => {
    onChange(reminders.map((x) => (x.id === r.id ? { ...x, doneDates: [...(x.doneDates || []), ts] } : x)));
  };
  const saveReminder = (r) => {
    const exists = reminders.some((x) => x.id === r.id);
    onChange(exists ? reminders.map((x) => (x.id === r.id ? r : x)) : [...reminders, r]);
    setEditing(null);
  };
  const removeReminder = (id) => onChange(reminders.filter((x) => x.id !== id));

  return (
    <div className="reminder-bell" ref={boxRef}>
      <button type="button" className={`bell-btn ${dueList.length ? "bell-btn-active" : ""}`} onClick={() => { setOpen((o) => !o); setEditing(null); setShowAll(false); }} title="Nhắc nhở">
        {dueList.length ? <BellRing size={17} /> : <Bell size={17} />}
        {dueList.length ? <span className="bell-badge">{dueList.length}</span> : null}
      </button>
      {open ? (
        <div className="reminder-panel">
          {editing ? (
            <>
              <div className="reminder-panel-head"><strong>{editing.id ? "Sửa nhắc nhở" : "Nhắc nhở mới"}</strong></div>
              <ReminderForm initial={editing.id ? editing : null} onSave={saveReminder} onCancel={() => setEditing(null)} />
            </>
          ) : (
            <>
              <div className="reminder-panel-head">
                <strong>Nhắc nhở {showAll ? "— tất cả" : "hôm nay"}</strong>
                <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setShowAll((s) => !s)}>
                  {showAll ? "Chỉ hôm nay" : "Xem tất cả"}
                </button>
              </div>
              <div className="reminder-list">
                {(showAll ? reminders : dueList).length === 0 ? (
                  <p className="empty-note" style={{ padding: "10px 0" }}>
                    {showAll ? "Chưa có nhắc nhở nào." : "Không có việc gì cần làm hôm nay."}
                  </p>
                ) : (showAll ? reminders : dueList).map((r) => {
                  const isDue = reminderDueToday(r, ts);
                  return (
                    <div key={r.id} className={`reminder-item ${isDue ? "reminder-item-due" : ""}`}>
                      <div className="reminder-item-main">
                        <Clock size={13} color="var(--text-dim)" />
                        <div>
                          <div className="reminder-item-title">{r.title}</div>
                          <div className="reminder-item-sub">{reminderScheduleLabel(r)}{r.active ? "" : " · Tạm tắt"}</div>
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
              <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={() => setEditing(emptyReminder())}>
                <PlusCircle size={14} /> Thêm nhắc nhở
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
