import { useState } from "react";
import { ConfirmButton, Field, ResourceSelect } from "./ui.jsx";
import { NOTE_TYPES } from "../lib/constants.js";
import { emptyNote } from "../lib/helpers.js";

export function NotesSection({ notes, onChange }) {
  const [form, setForm] = useState(emptyNote());
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.content.trim()) return;
    const exists = notes.some((n) => n.id === form.id);
    onChange(exists ? notes.map((n) => (n.id === form.id ? form : n)) : [...notes, form]);
    setForm(emptyNote());
  };
  const remove = (id) => { onChange(notes.filter((n) => n.id !== id)); if (form.id === id) setForm(emptyNote()); };
  const sorted = [...notes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Kế hoạch giao dịch · đánh giá tuần/tháng · bài học · sai lầm · mục tiêu.</p>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Ngày"><input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} /></Field>
          <Field label="Loại"><ResourceSelect value={form.type} onChange={setF("type")} options={NOTE_TYPES} placeholder="Chọn loại" /></Field>
        </div>
        <Field label="Nội dung"><textarea className="input textarea" style={{ minHeight: 100 }} value={form.content} onChange={(e) => setF("content")(e.target.value)} placeholder="Nội dung ghi chú..." /></Field>
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(emptyNote())}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật ghi chú" : "Lưu ghi chú"}</button>
        </div>
      </div>
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note">Chưa có ghi chú nào.</p> : null}
        {sorted.map((n) => (
          <div key={n.id} className="note-card" onClick={() => setForm(n)}>
            <div className="note-head">
              <span className="note-type">{n.type}</span>
              <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{n.date || "—"}</span>
              <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
            </div>
            <p className="note-content">{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
