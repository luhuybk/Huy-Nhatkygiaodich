import { useState, useMemo } from "react";
import { BookOpen, X, Pencil, ChevronRight, ChevronLeft, Check, CalendarDays, Filter, StickyNote } from "lucide-react";
import { CellImagePreview, CompletionBar, ConfirmButton, DangerConfirmButton, DetailGroup, DetailRow, ResourceSelect, StarRating } from "./ui.jsx";
import { GRADE_OPTIONS, RESULT_FILTERS } from "../lib/constants.js";
import { applyFilters, avgPillarScore, checklistProgress, computeResult, dateKey, fmt, heatColor, tradeCompletion, yearKey } from "../lib/helpers.js";

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
      </div>
      <button type="button" className="btn btn-ghost" onClick={clear}><Filter size={13} /> Xóa lọc</button>
    </div>
  );
}

export function TradeDetailModal({ trade, onClose, onEdit, onDelete }) {
  if (!trade) return null;
  const t = trade;
  const { rr, outcome, status } = computeResult(t);
  const score = avgPillarScore(t);
  const grade = GRADE_OPTIONS.find((g) => g.id === t.tradeGrade);
  const checklistEntries = Object.entries(t.checklist || {});
  const completion = tradeCompletion(t);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Chi tiết giao dịch</h3>
          <button type="button" className="row-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <CompletionBar done={completion.done} total={completion.total} percent={completion.percent} />
          <div className="chart-row">
            <DetailGroup title="Thông tin">
              <DetailRow label="Ngày entry" value={t.entryDate} />
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
              <DetailRow label="Tâm lý" value={t.psychology} />
            </DetailGroup>
            <DetailGroup title="Đánh giá giao dịch">
              <DetailRow label="Nhãn đánh giá" value={grade ? `${grade.tone === "win" ? "👍" : "☠️"} ${grade.label}` : "—"} />
              <DetailRow label="Nhận xét / Review" value={t.reviewNote} />
              <DetailRow label="Lý do vào lệnh" value={t.entryReason} />
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

          {(t.entryImage || t.entryLink || t.exitImage || t.exitLink) ? (
            <DetailGroup title="Hình ảnh">
              <div style={{ display: "flex", gap: 16 }}>
                {(t.entryImage || t.entryLink) ? (
                  <div>
                    <span className="field-hint">Vào lệnh</span><br />
                    <CellImagePreview image={t.entryImage} link={t.entryLink} />
                  </div>
                ) : null}
                {(t.exitImage || t.exitLink) ? (
                  <div>
                    <span className="field-hint">Thoát lệnh</span><br />
                    <CellImagePreview image={t.exitImage} link={t.exitLink} />
                  </div>
                ) : null}
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

export function JournalTable({ trades, resources, onEdit, onDelete }) {
  const res = resources || { checklistItems: [] };
  if (trades.length === 0) return <p className="empty-note" style={{ padding: "24px 0" }}>Không có giao dịch nào khớp bộ lọc.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Ngày</th><th>Symbol</th><th>Ảnh</th><th>Hướng</th><th>Setup</th><th>TF</th><th>%Risk</th><th>Lãi/Lỗ</th><th>RR</th><th>Kết quả</th><th>Chấm điểm</th><th>Checklist</th><th>Đánh giá</th><th>Tiến độ</th><th>Bài học</th><th></th></tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const { rr, outcome, status } = computeResult(t);
            const cp = checklistProgress(t, res);
            const completion = tradeCompletion(t);
            return (
              <tr key={t.id} onClick={() => onEdit(t)} className={t.hasLesson ? "row-has-lesson" : ""}>
                <td className="mono">{t.entryDate || "—"}</td>
                <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <CellImagePreview image={t.entryImage} link={t.entryLink} />
                    {t.exitImage || t.exitLink ? <CellImagePreview image={t.exitImage} link={t.exitLink} /> : null}
                  </div>
                </td>
                <td><span className={`dir-pill ${t.direction}`}>{t.direction === "buy" ? "Buy" : "Sell"}</span></td>
                <td>{t.setup || "—"}</td>
                <td className="mono">{t.timeframe || "—"}</td>
                <td className="mono">{t.riskPercent === "" || t.riskPercent === null || t.riskPercent === undefined ? "—" : `${t.riskPercent}%`}</td>
                <td className={`mono ${Number(t.profit) > 0 ? "text-win" : Number(t.profit) < 0 ? "text-loss" : ""}`}>{t.profit === "" ? "—" : fmt(Number(t.profit))}</td>
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
                <td className={`mono ${completion.percent >= 80 ? "text-win" : completion.percent < 40 ? "text-loss" : ""}`} title={`${completion.done}/${completion.total} mục`}>
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

  const byDay = useMemo(() => {
    const out = {};
    trades.forEach((t) => {
      const r = computeResult(t);
      const key = dateKey(t);
      if (!key) return;
      if (!out[key]) out[key] = { pnl: 0, count: 0 };
      out[key].count += 1;
      if (r.profit) out[key].pnl += r.profit;
    });
    return out;
  }, [trades]);

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

export function JournalSection({ trades, resources, onEdit, onDelete }) {
  const [tab, setTab] = useState("list");
  const [filters, setFilters] = useState({});
  const filtered = useMemo(() => applyFilters(trades, filters, resources).sort((a, b) => b.createdAt - a.createdAt), [trades, filters, resources]);

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
      <div className="subtabs">
        <button className={`subtab ${tab === "list" ? "subtab-active" : ""}`} onClick={() => setTab("list")}><BookOpen size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Danh sách</button>
        <button className={`subtab ${tab === "calendar" ? "subtab-active" : ""}`} onClick={() => setTab("calendar")}><CalendarDays size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Lịch</button>
      </div>
      {tab === "list" ? (
        <div>
          <JournalFilters trades={trades} resources={resources} filters={filters} setFilters={setFilters} />
          <p className="field-hint" style={{ margin: "0 0 10px" }}>{filtered.length} / {trades.length} lệnh</p>
          <JournalTable trades={filtered} resources={resources} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ) : (
        <TradingCalendar trades={trades} resources={resources} onEdit={onEdit} />
      )}
    </div>
  );
}
