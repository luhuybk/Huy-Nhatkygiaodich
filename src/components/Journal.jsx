import { useState, useMemo, useEffect } from "react";
import { BookOpen, X, Pencil, ChevronRight, ChevronLeft, Check, CalendarDays, Filter, StickyNote, Copy, AlertCircle, ArrowUpDown, Download } from "lucide-react";
import { CellImagePreview, CompletionBar, ImagePreviewStrip as Strip, ConfirmButton, DangerConfirmButton, DetailGroup, DetailRow, ResourceSelect, RiskAlertBanner, StarRating } from "./ui.jsx";
import { GRADE_OPTIONS, RESULT_FILTERS } from "../lib/constants.js";
import { applyFilters, avgPillarScore, checklistProgress, computeResult, computeRiskAlerts, dateKey, fmt, fmtHold, fmtMoney, heatColor, holdHours, missingCompletionFields, normalizeSort, sortTrades, tradeCompletion, tradeCurrency, tradeProfitUSD, tradesToCsv, yearKey } from "../lib/helpers.js";

export function JournalFilters({ trades, resources, filters, setFilters }) {
  const years = useMemo(() => {
    const set = new Set(trades.map((t) => yearKey(t.entryDate)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [trades]);
  const set = (k) => (v) => setFilters((p) => ({ ...p, [k]: v }));
  const clear = () => setFilters({});

  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <input className="input" placeholder="Tìm theo symbol..." value={filters.q || ""} onChange={(e) => set("q")(e.target.value)} />
        <ResourceSelect value={filters.account || ""} onChange={set("account")} options={resources.accounts.map((a) => a.name)} placeholder="Tài khoản" />
        <ResourceSelect value={filters.year || ""} onChange={set("year")} options={years} placeholder="Năm" />
        <ResourceSelect value={filters.month || ""} onChange={set("month")} options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]} placeholder="Tháng" />
        <ResourceSelect value={filters.setup || ""} onChange={set("setup")} options={resources.setups} placeholder="Setup" />
        <ResourceSelect value={filters.session || ""} onChange={set("session")} options={resources.sessions} placeholder="Phiên" />
        <ResourceSelect value={filters.psychology || ""} onChange={set("psychology")} options={resources.psychologies} placeholder="Tâm lý" />
        <select className="input" value={filters.direction || ""} onChange={(e) => set("direction")(e.target.value)}>
          <option value="">Hướng lệnh</option><option value="buy">Buy</option><option value="sell">Sell</option>
        </select>
        <select className="input" value={filters.result || ""} onChange={(e) => set("result")(e.target.value)}>
          {RESULT_FILTERS.map((r) => <option key={r.id} value={r.id}>{r.id === "" ? "Kết quả" : r.label}</option>)}
        </select>
        <select className="input" value={filters.score || ""} onChange={(e) => set("score")(e.target.value)}>
          <option value="">Chấm điểm</option>
          <option value="low">Thấp (≤ 2 sao)</option>
          <option value="mid">Trung bình (2-4 sao)</option>
          <option value="high">Cao (≥ 4 sao)</option>
        </select>
        <select className="input" value={filters.checklist || ""} onChange={(e) => set("checklist")(e.target.value)}>
          <option value="">Checklist</option>
          <option value="complete">Đã hoàn thành đủ</option>
          <option value="partial">Đang làm dở</option>
          <option value="none">Chưa làm gì</option>
        </select>
        <select className="input" value={filters.hasLesson || ""} onChange={(e) => set("hasLesson")(e.target.value)}>
          <option value="">Bài học</option>
          <option value="yes">Có bài học</option>
          <option value="no">Không có bài học</option>
        </select>
        <select className="input" value={filters.completion || ""} onChange={(e) => set("completion")(e.target.value)}>
          <option value="">Tiến độ hoàn thành</option>
          <option value="low">Thấp (&lt; 40%)</option>
          <option value="mid">Trung bình (40-79%)</option>
          <option value="high">Sắp xong (80-99%)</option>
          <option value="full">Đã hoàn thành đủ (100%)</option>
        </select>
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

// Gom mọi ảnh của một lệnh theo đúng thứ tự diễn biến: vào lệnh → trong lệnh → thoát lệnh.
// Ảnh "trong lệnh" trước đây chỉ nằm trong form, ngoài bảng và ô chi tiết đều không thấy.
function tradeImageShots(t) {
  const shots = [];
  if (t.entryImage || t.entryLink) shots.push({ key: "entry", label: "Vào lệnh", image: t.entryImage, link: t.entryLink });
  (t.inTradeImages || []).forEach((img, i) => {
    if (img && (img.image || img.link)) shots.push({ key: `in-${i}`, label: `Trong lệnh ${i + 1}`, image: img.image, link: img.link });
  });
  if (t.exitImage || t.exitLink) shots.push({ key: "exit", label: "Thoát lệnh", image: t.exitImage, link: t.exitLink });
  return shots;
}

export function TradeDetailModal({ trade, onClose, onEdit, onDelete }) {
  if (!trade) return null;
  const t = trade;
  const { rr, outcome, status } = computeResult(t);
  const score = avgPillarScore(t);
  const grade = GRADE_OPTIONS.find((g) => g.id === t.tradeGrade);
  const checklistEntries = Object.entries(t.checklist || {});
  const completion = tradeCompletion(t);
  const shots = tradeImageShots(t);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Chi tiết giao dịch</h3>
          <button type="button" className="row-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <CompletionBar done={completion.done} total={completion.total} percent={completion.percent} missing={missingCompletionFields(t)} />
          <div className="chart-row">
            <DetailGroup title="Thông tin">
              <DetailRow label="Ngày entry" value={t.entryDate} />
              <DetailRow label="Giờ entry" value={t.entryTime} />
              <DetailRow label="Tài khoản" value={t.account} />
              <DetailRow label="Symbol" value={t.symbol} />
              <DetailRow label="Hướng lệnh" value={t.direction === "buy" ? "Buy" : "Sell"} />
              <DetailRow label="Khung thời gian" value={t.timeframe} />
              <DetailRow label="Phiên" value={t.session} />
              <DetailRow label="Setup" value={t.setup} />
              <DetailRow label="Bonus" value={t.setupBonus} />
              <DetailRow label="Nhận xét Setup" value={t.setupNote} />
              <DetailRow label="Điểm cấu trúc (ĐCT)" value={t.structureScore !== "" ? t.structureScore : "—"} />
            </DetailGroup>
            <DetailGroup title="Quản trị vốn & Kết quả">
              <DetailRow label="Rủi ro (%)" value={t.riskPercent ? `${t.riskPercent}%` : "—"} />
              <DetailRow label="Rủi ro (số tiền)" value={t.riskAmount ? fmt(Number(t.riskAmount)) : "—"} />
              <DetailRow label="Quản trị vốn" value={t.riskAction} />
              <DetailRow label="Ngày exit" value={t.exitDate} />
              <DetailRow label="Giờ exit" value={t.exitTime} />
              <DetailRow label="TG giữ lệnh" value={fmtHold(holdHours(t))} />
              <DetailRow label="Lợi nhuận" value={t.profit === "" ? "—" : fmt(Number(t.profit))} tone={Number(t.profit) > 0 ? "text-win" : Number(t.profit) < 0 ? "text-loss" : ""} />
              <DetailRow label="RR thực" value={rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`} tone={rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""} />
              <DetailRow label="Kết quả" value={status === "open" ? "Đang mở" : outcome === "win" ? "Thắng" : outcome === "loss" ? "Thua" : "Hòa"} />
            </DetailGroup>
          </div>
          <div className="chart-row">
            <DetailGroup title="Kỹ năng & Tâm lý">
              <DetailRow label="Vào lệnh" value={t.entrySkill} />
              <DetailRow label="Trong lệnh" value={t.inTradeSkill} />
              <DetailRow label="Thoát lệnh" value={t.exitSkill} />
              <DetailRow label="Cảm nhận kỹ năng" value={t.skillNote} />
              <DetailRow label="Tâm lý" value={t.psychology} />
              <DetailRow label="Cảm nghĩ tâm lý" value={t.psychologyNote} />
            </DetailGroup>
            <DetailGroup title="Đánh giá giao dịch">
              <DetailRow label="Nhãn đánh giá" value={grade ? `${grade.tone === "win" ? "👍" : "☠️"} ${grade.label}` : "—"} />
              <DetailRow label="Nhận xét / Review" value={t.reviewNote} />
              <DetailRow label="Lý do vào lệnh" value={t.entryReason} />
              <DetailRow label="Cảm nghĩ trong lệnh" value={t.inTradeNote} />
            </DetailGroup>
          </div>

          <DetailGroup title="Chấm điểm (4 trụ cột)">
            <div className="pillar-grid" style={{ marginBottom: 0 }}>
              <div className="pillar-item"><span>Kiến thức</span><StarRating value={t.ratingKnowledge} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Kỹ năng</span><StarRating value={t.ratingSkill} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Quản trị vốn</span><StarRating value={t.ratingRisk} onChange={() => {}} size={14} /></div>
              <div className="pillar-item"><span>Tâm lý</span><StarRating value={t.ratingPsychology} onChange={() => {}} size={14} /></div>
            </div>
            <div className="pillar-avg" style={{ marginTop: 10 }}>
              <span>Trung bình</span><strong>{score === null ? "—" : `${score.toFixed(1)} / 5 ★`}</strong>
            </div>
          </DetailGroup>

          {checklistEntries.length > 0 ? (
            <DetailGroup title="Checklist">
              <div className="pillar-grid" style={{ marginBottom: 0 }}>
                {checklistEntries.map(([item, checked]) => (
                  <div key={item} className={`checklist-item ${checked ? "checklist-checked" : ""}`} style={{ cursor: "default" }}>
                    {checked ? <Check size={14} color="var(--win)" /> : <X size={14} color="var(--loss)" />}
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </DetailGroup>
          ) : null}

          {shots.length > 0 ? (
            <DetailGroup title="Hình ảnh">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {shots.map((s) => (
                  <div key={s.key}>
                    <span className="field-hint">{s.label}</span><br />
                    <CellImagePreview image={s.image} link={s.link} title={s.label} />
                  </div>
                ))}
              </div>
            </DetailGroup>
          ) : null}

          {t.hasLesson ? (
            <DetailGroup title="📌 Bài học cần ghi nhớ" className="detail-group-lesson">
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {t.lessonNote ? t.lessonNote : <span className="field-hint">Chưa ghi nội dung bài học.</span>}
              </p>
            </DetailGroup>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Đóng</button>
          <DangerConfirmButton label="Xóa" confirmLabel="Bấm lần nữa để xóa" onConfirm={() => { onDelete(t.id); onClose(); }} />
          <button type="button" className="btn btn-primary" onClick={() => { onEdit(t); onClose(); }}><Pencil size={14} /> Sửa</button>
        </div>
      </div>
    </div>
  );
}

// Các cột có thể bấm để sắp xếp — key khớp với tradeSortValue() ở helpers.js.
const JOURNAL_COLUMNS = [
  { key: "entryDate", label: "Ngày" },
  { key: "account", label: "Tài khoản" },
  { key: "symbol", label: "Symbol" },
  { key: null, label: "Ảnh" },
  { key: "direction", label: "Hướng" },
  { key: "setup", label: "Setup" },
  { key: "timeframe", label: "TF" },
  { key: "riskPercent", label: "%Risk" },
  { key: "profit", label: "Lãi/Lỗ" },
  { key: "rr", label: "RR" },
  { key: "status", label: "Kết quả" },
  { key: "score", label: "Chấm điểm" },
  { key: "checklist", label: "Checklist" },
  { key: "grade", label: "Đánh giá" },
  { key: "completion", label: "Tiến độ" },
  { key: "hasLesson", label: "Bài học" },
];

// Hiện rõ đang sắp xếp theo những cấp nào — vừa để biết, vừa là cách thêm/bớt cấp
// trên điện thoại (không giữ Shift được).
function SortBar({ sort, onChange }) {
  const cols = JOURNAL_COLUMNS.filter((c) => c.key);
  const labelOf = (key) => (cols.find((c) => c.key === key) || {}).label || key;
  const used = new Set(sort.map((l) => l.key));
  const flip = (i) => onChange(sort.map((l, x) => (x === i ? { ...l, dir: l.dir === "desc" ? "asc" : "desc" } : l)));
  const remove = (i) => onChange(sort.filter((_, x) => x !== i));
  const add = (key) => { if (key) onChange([...sort, { key, dir: "desc" }]); };
  const available = cols.filter((c) => !used.has(c.key));

  return (
    <div className="sort-bar">
      <span className="field-hint" style={{ margin: 0 }}>Sắp xếp:</span>
      {sort.map((l, i) => (
        <span key={l.key} className="sort-chip">
          {sort.length > 1 ? <span className="sort-chip-order">{i + 1}</span> : null}
          <button type="button" onClick={() => flip(i)} title="Đổi chiều tăng/giảm">
            {labelOf(l.key)} {l.dir === "asc" ? "↑" : "↓"}
          </button>
          {sort.length > 1 ? (
            <button type="button" className="sort-chip-x" onClick={() => remove(i)} title="Bỏ cấp này"><X size={11} /></button>
          ) : null}
        </span>
      ))}
      {available.length ? (
        <select className="input input-inline sort-add" value="" onChange={(e) => add(e.target.value)}>
          <option value="">+ thêm cấp</option>
          {available.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      ) : null}
      <span className="field-hint" style={{ margin: 0 }}>Hoặc giữ Shift khi bấm tiêu đề cột.</span>
    </div>
  );
}

export function JournalTable({ trades, resources, onEdit, onDelete, selected, onToggleOne, onToggleAll, sort, onSortChange }) {
  const res = resources || { checklistItems: [] };
  if (trades.length === 0) return <p className="empty-note" style={{ padding: "24px 0" }}>Không có giao dịch nào khớp bộ lọc.</p>;
  const selectable = !!selected && !!onToggleOne;
  const allSelected = selectable && trades.length > 0 && trades.every((t) => selected.has(t.id));
  const sortable = !!onSortChange;
  const levels = sort || [];
  // Bấm thường: chỉ sắp xếp theo cột đó (bấm lại để đảo chiều).
  // Giữ Shift: thêm cột đó thành cấp phụ, để vừa gom theo tài khoản vừa xếp theo ngày.
  const clickHeader = (key, shiftKey) => {
    if (!sortable || !key) return;
    const at = levels.findIndex((l) => l.key === key);
    const flipped = at >= 0 ? { key, dir: levels[at].dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" };
    if (!shiftKey) {
      onSortChange([at === 0 && levels.length === 1 ? flipped : { key, dir: at >= 0 ? levels[at].dir : "desc" }]);
      return;
    }
    onSortChange(at >= 0 ? levels.map((l, i) => (i === at ? flipped : l)) : [...levels, { key, dir: "desc" }]);
  };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {selectable ? (
              <th style={{ width: 30 }}>
                <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(trades.map((t) => t.id))} aria-label="Chọn tất cả" />
              </th>
            ) : null}
            {JOURNAL_COLUMNS.map((col, i) => {
              const at = sortable && col.key ? levels.findIndex((l) => l.key === col.key) : -1;
              return (
                <th key={col.key || `col-${i}`}
                  className={sortable && col.key ? `th-sortable ${at >= 0 ? "th-sorted" : ""}` : ""}
                  onClick={(e) => clickHeader(col.key, e.shiftKey)}
                  title={sortable && col.key ? `Sắp xếp theo ${col.label} — giữ Shift để thêm làm cấp phụ` : undefined}>
                  {col.label}
                  {at >= 0 ? (
                    <>
                      <ArrowUpDown size={11} className={levels[at].dir === "asc" ? "th-sort-asc" : ""} style={{ marginLeft: 4, verticalAlign: -1 }} />
                      {levels.length > 1 ? <span className="th-sort-order">{at + 1}</span> : null}
                    </>
                  ) : null}
                </th>
              );
            })}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const { rr, outcome, status } = computeResult(t);
            const cp = checklistProgress(t, res);
            const completion = tradeCompletion(t);
            const shots = tradeImageShots(t);
            return (
              <tr key={t.id} onClick={() => onEdit(t)} className={t.hasLesson ? "row-has-lesson" : ""}>
                {selectable ? (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => onToggleOne(t.id)} aria-label="Chọn lệnh" />
                  </td>
                ) : null}
                <td className="mono">{t.entryDate || "—"}</td>
                <td>{t.account || "—"}</td>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Strip items={shots} />
                </td>
                <td><span className={`dir-pill ${t.direction}`}>{t.direction === "buy" ? "Buy" : "Sell"}</span></td>
                <td>{t.setup || "—"}</td>
                <td className="mono">{t.timeframe || "—"}</td>
                <td className="mono">{t.riskPercent === "" || t.riskPercent === null || t.riskPercent === undefined ? "—" : `${t.riskPercent}%`}</td>
                <td className={`mono ${Number(t.profit) > 0 ? "text-win" : Number(t.profit) < 0 ? "text-loss" : ""}`}
                  title={t.profit === "" ? "" : `Quy đổi: ${fmtMoney(tradeProfitUSD(t, res), "USD")}`}>
                  {t.profit === "" ? "—" : fmtMoney(Number(t.profit), tradeCurrency(t, res))}
                </td>
                <td className={`mono ${rr > 0 ? "text-win" : rr < 0 ? "text-loss" : ""}`}>{rr === null ? "—" : `${rr > 0 ? "+" : ""}${rr.toFixed(2)}R`}</td>
                <td>{status === "open" ? <span className="status-pill open">Đang mở</span> :
                  <span className={`status-pill ${outcome}`}>{outcome === "win" ? "Thắng" : outcome === "loss" ? "Thua" : "Hòa"}</span>}</td>
                <td className={`mono ${avgPillarScore(t) === null ? "" : avgPillarScore(t) >= 4 ? "text-win" : avgPillarScore(t) <= 2 ? "text-loss" : ""}`}>
                  {avgPillarScore(t) === null ? "—" : `${avgPillarScore(t).toFixed(1)}★`}
                </td>
                <td className="mono">
                  {cp === null ? "—" : (
                    <span className={`checklist-progress ${cp.checked === cp.total ? "checklist-progress-full" : cp.checked === 0 ? "checklist-progress-empty" : ""}`}>
                      {cp.checked}/{cp.total}
                    </span>
                  )}
                </td>
                <td>{t.tradeGrade ? <span className="grade-tag">{GRADE_OPTIONS.find((g) => g.id === t.tradeGrade)?.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"}</span> : "—"}</td>
                <td className={`mono ${completion.percent >= 80 ? "text-win" : completion.percent < 40 ? "text-loss" : ""}`}
                  title={completion.percent < 100 ? `${completion.done}/${completion.total} mục — Còn thiếu: ${missingCompletionFields(t).join(", ")}` : `${completion.done}/${completion.total} mục — Đã hoàn thành đủ`}>
                  {completion.percent < 100 ? <AlertCircle size={11} style={{ verticalAlign: -1, marginRight: 3 }} color="var(--loss)" /> : null}
                  {completion.percent}%
                </td>
                <td title={t.lessonNote || ""}>{t.hasLesson ? <StickyNote size={16} className="lesson-icon" /> : "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button type="button" className="row-btn" onClick={() => onEdit(t)}><Pencil size={13} /></button>
                    <ConfirmButton onConfirm={() => onDelete(t.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TradingCalendar({ trades, resources, onEdit }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState("");
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  // Gộp nhiều tài khoản khác tiền tệ nên phải quy đổi USD trước khi cộng,
  // nếu không một lệnh VNĐ sẽ áp đảo toàn bộ con số của ngày đó.
  const byDay = useMemo(() => {
    const out = {};
    trades.forEach((t) => {
      const key = dateKey(t);
      if (!key) return;
      if (!out[key]) out[key] = { pnl: 0, count: 0 };
      out[key].count += 1;
      const usd = tradeProfitUSD(t, resources);
      if (usd) out[key].pnl += usd;
    });
    return out;
  }, [trades, resources]);
  const mixedCurrency = useMemo(() => {
    const set = new Set(trades.map((t) => tradeCurrency(t, resources)));
    return set.size > 1;
  }, [trades, resources]);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedTrades = selected ? trades.filter((t) => dateKey(t) === selected) : [];

  return (
    <div>
      <div className="cal-nav">
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <span className="cal-title">Tháng {m + 1}/{y}</span>
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      {mixedCurrency ? (
        <p className="field-hint" style={{ textAlign: "center", marginBottom: 10 }}>
          Có nhiều tài khoản khác đơn vị tiền — số tiền trong lịch được quy đổi sang USD theo tỷ giá ở mục Tài khoản.
        </p>
      ) : null}
      <div className="cal-grid cal-head">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cal-cell cal-empty" />;
          const key = `${y}-${pad(m + 1)}-${pad(d)}`;
          const info = byDay[key];
          const isSel = selected === key;
          return (
            <button type="button" key={i} className={`cal-cell ${isSel ? "cal-sel" : ""} ${info ? "cal-cell-filled" : ""}`}
              style={info ? { background: heatColor(info.pnl, Math.max(1, ...Object.values(byDay).map((x) => Math.abs(x.pnl)))) } : {}}
              onClick={() => setSelected(isSel ? "" : key)}>
              <span className="cal-daynum">{d}</span>
              {info ? <span className={`cal-pnl ${info.pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(info.pnl)}</span> : null}
              {info ? <span className="cal-count">{info.count} lệnh</span> : null}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div style={{ marginTop: 16 }}>
          <h3 className="block-title">Giao dịch ngày {selected}</h3>
          <JournalTable trades={selectedTrades} resources={resources} onEdit={onEdit} onDelete={() => {}} />
        </div>
      ) : null}
    </div>
  );
}

export function JournalSection({ trades, resources, ledger, onEdit, onDelete, onBulkDelete, onDuplicate, uiSettings, onUiSettingsChange }) {
  const [tab, setTab] = useState("list");
  const [selected, setSelected] = useState(() => new Set());
  // Bộ lọc + kiểu sắp xếp lưu vào uiSettings để rời trang quay lại vẫn giữ nguyên.
  const filters = (uiSettings && uiSettings.journalFilters) || {};
  const sort = useMemo(() => {
    const levels = normalizeSort(uiSettings && uiSettings.journalSort);
    return levels.length ? levels : [{ key: "entryDate", dir: "desc" }];
  }, [uiSettings]);
  const setFilters = (updater) => {
    const next = typeof updater === "function" ? updater(filters) : updater;
    onUiSettingsChange({ ...uiSettings, journalFilters: next });
  };
  const setSort = (next) => onUiSettingsChange({ ...uiSettings, journalSort: next });
  const filtered = useMemo(
    () => sortTrades(applyFilters(trades, filters, resources), sort, resources),
    [trades, filters, resources, sort]
  );
  const riskAlerts = useMemo(() => computeRiskAlerts(resources, trades, ledger), [resources, trades, ledger]);

  useEffect(() => { setSelected(new Set()); }, [filters]);

  const exportCsv = () => {
    const blob = new Blob([tradesToCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nhat-ky-giao-dich-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = (ids) => setSelected((prev) => {
    const allIn = ids.length > 0 && ids.every((id) => prev.has(id));
    if (allIn) { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; }
    return new Set([...prev, ...ids]);
  });

  if (trades.length === 0) {
    return (
      <div className="empty-state">
        <BookOpen size={28} color="var(--text-dim)" />
        <p>Chưa có giao dịch nào. Bắt đầu bằng cách thêm giao dịch đầu tiên.</p>
      </div>
    );
  }
  return (
    <div>
      <RiskAlertBanner alerts={riskAlerts} />
      <div className="subtabs">
        <button className={`subtab ${tab === "list" ? "subtab-active" : ""}`} onClick={() => setTab("list")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Danh sách</button>
        <button className={`subtab ${tab === "calendar" ? "subtab-active" : ""}`} onClick={() => setTab("calendar")}><CalendarDays size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Lịch</button>
      </div>
      {tab === "list" ? (
        <div>
          <JournalFilters trades={trades} resources={resources} filters={filters} setFilters={setFilters} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: "0 0 10px" }}>
            <p className="field-hint" style={{ margin: 0 }}>{filtered.length} / {trades.length} lệnh{selected.size ? ` · Đã chọn ${selected.size}` : ""}</p>
            <div style={{ display: "flex", gap: 8 }}>
              {selected.size > 0 ? (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => { onDuplicate(Array.from(selected)); setSelected(new Set()); }}>
                    <Copy size={13} /> Nhân bản ({selected.size})
                  </button>
                  <DangerConfirmButton label={`Xóa (${selected.size})`} confirmLabel="Bấm lần nữa để xóa" onConfirm={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()); }} />
                </>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={filtered.length === 0}
                title="Xuất đúng những lệnh đang hiển thị theo bộ lọc và thứ tự hiện tại">
                <Download size={13} /> Xuất CSV ({filtered.length})
              </button>
            </div>
          </div>
          <SortBar sort={sort} onChange={setSort} />
          <JournalTable trades={filtered} resources={resources} onEdit={onEdit} onDelete={onDelete} selected={selected} onToggleOne={toggleOne} onToggleAll={toggleAll} sort={sort} onSortChange={setSort} />
        </div>
      ) : (
        <TradingCalendar trades={trades} resources={resources} onEdit={onEdit} />
      )}
    </div>
  );
}
