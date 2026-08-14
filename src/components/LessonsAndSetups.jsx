import { useState, useMemo, Suspense, lazy } from "react";
import { X, Pencil, ImagePlus, Layers, Filter, Plus, BookOpen, ClipboardList, ChevronDown, ChevronRight, Wrench, Newspaper, Eye } from "lucide-react";
import { CellImagePreview, ChecklistEditor, ChipSelect, ConfirmButton, DangerConfirmButton, Field, FormModal, IdSelect, ImageOrLink, MultiChipSelect, MultiImageOrLink, ResourceSelect } from "./ui.jsx";
import { MAJOR_CURRENCIES, REVIEW_DIRECTIONS } from "../lib/constants.js";
import { applyLessonFilters, applyMissSkipFilters, applyNewsLogFilters, applyProblemLogFilters, emptyLesson, emptyMissed, emptyNewsLog, emptyProblemLog, emptySetupDef, emptySetupVariant, emptySkipped, lessonAttachments, lessonTitle, LESSON_MAX_IMAGES, MISS_MAX_IMAGES, NEWS_MAX_IMAGES, PROBLEM_MAX_IMAGES, SKIP_MAX_IMAGES, startOfWeek, todayStr, uid } from "../lib/helpers.js";

const ProcessImprovementSection = lazy(() => import("./ProcessImprovement.jsx").then((m) => ({ default: m.ProcessImprovementSection })));

export function MissSkipFilterPanel({ filters, setFilters, resources, reasonOptions, dateKeyLabel }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo symbol..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <ResourceSelect value={filters.timeframe || ""} onChange={set("timeframe")} options={resources.timeframes} placeholder="Khung thời gian" />
        <ResourceSelect value={filters.setup || ""} onChange={set("setup")} options={resources.setups} placeholder="Setup" />
        <ResourceSelect value={filters.reason || ""} onChange={set("reason")} options={reasonOptions} placeholder="Lý do" />
        <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title={`${dateKeyLabel} từ ngày`} />
        <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title={`${dateKeyLabel} đến ngày`} />
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function MissedSetupsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptyMissed());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyMissed()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyMissed()); setError(""); };
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyMissed());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const sorted = useMemo(
    () => applyMissSkipFilters(items, filters, "missDate").sort((a, b) => (b.missDate || "").localeCompare(a.missDate || "")),
    [items, filters]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại những setup bạn nhận ra nhưng không vào lệnh — để sau này xem lại có nên tối ưu quy trình không.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup bị miss</button>
      </div>
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa setup bị miss" : "Thêm setup bị miss"} onClose={closeModal}>
          <div className="grid-3">
            <Field label="Symbol">
              <input className="input" list="symbol-suggestions-miss" value={form.symbol} onChange={(e) => setF("symbol")(e.target.value.toUpperCase())} placeholder="VD: XAUUSD, HPG..." />
              <datalist id="symbol-suggestions-miss">{resources.symbols.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Ngày miss">
              <input type="date" className="input" value={form.missDate} onChange={(e) => setF("missDate")(e.target.value)} />
            </Field>
            <Field label="Khung thời gian">
              <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
            </Field>
          </div>
          <Field label="Setup">
            <ResourceSelect value={form.setup} onChange={setF("setup")} options={resources.setups} placeholder="Chọn setup" />
          </Field>
          <Field label="Link / hình ảnh TradingView">
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="miss" max={MISS_MAX_IMAGES} />
          </Field>
          <Field label="Lý do miss">
            <ChipSelect value={form.reason} onChange={setF("reason")} options={resources.missReasons} />
          </Field>
          <Field label="Bonus — ghi chú thêm">
            <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điền tay nội dung khác (tùy chọn)..." />
          </Field>
          <button
            type="button"
            className={`lesson-toggle-btn ${form.watch ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
            style={{ marginTop: 4 }}
            onClick={() => setF("watch")(!form.watch)}
          >
            <Eye size={15} /> {form.watch ? "👁 Cần theo dõi lệnh này" : "Đánh dấu cần theo dõi (tùy chọn)"}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu setup bị miss"}</button>
          </div>
        </FormModal>
      ) : null}
      <MissSkipFilterPanel filters={filters} setFilters={setFilters} resources={resources} reasonOptions={resources.missReasons} dateKeyLabel="Ngày miss" />
      <div className="table-wrap" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có setup bị miss nào khớp bộ lọc.</p> : (
          <table className="table">
            <thead>
              <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>Setup</th><th>TF</th><th>Lý do</th><th>Bonus</th><th>Theo dõi</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((n) => (
                <tr key={n.id} onClick={() => openEdit(n)} className={n.watch ? "row-watch" : ""}>
                  <td className="mono">{n.missDate || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{n.symbol}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {lessonAttachments(n).length ? lessonAttachments(n).map((att, i) => <CellImagePreview key={i} image={att.image} link={att.link} />) : <CellImagePreview image="" link="" />}
                    </div>
                  </td>
                  <td>{n.setup || "—"}</td>
                  <td className="mono">{n.timeframe || "—"}</td>
                  <td>{n.reason || "—"}</td>
                  <td style={{ maxWidth: 220, whiteSpace: "normal", color: "var(--text-dim)", fontSize: 12.5 }}>{n.note || "—"}</td>
                  <td>{n.watch ? <span className="watch-badge"><Eye size={12} /> Cần theo dõi</span> : "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button type="button" className="row-btn" onClick={() => openEdit(n)}><Pencil size={13} /></button>
                      <ConfirmButton onConfirm={() => remove(n.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function SkippedSetupsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptySkipped());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptySkipped()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptySkipped()); setError(""); };
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptySkipped());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const sorted = useMemo(
    () => applyMissSkipFilters(items, filters, "skipDate").sort((a, b) => (b.skipDate || "").localeCompare(a.skipDate || "")),
    [items, filters]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại những lệnh bạn chủ động bỏ qua (skip) dù đã cân nhắc — kèm review sau vài ngày để xem hướng lệnh diễn biến ra sao, giúp đánh giá quyết định skip có đúng không.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup bị skip</button>
      </div>
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa setup bị skip" : "Thêm setup bị skip"} onClose={closeModal}>
          <div className="grid-3">
            <Field label="Symbol">
              <input className="input" list="symbol-suggestions-skip" value={form.symbol} onChange={(e) => setF("symbol")(e.target.value.toUpperCase())} placeholder="VD: XAUUSD, HPG..." />
              <datalist id="symbol-suggestions-skip">{resources.symbols.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Ngày skip">
              <input type="date" className="input" value={form.skipDate} onChange={(e) => setF("skipDate")(e.target.value)} />
            </Field>
            <Field label="Khung thời gian">
              <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
            </Field>
          </div>
          <Field label="Setup">
            <ResourceSelect value={form.setup} onChange={setF("setup")} options={resources.setups} placeholder="Chọn setup" />
          </Field>
          <Field label="Link / hình ảnh TradingView">
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="skip" max={SKIP_MAX_IMAGES} />
          </Field>
          <Field label="Lý do skip">
            <ChipSelect value={form.reason} onChange={setF("reason")} options={resources.skipReasons} />
          </Field>
          <Field label="Ghi chú thêm">
            <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điền tay nội dung khác (tùy chọn)..." />
          </Field>
          <div className="section" style={{ marginTop: 4 }}>
            <div className="section-body" style={{ paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
              <p className="field-hint" style={{ marginBottom: 10 }}>Review sau vài ngày — quay lại đây khi đã có đủ thời gian để xem hướng đi thực tế của lệnh đã skip.</p>
              <div className="grid-2">
                <Field label="Ngày review">
                  <input type="date" className="input" value={form.reviewDate} onChange={(e) => setF("reviewDate")(e.target.value)} />
                </Field>
                <Field label="Hướng lệnh diễn biến">
                  <select className="input" value={form.reviewDirection} onChange={(e) => setF("reviewDirection")(e.target.value)}>
                    <option value="">— Chọn —</option>
                    {REVIEW_DIRECTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Nhận xét review">
                <textarea className="input textarea" value={form.reviewNote} onChange={(e) => setF("reviewNote")(e.target.value)} placeholder="Nếu vào lệnh thì sẽ thế nào, bài học rút ra..." />
              </Field>
            </div>
          </div>
          <button
            type="button"
            className={`lesson-toggle-btn ${form.watch ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
            style={{ marginTop: 4 }}
            onClick={() => setF("watch")(!form.watch)}
          >
            <Eye size={15} /> {form.watch ? "👁 Cần theo dõi lệnh này" : "Đánh dấu cần theo dõi (tùy chọn)"}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu setup bị skip"}</button>
          </div>
        </FormModal>
      ) : null}
      <MissSkipFilterPanel filters={filters} setFilters={setFilters} resources={resources} reasonOptions={resources.skipReasons} dateKeyLabel="Ngày skip" />
      <div className="table-wrap" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có setup bị skip nào khớp bộ lọc.</p> : (
          <table className="table">
            <thead>
              <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>Setup</th><th>TF</th><th>Lý do</th><th>Review</th><th>Theo dõi</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((n) => {
                const dir = REVIEW_DIRECTIONS.find((d) => d.id === n.reviewDirection);
                return (
                  <tr key={n.id} onClick={() => openEdit(n)} className={n.watch ? "row-watch" : ""}>
                    <td className="mono">{n.skipDate || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{n.symbol}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {lessonAttachments(n).length ? lessonAttachments(n).map((att, i) => <CellImagePreview key={i} image={att.image} link={att.link} />) : <CellImagePreview image="" link="" />}
                      </div>
                    </td>
                    <td>{n.setup || "—"}</td>
                    <td className="mono">{n.timeframe || "—"}</td>
                    <td>{n.reason || "—"}</td>
                    <td>{dir ? <span className={`outcome-pill ${dir.tone || ""}`} style={{ fontSize: 11 }}>{dir.label}</span> : "—"}</td>
                    <td>{n.watch ? <span className="watch-badge"><Eye size={12} /> Cần theo dõi</span> : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button type="button" className="row-btn" onClick={() => openEdit(n)}><Pencil size={13} /></button>
                        <ConfirmButton onConfirm={() => remove(n.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function LessonsFilterPanel({ filters, setFilters, resources }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo symbol / nội dung..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <ResourceSelect value={filters.category || ""} onChange={set("category")} options={resources.lessonCategories} placeholder="Danh mục" />
        <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
        <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function LessonsSection({ items, resources, trades, onChange }) {
  const [form, setForm] = useState(emptyLesson());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const tradeItems = useMemo(
    () => trades.map((t) => ({ id: t.id, name: `${t.symbol || "—"} · ${t.entryDate || "—"}` })),
    [trades]
  );
  const openNew = () => { setForm(emptyLesson()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyLesson()); setError(""); };
  const save = () => {
    if (!form.content.trim()) { setError("Nhập nội dung bài học trước đã."); return; }
    setError("");
    const cleanedImages = (form.images || []).filter((it) => (it.link && it.link.trim()) || it.image);
    const payload = { ...form, id: form.id || uid(), images: cleanedImages, link: "", image: "" };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyLesson());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const sorted = useMemo(
    () => applyLessonFilters(items, filters).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [items, filters]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại từng bài học rút ra từ giao dịch, phân loại theo danh mục (quản lý ở Tài nguyên → Danh mục bài học), kèm ảnh/link TradingView minh họa — để xem lại những điều cần chú ý.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm bài học</button>
      </div>
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa bài học" : "Thêm bài học"} onClose={closeModal}>
          <div className="grid-2">
            <Field label="Ngày">
              <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
            </Field>
            <Field label="Symbol (tùy chọn)">
              <input className="input" list="symbol-suggestions-lesson" value={form.symbol} onChange={(e) => setF("symbol")(e.target.value.toUpperCase())} placeholder="VD: XAUUSD, HPG..." />
              <datalist id="symbol-suggestions-lesson">{resources.symbols.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
          </div>
          <Field label="Danh mục bài học" hint="Có thể chọn nhiều danh mục cùng lúc">
            <MultiChipSelect value={form.categories} onChange={setF("categories")} options={resources.lessonCategories} />
          </Field>
          <Field label="Liên kết tới lệnh (tùy chọn)">
            <IdSelect value={form.tradeId} onChange={setF("tradeId")} items={tradeItems} placeholder="Không gắn với lệnh cụ thể" />
          </Field>
          <Field label="Tiêu đề" hint="Hiển thị ngắn gọn trong danh sách — để trống sẽ tự lấy từ nội dung">
            <input className="input" value={form.title} onChange={(e) => setF("title")(e.target.value)} placeholder="VD: Đừng vào lệnh khi chưa đủ tín hiệu xác nhận" />
          </Field>
          <Field label="Nội dung bài học" required>
            <textarea className="input textarea" style={{ minHeight: 100 }} value={form.content} onChange={(e) => setF("content")(e.target.value)} placeholder="Điều rút ra được, cần chú ý lần sau..." />
          </Field>
          <Field label={`Link / hình ảnh TradingView (tối đa ${LESSON_MAX_IMAGES})`}>
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="lesson" max={LESSON_MAX_IMAGES} />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật bài học" : "Lưu bài học"}</button>
          </div>
        </FormModal>
      ) : null}
      <LessonsFilterPanel filters={filters} setFilters={setFilters} resources={resources} />
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có bài học nào khớp bộ lọc.</p> : null}
        {sorted.map((n) => {
          const linkedTrade = trades.find((t) => t.id === n.tradeId);
          const attachments = lessonAttachments(n);
          const isOpen = expanded.has(n.id);
          return (
            <div key={n.id} className="note-card" onClick={() => toggleExpand(n.id)}>
              <div className="note-head">
                {isOpen ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
                <span className="note-content" style={{ fontWeight: 600, flex: 1 }}>{lessonTitle(n) || "(Chưa có nội dung)"}</span>
                <span onClick={(e) => { e.stopPropagation(); openEdit(n); }}><button type="button" className="row-btn" aria-label="Sửa"><Pencil size={13} /></button></span>
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <div className="note-head" style={{ marginTop: 2 }}>
                {(n.categories || []).map((c) => <span key={c} className="note-type">{c}</span>)}
                {n.symbol || linkedTrade ? (
                  <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>Lệnh: {n.symbol || linkedTrade.symbol}</span>
                ) : null}
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>Ngày: {n.date || "—"}</span>
                {attachments.length ? (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {attachments.map((att, i) => <CellImagePreview key={i} image={att.image} link={att.link} />)}
                  </span>
                ) : null}
              </div>
              {isOpen ? (
                <>
                  <p className="note-content" style={{ color: "var(--text-dim)", marginTop: 4 }}>{n.content}</p>
                  {linkedTrade ? <span className="field-hint">Gắn với lệnh: {linkedTrade.symbol} · {linkedTrade.entryDate || "—"}</span> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProblemLogFilterPanel({ filters, setFilters }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo vấn đề / hướng xử lý..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <select className="input" value={filters.status || ""} onChange={(e) => set("status")(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="unresolved">Chưa xử lý</option>
          <option value="resolved">Đã xử lý</option>
        </select>
        <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
        <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function ProblemLogSection({ items, onChange }) {
  const [form, setForm] = useState(emptyProblemLog());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyProblemLog()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ ...n, images: (n.images && n.images.length) ? n.images : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyProblemLog()); setError(""); };
  const save = () => {
    if (!form.problem.trim()) { setError("Nhập vấn đề gặp phải trước đã."); return; }
    setError("");
    const cleanedImages = (form.images || []).filter((it) => (it.link && it.link.trim()) || it.image);
    const payload = { ...form, id: form.id || uid(), images: cleanedImages };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyProblemLog());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const toggleResolved = (n, e) => { e.stopPropagation(); onChange(items.map((it) => (it.id === n.id ? { ...it, resolved: !it.resolved } : it))); };
  const sorted = useMemo(
    () => applyProblemLogFilters(items, filters).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [items, filters]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại vấn đề gặp phải khi giao dịch và hướng xử lý — VD: FOMO vào lệnh khi có giờ ra tin, cách xử lý là tạo nhắc hẹn không vào lệnh đồng tiền đó.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm vấn đề</button>
      </div>
      <ProblemLogFilterPanel filters={filters} setFilters={setFilters} />
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa vấn đề" : "Ghi nhận vấn đề mới"} onClose={closeModal}>
          <Field label="Ngày">
            <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
          </Field>
          <Field label="Vấn đề gặp phải" required>
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.problem} onChange={(e) => setF("problem")(e.target.value)} placeholder="VD: FOMO vào lệnh khi có giờ ra tin..." />
          </Field>
          <Field label="Hướng xử lý">
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.solution} onChange={(e) => setF("solution")(e.target.value)} placeholder="VD: Tạo nhắc hẹn không vào lệnh đồng tiền đó trong giờ ra tin..." />
          </Field>
          <Field label={`Link / hình ảnh minh họa (tối đa ${PROBLEM_MAX_IMAGES})`}>
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="problem" max={PROBLEM_MAX_IMAGES} />
          </Field>
          <Field label="Trạng thái">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.resolved} onChange={(e) => setF("resolved")(e.target.checked)} />
              <span>Đã xử lý vấn đề</span>
            </label>
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu vấn đề"}</button>
          </div>
        </FormModal>
      ) : null}
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có vấn đề nào khớp bộ lọc.</p> : null}
        {sorted.map((n) => {
          const attachments = n.images || [];
          const isOpen = expanded.has(n.id);
          return (
            <div key={n.id} className="note-card" onClick={() => toggleExpand(n.id)}>
              <div className="note-head">
                {isOpen ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
                <span onClick={(e) => toggleResolved(n, e)} title={n.resolved ? "Đã xử lý — bấm để bỏ đánh dấu" : "Bấm để đánh dấu đã xử lý"}>
                  <input type="checkbox" checked={!!n.resolved} onChange={() => {}} style={{ cursor: "pointer" }} />
                </span>
                <span className="note-content" style={{ fontWeight: 600, flex: 1, textDecoration: n.resolved ? "line-through" : "none", color: n.resolved ? "var(--text-dim)" : "var(--text)" }}>{n.problem}</span>
                <span onClick={(e) => { e.stopPropagation(); openEdit(n); }}><button type="button" className="row-btn" aria-label="Sửa"><Pencil size={13} /></button></span>
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <div className="note-head" style={{ marginTop: 2 }}>
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>Ngày: {n.date || "—"}</span>
                {n.resolved ? <span className="note-type" style={{ color: "var(--win)" }}>Đã xử lý</span> : <span className="note-type" style={{ color: "var(--loss)" }}>Chưa xử lý</span>}
                {attachments.length ? (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {attachments.map((att, i) => <CellImagePreview key={i} image={att.image} link={att.link} />)}
                  </span>
                ) : null}
              </div>
              {isOpen ? (
                <p className="note-content" style={{ color: "var(--text-dim)", marginTop: 4 }}><strong>Hướng xử lý:</strong> {n.solution || "—"}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SetupLibrarySection({ items, onChange }) {
  const [viewingId, setViewingId] = useState(null);
  const [form, setForm] = useState(null);
  const [variantForm, setVariantForm] = useState(null);
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const viewing = items.find((it) => it.id === viewingId) || null;

  const openNew = () => { setForm(emptySetupDef()); setError(""); };
  const openEditMain = (it) => { setForm({ ...emptySetupDef(), ...it, checklist: it.checklist || [], variants: it.variants || [] }); setError(""); };
  const closeMainModal = () => { setForm(null); setError(""); };
  const saveMain = () => {
    if (!form.name.trim()) { setError("Nhập tên setup."); return; }
    setError("");
    const cleanedChecklist = (form.checklist || []).map((c) => c.trim()).filter(Boolean);
    const payload = { ...form, id: form.id || uid(), checklist: cleanedChecklist, variants: form.variants || [] };
    const exists = items.some((it) => it.id === payload.id);
    onChange(exists ? items.map((it) => (it.id === payload.id ? payload : it)) : [...items, payload]);
    setForm(null);
    setViewingId(payload.id);
  };
  const removeMain = (id) => { onChange(items.filter((it) => it.id !== id)); setViewingId(null); setForm(null); };

  const openNewVariant = (parentId) => { setVariantForm({ parentId, index: -1, data: emptySetupVariant() }); setError(""); };
  const openEditVariant = (parentId, index, data) => { setVariantForm({ parentId, index, data: { ...data } }); setError(""); };
  const closeVariantModal = () => { setVariantForm(null); setError(""); };
  const setVariantField = (k) => (v) => setVariantForm((p) => ({ ...p, data: { ...p.data, [k]: v } }));
  const saveVariant = () => {
    if (!variantForm.data.name.trim()) { setError("Nhập tên biến thể."); return; }
    setError("");
    const cleaned = { ...variantForm.data, id: variantForm.data.id || uid(), checklist: (variantForm.data.checklist || []).map((c) => c.trim()).filter(Boolean) };
    onChange(items.map((it) => {
      if (it.id !== variantForm.parentId) return it;
      const variants = it.variants || [];
      const nextVariants = variantForm.index === -1 ? [...variants, cleaned] : variants.map((v, i) => (i === variantForm.index ? cleaned : v));
      return { ...it, variants: nextVariants };
    }));
    setVariantForm(null);
  };
  const removeVariant = (parentId, index) => {
    onChange(items.map((it) => (it.id === parentId ? { ...it, variants: (it.variants || []).filter((_, i) => i !== index) } : it)));
    setVariantForm(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Thư viện setup mẫu — bấm vào 1 setup để xem ảnh, checklist nhận diện và các biến thể (VD: RB có biến thể A, B, C).</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup</button>
      </div>

      {variantForm ? (
        <FormModal title={variantForm.index === -1 ? "Thêm biến thể" : "Sửa biến thể"} onClose={closeVariantModal}>
          <Field label="Tên biến thể" required>
            <input className="input" value={variantForm.data.name} onChange={(e) => setVariantField("name")(e.target.value)} placeholder="VD: RB - A" />
          </Field>
          <Field label="Ảnh minh họa / link TradingView">
            <ImageOrLink link={variantForm.data.link} image={variantForm.data.image} onLinkChange={setVariantField("link")} onImageChange={setVariantField("image")} label="variant" />
          </Field>
          <Field label="Ghi chú">
            <textarea className="input textarea" value={variantForm.data.note} onChange={(e) => setVariantField("note")(e.target.value)} placeholder="Điều kiện riêng của biến thể này..." />
          </Field>
          <Field label="Checklist nhận diện">
            <ChecklistEditor items={variantForm.data.checklist} onChange={setVariantField("checklist")} placeholder="VD: Chạm bật..." />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {variantForm.index !== -1 ? <DangerConfirmButton label="Xóa biến thể" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => removeVariant(variantForm.parentId, variantForm.index)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeVariantModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={saveVariant}>{variantForm.index !== -1 ? "Cập nhật" : "Lưu biến thể"}</button>
          </div>
        </FormModal>
      ) : form ? (
        <FormModal title={form.id ? "Sửa setup" : "Thêm setup mới"} onClose={closeMainModal}>
          <Field label="Tên Setup" required>
            <input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="VD: RB - Range Breakout" />
          </Field>
          <Field label="Ảnh minh họa / link TradingView">
            <ImageOrLink link={form.link} image={form.image} onLinkChange={setF("link")} onImageChange={setF("image")} label="setup" />
          </Field>
          <Field label="Ghi chú">
            <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điều kiện, quy tắc nhận diện setup..." />
          </Field>
          <Field label="Checklist nhận diện">
            <ChecklistEditor items={form.checklist} onChange={setF("checklist")} placeholder="VD: Có đoạn nén, Chạm bật..." />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={closeMainModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={saveMain}>{form.id ? "Cập nhật Setup" : "Lưu Setup"}</button>
          </div>
        </FormModal>
      ) : viewing ? (
        <FormModal title={viewing.name} onClose={() => setViewingId(null)}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            {viewing.image || viewing.link ? (
              <a href={viewing.image || viewing.link} target="_blank" rel="noopener noreferrer">
                <img src={viewing.image || viewing.link} alt={viewing.name} className="thumb" style={{ width: 96, height: 96, borderRadius: 8 }} />
              </a>
            ) : (
              <div className="setup-img setup-img-empty" style={{ width: 96, height: 96, borderRadius: 8, flexShrink: 0 }}><Layers size={22} color="var(--text-dim)" /></div>
            )}
            <p className="note-content" style={{ color: "var(--text-dim)", margin: 0 }}>{viewing.note || "Chưa có ghi chú."}</p>
          </div>
          {(viewing.checklist || []).length ? (
            <div style={{ marginBottom: 14 }}>
              <span className="field-label">Checklist nhận diện</span>
              <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {viewing.checklist.map((c, i) => <li key={i} style={{ fontSize: 13, marginBottom: 3 }}>{c}</li>)}
              </ol>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={() => openEditMain(viewing)}><Pencil size={13} /> Sửa setup</button>
            <DangerConfirmButton label="Xóa setup" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => removeMain(viewing.id)} />
          </div>
          <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="field-label">Biến thể ({(viewing.variants || []).length})</span>
              <button type="button" className="btn btn-ghost" onClick={() => openNewVariant(viewing.id)}><Plus size={13} /> Thêm biến thể</button>
            </div>
            {(viewing.variants || []).length === 0 ? (
              <p className="empty-note" style={{ padding: "16px 0" }}>Chưa có biến thể nào — VD: RB có biến thể A, B, C, mỗi biến thể có ảnh, ghi chú và checklist riêng.</p>
            ) : (
              <div className="setup-variant-grid">
                {viewing.variants.map((v, i) => {
                  const vThumb = v.image || v.link;
                  return (
                    <div key={v.id || i} className="setup-variant-card" onClick={() => openEditVariant(viewing.id, i, v)}>
                      {vThumb ? <img src={vThumb} alt={v.name} className="setup-variant-img" /> : <div className="setup-variant-img setup-img-empty"><Layers size={16} color="var(--text-dim)" /></div>}
                      <div className="setup-variant-card-body">
                        <strong>{v.name}</strong>
                        {(v.checklist || []).length ? <div className="setup-card-meta"><span className="note-type">{v.checklist.length} checklist</span></div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </FormModal>
      ) : null}

      <div className="setup-grid">
        {items.length === 0 ? <p className="empty-note">Chưa có setup mẫu nào.</p> : null}
        {items.map((it) => {
          const thumb = it.image || it.link;
          return (
            <div key={it.id} className="setup-card" onClick={() => setViewingId(it.id)}>
              {thumb ? <img src={thumb} alt={it.name} className="setup-img" /> : <div className="setup-img setup-img-empty"><Layers size={20} color="var(--text-dim)" /></div>}
              <div className="setup-card-body">
                <strong>{it.name}</strong>
                {it.note ? <p className="setup-note">{it.note}</p> : null}
                <div className="setup-card-meta">
                  {(it.checklist || []).length ? <span className="note-type">{it.checklist.length} checklist</span> : null}
                  {(it.variants || []).length ? <span className="note-type">{it.variants.length} biến thể</span> : null}
                </div>
              </div>
              <span onClick={(e) => e.stopPropagation()} className="setup-card-actions">
                <ConfirmButton onConfirm={() => removeMain(it.id)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NewsLogFilterPanel({ filters, setFilters }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo tên tin / nội dung..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <select className="input" value={filters.currency || ""} onChange={(e) => set("currency")(e.target.value)}>
          <option value="">Tất cả đồng tiền</option>
          {MAJOR_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
        <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function NewsLogSection({ items, onChange }) {
  const [form, setForm] = useState(emptyNewsLog());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyNewsLog()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm({ ...n, images: (n.images && n.images.length) ? n.images : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyNewsLog()); setError(""); };
  const save = () => {
    if (!form.title.trim()) { setError("Nhập tên tin tức trước đã."); return; }
    setError("");
    const cleanedImages = (form.images || []).filter((it) => (it.link && it.link.trim()) || it.image);
    const payload = { ...form, id: form.id || uid(), images: cleanedImages };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyNewsLog());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const sorted = useMemo(
    () => applyNewsLogFilters(items, filters).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [items, filters]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại biến động tin tức ảnh hưởng tới các đồng tiền khi trade forex — VD: CPI Mỹ ra tin ảnh hưởng USD, các cặp dính USD biến động mạnh.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm tin tức</button>
      </div>
      <NewsLogFilterPanel filters={filters} setFilters={setFilters} />
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa tin tức" : "Ghi nhận tin tức mới"} onClose={closeModal}>
          <div className="grid-2">
            <Field label="Ngày">
              <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
            </Field>
            <Field label="Tên tin tức" required>
              <input className="input" value={form.title} onChange={(e) => setF("title")(e.target.value)} placeholder="VD: CPI Mỹ, NFP, Lãi suất FED..." />
            </Field>
          </div>
          <Field label="Đồng tiền ảnh hưởng">
            <MultiChipSelect value={form.currencies} onChange={setF("currencies")} options={MAJOR_CURRENCIES} />
          </Field>
          <Field label="Nội dung / biến động">
            <textarea className="input textarea" style={{ minHeight: 80 }} value={form.content} onChange={(e) => setF("content")(e.target.value)} placeholder="Diễn biến tin tức, các cặp tiền bị ảnh hưởng, biên độ dao động..." />
          </Field>
          <Field label={`Hình ảnh theo dõi (tối đa ${NEWS_MAX_IMAGES})`}>
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="news" max={NEWS_MAX_IMAGES} />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu tin tức"}</button>
          </div>
        </FormModal>
      ) : null}
      <div className="resource-list" style={{ marginTop: 16 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có tin tức nào khớp bộ lọc.</p> : null}
        {sorted.map((n) => {
          const attachments = n.images || [];
          const isOpen = expanded.has(n.id);
          return (
            <div key={n.id} className="note-card" onClick={() => toggleExpand(n.id)}>
              <div className="note-head">
                {isOpen ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
                <span className="note-content" style={{ fontWeight: 600, flex: 1 }}>{n.title || "(Chưa có tên)"}</span>
                <span onClick={(e) => { e.stopPropagation(); openEdit(n); }}><button type="button" className="row-btn" aria-label="Sửa"><Pencil size={13} /></button></span>
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <div className="note-head" style={{ marginTop: 2 }}>
                {(n.currencies || []).map((c) => <span key={c} className="note-type">{c}</span>)}
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>Ngày: {n.date || "—"}</span>
                {attachments.length ? (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {attachments.map((att, i) => <CellImagePreview key={i} image={att.image} link={att.link} />)}
                  </span>
                ) : null}
              </div>
              {isOpen ? (
                <p className="note-content" style={{ color: "var(--text-dim)", marginTop: 4 }}>{n.content || "—"}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JourneySection({ lessons, resources, trades, onChangeLessons, processImprovements, onChangeProcessImprovements, problemLogs, onChangeProblemLogs, newsLogs, onChangeNewsLogs, avoidPrinciples }) {
  const [tab, setTab] = useState("lessons");
  const unresolvedCount = useMemo(() => problemLogs.filter((p) => !p.resolved).length, [problemLogs]);
  const thisWeekViolations = useMemo(() => {
    const thisMonday = startOfWeek(todayStr());
    return processImprovements
      .filter((n) => n.weekStart && startOfWeek(n.weekStart) === thisMonday)
      .reduce((sum, n) => sum + (n.violatedPrinciples || []).length, 0);
  }, [processImprovements]);
  return (
    <div>
      {unresolvedCount > 0 || thisWeekViolations > 0 ? (
        <div className="journey-summary">
          {unresolvedCount > 0 ? (
            <button type="button" className="journey-summary-item" onClick={() => setTab("problems")}>
              <Wrench size={13} /> {unresolvedCount} vấn đề chưa xử lý
            </button>
          ) : null}
          {thisWeekViolations > 0 ? (
            <button type="button" className="journey-summary-item" onClick={() => setTab("process")}>
              <ClipboardList size={13} /> {thisWeekViolations} vi phạm nguyên tắc tuần này
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="subtabs">
        <button className={`subtab ${tab === "lessons" ? "subtab-active" : ""}`} onClick={() => setTab("lessons")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Bài học</button>
        <button className={`subtab ${tab === "process" ? "subtab-active" : ""}`} onClick={() => setTab("process")}><ClipboardList size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Cải thiện quy trình</button>
        <button className={`subtab ${tab === "problems" ? "subtab-active" : ""}`} onClick={() => setTab("problems")}><Wrench size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Xử lý vấn đề</button>
        <button className={`subtab ${tab === "news" ? "subtab-active" : ""}`} onClick={() => setTab("news")}><Newspaper size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Nhật ký tin tức</button>
      </div>
      {tab === "lessons" ? (
        <LessonsSection items={lessons} resources={resources} trades={trades} onChange={onChangeLessons} />
      ) : tab === "process" ? (
        <Suspense fallback={<p className="empty-note" style={{ padding: "24px 0" }}>Đang tải...</p>}>
          <ProcessImprovementSection items={processImprovements} avoidPrinciples={avoidPrinciples} onChange={onChangeProcessImprovements} />
        </Suspense>
      ) : tab === "problems" ? (
        <ProblemLogSection items={problemLogs} onChange={onChangeProblemLogs} />
      ) : (
        <NewsLogSection items={newsLogs} onChange={onChangeNewsLogs} />
      )}
    </div>
  );
}
