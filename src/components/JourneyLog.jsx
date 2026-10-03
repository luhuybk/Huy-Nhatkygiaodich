import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Link2, List, Pencil, Plus, Search, Tags, X } from "lucide-react";
import { ConfirmButton, Field, useStickyTab } from "./ui.jsx";
import { dateKey, emptyLesson, todayStr, uid, weekStart } from "../lib/helpers.js";
import {
  applyLogFilters, emptyLogEntry, entriesInRange, finalizeLogEntry, firstLine, fmtDayVN, fmtRShortVN, LOG_MOODS, LOG_TAG_COLORS,
  logRange, logRangeLabel, logStats, monthRange, moodMeta, tradesInRange,
} from "../lib/journeyLog.js";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function TagChip({ tag, on, onClick, small }) {
  if (!tag) return null;
  const style = { "--tag": tag.color };
  return onClick ? (
    <button type="button" className={`jl-tag ${on ? "jl-tag-on" : ""} ${small ? "jl-tag-sm" : ""}`} style={style} onClick={onClick}>{tag.name}</button>
  ) : (
    <span className={`jl-tag jl-tag-on ${small ? "jl-tag-sm" : ""}`} style={style}>{tag.name}</span>
  );
}

// Kết quả giao dịch của ngày/tuần mà log nói tới. Bấm mở danh sách lệnh, bấm lệnh mở chi tiết.
function TradeResult({ trades, from, to, onOpenTrade }) {
  const [open, setOpen] = useState(false);
  const sum = useMemo(() => tradesInRange(trades, from, to), [trades, from, to]);
  if (!sum.count) return <span className="jl-trades jl-trades-none">Không có lệnh</span>;
  return (
    <span className="jl-trades-wrap">
      <button type="button" className={`jl-trades ${sum.withR ? (sum.r > 0 ? "jl-pos" : sum.r < 0 ? "jl-neg" : "") : ""}`} onClick={() => setOpen(!open)}>
        {sum.count} lệnh{sum.closed ? ` · ${sum.wins}W ${sum.losses}L` : ""}{sum.withR ? ` · ${fmtRShortVN(sum.r)}` : ""}{sum.open ? ` · ${sum.open} đang mở` : ""}
        <ChevronRight size={11} className={open ? "jl-rot" : ""} />
      </button>
      {open ? (
        <span className="jl-trade-list">
          {sum.list.map((t) => (
            <button key={t.id} type="button" className="jl-trade-chip" onClick={() => onOpenTrade && onOpenTrade(t)}>
              {t.symbol || "?"} {t.direction === "sell" ? "↓" : "↑"}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

const tradeLabel = (t) => `${t.symbol || "?"} ${t.direction === "sell" ? "↓" : "↑"}`;
const tradeDay = (t) => { const d = dateKey(t); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ""; };

// Gắn log vào lệnh cụ thể (không bắt buộc). Gợi ý sẵn các lệnh trong đúng ngày/tuần của log;
// lệnh khác thì gõ mã để tìm.
function TradePicker({ trades, draft, onToggle }) {
  const [q, setQ] = useState("");
  const ids = draft.tradeIds || [];
  const { from, to } = logRange({ ...draft, date: draft.scope === "week" ? weekStart(draft.date) : draft.date });
  const near = useMemo(() => (trades || []).filter((t) => { const d = dateKey(t); return d && d >= from && d <= to; }), [trades, from, to]);
  const found = useMemo(() => {
    const k = q.trim().toUpperCase();
    if (!k) return [];
    return (trades || []).filter((t) => String(t.symbol || "").toUpperCase().includes(k) && !near.includes(t))
      .sort((a, b) => String(dateKey(b)).localeCompare(String(dateKey(a)))).slice(0, 8);
  }, [trades, q, near]);
  const picked = (trades || []).filter((t) => ids.includes(t.id) && !near.includes(t));
  const chip = (t) => (
    <button key={t.id} type="button" className={`jl-trade-chip ${ids.includes(t.id) ? "jl-trade-chip-on" : ""}`} onClick={() => onToggle(t.id)}>
      {ids.includes(t.id) ? <Check size={11} /> : <Link2 size={11} />} {tradeLabel(t)} <small>{tradeDay(t)}</small>
    </button>
  );
  return (
    <div className="jl-picker">
      <span className="jl-picker-label"><Link2 size={12} /> Gắn vào lệnh <small>(không bắt buộc)</small></span>
      <span className="jl-trade-list">
        {near.length ? near.map(chip) : <small className="field-hint" style={{ margin: 0 }}>Không có lệnh trong {draft.scope === "week" ? "tuần" : "ngày"} này.</small>}
        {picked.map(chip)}
      </span>
      <span className="jl-picker-search">
        <Search size={12} />
        <input className="input input-inline" value={q} placeholder="Lệnh ngày khác: gõ mã, VD XAU" onChange={(e) => setQ(e.target.value)} />
      </span>
      {found.length ? <span className="jl-trade-list">{found.map(chip)}</span> : null}
    </div>
  );
}

function Composer({ draft, setDraft, tags, trades, editing, onSave, onCancel, boxRef }) {
  const set = (k) => (v) => setDraft((p) => ({ ...p, [k]: v }));
  const toggleTag = (id) => setDraft((p) => ({ ...p, tags: (p.tags || []).includes(id) ? p.tags.filter((x) => x !== id) : [...(p.tags || []), id] }));
  const toggleTrade = (id) => setDraft((p) => ({ ...p, tradeIds: (p.tradeIds || []).includes(id) ? p.tradeIds.filter((x) => x !== id) : [...(p.tradeIds || []), id] }));
  const canSave = !!String(draft.text || "").trim();
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSave) { e.preventDefault(); onSave(); } };
  return (
    <div className={`account-form jl-composer ${editing ? "jl-composer-edit" : ""}`} ref={boxRef}>
      <div className="jl-composer-top">
        <input type="date" className="input jl-date" value={draft.date} onChange={(e) => set("date")(e.target.value)} />
        <div className="jl-seg">
          <button type="button" className={draft.scope !== "week" ? "jl-seg-on" : ""} onClick={() => set("scope")("day")}>Ngày</button>
          <button type="button" className={draft.scope === "week" ? "jl-seg-on" : ""} onClick={() => set("scope")("week")}>Cả tuần</button>
        </div>
        {draft.scope === "week" ? <span className="field-hint jl-week-hint">{logRangeLabel({ ...draft, date: weekStart(draft.date) })}</span> : null}
        <div className="jl-moods" role="group" aria-label="Cảm xúc">
          {LOG_MOODS.map((m) => (
            <button key={m.v} type="button" title={m.label} className={`jl-mood ${Number(draft.mood) === m.v ? "jl-mood-on" : ""}`}
              onClick={() => set("mood")(Number(draft.mood) === m.v ? 0 : m.v)}>{m.icon}</button>
          ))}
        </div>
      </div>
      <div className="jl-tags-row">
        {tags.map((t) => <TagChip key={t.id} tag={t} on={(draft.tags || []).includes(t.id)} onClick={() => toggleTag(t.id)} />)}
      </div>
      <textarea className="input textarea jl-text" value={draft.text} onChange={(e) => set("text")(e.target.value)} onKeyDown={onKey}
        placeholder="Chuyện gì đã xảy ra, mình cảm thấy thế nào? VD: hôm qua tham lam khi có quét thanh khoản rồi lệnh chạy mất — cũng là chuyện bình thường thôi..." />
      <Field label="Nguyên nhân — vì sao chuyện đó xảy ra?">
        <textarea className="input textarea jl-cause" value={draft.cause} onChange={(e) => set("cause")(e.target.value)} onKeyDown={onKey}
          placeholder="VD: thua 2 lệnh trước nên muốn gỡ; ngủ ít; vào lệnh khi chưa đủ tín hiệu..." />
      </Field>
      <TradePicker trades={trades} draft={draft} onToggle={toggleTrade} />
      <div className="jl-composer-actions">
        <span className="field-hint">Ctrl/⌘ + Enter để lưu</span>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{editing ? "Hủy sửa" : "Đóng"}</button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={onSave}><Check size={14} /> {editing ? "Lưu thay đổi" : "Ghi log"}</button>
      </div>
    </div>
  );
}

function TagManager({ tags, entries, onChange, onClose }) {
  const [name, setName] = useState("");
  const used = useMemo(() => logStats(entries).byTag, [entries]);
  const update = (id, patch) => onChange(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...tags, { id: uid(), name: n, color: LOG_TAG_COLORS[tags.length % LOG_TAG_COLORS.length] }]);
    setName("");
  };
  return (
    <div className="account-form jl-tagman">
      <div className="jl-tagman-head"><b><Tags size={14} /> Quản lý tag</b><button type="button" className="row-btn" onClick={onClose}><X size={14} /></button></div>
      {tags.map((t) => (
        <div key={t.id} className="jl-tagman-row">
          <span className="jl-swatches">
            {LOG_TAG_COLORS.map((c) => (
              <button key={c} type="button" className={`jl-swatch ${t.color === c ? "jl-swatch-on" : ""}`} style={{ background: c }} onClick={() => update(t.id, { color: c })} aria-label="Đổi màu" />
            ))}
          </span>
          <input className="input input-inline" defaultValue={t.name} key={t.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) update(t.id, { name: v }); }} />
          <small className="field-hint jl-tagman-used">{used[t.id] || 0} log</small>
          <ConfirmButton onConfirm={() => onChange(tags.filter((x) => x.id !== t.id))} />
        </div>
      ))}
      <div className="jl-tagman-row">
        <input className="input input-inline" value={name} placeholder="Tag mới..." onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" className="btn btn-ghost" onClick={add} disabled={!name.trim()}><Plus size={13} /> Thêm</button>
      </div>
      <p className="field-hint" style={{ margin: 0 }}>Xoá tag thì các log cũ vẫn còn, chỉ không hiện chip đó nữa.</p>
    </div>
  );
}

function EntryCard({ e, tagById, trades, onOpenTrade, onEdit, onDelete, onToLesson }) {
  const { from, to } = logRange(e);
  const mood = moodMeta(e.mood);
  const linked = (trades || []).filter((t) => (e.tradeIds || []).includes(t.id));
  return (
    <div className={`jl-entry ${e.scope === "week" ? "jl-entry-week" : ""}`}>
      <div className="jl-entry-head">
        {mood ? <span className="jl-entry-mood" title={mood.label}>{mood.icon}</span> : null}
        <b className="jl-entry-date">{logRangeLabel(e)}</b>
        {(e.tags || []).map((id) => <TagChip key={id} tag={tagById[id]} small />)}
        <span className="jl-entry-actions">
          {onToLesson ? (
            e.lessonId ? <span className="jl-lesson-done"><BookOpen size={12} /> đã thành bài học</span> : (
              <button type="button" className="row-btn" title="Chuyển thành bài học" onClick={() => onToLesson(e)}><BookOpen size={13} /></button>
            )
          ) : null}
          <button type="button" className="row-btn" title="Sửa" onClick={() => onEdit(e)}><Pencil size={13} /></button>
          <ConfirmButton onConfirm={() => onDelete(e.id)} />
        </span>
      </div>
      <p className="jl-entry-text">{e.text}</p>
      {e.cause ? <p className="jl-entry-cause"><span>Nguyên nhân</span>{e.cause}</p> : null}
      <div className="jl-entry-foot">
        <TradeResult trades={trades} from={from} to={to} onOpenTrade={onOpenTrade} />
        {linked.length ? (
          <span className="jl-linked">
            {linked.map((t) => (
              <button key={t.id} type="button" className="jl-trade-chip jl-trade-chip-on" title="Lệnh đã gắn — bấm để xem" onClick={() => onOpenTrade && onOpenTrade(t)}>
                <Link2 size={11} /> {tradeLabel(t)} <small>{tradeDay(t)}</small>
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatsBar({ entries, tagById, label }) {
  const s = logStats(entries);
  const mood = s.avgMood ? moodMeta(Math.round(s.avgMood)) : null;
  const tagList = Object.entries(s.byTag).filter(([id]) => tagById[id]).sort((a, b) => b[1] - a[1]);
  return (
    <div className="jl-stats">
      <span className="jl-stats-label">{label}</span>
      <span><b>{s.count}</b> log</span>
      {mood ? <span title={`Cảm xúc trung bình ${s.avgMood.toFixed(1).replace(".", ",")}/5`}>{mood.icon} TB {s.avgMood.toFixed(1).replace(".", ",")}</span> : null}
      {tagList.map(([id, n]) => <span key={id} className="jl-stats-tag" style={{ "--tag": tagById[id].color }}>{tagById[id].name} <b>{n}</b></span>)}
    </div>
  );
}

function CalendarView({ entries, tagById, trades, onOpenTrade, cursor, setCursor, selected, setSelected, onAddFor, renderEntry }) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const { from: mFrom, to: mTo } = monthRange(y, m);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const today = todayStr();
  const monthEntries = useMemo(() => entriesInRange(entries, mFrom, mTo), [entries, mFrom, mTo]);
  const byDay = useMemo(() => {
    const map = {};
    monthEntries.filter((e) => e.scope !== "week").forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [monthEntries]);
  const tradeByDay = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) { const k = dayKey(y, m, d); const s = tradesInRange(trades, k, k); if (s.count) map[k] = s; }
    return map;
  }, [trades, y, m, daysInMonth]);

  // Chia theo hàng tuần để chèn dải "cả tuần" ngay dưới đúng hàng của nó.
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const weekOfRow = (row) => {
    const idx = row.findIndex((d) => d !== null);
    return weekStart(dayKey(y, m, row[idx]));
  };

  const selEntries = selected ? applyLogFilters(entriesInRange(entries, selected, selected), {}) : [];
  return (
    <div>
      <div className="cal-nav">
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <span className="cal-title">Tháng {m + 1}/{y}</span>
        <button type="button" className="row-btn" onClick={() => setCursor(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <StatsBar entries={monthEntries} tagById={tagById} label={`Tháng ${m + 1}:`} />
      <div className="cal-grid cal-head jl-cal">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid jl-cal">
        {rows.map((row, ri) => {
          const wk = weekOfRow(row);
          const weekLogs = monthEntries.filter((e) => e.scope === "week" && e.date === wk);
          return [
            ...row.map((d, i) => {
              if (d === null) return <div key={`${ri}-${i}`} className="cal-cell cal-empty" />;
              const key = dayKey(y, m, d);
              const logs = byDay[key] || [];
              const tr = tradeByDay[key];
              const moods = logs.map((e) => Number(e.mood)).filter((v) => v > 0);
              const mood = moods.length ? moodMeta(Math.round(moods.reduce((a, b) => a + b, 0) / moods.length)) : null;
              const tagIds = [...new Set(logs.flatMap((e) => e.tags || []))].filter((id) => tagById[id]);
              return (
                <button type="button" key={key} className={`cal-cell jl-cell ${selected === key ? "cal-sel" : ""} ${logs.length ? "jl-cell-has" : ""} ${key === today ? "jl-cell-today" : ""}`}
                  onClick={() => setSelected(selected === key ? "" : key)}>
                  <span className="jl-cell-top"><span className="cal-daynum">{d}</span>{mood ? <span className="jl-cell-mood">{mood.icon}</span> : null}</span>
                  {tagIds.length ? <span className="jl-dots">{tagIds.slice(0, 5).map((id) => <i key={id} style={{ background: tagById[id].color }} title={tagById[id].name} />)}</span> : null}
                  {logs.length ? <span className="jl-cell-count">{logs.length} log</span> : null}
                  {tr ? <span className={`jl-cell-trade ${tr.withR ? (tr.r > 0 ? "jl-pos" : tr.r < 0 ? "jl-neg" : "") : ""}`}>{tr.count}L{tr.withR ? ` ${fmtRShortVN(tr.r)}` : ""}</span> : null}
                </button>
              );
            }),
            weekLogs.length ? (
              <button type="button" key={`w-${ri}`} className="jl-weekband" onClick={() => setSelected(selected === `w:${wk}` ? "" : `w:${wk}`)}>
                <span className="jl-weekband-label">Cả tuần</span>
                {weekLogs.map((e) => (
                  <span key={e.id} className="jl-weekband-item">
                    {moodMeta(e.mood) ? moodMeta(e.mood).icon : ""} {(e.tags || []).filter((id) => tagById[id]).slice(0, 2).map((id) => <i key={id} style={{ background: tagById[id].color }} />)}
                    <span>{firstLine(e.text)}</span>
                  </span>
                ))}
              </button>
            ) : null,
          ];
        })}
      </div>
      {selected ? (
        <div className="jl-day-panel">
          <div className="jl-day-head">
            <b>{selected.startsWith("w:") ? logRangeLabel({ scope: "week", date: selected.slice(2) }) : fmtDayVN(selected)}</b>
            {!selected.startsWith("w:") ? <TradeResult trades={trades} from={selected} to={selected} onOpenTrade={onOpenTrade} /> : null}
            <button type="button" className="btn btn-ghost jl-day-add" onClick={() => onAddFor(selected.startsWith("w:") ? selected.slice(2) : selected, selected.startsWith("w:") ? "week" : "day")}>
              <Plus size={13} /> Ghi log {selected.startsWith("w:") ? "tuần này" : "ngày này"}
            </button>
          </div>
          {(selected.startsWith("w:") ? applyLogFilters(monthEntries.filter((e) => e.scope === "week" && e.date === selected.slice(2)), {}) : selEntries).map(renderEntry)}
          {!selected.startsWith("w:") && !selEntries.length ? <p className="empty-note" style={{ margin: 0 }}>Chưa có log nào cho ngày này.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function JourneyLogSection({ data, onChange, trades, onOpenTrade, lessons, onChangeLessons }) {
  const { entries, tags } = data;
  const [view, setView] = useStickyTab("journeyLogView", "list", ["list", "calendar"]);
  const [draft, setDraft] = useState(() => emptyLogEntry());
  const [editingId, setEditingId] = useState(null);
  // Ô ghi log gấp lại cho đỡ chiếm chỗ — bấm "Ghi log" mới mở.
  const [composerOpen, setComposerOpen] = useState(false);
  const [filters, setFilters] = useState({ q: "", tag: "", mood: 0 });
  const [showTags, setShowTags] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState("");
  const boxRef = useRef(null);
  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t])), [tags]);

  const save = () => {
    const e = finalizeLogEntry(draft);
    if (!e.text) return;
    const exists = entries.some((x) => x.id === e.id);
    onChange({ ...data, entries: exists ? entries.map((x) => (x.id === e.id ? e : x)) : [e, ...entries] });
    setDraft(emptyLogEntry(draft.date));
    setEditingId(null);
    setComposerOpen(false);
  };
  const openComposer = (next) => { if (next) setDraft(next); setComposerOpen(true); setTimeout(() => boxRef.current && boxRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  const edit = (e) => { setEditingId(e.id); openComposer({ ...emptyLogEntry(), ...e }); };
  const cancel = () => { setDraft(emptyLogEntry()); setEditingId(null); setComposerOpen(false); };
  const remove = (id) => { onChange({ ...data, entries: entries.filter((x) => x.id !== id) }); if (id === editingId) cancel(); };
  const addFor = (date, scope) => { setEditingId(null); openComposer({ ...emptyLogEntry(date), scope }); };
  // Log về sau hoá ra là bài học thật thì chép sang tab Bài học, giữ nguyên ngày và nguyên nhân.
  const toLesson = onChangeLessons ? (e) => {
    const lesson = {
      ...emptyLesson(logRange(e).from), id: uid(),
      title: firstLine(e.text).slice(0, 90),
      content: `${e.text}${e.cause ? `\n\nNguyên nhân: ${e.cause}` : ""}`,
    };
    onChangeLessons([lesson, ...(lessons || [])]);
    onChange({ ...data, entries: entries.map((x) => (x.id === e.id ? { ...x, lessonId: lesson.id } : x)) });
  } : null;

  const filtered = useMemo(() => applyLogFilters(entries, filters), [entries, filters]);
  const grouped = useMemo(() => {
    const out = [];
    filtered.forEach((e) => {
      const k = e.date.slice(0, 7);
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, list: [] });
      out[out.length - 1].list.push(e);
    });
    return out;
  }, [filtered]);
  const thisMonth = useMemo(() => { const now = new Date(); const r = monthRange(now.getFullYear(), now.getMonth()); return entriesInRange(entries, r.from, r.to); }, [entries]);
  const renderEntry = (e) => <EntryCard key={e.id} e={e} tagById={tagById} trades={trades} onOpenTrade={onOpenTrade} onEdit={edit} onDelete={remove} onToLesson={toLesson} />;

  useEffect(() => { if (view !== "calendar") setSelected(""); }, [view]);

  return (
    <div className="jl">
      <p className="field-hint" style={{ marginTop: 0 }}>
        Ghi lại chuyện đã xảy ra và tâm sự của mình — không cần là bài học hay lỗi. Ghi kèm <b>nguyên nhân</b>: mọi thứ đều có lý do, nhìn lại cả tháng mới thấy vấn đề nằm ở đâu.
      </p>
      <div className="jl-toolbar">
        {!composerOpen ? (
          <button type="button" className="btn btn-primary jl-new" onClick={() => { setEditingId(null); openComposer(emptyLogEntry()); }}><Plus size={14} /> Ghi log</button>
        ) : null}
        <div className="jl-seg">
          <button type="button" className={view === "list" ? "jl-seg-on" : ""} onClick={() => setView("list")}><List size={13} /> Danh sách</button>
          <button type="button" className={view === "calendar" ? "jl-seg-on" : ""} onClick={() => setView("calendar")}><CalendarDays size={13} /> Lịch tháng</button>
        </div>
        <button type="button" className={`btn btn-ghost jl-tagman-btn ${showTags ? "jl-seg-on" : ""}`} onClick={() => setShowTags(!showTags)}><Tags size={13} /> Tag</button>
      </div>
      {composerOpen ? <Composer draft={draft} setDraft={setDraft} tags={tags} trades={trades} editing={!!editingId} onSave={save} onCancel={cancel} boxRef={boxRef} /> : null}
      {showTags ? <TagManager tags={tags} entries={entries} onChange={(next) => onChange({ ...data, tags: next })} onClose={() => setShowTags(false)} /> : null}

      {view === "calendar" ? (
        <CalendarView entries={entries} tagById={tagById} trades={trades} onOpenTrade={onOpenTrade} cursor={cursor} setCursor={setCursor}
          selected={selected} setSelected={setSelected} onAddFor={addFor} renderEntry={renderEntry} />
      ) : (
        <>
          <StatsBar entries={thisMonth} tagById={tagById} label="Tháng này:" />
          <div className="jl-filters">
            <span className="jl-search"><Search size={13} /><input className="input input-inline" value={filters.q} placeholder="Tìm trong log, VD: tham lam" onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></span>
            <span className="jl-tags-row">
              {tags.map((t) => <TagChip key={t.id} tag={t} small on={filters.tag === t.id} onClick={() => setFilters({ ...filters, tag: filters.tag === t.id ? "" : t.id })} />)}
            </span>
            <span className="jl-moods jl-moods-sm">
              {LOG_MOODS.map((mm) => (
                <button key={mm.v} type="button" title={mm.label} className={`jl-mood ${filters.mood === mm.v ? "jl-mood-on" : ""}`} onClick={() => setFilters({ ...filters, mood: filters.mood === mm.v ? 0 : mm.v })}>{mm.icon}</button>
              ))}
            </span>
          </div>
          {!entries.length ? <p className="empty-note">Chưa có log nào — ghi dòng đầu tiên ở khung phía trên.</p> : null}
          {entries.length && !filtered.length ? <p className="empty-note">Không có log nào khớp bộ lọc.</p> : null}
          {grouped.map((g) => (
            <div key={g.k} className="jl-month">
              <h4 className="jl-month-title">Tháng {Number(g.k.slice(5, 7))}/{g.k.slice(0, 4)} <small>{g.list.length} log</small></h4>
              {g.list.map(renderEntry)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
