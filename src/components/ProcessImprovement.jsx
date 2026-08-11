import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Plus } from "lucide-react";
import { ChartCard, ConfirmButton, DangerConfirmButton, Field, FormModal, MultiChipSelect } from "./ui.jsx";
import { CATEGORY_COLORS, GRID, MUTED, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { emptyProcessImprovement, uid } from "../lib/helpers.js";

export function ProcessImprovementSection({ items, avoidPrinciples, onChange }) {
  const [form, setForm] = useState(emptyProcessImprovement());
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyProcessImprovement()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ violatedPrinciples: [], ...n }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyProcessImprovement()); setError(""); };
  const save = () => {
    if (!form.weekStart) { setError("Chọn tuần trước đã."); return; }
    if (!form.doneWell.trim() && !form.mistakes.trim() && !form.improveNext.trim()) {
      setError("Trả lời ít nhất 1 trong 3 câu hỏi trước đã.");
      return;
    }
    setError("");
    const payload = { ...form, id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyProcessImprovement());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const sorted = useMemo(() => [...items].sort((a, b) => (b.weekStart || "").localeCompare(a.weekStart || "")), [items]);

  const chartPrinciples = useMemo(() => {
    const set = new Set();
    items.forEach((n) => (n.violatedPrinciples || []).forEach((p) => set.add(p)));
    return Array.from(set);
  }, [items]);
  const chartData = useMemo(() => {
    return [...items]
      .filter((n) => n.weekStart)
      .sort((a, b) => (a.weekStart || "").localeCompare(b.weekStart || ""))
      .map((n) => {
        const row = { weekStart: n.weekStart };
        (n.violatedPrinciples || []).forEach((p) => { row[p] = (row[p] || 0) + 1; });
        return row;
      });
  }, [items]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Mỗi tuần dừng lại trả lời 3 câu hỏi để cải thiện quy trình giao dịch — làm tốt điều gì, mắc lỗi ở đâu, và lần sau cải thiện ra sao.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm đánh giá tuần</button>
      </div>
      {chartPrinciples.length > 0 ? (
        <ChartCard
          title="Vi phạm nguyên tắc theo tuần"
          subtitle="Cột càng thấp / càng ít qua thời gian là đang tiến bộ"
          height={220}
          legend={chartPrinciples.map((p, i) => ({ color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], label: p }))}
        >
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="weekStart" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={30} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              {chartPrinciples.map((p, i) => (
                <Bar key={p} dataKey={p} stackId="violations" fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} maxBarSize={40} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa đánh giá tuần" : "Đánh giá quy trình tuần này"} onClose={closeModal}>
          <Field label="Tuần bắt đầu">
            <input type="date" className="input" value={form.weekStart} onChange={(e) => setF("weekStart")(e.target.value)} />
          </Field>
          <Field label="1. Tuần này mình đã làm tốt điều gì?">
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.doneWell} onChange={(e) => setF("doneWell")(e.target.value)} placeholder="Những điều đã làm tốt, đúng quy trình..." />
          </Field>
          <Field label="2. Mình đã mắc lỗi ở đâu? (hay còn thiếu sót ở đâu?)">
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.mistakes} onChange={(e) => setF("mistakes")(e.target.value)} placeholder="Lỗi, thiếu sót cần nhìn thẳng vào..." />
          </Field>
          <Field label="3. Lần sau mình có thể làm gì để tốt hơn?">
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.improveNext} onChange={(e) => setF("improveNext")(e.target.value)} placeholder="Điều cụ thể sẽ thay đổi/cải thiện..." />
          </Field>
          <Field label="Vi phạm nguyên tắc nào tuần này? (nếu có)" hint="Chọn từ danh sách 'Cần tránh' ở mục Nguyên tắc">
            {avoidPrinciples && avoidPrinciples.length > 0 ? (
              <MultiChipSelect value={form.violatedPrinciples} onChange={setF("violatedPrinciples")} options={avoidPrinciples} />
            ) : (
              <p className="empty-note">Chưa có nguyên tắc "Cần tránh" nào — thêm ở tab Nguyên tắc.</p>
            )}
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu đánh giá"}</button>
          </div>
        </FormModal>
      ) : null}
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có đánh giá tuần nào. Thêm đánh giá đầu tiên nhé.</p> : null}
        {sorted.map((n) => (
          <div key={n.id} className="note-card" onClick={() => openEdit(n)}>
            <div className="note-head">
              <span className="note-type">Tuần {n.weekStart || "—"}</span>
              {(n.violatedPrinciples || []).length ? (
                <span className="mono" style={{ fontSize: 10.5, color: "var(--loss)" }}>{n.violatedPrinciples.length} vi phạm</span>
              ) : null}
              <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
            </div>
            {n.doneWell ? <p className="note-content"><strong>Làm tốt:</strong> {n.doneWell}</p> : null}
            {n.mistakes ? <p className="note-content"><strong>Mắc lỗi:</strong> {n.mistakes}</p> : null}
            {n.improveNext ? <p className="note-content"><strong>Cải thiện:</strong> {n.improveNext}</p> : null}
            {(n.violatedPrinciples || []).length ? (
              <p className="note-content" style={{ color: "var(--loss)" }}><strong>Vi phạm:</strong> {n.violatedPrinciples.join(", ")}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
