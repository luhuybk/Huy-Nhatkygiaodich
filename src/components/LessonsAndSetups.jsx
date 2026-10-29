import { useState, useMemo, useRef, useLayoutEffect, Suspense, lazy } from "react";
import { useNavTab } from "../lib/useBackNav.js";
import { Pencil, Layers, Filter, Plus, BookOpen, ClipboardList, ChevronDown, ChevronRight, Wrench, Newspaper, Eye, EyeOff, SkipForward, Shapes, Dumbbell, Map as MapIcon, SquareArrowOutUpRight, TrendingUp, CalendarRange, Printer } from "lucide-react";
import { ChecklistEditor, ChipSelect, ConfirmButton, DangerConfirmButton, Field, FilterShell, FormModal, IdSelect, ImageOrLink, MultiChipSelect, MultiImageOrLink, ImagePreviewStrip as Strip, ResourceSelect, NoteText, ShotGallery, SymbolInput, clickOrDouble } from "./ui.jsx";
import { MAJOR_CURRENCIES, REVIEW_DIRECTIONS } from "../lib/constants.js";
import { applyLessonFilters, countByLevel, fmtR, groupByLevel, groupByMonth, groupByReason, missedVsPerformance, readLocalUi, writeLocalUi, lessonLevel, lessonLevelMeta, LESSON_LEVELS, applyMissSkipFilters, countPendingWatch, groupBySetup, watchState, WATCH_FILTERS, applyNewsLogFilters, applyProblemLogFilters, emptyLesson, emptyMissed, emptyNewsLog, emptyProblemLog, emptySetupDef, emptySetupVariant, emptySkipped, emptyVariant, variantDesc, variantNoteRest, lessonAttachments, lessonTitle, LESSON_MAX_IMAGES, MISS_MAX_IMAGES, NEWS_MAX_IMAGES, PROBLEM_MAX_IMAGES, SKIP_MAX_IMAGES, VARIANT_MAX_IMAGES, startOfWeek, todayStr, uid, canonicalSymbol, ISSUE_STATUS, tradeIssues, PROBLEM_RESULTS, PROBLEM_STAGES, emptyProblemRound, problemRounds, problemStage, problemStageMeta } from "../lib/helpers.js";

const ProcessImprovementSection = lazy(() => import("./ProcessImprovement.jsx").then((m) => ({ default: m.ProcessImprovementSection })));
const SkillsPage = lazy(() => import("./Skills.jsx").then((m) => ({ default: m.SkillsPage })));
const TradingPlanSection = lazy(() => import("./TradingPlans.jsx").then((m) => ({ default: m.TradingPlanSection })));
const PrintMissSkip = lazy(() => import("./PrintMissSkip.jsx").then((m) => ({ default: m.PrintMissSkip })));

// `showWatch` chỉ bật ở Bị miss / Bị skip. Biến thể không có khái niệm theo dõi, hiện ô lọc
// đó ở đấy chỉ tổ khiến người dùng tưởng mình quên đánh dấu.
export function MissSkipFilterPanel({ filters, setFilters, resources, reasonOptions, dateKeyLabel, items, showWatch }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  // Đếm trên TOÀN BỘ danh sách chứ không phải danh sách đã lọc: con số này để bạn biết còn
  // bao nhiêu việc chưa xem, nó phải đứng yên khi bạn nghịch các bộ lọc khác.
  const pending = countPendingWatch(items);
  const onlyPending = filters.watch === "pending";
  return (
    <FilterShell filters={filters} onClear={clear}
      before={showWatch ? (
        <button type="button" className={`watch-quick ${onlyPending ? "watch-quick-on" : ""} ${pending ? "" : "watch-quick-empty"}`}
          title="Lọc nhanh những cái bạn đã đánh dấu theo dõi mà chưa review — dành cho buổi xem lại cuối tuần"
          onClick={() => setFilters((p) => ({ ...p, watch: onlyPending ? "" : "pending" }))}>
          <Eye size={14} /> Cần theo dõi
          <span className="watch-quick-count">{pending}</span>
        </button>
      ) : null}
      search={<input className="input filter-q" placeholder="Tìm theo symbol..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />}>
      <ResourceSelect value={filters.timeframe || ""} onChange={set("timeframe")} options={resources.timeframes} placeholder="Khung thời gian" />
      <ResourceSelect value={filters.setup || ""} onChange={set("setup")} options={resources.setups} groups={resources.setupGroups} placeholder="Setup" />
      {reasonOptions ? <ResourceSelect value={filters.reason || ""} onChange={set("reason")} options={reasonOptions} placeholder="Lý do" /> : null}
      {showWatch ? (
        <select className="input" value={filters.watch || ""} onChange={(e) => set("watch")(e.target.value)}>
          <option value="">Mọi trạng thái theo dõi</option>
          {WATCH_FILTERS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : null}
      <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title={`${dateKeyLabel} từ ngày`} />
      <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title={`${dateKeyLabel} đến ngày`} />
    </FilterShell>
  );
}

// Mỗi cách nhóm trả lời một câu hỏi khác nhau, nên không có cách nào "đúng" để chốt cứng:
// Lý do -> "vì sao mình cứ bỏ lỡ"; Setup -> "mình mù cái setup nào"; Ngày -> "gần đây bỏ lỡ gì".
const GROUP_MODES = [
  { id: "reason", label: "Lý do", icon: Filter, empty: "Chưa ghi lý do" },
  { id: "setup", label: "Setup", icon: Shapes, empty: "Chưa gán setup" },
  { id: "date", label: "Ngày", icon: CalendarRange, empty: "Chưa ghi ngày" },
];

function buildMissSkipGroups(items, dateField, mode, setups) {
  if (mode === "setup") {
    return groupBySetup(items, setups, dateField)
      .map((g) => ({ key: g.setup || "__none", label: g.setup, list: g.list }));
  }
  if (mode === "date") {
    return groupByMonth(items, dateField)
      .map((g) => ({ key: g.month || "__none", label: g.month ? g.label : "", list: g.list }));
  }
  return groupByReason(items, dateField)
    .map((g) => ({ key: g.reason || "__none", label: g.reason, list: g.list }));
}

function GroupByPicker({ value, onChange }) {
  return (
    <div className="group-by">
      <span className="group-by-label">Nhóm theo</span>
      {GROUP_MODES.map((m) => (
        <button key={m.id} type="button"
          className={`group-by-btn ${value === m.id ? "group-by-on" : ""}`}
          onClick={() => onChange(m.id)}>
          <m.icon size={12} /> {m.label}
        </button>
      ))}
    </div>
  );
}

// Miss và Skip có cùng hình dạng dữ liệu nên dùng chung một thẻ. Bảng cũ 10 cột rộng 818px,
// trên điện thoại phải cuộn ngang gần 480px mới thấy hai cột cuối — mà hai cột cuối lại đúng
// là "Review" và "Theo dõi", thứ đáng nhìn nhất. Thẻ đưa chúng lên ngay đầu.
function MissSkipCards({ groups, dateField, mode, onView, onEdit, onRemove }) {
  const meta = GROUP_MODES.find((m) => m.id === mode) || GROUP_MODES[0];
  const HeadIcon = meta.icon;
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="var-groups">
      {groups.map((g) => (
        <section key={g.key} className="var-group">
          <h4 className="var-group-head">
            <HeadIcon size={14} />
            <span className={g.label ? "" : "var-group-none"}>{g.label || meta.empty}</span>
            <span className="var-group-count">{g.list.length} lần</span>
          </h4>
          <div className="var-grid">
            {g.list.map((n) => {
              const dir = REVIEW_DIRECTIONS.find((d) => d.id === n.reviewDirection);
              const shots = lessonAttachments(n).filter((a) => a.image || a.link);
              return (
                <article key={n.id} className={`var-card ms-card ${watchState(n) === "pending" ? "ms-card-watch" : ""}`}
                  role="button" tabIndex={0} title="Bấm để xem ảnh · bấm đúp để sửa"
                  onClick={(e) => clickOrDouble(e, () => onView(n), () => onEdit(n))}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(n); }
                  }}>
                  {shots.length ? (
                    <div className="var-card-shots" onClick={(e) => e.stopPropagation()}>
                      <Strip items={shots} empty={false} />
                    </div>
                  ) : null}
                  <div className="var-card-head">
                    <b>{n.symbol || "—"}</b>
                    {n.timeframe ? <span className="var-card-tf mono">{n.timeframe}</span> : null}
                    <span className="var-card-date mono">{n[dateField] || "—"}</span>
                    <span className="var-card-tools" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="row-btn" aria-label="Sửa" onClick={() => onEdit(n)}><Pencil size={13} /></button>
                      <ConfirmButton onConfirm={() => onRemove(n.id)} />
                    </span>
                  </div>
                  {n.setup ? <span className="ms-card-setup">{n.setup}</span> : null}
                  {n.watch || dir ? (
                    <div className="ms-card-flags">
                      {n.watch ? (
                        <span className={`watch-badge ${n.watchDone ? "watch-badge-done" : ""}`}>
                          <Eye size={12} /> {n.watchDone ? "Đã theo dõi" : "Cần theo dõi"}
                        </span>
                      ) : null}
                      {dir ? <span className={`outcome-pill ${dir.tone || ""}`} style={{ fontSize: 11 }}>{dir.label}</span> : null}
                    </div>
                  ) : null}
                  {n.note || n.reviewNote ? (
                    <>
                      <button type="button" className="var-card-more"
                        onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                        {open.has(n.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Ghi chú
                      </button>
                      {open.has(n.id) ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          {n.note ? <p className="var-card-note ms-card-note"><NoteText text={n.note} /></p> : null}
                          {n.reviewNote ? (
                            <p className="var-card-note ms-card-note ms-card-review"><b>Review:</b> <NoteText text={n.reviewNote} /></p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Bấm thẻ thì mở khung xem: ảnh chart thật (link TradingView đổi sang PNG như ở chi tiết lệnh),
// lý do, ghi chú, review. Trước đây bấm là vào thẳng form sửa, còn ảnh chỉ là biểu tượng phải rê
// chuột mới hiện — trên điện thoại không rê chuột được nên coi như không xem được ảnh.
// Dùng chung cho Biến thể: không có lý do / theo dõi / review thì các dòng đó tự ẩn, thêm mô tả.
function MissSkipDetail({ item: n, dateField, kindLabel, onEdit, onRemove, onClose }) {
  const shots = lessonAttachments(n).filter((a) => a && (a.image || a.link))
    .map((a, i) => ({ key: `${i}|${a.link || ""}|${a.image || ""}`, label: `Ảnh ${i + 1}`, image: a.image, link: a.link }));
  const dir = REVIEW_DIRECTIONS.find((d) => d.id === n.reviewDirection);
  return (
    <FormModal title={`${n.symbol || "—"}${n.timeframe ? ` · ${n.timeframe}` : ""} · ${n[dateField] || "chưa ghi ngày"}`} onClose={onClose}>
      <div className="ms-detail-tags">
        <span className="note-type">{kindLabel}</span>
        {n.setup ? <span className="ms-card-setup">{n.setup}</span> : null}
        {n.reason ? <span className="note-type">Lý do: {n.reason}</span> : null}
        {n.watch ? (
          <span className={`watch-badge ${n.watchDone ? "watch-badge-done" : ""}`}>
            <Eye size={12} /> {n.watchDone ? "Đã theo dõi" : "Cần theo dõi"}
          </span>
        ) : null}
        {dir ? <span className={`outcome-pill ${dir.tone || ""}`} style={{ fontSize: 11 }}>{dir.label}</span> : null}
      </div>
      {shots.length ? <ShotGallery shots={shots} /> : (
        <p className="empty-note" style={{ padding: "14px 0" }}>Chưa có ảnh — bấm Sửa để dán link TradingView.</p>
      )}
      {n.desc ? <p className="var-card-desc" style={{ marginTop: 12 }}>{n.desc}</p> : null}
      {n.note ? <p className="var-card-note ms-card-note" style={{ marginTop: 12 }}><NoteText text={n.note} /></p> : null}
      {n.reviewNote || n.reviewDate ? (
        <p className="var-card-note ms-card-note ms-card-review" style={{ marginTop: 10 }}>
          <b>Review{n.reviewDate ? ` · ${n.reviewDate}` : ""}:</b> <NoteText text={n.reviewNote || "—"} />
        </p>
      ) : null}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => { onRemove(n.id); onClose(); }} />
        <button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button>
        <button type="button" className="btn btn-primary" onClick={() => onEdit(n)}><Pencil size={14} /> Sửa</button>
      </div>
    </FormModal>
  );
}

// Nút In ở đầu mục: in đúng danh sách đang lọc. Trang in nặng (thư viện PDF, ảnh) nên chỉ tải khi bấm.
function MissSkipPrint({ kind, items, filters, onClose }) {
  const label = filters.from || filters.to ? `${filters.from || "…"} → ${filters.to || "…"}` : "";
  return (
    <Suspense fallback={null}>
      <PrintMissSkip kind={kind} items={items} label={label} onClose={onClose} />
    </Suspense>
  );
}

export function MissedSetupsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptyMissed());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  // Mã đã dùng ở đâu đó thì giữ đúng cách viết đó khi chuẩn hoá ô Symbol.
  const knownSymbols = useMemo(() => [...resources.symbols, ...items.map((n) => n.symbol)], [resources.symbols, items]);
  const [viewId, setViewId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const viewing = viewId ? items.find((n) => n.id === viewId) : null;
  const openNew = () => { setForm(emptyMissed()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setViewId(null); setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyMissed()); setError(""); };
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, symbol: canonicalSymbol(form.symbol, knownSymbols), id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyMissed());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const filtered = useMemo(() => applyMissSkipFilters(items, filters, "missDate"), [items, filters]);
  const [groupBy, setGroupBy] = useState(() => readLocalUi("missGroupBy", "reason"));
  const pickGroup = (m) => { setGroupBy(m); writeLocalUi("missGroupBy", m); };
  const groups = useMemo(() => buildMissSkipGroups(filtered, "missDate", groupBy, resources.setups), [filtered, groupBy, resources.setups]);

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại những setup bạn nhận ra nhưng không vào lệnh — để sau này xem lại có nên tối ưu quy trình không.</p>
        <span className="section-head-actions">
          <button type="button" className="btn btn-ghost" disabled={!filtered.length} onClick={() => setPrinting(true)}
            title="In / tải PDF những setup đang hiện (theo bộ lọc)"><Printer size={15} /> In / PDF</button>
          <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup bị miss</button>
        </span>
      </div>
      {viewing && !modalOpen ? (
        <MissSkipDetail item={viewing} dateField="missDate" kindLabel="Bị miss"
          onEdit={openEdit} onRemove={remove} onClose={() => setViewId(null)} />
      ) : null}
      {printing ? <MissSkipPrint kind="missed" items={filtered} filters={filters} onClose={() => setPrinting(false)} /> : null}
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa setup bị miss" : "Thêm setup bị miss"} onClose={closeModal} linkOwner={`missed:${form.id || "new"}`}>
          <div className="grid-3">
            <Field label="Symbol">
              <SymbolInput value={form.symbol} onChange={setF("symbol")} known={knownSymbols} listId="symbol-suggestions-miss" />
            </Field>
            <Field label="Ngày miss">
              <input type="date" className="input" value={form.missDate} onChange={(e) => setF("missDate")(e.target.value)} />
            </Field>
            <Field label="Khung thời gian">
              <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
            </Field>
          </div>
          <Field label="Setup">
            <ResourceSelect value={form.setup} onChange={setF("setup")} options={resources.setups} groups={resources.setupGroups} placeholder="Chọn setup" />
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
          {form.watch ? (
            <div className="section" style={{ marginTop: 10 }}>
              <div className="section-body" style={{ paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
                <p className="field-hint" style={{ marginBottom: 10 }}>Review sau vài ngày — quay lại đây khi đã có đủ thời gian để xem hướng đi thực tế nếu đã vào lệnh.</p>
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
                <label className={`checklist-item ${form.watchDone ? "checklist-checked" : ""}`}>
                  <input type="checkbox" checked={!!form.watchDone} onChange={(e) => setF("watchDone")(e.target.checked)} />
                  <span>Đã hoàn thành theo dõi (đã review xong)</span>
                </label>
              </div>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu setup bị miss"}</button>
          </div>
        </FormModal>
      ) : null}
      <MissSkipFilterPanel items={items} filters={filters} setFilters={setFilters} resources={resources} reasonOptions={resources.missReasons} dateKeyLabel="Ngày miss" showWatch />
      {filtered.length === 0 ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có setup bị miss nào khớp bộ lọc.</p>
      ) : (
        <>
          <GroupByPicker value={groupBy} onChange={pickGroup} />
          <MissSkipCards groups={groups} dateField="missDate" mode={groupBy} onView={(n) => setViewId(n.id)} onEdit={openEdit} onRemove={remove} />
        </>
      )}
    </div>
  );
}

export function SkippedSetupsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptySkipped());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  // Mã đã dùng ở đâu đó thì giữ đúng cách viết đó khi chuẩn hoá ô Symbol.
  const knownSymbols = useMemo(() => [...resources.symbols, ...items.map((n) => n.symbol)], [resources.symbols, items]);
  const [viewId, setViewId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const viewing = viewId ? items.find((n) => n.id === viewId) : null;
  const openNew = () => { setForm(emptySkipped()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setViewId(null); setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptySkipped()); setError(""); };
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, symbol: canonicalSymbol(form.symbol, knownSymbols), id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptySkipped());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const filtered = useMemo(() => applyMissSkipFilters(items, filters, "skipDate"), [items, filters]);
  const [groupBy, setGroupBy] = useState(() => readLocalUi("skipGroupBy", "reason"));
  const pickGroup = (m) => { setGroupBy(m); writeLocalUi("skipGroupBy", m); };
  const groups = useMemo(() => buildMissSkipGroups(filtered, "skipDate", groupBy, resources.setups), [filtered, groupBy, resources.setups]);

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại những lệnh bạn chủ động bỏ qua (skip) dù đã cân nhắc — kèm review sau vài ngày để xem hướng lệnh diễn biến ra sao, giúp đánh giá quyết định skip có đúng không.</p>
        <span className="section-head-actions">
          <button type="button" className="btn btn-ghost" disabled={!filtered.length} onClick={() => setPrinting(true)}
            title="In / tải PDF những setup đang hiện (theo bộ lọc)"><Printer size={15} /> In / PDF</button>
          <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup bị skip</button>
        </span>
      </div>
      {viewing && !modalOpen ? (
        <MissSkipDetail item={viewing} dateField="skipDate" kindLabel="Bị skip"
          onEdit={openEdit} onRemove={remove} onClose={() => setViewId(null)} />
      ) : null}
      {printing ? <MissSkipPrint kind="skipped" items={filtered} filters={filters} onClose={() => setPrinting(false)} /> : null}
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa setup bị skip" : "Thêm setup bị skip"} onClose={closeModal} linkOwner={`skipped:${form.id || "new"}`}>
          <div className="grid-3">
            <Field label="Symbol">
              <SymbolInput value={form.symbol} onChange={setF("symbol")} known={knownSymbols} listId="symbol-suggestions-skip" />
            </Field>
            <Field label="Ngày skip">
              <input type="date" className="input" value={form.skipDate} onChange={(e) => setF("skipDate")(e.target.value)} />
            </Field>
            <Field label="Khung thời gian">
              <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
            </Field>
          </div>
          <Field label="Setup">
            <ResourceSelect value={form.setup} onChange={setF("setup")} options={resources.setups} groups={resources.setupGroups} placeholder="Chọn setup" />
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
          <button
            type="button"
            className={`lesson-toggle-btn ${form.watch ? "lesson-toggle-active lesson-toggle-glow" : ""}`}
            style={{ marginTop: 4 }}
            onClick={() => setF("watch")(!form.watch)}
          >
            <Eye size={15} /> {form.watch ? "👁 Cần theo dõi lệnh này" : "Đánh dấu cần theo dõi (tùy chọn)"}
          </button>
          {form.watch ? (
            <div className="section" style={{ marginTop: 10 }}>
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
                <label className={`checklist-item ${form.watchDone ? "checklist-checked" : ""}`}>
                  <input type="checkbox" checked={!!form.watchDone} onChange={(e) => setF("watchDone")(e.target.checked)} />
                  <span>Đã hoàn thành theo dõi (đã review xong)</span>
                </label>
              </div>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu setup bị skip"}</button>
          </div>
        </FormModal>
      ) : null}
      <MissSkipFilterPanel items={items} filters={filters} setFilters={setFilters} resources={resources} reasonOptions={resources.skipReasons} dateKeyLabel="Ngày skip" showWatch />
      {filtered.length === 0 ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có setup bị skip nào khớp bộ lọc.</p>
      ) : (
        <>
          <GroupByPicker value={groupBy} onChange={pickGroup} />
          <MissSkipCards groups={groups} dateField="skipDate" mode={groupBy} onView={(n) => setViewId(n.id)} onEdit={openEdit} onRemove={remove} />
        </>
      )}
    </div>
  );
}

export function SetupVariantsSection({ items, resources, onChange }) {
  const [form, setForm] = useState(emptyVariant());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  // Mã đã dùng ở đâu đó thì giữ đúng cách viết đó khi chuẩn hoá ô Symbol.
  const knownSymbols = useMemo(() => [...resources.symbols, ...items.map((n) => n.symbol)], [resources.symbols, items]);
  const [viewId, setViewId] = useState(null);
  const viewing = viewId ? items.find((n) => n.id === viewId) : null;
  const openNew = () => { setForm(emptyVariant()); setError(""); setModalOpen(true); };
  const openEdit = (n) => { setViewId(null); setForm({ ...n, images: lessonAttachments(n).length ? lessonAttachments(n) : [{ link: "", image: "" }] }); setError(""); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setForm(emptyVariant()); setError(""); };
  const save = () => {
    if (!form.symbol.trim()) { setError("Nhập symbol trước đã."); return; }
    setError("");
    const payload = { ...form, symbol: canonicalSymbol(form.symbol, knownSymbols), id: form.id || uid() };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyVariant());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  // Xếp theo ngày thì biến thể của cùng một setup nằm rải rác, không so với nhau được.
  // Gom theo loại setup, trong mỗi nhóm mới xếp mới nhất trước.
  const groups = useMemo(
    () => groupBySetup(applyMissSkipFilters(items, filters, "variantDate"), resources.setups, "variantDate"),
    [items, filters, resources.setups]
  );
  const shown = groups.reduce((n, g) => n + g.list.length, 0);
  // Ghi chú dài làm thẻ cao lệch nhau và che mất phần còn lại — mặc định gấp, bấm mới mở.
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const toggleNote = (id) => setOpenNotes((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Cùng một setup nhưng nến chạy khác đi nên lúc giao dịch không nhận ra, xong lệnh nhìn lại mới thấy. Lưu ảnh lại để lần sau nhận diện được sớm hơn.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm biến thể</button>
      </div>
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa setup biến thể" : "Thêm setup biến thể"} onClose={closeModal} linkOwner={`variant:${form.id || "new"}`}>
          <div className="grid-3">
            <Field label="Symbol">
              <SymbolInput value={form.symbol} onChange={setF("symbol")} known={knownSymbols} listId="symbol-suggestions-variant" />
            </Field>
            <Field label="Ngày">
              <input type="date" className="input" value={form.variantDate} onChange={(e) => setF("variantDate")(e.target.value)} />
            </Field>
            <Field label="Khung thời gian">
              <ResourceSelect value={form.timeframe} onChange={setF("timeframe")} options={resources.timeframes} placeholder="Chọn timeframe" />
            </Field>
          </div>
          <Field label="Setup">
            <ResourceSelect value={form.setup} onChange={setF("setup")} options={resources.setups} groups={resources.setupGroups} placeholder="Chọn setup" />
          </Field>
          <Field label="Link / hình ảnh TradingView" hint={`Tối đa ${VARIANT_MAX_IMAGES} ảnh/link`}>
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="variant" max={VARIANT_MAX_IMAGES} />
          </Field>
          <Field label="Mô tả biến thể" hint="Một dòng ngắn để nhận ra ngay trên thẻ — luôn hiện, không phải bấm mở.">
            <input className="input" value={form.desc || ""} onChange={(e) => setF("desc")(e.target.value)} placeholder="VD: Reversal + Doji" />
          </Field>
          <Field label="Ghi chú (tùy chọn)" hint="Phân tích dài để dành: trên thẻ nó được thu gọn, bấm mới mở ra. Xuống dòng ở đây thì ngoài thẻ cũng xuống dòng y hệt.">
            <textarea className="input textarea" value={form.note} onChange={(e) => setF("note")(e.target.value)} placeholder="VD: nến rút chân dài hơn thường lệ, vào chậm 1 nến..." />
          </Field>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="form-actions" style={{ marginTop: 4 }}>
            {form.id ? <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => remove(form.id)} /> : null}
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Lưu biến thể"}</button>
          </div>
        </FormModal>
      ) : null}
      {viewing && !modalOpen ? (
        <MissSkipDetail item={viewing} dateField="variantDate" kindLabel="Biến thể"
          onEdit={openEdit} onRemove={remove} onClose={() => setViewId(null)} />
      ) : null}
      <MissSkipFilterPanel items={items} filters={filters} setFilters={setFilters} resources={resources} dateKeyLabel="Ngày" />
      {shown === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có biến thể nào khớp bộ lọc.</p> : (
        <div className="var-groups">
          {groups.map((g) => (
            <section key={g.setup || "__none__"} className="var-group">
              <h4 className="var-group-head">
                <Shapes size={14} />
                <span className={g.setup ? "" : "var-group-none"}>{g.setup || "Chưa gán setup"}</span>
                <span className="var-group-count">{g.list.length} biến thể</span>
              </h4>
              <div className="var-grid">
                {g.list.map((n) => (
                  <article key={n.id} className="var-card" role="button" tabIndex={0} title="Bấm để xem ảnh · bấm đúp để sửa"
                    onClick={(e) => clickOrDouble(e, () => setViewId(n.id), () => openEdit(n))}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewId(n.id); }
                    }}>
                    {lessonAttachments(n).some((a) => a.image || a.link) ? (
                      <div className="var-card-shots" onClick={(e) => e.stopPropagation()}>
                        <Strip items={lessonAttachments(n)} empty={false} />
                      </div>
                    ) : null}
                    <div className="var-card-head">
                      <b>{n.symbol || "—"}</b>
                      {n.timeframe ? <span className="var-card-tf mono">{n.timeframe}</span> : null}
                      <span className="var-card-date mono">{n.variantDate || "—"}</span>
                      <span className="var-card-tools" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="row-btn" aria-label="Sửa biến thể" onClick={() => openEdit(n)}><Pencil size={13} /></button>
                        <ConfirmButton onConfirm={() => remove(n.id)} />
                      </span>
                    </div>
                    {variantDesc(n) ? <p className="var-card-desc">{variantDesc(n)}</p> : null}
                    {variantNoteRest(n) ? (
                      <>
                        <button type="button" className="var-card-more"
                          onClick={(e) => { e.stopPropagation(); toggleNote(n.id); }}>
                          {openNotes.has(n.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          Ghi chú
                        </button>
                        {openNotes.has(n.id) ? (
                          <p className="var-card-note" onClick={(e) => e.stopPropagation()}>{variantNoteRest(n)}</p>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// "Setup nào mình hay bỏ lỡ" và "setup nào đánh có ăn" là hai câu hỏi nằm ở hai trang khác
// nhau, nên chẳng ai ghép lại. Bỏ lỡ nhiều một setup đang lỗ thì chẳng mất gì; bỏ lỡ nhiều
// đúng setup lời nhất mới là tiền mất thật — đó là thứ bảng này đi tìm.
function MissCostSection({ missedSetups, skippedSetups, trades }) {
  const rows = useMemo(() => missedVsPerformance(missedSetups, skippedSetups, trades), [missedSetups, skippedSetups, trades]);
  const worst = rows.find((r) => r.rPerTrade !== null && r.rPerTrade > 0 && r.total >= 2);

  if (!rows.length) {
    return (
      <p className="empty-note" style={{ padding: "24px 0" }}>
        Chưa có setup nào vừa bị miss/skip vừa có tên setup — ghi setup vào các mục Bị miss / Bị skip là bảng này tự hiện.
      </p>
    );
  }

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Ghép số lần bỏ lỡ với kết quả thật của chính setup đó. Cột <b>Ước tính bỏ lỡ</b> là
        số lần bỏ lỡ × R trung bình mỗi lệnh của setup — chỉ là ước lượng thô (không phải lần
        nào vào cũng ăn được bằng trung bình), nhưng đủ để biết nên tiếc cái nào trước.
        Số âm nghĩa là setup đó đang lỗ — bỏ lỡ nó lại hoá may. Setup chưa từng đánh xong
        lệnh nào thì chưa có gì để so.
      </p>
      {worst ? (
        <div className="journey-summary" style={{ marginBottom: 12 }}>
          <span className="journey-summary-item" style={{ cursor: "default" }}>
            <Shapes size={13} /> Đáng tiếc nhất: <b>{worst.setup}</b> — bỏ lỡ {worst.total} lần,
            mỗi lệnh thực tế ăn {fmtR(worst.rPerTrade)}
          </span>
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Setup</th><th>Bỏ lỡ</th><th>Đã đánh</th><th>Winrate</th><th>R / lệnh</th><th>Ước tính bỏ lỡ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const est = r.rPerTrade !== null ? r.total * r.rPerTrade : null;
              return (
                <tr key={r.setup}>
                  <td><b>{r.setup}</b></td>
                  <td>{r.total} <span className="err-note">({r.miss} miss / {r.skip} skip)</span></td>
                  <td>{r.closed || "—"}</td>
                  <td>{r.winRate === null ? "—" : `${r.winRate.toFixed(0)}%`}</td>
                  <td className={r.rPerTrade === null ? "" : r.rPerTrade > 0 ? "text-win" : "text-loss"}>
                    {r.rPerTrade === null ? "chưa đánh" : fmtR(r.rPerTrade)}
                  </td>
                  <td className={est === null ? "" : est > 0 ? "text-win" : "text-loss"}>
                    <b>{est === null ? "—" : fmtR(est)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Bốn mục này cùng trả lời một câu hỏi ("setup nào mình đã bỏ lỡ hoặc chưa nhận ra?"),
// nên gộp về một trang thay vì các mục rời rạc ngoài menu.
export function SetupHubSection({ missedSetups, skippedSetups, setupVariants, trades, resources, onChangeMissed, onChangeSkipped, onChangeVariants }) {
  const [tab, setTab] = useNavTab("setupHubTab", "missed", { sticky: true, allowed: ["missed", "skipped", "variants", "cost"] });
  const tabs = [
    { key: "missed", label: "Bị miss", icon: EyeOff, count: missedSetups.length },
    { key: "skipped", label: "Bị skip", icon: SkipForward, count: skippedSetups.length },
    { key: "variants", label: "Biến thể", icon: Shapes, count: setupVariants.length },
    { key: "cost", label: "Chi phí bỏ lỡ", icon: TrendingUp, count: 0 },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 19, marginBottom: 12 }}>Setup tổng hợp</h2>
      <div className="subtabs">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={`subtab ${tab === t.key ? "subtab-active" : ""}`} onClick={() => setTab(t.key)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon size={13} /> {t.label}
                {t.count ? <span className="subtab-badge subtab-badge-muted">{t.count}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {tab === "missed" ? (
        <MissedSetupsSection items={missedSetups} resources={resources} onChange={onChangeMissed} />
      ) : tab === "skipped" ? (
        <SkippedSetupsSection items={skippedSetups} resources={resources} onChange={onChangeSkipped} />
      ) : tab === "variants" ? (
        <SetupVariantsSection items={setupVariants} resources={resources} onChange={onChangeVariants} />
      ) : (
        <MissCostSection missedSetups={missedSetups} skippedSetups={skippedSetups} trades={trades} />
      )}
    </div>
  );
}

export function LessonsFilterPanel({ filters, setFilters, resources }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <FilterShell filters={filters} onClear={clear}
      search={<input className="input filter-q" placeholder="Tìm theo symbol / nội dung..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />}>
      <ResourceSelect value={filters.category || ""} onChange={set("category")} options={resources.lessonCategories} placeholder="Danh mục" />
      <select className="input" value={filters.level || ""} onChange={(e) => set("level")(e.target.value)}>
        <option value="">Mọi cấp độ</option>
        {LESSON_LEVELS.map((L) => <option key={L.id} value={String(L.id)}>{L.label}</option>)}
        <option value="none">Chưa phân cấp</option>
      </select>
      <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
      <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
    </FilterShell>
  );
}

export function LessonsSection({ items, resources, trades, onChange, onOpenTrade }) {
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
  // Mã đã dùng ở đâu đó thì giữ đúng cách viết đó khi chuẩn hoá ô Symbol.
  const knownSymbols = useMemo(() => [...resources.symbols, ...trades.map((t) => t.symbol), ...items.map((n) => n.symbol)], [resources.symbols, trades, items]);
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
    const payload = { ...form, symbol: canonicalSymbol(form.symbol, knownSymbols), id: form.id || uid(), images: cleanedImages, link: "", image: "" };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    setModalOpen(false);
    setForm(emptyLesson());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const groups = useMemo(() => groupByLevel(applyLessonFilters(items, filters)), [items, filters]);
  const shown = groups.reduce((n, g) => n + g.list.length, 0);
  const counts = useMemo(() => countByLevel(items), [items]);
  // Phân cấp ngay trên thẻ: cả đống bài học cũ chưa đánh dấu, mở form từng cái thì không ai làm.
  const setLevel = (id, level) => onChange(items.map((n) => (n.id === id ? { ...n, level } : n)));

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại từng bài học rút ra từ giao dịch, phân loại theo danh mục (quản lý ở Tài nguyên → Danh mục bài học), kèm ảnh/link TradingView minh họa — để xem lại những điều cần chú ý.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm bài học</button>
      </div>
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa bài học" : "Thêm bài học"} onClose={closeModal}
          linkOwner={[`lesson:${form.id || "new"}`, form.tradeId ? `trade:${form.tradeId}` : ""]}>
          <div className="grid-2">
            <Field label="Ngày">
              <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
            </Field>
            <Field label="Symbol (tùy chọn)">
              <SymbolInput value={form.symbol} onChange={setF("symbol")} known={knownSymbols} listId="symbol-suggestions-lesson" />
            </Field>
          </div>
          <Field label="Danh mục bài học" hint="Có thể chọn nhiều danh mục cùng lúc">
            <MultiChipSelect value={form.categories} onChange={setF("categories")} options={resources.lessonCategories} />
          </Field>
          <Field label="Liên kết tới lệnh (tùy chọn)">
            <IdSelect value={form.tradeId} onChange={setF("tradeId")} items={tradeItems} placeholder="Không gắn với lệnh cụ thể" />
          </Field>
          <Field label="Tiêu đề" hint="Hiển thị ngắn gọn trong danh sách — để trống sẽ tự lấy từ nội dung">
            <input className="input" data-autocap value={form.title} onChange={(e) => setF("title")(e.target.value)} placeholder="VD: Đừng vào lệnh khi chưa đủ tín hiệu xác nhận" />
          </Field>
          <Field label="Mức độ quan trọng" hint="Cấp 1 lên đầu trang. Để trống cũng được — phân cấp nhanh được ngay trên thẻ.">
            <div className="lsn-pick lsn-pick-lg">
              {LESSON_LEVELS.map((L) => (
                <button key={L.id} type="button" title={L.hint}
                  className={`lsn-pick-btn ${lessonLevel(form) === L.id ? `lsn-pick-on lsn-pick-on-${L.id}` : ""}`}
                  onClick={() => setF("level")(lessonLevel(form) === L.id ? 0 : L.id)}>
                  {L.label}
                </button>
              ))}
            </div>
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
      {counts[0] > 0 && !filters.level ? (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Còn <b>{counts[0]} bài học chưa phân cấp</b> — bấm số 1/2/3 ngay trên thẻ là xong, không cần mở form.
        </p>
      ) : null}
      {shown === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có bài học nào khớp bộ lọc.</p> : (
        <div className="var-groups">
          {groups.map((g) => {
            const meta = lessonLevelMeta(g.level);
            return (
              <section key={g.level} className="var-group">
                <h4 className="var-group-head">
                  <BookOpen size={14} />
                  <span className={meta ? "" : "var-group-none"}>{meta ? meta.label : "Chưa phân cấp"}</span>
                  {meta ? <span className="lsn-head-hint">{meta.hint}</span> : null}
                  <span className="var-group-count">{g.list.length} bài</span>
                </h4>
                <div className="var-grid lsn-grid">
                  {g.list.map((n) => {
                    const linkedTrade = trades.find((t) => t.id === n.tradeId);
                    const attachments = lessonAttachments(n);
                    const isOpen = expanded.has(n.id);
                    return (
                      <article key={n.id} className={`var-card lsn-card lsn-card-lv${g.level}`} role="button" tabIndex={0}
                        title="Bấm để mở nội dung · bấm đúp để sửa"
                        onClick={(e) => clickOrDouble(e, () => toggleExpand(n.id), () => openEdit(n))}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(n); }
                        }}>
                        {attachments.length ? (
                          <div className="var-card-shots" onClick={(e) => e.stopPropagation()}>
                            <Strip items={attachments} empty={false} />
                          </div>
                        ) : null}
                        <div className="var-card-head">
                          <b className="lsn-card-title">{lessonTitle(n) || "(Chưa có nội dung)"}</b>
                          <span className="var-card-tools" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="row-btn" aria-label="Sửa bài học" onClick={() => openEdit(n)}><Pencil size={13} /></button>
                            <ConfirmButton onConfirm={() => remove(n.id)} />
                          </span>
                        </div>
                        <div className="lsn-card-meta">
                          {(n.categories || []).map((c) => <span key={c} className="note-type">{c}</span>)}
                          {linkedTrade && onOpenTrade ? (
                            <button type="button" className="lsn-trade-btn" title="Mở chi tiết lệnh này"
                              onClick={(e) => { e.stopPropagation(); onOpenTrade(linkedTrade); }}>
                              <SquareArrowOutUpRight size={11} />
                              <span className="mono">{linkedTrade.symbol || "Lệnh"} · {linkedTrade.entryDate || "—"}</span>
                            </button>
                          ) : n.symbol ? <span className="mono lsn-card-dim">{n.symbol}</span> : null}
                          {n.tradeId && !linkedTrade ? (
                            <span className="lsn-card-dim" title="Lệnh gắn với bài học này đã bị xóa">lệnh đã xóa</span>
                          ) : null}
                          <span className="mono lsn-card-dim lsn-card-date">{n.date || "—"}</span>
                        </div>
                        {n.content ? (
                          <>
                            <button type="button" className="var-card-more"
                              onClick={(e) => { e.stopPropagation(); toggleExpand(n.id); }}>
                              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Nội dung
                            </button>
                            {isOpen ? (
                              <p className="var-card-note" onClick={(e) => e.stopPropagation()}><NoteText text={n.content} /></p>
                            ) : null}
                          </>
                        ) : null}
                        <div className="lsn-pick" onClick={(e) => e.stopPropagation()}>
                          <span className="lsn-pick-label">Cấp</span>
                          {LESSON_LEVELS.map((L) => (
                            <button key={L.id} type="button"
                              className={`lsn-pick-btn ${g.level === L.id ? `lsn-pick-on lsn-pick-on-${L.id}` : ""}`}
                              title={g.level === L.id ? `${L.label} — bấm lần nữa để bỏ cấp` : `${L.label}: ${L.hint}`}
                              onClick={() => setLevel(n.id, g.level === L.id ? 0 : L.id)}>
                              {L.id}
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProblemLogFilterPanel({ filters, setFilters }) {
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});
  return (
    <FilterShell filters={filters} onClear={clear}
      search={<input className="input filter-q" placeholder="Tìm theo vấn đề / nguyên nhân / hướng xử lý..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />}>
      <select className="input" value={filters.status || ""} onChange={(e) => set("status")(e.target.value)}>
        <option value="">Tất cả giai đoạn</option>
        <option value="unresolved">Chưa xử lý xong</option>
        {PROBLEM_STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
      </select>
      <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
      <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
    </FilterShell>
  );
}

// Vấn đề ghi trong từng lệnh (mục 8 → tab Vấn đề) — gom lên đây để có một danh sách việc cần sửa duy
// nhất. Đổi trạng thái ngay tại đây (ghi thẳng vào lệnh), muốn sửa nội dung thì mở lệnh.
function TradeIssueList({ trades, onChangeTrades, onOpenTrade }) {
  const [showDone, setShowDone] = useState(false);
  const rows = useMemo(() => (trades || []).flatMap((t) => tradeIssues(t).map((x) => ({ t, x })))
    .sort((a, b) => (a.x.status === "done") - (b.x.status === "done") || String(b.x.foundDate || "").localeCompare(String(a.x.foundDate || ""))), [trades]);
  if (!rows.length) return null;
  const open = rows.filter((r) => r.x.status !== "done");
  const shown = showDone ? rows : open;
  const setStatus = (t, x, status) => onChangeTrades(trades.map((y) => (y.id !== t.id ? y : {
    ...y, issues: (y.issues || []).map((z) => (z && z.id === x.id ? { ...z, status, resolvedDate: status === "done" ? (z.resolvedDate || todayStr()) : "" } : z)),
  })));
  return (
    <div className="trade-issue-block">
      <div className="trade-issue-head">
        <b>Vấn đề trong lệnh</b>
        <span className="field-hint" style={{ margin: 0 }}>{open.length ? `${open.length} chưa xử lý xong` : "đã xử lý hết"} · {rows.length} tổng</span>
        {rows.length > open.length ? (
          <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowDone((v) => !v)}>{showDone ? "Ẩn vấn đề đã xử lý" : `Hiện cả ${rows.length - open.length} vấn đề đã xử lý`}</button>
        ) : null}
      </div>
      {shown.map(({ t, x }) => (
        <div key={`${t.id}-${x.id}`} className={`trade-issue-row issue-${x.status || "open"}`}>
          <div className="trade-issue-main">
            <span className="trade-issue-title">
              <b>{t.symbol || "—"}</b> <span className="field-hint" style={{ margin: 0 }}>{t.account || ""} · {t.entryDate || ""}</span>
              {x.type ? <span className="note-type">{x.type}</span> : null}
              {x.impact !== "" && x.impact !== undefined && x.impact !== null && Number(x.impact) ? <span className={`mono ${Number(x.impact) < 0 ? "text-loss" : "text-win"}`}>{Number(x.impact) > 0 ? "+" : ""}{x.impact}</span> : null}
            </span>
            {x.what ? <span className="trade-issue-text">{x.what}</span> : null}
            {x.fix ? <span className="trade-issue-text"><b>Xử lý:</b> {x.fix}</span> : null}
          </div>
          <div className="trade-issue-actions">
            <select className="input" value={x.status || "open"} onChange={(e) => setStatus(t, x, e.target.value)}>
              {ISSUE_STATUS.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
            {onOpenTrade ? <button type="button" className="btn btn-ghost" onClick={() => onOpenTrade(t)}>Mở lệnh</button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const shortDate = (d) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d || "");
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
// Mỗi vòng một màu cho dễ lần theo trên sơ đồ (vàng để dành cho Nguyên nhân, xanh/đỏ cho kết quả test).
const ROUND_COLORS = ["#5b9bd5", "#9b7fe0", "#3fb8a8", "#d96fa8", "#e0875a", "#a3b84a"];
const roundColor = (i) => ROUND_COLORS[i % ROUND_COLORS.length];

// Bấm chọn kết quả của một vòng test. Chọn xong (khác "Đang test") mà chưa ghi ngày kết thúc thì lấy hôm nay.
function setRoundResult(r, result) {
  return { ...r, result, to: result !== "testing" && !r.to ? todayStr() : r.to };
}

function ProblemResultSeg({ value, onChange }) {
  return (
    <span className="pb-res-seg" role="radiogroup" aria-label="Kết quả test">
      {PROBLEM_RESULTS.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={value === r.id}
          className={`pb-tone-r-${r.id} ${value === r.id ? "on" : ""}`} onClick={() => onChange(r.id)}>{r.label}</button>
      ))}
    </span>
  );
}

function ProblemRoundsEditor({ rounds, onChange }) {
  const patch = (id, next) => onChange(rounds.map((r) => (r.id === id ? next : r)));
  const last = rounds[rounds.length - 1];
  return (
    <div>
      {rounds.map((r, i) => (
        <div key={r.id} className="pb-round" style={{ "--rc": roundColor(i) }}>
          <div className="pb-round-head">
            <b className="pb-round-name">Vòng {i + 1}</b>
            <ProblemResultSeg value={r.result || "testing"} onChange={(v) => patch(r.id, setRoundResult(r, v))} />
            <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => onChange(rounds.filter((x) => x.id !== r.id))}>Bỏ vòng này</button>
          </div>
          <span className="pmm-kicker">Hướng xử lý</span>
          <textarea className="input textarea" style={{ minHeight: 60 }} value={r.idea} onChange={(e) => patch(r.id, { ...r, idea: e.target.value })}
            placeholder={i ? "Hướng xử lý đã chỉnh lại ở vòng này..." : "Hướng xử lý — VD: tạo nhắc hẹn không vào lệnh đồng tiền đó trong giờ ra tin"} />
          <div className="pb-round-dates">
            <span>Test từ</span>
            <input type="date" className="input" value={r.from || ""} onChange={(e) => patch(r.id, { ...r, from: e.target.value })} />
            <span>đến</span>
            <input type="date" className="input" value={r.to || ""} onChange={(e) => patch(r.id, { ...r, to: e.target.value })} />
            {r.from ? <span className="mono">{daysBetween(r.from, r.to || todayStr())} ngày</span> : null}
          </div>
          <span className="pmm-kicker">Kết quả test thực tế</span>
          <textarea className="input textarea" style={{ minHeight: 50 }} value={r.note} onChange={(e) => patch(r.id, { ...r, note: e.target.value })}
            placeholder="Kết quả test thực tế — VD: 2 tuần không vào lệnh giờ tin, nhưng 1 lần quên đặt nhắc..." />
          <span className="pmm-kicker">{r.result === "works" ? "Chốt / ghi nhớ" : "Rút ra — tối ưu tiếp"}</span>
          <textarea className="input textarea" style={{ minHeight: 50 }} value={r.next} onChange={(e) => patch(r.id, { ...r, next: e.target.value })}
            placeholder={r.result === "works" ? "Chốt lại / cần ghi nhớ gì..." : "Rút ra — vòng sau cần tối ưu gì..."} />
        </div>
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => onChange([...rounds, emptyProblemRound(last && last.next && last.result !== "works" ? last.next : "")])}>
        <Plus size={14} /> {rounds.length ? `Thêm vòng ${rounds.length + 1} (tối ưu tiếp)` : "Thêm hướng xử lý"}
      </button>
    </div>
  );
}

// Sơ đồ nhánh của một vấn đề: gốc là vấn đề, mỗi nhánh là nguyên nhân hoặc một vòng xử lý
// (Hướng xử lý → Test → Tối ưu). Đổi kết quả test, mở vòng mới, chốt đã xử lý ngay trên sơ đồ.
// Mũi tên nối từ ô cuối của vòng trước (Tối ưu tiếp) sang ô Hướng xử lý của vòng sau — vẽ bằng SVG
// phủ lên khung nhánh, đo lại vị trí mỗi khi khung đổi cỡ (màn hẹp các ô xếp dọc, chỗ nối khác hẳn).
function useRoundLinks(ref, deps) {
  const [links, setLinks] = useState([]);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const measure = () => {
      const c = box.getBoundingClientRect();
      const next = [];
      box.querySelectorAll("[data-round-last]").forEach((a) => {
        const i = Number(a.getAttribute("data-round-last"));
        const b = box.querySelector(`[data-round-first="${i + 1}"]`);
        if (!b) return;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        next.push({ i, x1: ra.left + ra.width / 2 - c.left, y1: ra.bottom - c.top, x2: rb.left + Math.min(rb.width / 2, 60) - c.left, y2: rb.top - c.top });
      });
      setLinks((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(box);
    return () => { if (ro) ro.disconnect(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return links;
}

function ProblemMindMap({ p, onSetResult, onAddRound, onResolve, onEdit }) {
  const rounds = problemRounds(p);
  const stage = problemStage(p);
  const meta = problemStageMeta(stage);
  const today = todayStr();
  const branchesRef = useRef(null);
  const links = useRoundLinks(branchesRef, [p]);
  return (
    <div className="pmm" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className={`pmm-root pb-tone-${stage}`}>
        <span className="pmm-kicker">Vấn đề · {shortDate(p.date)}</span>
        <b><NoteText text={p.problem} /></b>
        <span className="pb-pill">{meta.label}</span>
        <span className="field-hint" style={{ margin: 0 }}>{meta.hint}</span>
        <button type="button" className="btn btn-ghost pmm-edit" onClick={onEdit}><Pencil size={12} /> Sửa</button>
      </div>
      <div className="pmm-branches" ref={branchesRef}>
        <svg className="pmm-links" aria-hidden="true">
          {links.map((l) => {
            const color = roundColor(l.i + 1);
            const ey = l.y2 - 7;
            const bend = Math.max(10, (ey - l.y1) / 2);
            return (
              <g key={l.i}>
                <path d={`M${l.x1},${l.y1} C${l.x1},${l.y1 + bend} ${l.x2},${ey - bend} ${l.x2},${ey}`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <path d={`M${l.x2 - 5},${ey - 1} L${l.x2 + 5},${ey - 1} L${l.x2},${l.y2} Z`} fill={color} />
              </g>
            );
          })}
        </svg>
        {p.cause ? (
          <div className="pmm-branch">
            <div className="pmm-node pmm-cause"><span className="pmm-kicker">⚑ Nguyên nhân</span><NoteText text={p.cause} /></div>
          </div>
        ) : null}
        {rounds.map((r, i) => {
          const res = r.result || "testing";
          return (
            <div key={r.id} className="pmm-branch pmm-round" style={{ "--rc": roundColor(i) }}>
              <div className="pmm-chain">
                <div className="pmm-node pmm-idea" data-round-first={i}>
                  <span className="pmm-kicker"><span className="pmm-round-tag">Vòng {i + 1}</span> Hướng xử lý</span>
                  <NoteText text={r.idea || "—"} />
                </div>
                <span className="pmm-arrow" aria-hidden="true" />
                <div className={`pmm-node pmm-test pb-tone-r-${res}`} {...(r.next ? {} : { "data-round-last": i })}>
                  <span className="pmm-kicker">Test{r.from ? ` · ${shortDate(r.from)} → ${r.to ? shortDate(r.to) : "nay"} (${daysBetween(r.from, r.to || today)} ngày)` : ""}</span>
                  <select className="input pmm-result" value={res} onChange={(e) => onSetResult(r.id, e.target.value)} aria-label={`Kết quả test vòng ${i + 1}`}>
                    {PROBLEM_RESULTS.map((x) => <option key={x.id} value={x.id}>{x.short} {x.label}</option>)}
                  </select>
                  {r.note ? <NoteText text={r.note} /> : <span className="field-hint" style={{ margin: 0 }}>Chưa ghi kết quả thực tế</span>}
                </div>
                {r.next ? (
                  <>
                    <span className="pmm-arrow" aria-hidden="true" />
                    <div className="pmm-node pmm-next" data-round-last={i}>
                      <span className="pmm-kicker">{res === "works" ? "Chốt / ghi nhớ" : "Tối ưu tiếp"}</span>
                      <NoteText text={r.next} />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        {!p.resolved ? (
          <div className="pmm-branch">
            <div className="pmm-actions">
              <button type="button" className="pmm-add" onClick={onAddRound}>
                <Plus size={13} /> {rounds.length ? `Vòng ${rounds.length + 1}: tối ưu tiếp` : "Thêm hướng xử lý"}
              </button>
              {stage === "works" ? <button type="button" className="pmm-add pmm-close" onClick={onResolve}>✓ Chốt: đã xử lý xong</button> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProblemStageStrip({ items, value, onPick }) {
  const counts = useMemo(() => {
    const c = {};
    items.forEach((p) => { const st = problemStage(p); c[st] = (c[st] || 0) + 1; });
    return c;
  }, [items]);
  return (
    <div className="pb-stages">
      {PROBLEM_STAGES.map((st) => (
        <button key={st.id} type="button" title={st.hint} className={`pb-stage-btn pb-tone-${st.id} ${value === st.id ? "on" : ""}`}
          onClick={() => onPick(value === st.id ? "" : st.id)}>
          {st.label} <b>{counts[st.id] || 0}</b>
        </button>
      ))}
    </div>
  );
}

export function ProblemLogSection({ items, onChange, trades, onChangeTrades, onOpenTrade }) {
  const [form, setForm] = useState(emptyProblemLog());
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [allOpen, setAllOpen] = useState(false);
  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm({ ...emptyProblemLog(), rounds: [emptyProblemRound()] }); setError(""); setModalOpen(true); };
  const openEdit = (n, addRound) => {
    const rounds = problemRounds(n);
    const last = rounds[rounds.length - 1];
    setForm({
      ...n, cause: n.cause || "",
      rounds: addRound ? [...rounds, emptyProblemRound(last && last.next && last.result !== "works" ? last.next : "")] : rounds,
      images: (n.images && n.images.length) ? n.images : [{ link: "", image: "" }],
    });
    setError("");
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setForm(emptyProblemLog()); setError(""); };
  const save = () => {
    if (!form.problem.trim()) { setError("Nhập vấn đề gặp phải trước đã."); return; }
    setError("");
    const cleanedImages = (form.images || []).filter((it) => (it.link && it.link.trim()) || it.image);
    const rounds = problemRounds({ rounds: form.rounds });
    // `solution` giữ hướng xử lý của vòng gần nhất cho bản sao lưu / dữ liệu cũ đọc được.
    const payload = { ...form, id: form.id || uid(), images: cleanedImages, rounds, solution: rounds.length ? rounds[rounds.length - 1].idea : "" };
    const exists = items.some((n) => n.id === payload.id);
    onChange(exists ? items.map((n) => (n.id === payload.id ? payload : n)) : [...items, payload]);
    // Vấn đề vừa tạo mở sẵn sơ đồ để thấy ngay vòng xử lý đầu tiên.
    if (!exists) setExpanded((prev) => { const next = new Set(prev); if (allOpen) next.delete(payload.id); else next.add(payload.id); return next; });
    setModalOpen(false);
    setForm(emptyProblemLog());
  };
  const remove = (id) => { onChange(items.filter((n) => n.id !== id)); if (form.id === id) closeModal(); };
  const update = (n, fn) => onChange(items.map((it) => (it.id === n.id ? fn(it) : it)));
  const toggleResolved = (n, e) => { e.stopPropagation(); update(n, (it) => ({ ...it, resolved: !it.resolved })); };
  const setResult = (n, roundId, result) => update(n, (it) => {
    const rounds = problemRounds(it).map((r) => (r.id === roundId ? setRoundResult(r, result) : r));
    return { ...it, rounds, solution: rounds.length ? rounds[rounds.length - 1].idea : "" };
  });
  const sorted = useMemo(
    () => applyProblemLogFilters(items, filters).sort((a, b) => (a.resolved - b.resolved) || (b.date || "").localeCompare(a.date || "")),
    [items, filters]
  );

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Mỗi vấn đề đi theo vòng: <b>hướng xử lý → test thử → ghi kết quả → tối ưu tiếp</b>, tới khi chốt được cách làm. Bấm vào vấn đề để xem sơ đồ.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm vấn đề</button>
      </div>
      {trades && onChangeTrades ? <TradeIssueList trades={trades} onChangeTrades={onChangeTrades} onOpenTrade={onOpenTrade} /> : null}
      <ProblemStageStrip items={items} value={filters.status || ""} onPick={(v) => setFilters((p) => ({ ...p, status: v }))} />
      <ProblemLogFilterPanel filters={filters} setFilters={setFilters} />
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa vấn đề" : "Ghi nhận vấn đề mới"} onClose={closeModal} linkOwner={`problem:${form.id || "new"}`}>
          <Field label="Ngày">
            <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
          </Field>
          <Field label="Vấn đề gặp phải" required>
            <textarea className="input textarea" style={{ minHeight: 70 }} value={form.problem} onChange={(e) => setF("problem")(e.target.value)} placeholder="VD: FOMO vào lệnh khi có giờ ra tin..." />
          </Field>
          <Field label="Nguyên nhân">
            <textarea className="input textarea pb-cause-input" style={{ minHeight: 50 }} value={form.cause || ""} onChange={(e) => setF("cause")(e.target.value)} placeholder="Vì sao xảy ra — VD: không xem lịch tin trước phiên, thấy nến chạy mạnh là vào..." />
          </Field>
          <Field label="Các vòng xử lý">
            <ProblemRoundsEditor rounds={form.rounds || []} onChange={setF("rounds")} />
          </Field>
          <Field label={`Link / hình ảnh minh họa (tối đa ${PROBLEM_MAX_IMAGES})`}>
            <MultiImageOrLink items={form.images} onChange={setF("images")} label="problem" max={PROBLEM_MAX_IMAGES} />
          </Field>
          <Field label="Trạng thái">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.resolved} onChange={(e) => setF("resolved")(e.target.checked)} />
              <span>Đã xử lý xong — chốt cách làm</span>
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
      {sorted.length ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setAllOpen((v) => !v); setExpanded(new Set()); }}>{allOpen ? "Thu gọn tất cả" : "Mở sơ đồ tất cả"}</button>
        </div>
      ) : null}
      <div className="resource-list" style={{ marginTop: 8 }}>
        {sorted.length === 0 ? <p className="empty-note" style={{ padding: "24px 0" }}>Chưa có vấn đề nào khớp bộ lọc.</p> : null}
        {sorted.map((n) => {
          const attachments = n.images || [];
          const isOpen = allOpen ? !expanded.has(n.id) : expanded.has(n.id);
          const stage = problemStage(n);
          const rounds = problemRounds(n);
          return (
            <div key={n.id} className={`note-card pb-card pb-tone-${stage}`} title="Bấm để xem sơ đồ · bấm đúp để sửa" onClick={(e) => clickOrDouble(e, () => toggleExpand(n.id), () => openEdit(n))}>
              <div className="note-head">
                {isOpen ? <ChevronDown size={13} color="var(--text-dim)" /> : <ChevronRight size={13} color="var(--text-dim)" />}
                <span onClick={(e) => toggleResolved(n, e)} title={n.resolved ? "Đã xử lý — bấm để bỏ đánh dấu" : "Bấm để đánh dấu đã xử lý"}>
                  <input type="checkbox" checked={!!n.resolved} onChange={() => {}} style={{ cursor: "pointer" }} />
                </span>
                <span className="note-content" style={{ fontWeight: 600, flex: 1, textDecoration: n.resolved ? "line-through" : "none", color: n.resolved ? "var(--text-dim)" : "var(--text)" }}>{n.problem}</span>
                <span onClick={(e) => { e.stopPropagation(); openEdit(n); }}><button type="button" className="row-btn" aria-label="Sửa"><Pencil size={13} /></button></span>
                <span onClick={(e) => e.stopPropagation()}><ConfirmButton onConfirm={() => remove(n.id)} /></span>
              </div>
              <div className="note-head" style={{ marginTop: 4 }}>
                <span className="pb-pill">{problemStageMeta(stage).label}</span>
                {rounds.length ? (
                  <span className="pb-dots" title={rounds.map((r, i) => `Vòng ${i + 1}: ${PROBLEM_RESULTS.find((x) => x.id === (r.result || "testing")).label}`).join("\n")}>
                    {rounds.map((r) => <span key={r.id} className={`pb-dot pb-tone-r-${r.result || "testing"}`} />)}
                    <span className="field-hint" style={{ margin: "0 0 0 4px" }}>{rounds.length} vòng</span>
                  </span>
                ) : null}
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{n.date || "—"}</span>
                {attachments.length ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Strip items={attachments} empty={false} />
                  </span>
                ) : null}
              </div>
              {!isOpen && n.cause ? <p className="note-content pb-latest pb-latest-cause"><b>⚑ Nguyên nhân:</b> {n.cause}</p> : null}
              {!isOpen && rounds.length ? (
                <p className="note-content pb-latest"><b style={{ color: roundColor(rounds.length - 1) }}>Vòng {rounds.length}:</b> {rounds[rounds.length - 1].idea || "—"}</p>
              ) : null}
              {isOpen ? (
                <ProblemMindMap p={n}
                  onSetResult={(rid, v) => setResult(n, rid, v)}
                  onAddRound={() => openEdit(n, true)}
                  onResolve={() => update(n, (it) => ({ ...it, resolved: true }))}
                  onEdit={() => openEdit(n)} />
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
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Thư viện setup mẫu — bấm vào 1 setup để xem ảnh, checklist nhận diện và các biến thể (VD: RB có biến thể A, B, C).</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm setup</button>
      </div>

      {variantForm ? (
        // key riêng cho từng hộp: ba hộp nằm cùng một chỗ, không có key thì React dùng lại hộp đang
        // mở (VD đang xem setup → bấm Thêm biến thể) và con trỏ không tự vào ô Tên.
        <FormModal key="variant" title={variantForm.index === -1 ? "Thêm biến thể" : "Sửa biến thể"} onClose={closeVariantModal}
          linkOwner={`setuplib:${variantForm.parentId}:${variantForm.data.id || (variantForm.index === -1 ? "new" : variantForm.index)}`}>
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
        <FormModal key="main" title={form.id ? "Sửa setup" : "Thêm setup mới"} onClose={closeMainModal} linkOwner={`setuplib:${form.id || "new"}`}>
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
        <FormModal key="view" title={viewing.name} onClose={() => setViewingId(null)}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            {viewing.image || viewing.link ? (
              <a href={viewing.image || viewing.link} target="_blank" rel="noopener noreferrer">
                <img src={viewing.image || viewing.link} alt={viewing.name} className="thumb" style={{ width: 96, height: 96, borderRadius: 8 }} />
              </a>
            ) : (
              <div className="setup-img setup-img-empty" style={{ width: 96, height: 96, borderRadius: 8, flexShrink: 0 }}><Layers size={22} color="var(--text-dim)" /></div>
            )}
            <p className="note-content" style={{ color: "var(--text-dim)", margin: 0 }}><NoteText text={viewing.note || "Chưa có ghi chú."} /></p>
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
            <div key={it.id} className="setup-card" title="Bấm để xem · bấm đúp để sửa" onClick={(e) => clickOrDouble(e, () => setViewingId(it.id), () => openEditMain(it))}>
              {thumb ? <img src={thumb} alt={it.name} className="setup-img" /> : <div className="setup-img setup-img-empty"><Layers size={20} color="var(--text-dim)" /></div>}
              <div className="setup-card-body">
                <strong>{it.name}</strong>
                {it.note ? <p className="setup-note"><NoteText text={it.note} /></p> : null}
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
    <FilterShell filters={filters} onClear={clear}
      search={<input className="input filter-q" placeholder="Tìm theo tên tin / nội dung..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />}>
      <select className="input" value={filters.currency || ""} onChange={(e) => set("currency")(e.target.value)}>
        <option value="">Tất cả đồng tiền</option>
        {MAJOR_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="date" className="input" value={filters.from || ""} onChange={(e) => set("from")(e.target.value)} title="Từ ngày" />
      <input type="date" className="input" value={filters.to || ""} onChange={(e) => set("to")(e.target.value)} title="Đến ngày" />
    </FilterShell>
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
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>Ghi lại biến động tin tức ảnh hưởng tới các đồng tiền khi trade forex — VD: CPI Mỹ ra tin ảnh hưởng USD, các cặp dính USD biến động mạnh.</p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm tin tức</button>
      </div>
      <NewsLogFilterPanel filters={filters} setFilters={setFilters} />
      {modalOpen ? (
        <FormModal title={form.id ? "Sửa tin tức" : "Ghi nhận tin tức mới"} onClose={closeModal} linkOwner={`news:${form.id || "new"}`}>
          <div className="grid-2">
            <Field label="Ngày">
              <input type="date" className="input" value={form.date} onChange={(e) => setF("date")(e.target.value)} />
            </Field>
            <Field label="Tên tin tức" required>
              <input className="input" data-autocap value={form.title} onChange={(e) => setF("title")(e.target.value)} placeholder="VD: CPI Mỹ, NFP, Lãi suất FED..." />
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
            <div key={n.id} className="note-card" title="Bấm để mở rộng · bấm đúp để sửa" onClick={(e) => clickOrDouble(e, () => toggleExpand(n.id), () => openEdit(n))}>
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
                  <span onClick={(e) => e.stopPropagation()}>
                    <Strip items={attachments} empty={false} />
                  </span>
                ) : null}
              </div>
              {isOpen ? (
                <p className="note-content" style={{ color: "var(--text-dim)", marginTop: 4 }}><NoteText text={n.content || "—"} /></p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JourneySection({ lessons, resources, trades, onChangeTrades, onChangeLessons, tradingPlans, onChangeTradingPlans, skills, onChangeSkills, processImprovements, onChangeProcessImprovements, problemLogs, onChangeProblemLogs, newsLogs, onChangeNewsLogs, avoidPrinciples, onOpenTrade }) {
  const [tab, setTab] = useNavTab("journeyTab", "lessons", { sticky: true, allowed: ["plan", "skills", "lessons", "process", "problems", "news"] });
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
        <button className={`subtab ${tab === "plan" ? "subtab-active" : ""}`} onClick={() => setTab("plan")}><MapIcon size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Kế hoạch</button>
        <button className={`subtab ${tab === "skills" ? "subtab-active" : ""}`} onClick={() => setTab("skills")}><Dumbbell size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Kỹ năng</button>
        <button className={`subtab ${tab === "lessons" ? "subtab-active" : ""}`} onClick={() => setTab("lessons")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Bài học</button>
        <button className={`subtab ${tab === "process" ? "subtab-active" : ""}`} onClick={() => setTab("process")}><ClipboardList size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Cải thiện quy trình</button>
        <button className={`subtab ${tab === "problems" ? "subtab-active" : ""}`} onClick={() => setTab("problems")}><Wrench size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Xử lý vấn đề</button>
        <button className={`subtab ${tab === "news" ? "subtab-active" : ""}`} onClick={() => setTab("news")}><Newspaper size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Nhật ký tin tức</button>
      </div>
      {tab === "plan" ? (
        <Suspense fallback={<p className="empty-note" style={{ padding: "24px 0" }}>Đang tải...</p>}>
          <TradingPlanSection items={tradingPlans} onChange={onChangeTradingPlans} />
        </Suspense>
      ) : tab === "skills" ? (
        <Suspense fallback={<p className="empty-note" style={{ padding: "24px 0" }}>Đang tải...</p>}>
          <SkillsPage items={skills} trades={trades} resources={resources} onChange={onChangeSkills} onTradesChange={onChangeTrades} />
        </Suspense>
      ) : tab === "lessons" ? (
        <LessonsSection items={lessons} resources={resources} trades={trades} onChange={onChangeLessons} onOpenTrade={onOpenTrade} />
      ) : tab === "process" ? (
        <Suspense fallback={<p className="empty-note" style={{ padding: "24px 0" }}>Đang tải...</p>}>
          <ProcessImprovementSection items={processImprovements} avoidPrinciples={avoidPrinciples} onChange={onChangeProcessImprovements} />
        </Suspense>
      ) : tab === "problems" ? (
        <ProblemLogSection items={problemLogs} onChange={onChangeProblemLogs} trades={trades} onChangeTrades={onChangeTrades} onOpenTrade={onOpenTrade} />
      ) : (
        <NewsLogSection items={newsLogs} onChange={onChangeNewsLogs} />
      )}
    </div>
  );
}
