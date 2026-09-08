import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConfirmButton, Field, ResourceSelect } from "./ui.jsx";
import { NOTE_TYPES } from "../lib/constants.js";
import { emptyNote, firstLine, restLines } from "../lib/helpers.js";

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
  // Kế hoạch giao dịch và đánh giá tuần thường dài cả chục dòng; đổ hết ra thì danh sách
  // thành một bức tường chữ, lướt tìm đúng ghi chú cần đọc còn khó hơn mở từng cái.
  // Dòng đầu ở lại làm nhãn nhận diện, phần còn lại chờ bấm mới hiện.
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
        {sorted.map((n) => {
          const head = firstLine(n.content);
          const rest = restLines(n.content);
          const isOpen = open.has(n.id);
          return (
            <div key={n.id} className="note-card" onClick={() => setForm(n)}>
              <div className="note-head">
                <span className="note-type">{n.type}</span>
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{n.date || "—"}</span>
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <p className="note-content note-content-head">{head || "(chưa có nội dung)"}</p>
              {rest ? (
                <>
                  <button type="button" className="var-card-more"
                    onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {isOpen ? "Thu gọn" : `Xem tiếp ${rest.split("\n").filter((x) => x.trim()).length} dòng`}
                  </button>
                  {isOpen ? <p className="note-content">{rest}</p> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
