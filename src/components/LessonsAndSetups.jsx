import { useState, useMemo } from "react";
import { X, Pencil, ImagePlus, Layers, Filter, Plus, BookOpen, ClipboardList } from "lucide-react";
import { CellImagePreview, ChipSelect, ConfirmButton, DangerConfirmButton, Field, FormModal, IdSelect, ImageOrLink, MultiChipSelect, ResourceSelect } from "./ui.jsx";
import { REVIEW_DIRECTIONS } from "../lib/constants.js";
import { applyLessonFilters, applyMissSkipFilters, emptyLesson, emptyMissed, emptyProcessImprovement, emptySetupDef, emptySkipped, uid } from "../lib/helpers.js";

export function MissSkipFilterPanel({ filters, setFilters, resources, reasonOptions, dateKeyLabel }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo symbol..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <ResourceSelect value={filters.timeframe || ""} onChange={set("timeframe")} options={resources.timeframes} placeholder="Khung thời gian" />
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
  const openEdit = (n) => { setForm(n); setError(""); setModalOpen(true); };
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
          <Field label="Link / hình ảnh TradingView">
            <ImageOrLink link={form.link} image={form.image} onLinkChange={setF("link")} onImageChange={setF("image")} label="miss" />
          </Field>
          <Field label="Lý do miss">
            <ChipSelect value={form.reason} onChange={setF("reason")} options={resources.missReasons} />
          </Field>
          <Field label="Bonus — ghi chú thêm">
            <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điền tay nội dung khác (tùy chọn)..." />
          </Field>
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
              <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>TF</th><th>Lý do</th><th>Bonus</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((n) => (
                <tr key={n.id} onClick={() => openEdit(n)}>
                  <td className="mono">{n.missDate || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{n.symbol}</td>
                  <td onClick={(e) => e.stopPropagation()}><CellImagePreview image={n.image} link={n.link} /></td>
                  <td className="mono">{n.timeframe || "—"}</td>
                  <td>{n.reason || "—"}</td>
                  <td style={{ maxWidth: 220, whiteSpace: "normal", color: "var(--text-dim)", fontSize: 12.5 }}>{n.note || "—"}</td>
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
  const openEdit = (n) => { setForm(n); setError(""); setModalOpen(true); };
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
          <Field label="Link / hình ảnh TradingView">
            <ImageOrLink link={form.link} image={form.image} onLinkChange={setF("link")} onImageChange={setF("image")} label="skip" />
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
              <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>TF</th><th>Lý do</th><th>Review</th><th></th></tr>
            </thead>
            <tbody>
              {sorted.map((n) => {
                const dir = REVIEW_DIRECTIONS.find((d) => d.id === n.reviewDirection);
                return (
                  <tr key={n.id} onClick={() => openEdit(n)}>
                    <td className="mono">{n.skipDate || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{n.symbol}</td>
                    <td onClick={(e) => e.stopPropagation()}><CellImagePreview image={n.image} link={n.link} /></td>
                    <td className="mono">{n.timeframe || "—"}</td>
                    <td>{n.reason || "—"}</td>
                    <td>{dir ? <span className={`outcome-pill ${dir.tone || ""}`} style={{ fontSize: 11 }}>{dir.label}</span> : "—"}</td>
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
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const tradeItems = useMemo(
    () => trades.map((t) => ({ id: t.id, name: `${t.symbol || "—"} · ${t.entryDate || "—"}` })),
    [trades]
  );
  const openNew = () => { setForm(emptyLesson()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm(n); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyLesson()); setError(""); };
  const save = () => {
    if (!form.content.trim()) { setError("Nhập nội dung bài học trước đã."); return; }
    setError("");
    const payload = { ...form, id: form.id || uid() };
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
          <Field label="Nội dung bài học" required>
            <textarea className="input textarea" style={{ minHeight: 100 }} value={form.content} onChange={(e) => setF("content")(e.target.value)} placeholder="Điều rút ra được, cần chú ý lần sau..." />
          </Field>
          <Field label="Link / hình ảnh TradingView">
            <ImageOrLink link={form.link} image={form.image} onLinkChange={setF("link")} onImageChange={setF("image")} label="lesson" />
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
          return (
            <div key={n.id} className="note-card" onClick={() => openEdit(n)}>
              <div className="note-head">
                {(n.categories || []).map((c) => <span key={c} className="note-type">{c}</span>)}
                {n.symbol ? <span className="mono" style={{ fontWeight: 600 }}>{n.symbol}</span> : null}
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{n.date || "—"}</span>
                {(n.image || n.link) ? <span onClick={(e) => e.stopPropagation()}><CellImagePreview image={n.image} link={n.link} /></span> : null}
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <p className="note-content">{n.content}</p>
              {linkedTrade ? <span className="field-hint">Gắn với lệnh: {linkedTrade.symbol} · {linkedTrade.entryDate || "—"}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SetupLibrarySection({ items, onChange }) {
  const [form, setForm] = useState(emptySetupDef());
  const [error, setError] = useState("");
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!form.name.trim()) { setError("Nhập tên setup."); return; }
    setError("");
    if (form.id) onChange(items.map((it) => (it.id === form.id ? form : it)));
    else onChange([...items, { ...form, id: uid() }]);
    setForm(emptySetupDef());
  };
  const remove = (id) => { onChange(items.filter((it) => it.id !== id)); if (form.id === id) setForm(emptySetupDef()); };
  const handleImg = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { setError("Ảnh quá lớn (>1.5MB)."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => setF("image")(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Thư viện setup mẫu kèm ảnh minh họa để tra cứu nhanh khi vào lệnh.</p>
      <div className="account-form">
        <div className="grid-2">
          <Field label="Tên Setup"><input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)} placeholder="VD: RB - Range Breakout" /></Field>
          <Field label="Ảnh minh họa">
            <label className="upload-btn"><ImagePlus size={14} /><span>{form.image ? "Đổi ảnh" : "Tải ảnh lên"}</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImg} /></label>
          </Field>
        </div>
        <Field label="Ghi chú"><textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="Điều kiện, quy tắc nhận diện setup..." /></Field>
        {form.image ? (
          <div className="thumb-wrap" style={{ marginBottom: 10 }}>
            <img src={form.image} alt="setup" className="thumb" style={{ width: 60, height: 60 }} onClick={() => window.open(form.image, "_blank")} />
            <button type="button" className="thumb-x" onClick={() => setF("image")("")}><X size={12} /></button>
          </div>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="form-actions" style={{ marginTop: 4 }}>
          {form.id ? <button type="button" className="btn btn-ghost" onClick={() => setForm(emptySetupDef())}>Hủy sửa</button> : null}
          <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật Setup" : "Thêm Setup"}</button>
        </div>
      </div>
      <div className="setup-grid">
        {items.length === 0 ? <p className="empty-note">Chưa có setup mẫu nào.</p> : null}
        {items.map((it) => (
          <div key={it.id} className="setup-card" onClick={() => { setForm(it); setError(""); }}>
            {it.image ? <img src={it.image} alt={it.name} className="setup-img" /> : <div className="setup-img setup-img-empty"><Layers size={20} color="var(--text-dim)" /></div>}
            <div className="setup-card-body">
              <strong>{it.name}</strong>
              {it.note ? <p className="setup-note">{it.note}</p> : null}
            </div>
            <span onClick={(e) => e.stopPropagation()} className="setup-card-actions">
              <button type="button" className="row-btn" onClick={() => { setForm(it); setError(""); }}><Pencil size={13} /></button>
              <ConfirmButton onConfirm={() => remove(it.id)} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcessImprovementSection({ items, onChange }) {
  const [form, setForm] = useState(emptyProcessImprovement());
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyProcessImprovement()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setForm(n); setError(""); setModalOpen(true); };
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <p className="field-hint" style={{ margin: 0 }}>Mỗi tuần dừng lại trả lời 3 câu hỏi để cải thiện quy trình giao dịch — làm tốt điều gì, mắc lỗi ở đâu, và lần sau cải thiện ra sao.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm đánh giá tuần</button>
      </div>
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
              <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
            </div>
            {n.doneWell ? <p className="note-content"><strong>Làm tốt:</strong> {n.doneWell}</p> : null}
            {n.mistakes ? <p className="note-content"><strong>Mắc lỗi:</strong> {n.mistakes}</p> : null}
            {n.improveNext ? <p className="note-content"><strong>Cải thiện:</strong> {n.improveNext}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function JourneySection({ lessons, resources, trades, onChangeLessons, processImprovements, onChangeProcessImprovements }) {
  const [tab, setTab] = useState("lessons");
  return (
    <div>
      <div className="subtabs">
        <button className={`subtab ${tab === "lessons" ? "subtab-active" : ""}`} onClick={() => setTab("lessons")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Bài học</button>
        <button className={`subtab ${tab === "process" ? "subtab-active" : ""}`} onClick={() => setTab("process")}><ClipboardList size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Cải thiện quy trình</button>
      </div>
      {tab === "lessons" ? (
        <LessonsSection items={lessons} resources={resources} trades={trades} onChange={onChangeLessons} />
      ) : (
        <ProcessImprovementSection items={processImprovements} onChange={onChangeProcessImprovements} />
      )}
    </div>
  );
}
