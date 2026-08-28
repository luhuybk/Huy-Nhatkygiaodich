import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Filter, Pencil, Plus } from "lucide-react";
import { ChecklistEditor, ConfirmButton, DangerConfirmButton, Field, FormModal, ImagePreviewStrip as Strip, MultiChipSelect, MultiImageOrLink, ResourceSelect, StatCard } from "./ui.jsx";
import { applySkillFilters, emptySkill, moveSkill, nextOrder, skillAttachments, skillLevel, skillStats, sortedByOrder, SKILL_LEVELS, SKILL_MAX_IMAGES, uid } from "../lib/helpers.js";

function LevelBadge({ id }) {
  const lv = skillLevel(id);
  return <span className={`skill-level skill-level-${lv.id}`}>{lv.label}</span>;
}

function SkillsFilterPanel({ filters, setFilters, resources }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo tên / nội dung / bước..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <select className="input" value={filters.level || ""} onChange={(e) => set("level")(e.target.value)}>
          <option value="">Mọi mức thành thạo</option>
          {SKILL_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <ResourceSelect value={filters.setup || ""} onChange={set("setup")} options={resources.setups} placeholder="Áp dụng cho setup" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => setFilters({})}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function SkillsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptySkill());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openNew = () => { setForm({ ...emptySkill(), order: nextOrder(items) }); setError(""); setModalOpen(true); };
  const openEdit = (s) => {
    setForm({ ...emptySkill(), ...s, images: skillAttachments(s).length ? skillAttachments(s) : [{ link: "", image: "" }] });
    setError(""); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setForm(emptySkill()); setError(""); };
  const save = () => {
    if (!form.name.trim()) { setError("Đặt tên cho kỹ năng trước đã."); return; }
    setError("");
    const payload = {
      ...form,
      name: form.name.trim(),
      id: form.id || uid(),
      images: (form.images || []).filter((it) => (it.link && it.link.trim()) || it.image),
    };
    const exists = (items || []).some((s) => s.id === payload.id);
    onChange(exists ? items.map((s) => (s.id === payload.id ? payload : s)) : [...(items || []), payload]);
    closeModal();
  };
  const remove = (id) => { onChange((items || []).filter((s) => s.id !== id)); if (form.id === id) closeModal(); };
  const move = (id, delta) => {
    const r = moveSkill(items, id, delta);
    if (r.changed) onChange(r.items);
  };

  const stats = useMemo(() => skillStats(items), [items]);
  const ordered = useMemo(() => sortedByOrder(items), [items]);
  const shown = useMemo(() => applySkillFilters(ordered, filters), [ordered, filters]);
  // Nút lên/xuống đổi chỗ trong DANH SÁCH ĐẦY ĐỦ, nên vị trí phải lấy ở đó. Lấy theo danh sách
  // đang lọc thì bấm một cái là kỹ năng nhảy qua mấy mục đang bị ẩn, trông như lỗi.
  const posById = useMemo(() => new Map(ordered.map((s, i) => [s.id, i])), [ordered]);
  const filtering = Object.values(filters).some(Boolean);

  return (
    <div>
      <div className="skills-head">
        <p className="field-hint" style={{ margin: 0 }}>
          Những gì bạn rút ra được và luyện thành kỹ năng thực thi — Bóp StopLoss, Re-entry... Mỗi kỹ năng gồm phần diễn giải,
          các bước làm và ảnh minh họa, để lúc cần là mở ra làm theo chứ không phải nhớ lại.
        </p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm kỹ năng</button>
      </div>

      {stats.total ? (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Tổng kỹ năng" value={stats.total} />
          <StatCard label="Thành thạo" value={stats.solid} tone={stats.solid ? "win" : ""} />
          <StatCard label="Đang luyện" value={stats.practicing} />
          <StatCard label="Chưa ghi bước làm" value={stats.noSteps} tone={stats.noSteps ? "loss" : ""} sub={stats.noSteps ? "mới là ý định, chưa thực thi được" : "kỹ năng nào cũng có bước làm"} />
        </div>
      ) : null}

      {modalOpen ? (
        <FormModal title={form.id ? "Sửa kỹ năng" : "Thêm kỹ năng"} onClose={closeModal}>
          <Field label="Tên kỹ năng" required>
            <input className="input" value={form.name} autoFocus onChange={(e) => setF("name")(e.target.value)} placeholder="VD: Bóp StopLoss, Re-entry sau khi quét râu..." />
          </Field>
          <div className="grid-2">
            <Field label="Mức thành thạo">
              <select className="input" value={form.level || "learning"} onChange={(e) => setF("level")(e.target.value)}>
                {SKILL_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </Field>
            <Field label="Áp dụng cho setup" hint="Để trống nghĩa là dùng được cho mọi setup">
              <MultiChipSelect value={form.setups} onChange={setF("setups")} options={resources.setups} />
            </Field>
          </div>
          <Field label="Diễn giải" hint="Kỹ năng này là gì, vì sao nó ăn tiền, dùng trong tình huống nào">
            <textarea className="input textarea" style={{ minHeight: 100 }} value={form.summary} onChange={(e) => setF("summary")(e.target.value)}
              placeholder="VD: Sau khi giá xác nhận hướng, kéo SL về sát cấu trúc gần nhất để giảm rủi ro mà không cắt mất dư địa chạy..." />
          </Field>
          <Field label="Cách thức thực thi" hint="Từng bước một, theo đúng thứ tự sẽ làm — đây là thứ bạn mở ra đọc lúc đang có lệnh chạy">
            <ChecklistEditor items={form.steps} onChange={setF("steps")} placeholder="Thêm một bước..." />
          </Field>
          <Field label="Dễ sai ở đâu" hint="Không bắt buộc — nhưng ghi ra thì lần sau đỡ vấp lại">
            <textarea className="input textarea" value={form.watchOut} onChange={(e) => setF("watchOut")(e.target.value)}
              placeholder="VD: Bóp quá sớm khi giá chưa rời khỏi vùng vào lệnh — dễ bị quét..." />
          </Field>
          <Field label={`Hình minh họa (tối đa ${SKILL_MAX_IMAGES})`} hint="Càng nhiều ví dụ thật càng dễ nhận ra tình huống ngoài thị trường">
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="skill" max={SKILL_MAX_IMAGES} />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật kỹ năng" : "Lưu kỹ năng"}</button>
          </div>
        </FormModal>
      ) : null}

      <SkillsFilterPanel filters={filters} setFilters={setFilters} resources={resources} />

      <div className="resource-list" style={{ marginTop: 16 }}>
        {(items || []).length === 0 ? (
          <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có kỹ năng nào. Bắt đầu từ một thứ bạn đã làm được vài lần và muốn làm lại cho đúng.</p>
        ) : shown.length === 0 ? (
          <p className="empty-note" style={{ padding: "24px 0" }}>Không có kỹ năng nào khớp bộ lọc.</p>
        ) : null}
        {shown.map((s) => {
          const isOpen = expanded.has(s.id);
          const at = posById.get(s.id);
          const shots = skillAttachments(s);
          const steps = s.steps || [];
          return (
            <div key={s.id} className="note-card" onClick={() => toggleExpand(s.id)}>
              <div className="note-head">
                {isOpen ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
                <span className="note-content" style={{ fontWeight: 600, flex: 1 }}>{s.name}</span>
                <LevelBadge id={s.level} />
                <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="row-btn" disabled={filtering || at === 0} onClick={() => move(s.id, -1)}
                    title={filtering ? "Xóa lọc để đổi thứ tự" : "Đưa lên trên"} aria-label="Đưa lên trên"><ArrowUp size={13} /></button>
                  <button type="button" className="row-btn" disabled={filtering || at === ordered.length - 1} onClick={() => move(s.id, 1)}
                    title={filtering ? "Xóa lọc để đổi thứ tự" : "Đưa xuống dưới"} aria-label="Đưa xuống dưới"><ArrowDown size={13} /></button>
                  <button type="button" className="row-btn" onClick={() => openEdit(s)} aria-label="Sửa"><Pencil size={13} /></button>
                  <ConfirmButton onConfirm={() => remove(s.id)} />
                </span>
              </div>
              <div className="note-head" style={{ marginTop: 2 }}>
                {(s.setups || []).map((n) => <span key={n} className="note-type">{n}</span>)}
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>
                  {steps.length ? `${steps.length} bước` : "chưa có bước làm"}
                </span>
                {shots.length ? (
                  <span onClick={(e) => e.stopPropagation()}><Strip items={shots} empty={false} /></span>
                ) : null}
              </div>
              {isOpen ? (
                <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                  {s.summary ? <p className="note-content" style={{ color: "var(--text-dim)", marginTop: 6 }}>{s.summary}</p> : null}
                  {steps.length ? (
                    <>
                      <h4 className="rec-title" style={{ marginTop: 10 }}>Cách thực thi</h4>
                      <ol className="skill-steps">{steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                    </>
                  ) : (
                    <p className="field-hint" style={{ marginTop: 8 }}>Chưa ghi bước thực thi — bấm sửa để thêm, kỹ năng chỉ dùng được khi có các bước cụ thể.</p>
                  )}
                  {s.watchOut ? (
                    <div className="skill-watch">
                      <span className="skill-watch-label">Dễ sai</span>
                      <span>{s.watchOut}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
