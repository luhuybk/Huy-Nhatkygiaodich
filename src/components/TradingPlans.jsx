import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Map as MapIcon, Pencil, Plus } from "lucide-react";
import { ConfirmButton, DangerConfirmButton, Field, FormModal } from "./ui.jsx";
import { emptyPlan, emptyPlanItem, groupPlanItems, lessonLevel, movePlanItem, planItemLine, planLevelMeta, PLAN_LEVELS, uid } from "../lib/helpers.js";

// Kế hoạch là thứ ĐỌC TRƯỚC khi vào lệnh, không phải nhật ký ghi lại sau. Nên ở đây không có
// ngày tháng, không có tick "đã làm": một danh sách đầy dấu tick cũ là danh sách không ai đọc
// nữa. Chỉ có nội dung, thứ tự, và cấp độ.

function levelClass(level) {
  return level ? `plan-item-lv${level}` : "plan-item-lv0";
}

function PlanItemForm({ form, setForm, onSave, onRemove, onClose, error }) {
  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <FormModal title={form.id ? "Sửa mục kế hoạch" : "Thêm mục vào kế hoạch"} onClose={onClose}>
      <Field label="Khi / Nếu" hint="Điều kiện để mục này được áp dụng. Để trống nếu đây là quy tắc luôn đúng, VD: mỗi lệnh không quá 2% vốn.">
        <textarea className="input textarea" style={{ minHeight: 60 }} value={form.when}
          onChange={(e) => setF("when")(e.target.value)} placeholder="VD: Thị trường chỉnh hơn 5% từ đỉnh..." />
      </Field>
      <Field label="Thì làm gì" required>
        <textarea className="input textarea" style={{ minHeight: 80 }} value={form.then}
          onChange={(e) => setF("then")(e.target.value)} placeholder="VD: Hạ tỷ trọng về 30%, chỉ giữ mã đang có lãi..." />
      </Field>
      <Field label="Mức độ quan trọng" hint="Cấp 1 sẽ được ghim lên trang Tổng quan. Để trống cũng được — phân cấp sau ngay trên thẻ.">
        <div className="lsn-pick">
          {PLAN_LEVELS.map((L) => (
            <button key={L.id} type="button"
              className={`lsn-pick-btn ${lessonLevel(form) === L.id ? `lsn-pick-on lsn-pick-on-${L.id}` : ""}`}
              onClick={() => setF("level")(lessonLevel(form) === L.id ? 0 : L.id)}>
              {L.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Ghi chú thêm">
        <textarea className="input textarea" style={{ minHeight: 60 }} value={form.note}
          onChange={(e) => setF("note")(e.target.value)} placeholder="Lý do vì sao xử lý như vậy..." />
      </Field>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 4 }}>
        {form.id ? <DangerConfirmButton label="Xóa mục" confirmLabel="Bấm lần nữa để xóa" onConfirm={onRemove} /> : null}
        <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={onSave}>{form.id ? "Cập nhật" : "Thêm mục"}</button>
      </div>
    </FormModal>
  );
}

function PlanDetail({ plan, onChange, onBack, onRemovePlan, onEditPlan }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const groups = useMemo(() => groupPlanItems(plan.items), [plan.items]);
  const items = plan.items || [];

  const openNew = () => { setForm(emptyPlanItem()); setError(""); };
  const openEdit = (it) => { setForm({ ...emptyPlanItem(), ...it }); setError(""); };
  const close = () => { setForm(null); setError(""); };
  const setItems = (next) => onChange({ ...plan, items: next });

  const save = () => {
    if (!String(form.then || "").trim()) { setError("Nhập phần \"thì làm gì\" trước đã."); return; }
    const payload = { ...form, id: form.id || uid() };
    const exists = items.some((it) => it.id === payload.id);
    setItems(exists ? items.map((it) => (it.id === payload.id ? payload : it)) : [...items, payload]);
    close();
  };
  const remove = (id) => { setItems(items.filter((it) => it.id !== id)); if (form && form.id === id) close(); };
  const setLevel = (id, level) => setItems(items.map((it) => (it.id === id ? { ...it, level: lessonLevel(it) === level ? 0 : level } : it)));

  const move = (id, dir) => setItems(movePlanItem(items, id, dir));

  return (
    <div>
      <div className="section-head">
        <button type="button" className="btn btn-ghost" onClick={onBack}><ChevronLeft size={15} /> Tất cả kế hoạch</button>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm mục</button>
      </div>
      <div className="plan-detail-head">
        <h3 className="plan-detail-name">
          {plan.name}
          {plan.active === false ? <span className="plan-off-tag">đang tắt</span> : null}
        </h3>
        <span className="var-card-tools">
          <button type="button" className="row-btn" aria-label="Sửa kế hoạch" onClick={onEditPlan}><Pencil size={13} /></button>
          <ConfirmButton onConfirm={onRemovePlan} />
        </span>
      </div>
      {plan.scope ? <p className="field-hint" style={{ marginTop: 0 }}>{plan.scope}</p> : null}
      {plan.note ? <p className="plan-detail-note">{plan.note}</p> : null}

      {form ? (
        <PlanItemForm form={form} setForm={setForm} onSave={save} onRemove={() => remove(form.id)} onClose={close} error={error} />
      ) : null}

      {items.length === 0 ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>
          Kế hoạch này chưa có mục nào — bấm "Thêm mục" để ghi điều đầu tiên cần làm.
        </p>
      ) : (
        <div className="var-groups" style={{ marginTop: 14 }}>
          {groups.map((g) => {
            const meta = planLevelMeta(g.level);
            return (
              <section key={g.level} className="var-group">
                <h4 className="var-group-head">
                  <MapIcon size={14} />
                  <span className={meta ? "" : "var-group-none"}>{meta ? meta.label : "Chưa phân cấp"}</span>
                  {meta ? <span className="lsn-head-hint">{meta.hint}</span> : null}
                  <span className="var-group-count">{g.list.length} mục</span>
                </h4>
                <div className="plan-item-list">
                  {g.list.map((it, i) => (
                    <article key={it.id} className={`plan-item ${levelClass(g.level)}`}>
                      <div className="plan-item-body">
                        {String(it.when || "").trim() ? (
                          <p className="plan-item-when"><span className="plan-item-kw">Nếu</span>{it.when}</p>
                        ) : null}
                        {/* white-space:pre-wrap giữ nguyên MỌI khoảng trắng, nên dấu cách thừa
                            trước chữ sẽ hiện ra thật — khoảng cách để margin của nhãn lo. */}
                        <p className="plan-item-then">
                          {String(it.when || "").trim() ? <span className="plan-item-kw">Thì</span> : null}{it.then}
                        </p>
                        {it.note ? <p className="plan-item-note">{it.note}</p> : null}
                      </div>
                      <div className="plan-item-tools">
                        <div className="lsn-pick lsn-pick-mini">
                          {PLAN_LEVELS.map((L) => (
                            <button key={L.id} type="button" title={L.label}
                              className={`lsn-pick-btn ${g.level === L.id ? `lsn-pick-on lsn-pick-on-${L.id}` : ""}`}
                              onClick={() => setLevel(it.id, L.id)}>{L.id}</button>
                          ))}
                        </div>
                        <button type="button" className="row-btn" aria-label="Lên trên" disabled={i === 0} onClick={() => move(it.id, -1)}><ArrowUp size={13} /></button>
                        <button type="button" className="row-btn" aria-label="Xuống dưới" disabled={i === g.list.length - 1} onClick={() => move(it.id, 1)}><ArrowDown size={13} /></button>
                        <button type="button" className="row-btn" aria-label="Sửa mục" onClick={() => openEdit(it)}><Pencil size={13} /></button>
                        <ConfirmButton onConfirm={() => remove(it.id)} />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TradingPlanSection({ items, onChange }) {
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const plans = items || [];
  const open = plans.find((p) => p.id === openId) || null;

  const setF = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const openNew = () => { setForm(emptyPlan()); setError(""); };
  const openEdit = (p) => { setForm({ ...emptyPlan(), ...p }); setError(""); };
  const close = () => { setForm(null); setError(""); };
  const save = () => {
    if (!String(form.name || "").trim()) { setError("Đặt tên cho kế hoạch trước đã."); return; }
    const payload = { ...form, id: form.id || uid(), items: form.items || [] };
    const exists = plans.some((p) => p.id === payload.id);
    onChange(exists ? plans.map((p) => (p.id === payload.id ? payload : p)) : [...plans, payload]);
    close();
    setOpenId(payload.id);
  };
  const updatePlan = (next) => onChange(plans.map((p) => (p.id === next.id ? next : p)));
  const remove = (id) => { onChange(plans.filter((p) => p.id !== id)); setOpenId(null); close(); };
  const toggleActive = (p) => updatePlan({ ...p, active: p.active === false });

  const planForm = form ? (
    <FormModal title={form.id ? "Sửa kế hoạch" : "Kế hoạch mới"} onClose={close}>
      <Field label="Tên kế hoạch" required>
        <input className="input" value={form.name} onChange={(e) => setF("name")(e.target.value)}
          placeholder="VD: Kế hoạch đi vốn — VN Stock" />
      </Field>
      <Field label="Phạm vi áp dụng" hint="Một dòng ngắn: thị trường nào, tài khoản nào, giai đoạn nào.">
        <input className="input" value={form.scope} onChange={(e) => setF("scope")(e.target.value)}
          placeholder="VD: Cổ phiếu Việt Nam, tài khoản chính" />
      </Field>
      <Field label="Mục tiêu / ghi chú chung">
        <textarea className="input textarea" style={{ minHeight: 70 }} value={form.note}
          onChange={(e) => setF("note")(e.target.value)} placeholder="Kế hoạch này nhằm đạt điều gì..." />
      </Field>
      <Field label="Trạng thái" hint="Kế hoạch đang dùng mới được ghim cấp 1 lên Tổng quan. Tắt đi thì vẫn giữ nguyên nội dung để đọc lại.">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={form.active !== false} onChange={(e) => setF("active")(e.target.checked)} />
          <span>Đang dùng</span>
        </label>
      </Field>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="form-actions" style={{ marginTop: 4 }}>
        {form.id ? <DangerConfirmButton label="Xóa kế hoạch" confirmLabel="Bấm lần nữa để xóa cả kế hoạch" onConfirm={() => remove(form.id)} /> : null}
        <button type="button" className="btn btn-ghost" onClick={close}>Hủy</button>
        <button type="button" className="btn btn-primary" onClick={save}>{form.id ? "Cập nhật" : "Tạo kế hoạch"}</button>
      </div>
    </FormModal>
  ) : null;

  if (open) {
    return (
      <div>
        {planForm}
        <PlanDetail plan={open} onChange={updatePlan} onBack={() => setOpenId(null)}
          onRemovePlan={() => remove(open.id)} onEditPlan={() => openEdit(open)} />
      </div>
    );
  }

  return (
    <div>
      <div className="section-head">
        <p className="field-hint" style={{ margin: 0 }}>
          Những gì cần làm khi giao dịch — mỗi kế hoạch gồm các mục dạng "nếu thị trường thế này thì xử lý thế kia",
          chia 3 cấp. Mục cấp 1 được ghim lên trang Tổng quan để đọc trước khi vào lệnh.
        </p>
        <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={15} /> Thêm kế hoạch</button>
      </div>
      {planForm}
      {plans.length === 0 ? (
        <p className="empty-note" style={{ padding: "24px 0" }}>
          Chưa có kế hoạch nào — VD "Kế hoạch đi vốn cho VN Stock", bên trong ghi các tình huống thị trường và cách xử lý.
        </p>
      ) : (
        <div className="plan-grid">
          {plans.map((p) => {
            const counts = { 1: 0, 2: 0, 3: 0, 0: 0 };
            (p.items || []).forEach((it) => { counts[lessonLevel(it)] += 1; });
            const core = (p.items || []).filter((it) => lessonLevel(it) === 1).slice(0, 2);
            return (
              <article key={p.id} className={`plan-card ${p.active === false ? "plan-card-off" : ""}`} role="button" tabIndex={0}
                onClick={() => setOpenId(p.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenId(p.id); } }}>
                <div className="var-card-head">
                  <b className="plan-card-name">{p.name}</b>
                  <span className="var-card-tools" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="row-btn" aria-label="Sửa kế hoạch" onClick={() => openEdit(p)}><Pencil size={13} /></button>
                    <ConfirmButton onConfirm={() => remove(p.id)} />
                  </span>
                </div>
                {p.scope ? <p className="plan-card-scope">{p.scope}</p> : null}
                <div className="plan-card-levels">
                  {PLAN_LEVELS.map((L) => (
                    <span key={L.id} className={`plan-lv-chip plan-lv-chip-${L.id} ${counts[L.id] ? "" : "plan-lv-chip-empty"}`} title={L.label}>
                      C{L.id} · {counts[L.id]}
                    </span>
                  ))}
                  {counts[0] ? <span className="plan-lv-chip plan-lv-chip-empty" title="Chưa phân cấp">? · {counts[0]}</span> : null}
                </div>
                {core.length ? (
                  <ul className="plan-card-core">
                    {core.map((it) => <li key={it.id}>{planItemLine(it)}</li>)}
                  </ul>
                ) : null}
                <div className="plan-card-foot" onClick={(e) => e.stopPropagation()}>
                  <label className="plan-active-toggle">
                    <input type="checkbox" checked={p.active !== false} onChange={() => toggleActive(p)} />
                    <span>{p.active === false ? "Đang tắt" : "Đang dùng"}</span>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
