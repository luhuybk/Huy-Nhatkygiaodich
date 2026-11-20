import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Printer, X } from "lucide-react";
import { exportPdf } from "../lib/exportPdf.js";
import { fmtDateVN, weekdayVN } from "../lib/printTrades.js";
import { fmtRShortVN, logRange, logRangeLabel, LOG_MOODS, moodMeta, tradesInRange } from "../lib/journeyLog.js";
import { NoteText } from "./ui.jsx";

// In Log hành trình ra giấy (A4 ngang, cùng kiểu Sổ bài học): trang đầu tổng hợp theo tag, theo
// cảm xúc (kèm kết quả lệnh những ngày đó) và gom mọi nguyên nhân đã ghi vào một bảng — nhìn cả
// tháng một lượt mới thấy chuyện gì đang lặp lại. Sau đó là từng log, hai cột, chừa dòng ghi tay.
const byOldest = (a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0);
const monthLabel = (k) => `Tháng ${Number(k.slice(5, 7))}/${k.slice(0, 4)}`;
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

function dayLabel(e) {
  return e.scope === "week" ? logRangeLabel(e) : `${weekdayVN(e.date)} ${fmtDateVN(e.date)}`;
}

function Tags({ e, tagById }) {
  const list = (e.tags || []).map((id) => tagById[id]).filter(Boolean);
  if (!list.length) return null;
  return <span className="jlp-tags">{list.map((t) => <span key={t.id} className="jlp-tag" style={{ "--tag": t.color }}>{t.name}</span>)}</span>;
}

function TradeLine({ e, trades, tradeById }) {
  const { from, to } = logRange(e);
  const s = tradesInRange(trades, from, to);
  const linked = (e.tradeIds || []).map((id) => tradeById[id]).filter(Boolean);
  if (!s.count && !linked.length) return null;
  return (
    <div className="jlp-trades">
      {s.count ? (
        <span><b>{e.scope === "week" ? "Tuần đó" : "Ngày đó"}:</b> {s.count} lệnh{s.closed ? ` · ${s.wins}W ${s.losses}L` : ""}{s.withR ? ` · ${fmtRShortVN(s.r)}` : ""}{s.open ? ` · ${s.open} đang mở` : ""}</span>
      ) : null}
      {linked.length ? (
        <span><b>Gắn lệnh:</b> {linked.map((t) => `${t.symbol || "?"} ${t.direction === "sell" ? "↓" : "↑"}`).join(", ")}</span>
      ) : null}
    </div>
  );
}

function Cover({ list, tagById, trades, label }) {
  const dates = list.flatMap((e) => { const r = logRange(e); return [r.from, r.to]; }).filter(Boolean).sort();
  const range = dates.length ? `${fmtDateVN(dates[0])} – ${fmtDateVN(dates[dates.length - 1])}` : "";
  const moods = list.map((e) => Number(e.mood)).filter((v) => v > 0);
  const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  const total = dates.length ? tradesInRange(trades, dates[0], dates[dates.length - 1]) : null;
  const byTag = useMemo(() => {
    const m = new Map();
    list.forEach((e) => (e.tags || []).filter((id) => tagById[id]).forEach((id) => {
      const x = m.get(id) || { n: 0, mSum: 0, mN: 0 };
      x.n += 1; if (Number(e.mood) > 0) { x.mSum += Number(e.mood); x.mN += 1; }
      m.set(id, x);
    }));
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [list, tagById]);
  // Cảm xúc ↔ kết quả: những ngày ghi cảm xúc X thì lệnh hôm đó ra sao (chỉ log theo ngày).
  const byMood = useMemo(() => LOG_MOODS.map((m) => {
    const days = [...new Set(list.filter((e) => e.scope !== "week" && Number(e.mood) === m.v).map((e) => e.date))];
    let count = 0; let r = 0; let withR = 0;
    days.forEach((d) => { const s = tradesInRange(trades, d, d); count += s.count; r += s.r; withR += s.withR; });
    return { m, n: list.filter((e) => Number(e.mood) === m.v).length, count, r, withR };
  }).filter((x) => x.n).reverse(), [list, trades]);
  const causes = list.filter((e) => String(e.cause || "").trim());
  const low = moods.filter((v) => v <= 2).length;
  return (
    <section className="print-cover">
      <div className="print-cover-head">
        <span className="print-cover-title">LOG HÀNH TRÌNH</span>
        <span className="print-cover-range">{range}{label ? ` · ${label}` : ""}</span>
      </div>
      <div className="print-cover-kpis">
        <div><span>Số log</span><b>{list.length}</b></div>
        <div><span>Cảm xúc trung bình</span><b>{avg ? `${moodMeta(Math.round(avg)).icon} ${avg.toFixed(1).replace(".", ",")}/5` : "—"}</b></div>
        <div><span>Log tâm trạng tệ (😣 😟)</span><b>{low}</b></div>
        <div><span>Tag hay gặp nhất</span><b style={{ fontSize: 14 }}>{byTag.length ? `${tagById[byTag[0][0]].name} (${byTag[0][1].n})` : "—"}</b></div>
        <div><span>Lệnh trong kỳ</span><b style={{ fontSize: 14 }}>{total && total.count ? `${total.count} · ${total.wins}W ${total.losses}L${total.withR ? ` · ${fmtRShortVN(total.r)}` : ""}` : "—"}</b></div>
      </div>
      <div className="print-detail-body" style={{ gridTemplateColumns: "minmax(0, 34fr) minmax(0, 66fr)" }}>
        <div className="print-detail-facts">
          <h4 className="print-cover-h">Theo tag</h4>
          {byTag.length ? (
            <table className="print-table print-kv"><tbody>
              {byTag.map(([id, x]) => (
                <tr key={id}><th><span className="jlp-dot" style={{ background: tagById[id].color }} />{tagById[id].name}</th>
                  <td>{x.n} log{x.mN ? ` · cảm xúc TB ${(x.mSum / x.mN).toFixed(1).replace(".", ",")}` : ""}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="print-cover-empty">Chưa gắn tag nào.</p>}
          <h4 className="print-cover-h">Cảm xúc ↔ kết quả lệnh hôm đó</h4>
          {byMood.length ? (
            <table className="print-table print-kv"><tbody>
              {byMood.map((x) => (
                <tr key={x.m.v}><th>{x.m.icon} {x.m.label}</th>
                  <td>{x.n} log{x.count ? ` · ${x.count} lệnh${x.withR ? ` · ${fmtRShortVN(x.r)}` : ""}` : " · không có lệnh"}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="print-cover-empty">Chưa chấm cảm xúc.</p>}
        </div>
        <div>
          <h4 className="print-cover-h">Nguyên nhân đã ghi — đọc một lượt xem cái gì lặp lại</h4>
          {causes.length ? (
            <table className="print-table">
              <thead><tr><th>Ngày</th><th></th><th>Nguyên nhân</th></tr></thead>
              <tbody>
                {causes.map((e) => (
                  <tr key={e.id} data-pdf-keep>
                    <td style={{ whiteSpace: "nowrap" }}>{e.scope === "week" ? logRangeLabel(e).replace(/\/\d{4}$/, "") : fmtDateVN(e.date).slice(0, 5)}</td>
                    <td>{moodMeta(e.mood) ? moodMeta(e.mood).icon : ""}</td>
                    <td className="print-note-text">{e.cause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="print-cover-empty">Chưa log nào ghi nguyên nhân.</p>}
        </div>
      </div>
    </section>
  );
}

function Entry({ e, tagById, trades, tradeById, handwrite }) {
  const mood = moodMeta(e.mood);
  return (
    <article className={`print-lsn-item jlp-item ${e.scope === "week" ? "jlp-week" : ""}`} data-pdf-keep>
      <div className="print-lsn-item-head">
        {mood ? <span className="jlp-mood" title={mood.label}>{mood.icon}</span> : null}
        <b className="print-lsn-title">{dayLabel(e)}</b>
        {e.scope === "week" ? <span className="print-dir">CẢ TUẦN</span> : null}
        <Tags e={e} tagById={tagById} />
      </div>
      <div className="print-note-text print-lsn-text"><NoteText text={e.text} /></div>
      {e.cause ? <div className="jlp-cause"><b>Nguyên nhân</b><div className="print-note-text"><NoteText text={e.cause} /></div></div> : null}
      <TradeLine e={e} trades={trades} tradeById={tradeById} />
      {handwrite ? <div className="print-handwrite jlp-handwrite"><span>Nhìn lại…</span></div> : null}
    </article>
  );
}

export function PrintJourneyLog({ entries, tags, trades, label, onClose }) {
  const tagById = useMemo(() => Object.fromEntries((tags || []).map((t) => [t.id, t])), [tags]);
  const tradeById = useMemo(() => Object.fromEntries((trades || []).map((t) => [t.id, t])), [trades]);
  const sorted = useMemo(() => [...(entries || [])].sort(byOldest), [entries]);
  const months = useMemo(() => [...new Set(sorted.map((e) => String(e.date).slice(0, 7)))].reverse(), [sorted]);
  const [month, setMonth] = useState(() => (months.includes(thisMonth()) ? thisMonth() : "all"));
  const [withCover, setWithCover] = useState(true);
  const [handwrite, setHandwrite] = useState(true);
  const [skip, setSkip] = useState(() => new Set());
  const [exporting, setExporting] = useState(null);
  const [exported, setExported] = useState("");
  const pagesRef = useRef(null);
  const inMonth = useMemo(() => (month === "all" ? sorted : sorted.filter((e) => String(e.date).slice(0, 7) === month)), [sorted, month]);
  const list = useMemo(() => inMonth.filter((e) => !skip.has(e.id)), [inMonth, skip]);
  const groups = useMemo(() => {
    const out = [];
    list.forEach((e) => {
      const k = String(e.date).slice(0, 7);
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, items: [] });
      out[out.length - 1].items.push(e);
    });
    return out;
  }, [list]);
  const fullLabel = [month === "all" ? "" : monthLabel(month), label].filter(Boolean).join(" · ");

  useEffect(() => {
    document.body.classList.add("printing-trades");
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("printing-trades"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const toggle = (id) => setSkip((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const fileName = `Log-hanh-trinh_${month === "all" ? (list.length ? `${list[0].date}_${list[list.length - 1].date}` : "tat-ca") : month}.pdf`;
  const download = async () => {
    const nodes = pagesRef.current ? [...pagesRef.current.querySelectorAll(".print-cover, .print-sheet")] : [];
    if (!nodes.length) return;
    setExported("");
    try {
      const res = await exportPdf(nodes, fileName, (done, total) => setExporting({ done, total }));
      setExported(`Đã tải ${fileName} · ${res.pages} trang · ${(res.size / 1048576).toFixed(1)} MB`);
    } catch (err) {
      setExported(`Không tạo được PDF: ${(err && err.message) || err}. Dùng nút In → chọn "Lưu dưới dạng PDF" thay thế.`);
    } finally {
      setExporting(null);
    }
  };

  return createPortal(
    <div className="print-root">
      <div className="print-toolbar">
        <div className="print-toolbar-row">
          <b>LOG HÀNH TRÌNH{fullLabel ? ` · ${fullLabel}` : ""}</b>
          <label className="print-opt">Kỳ
            <select className="input print-select" value={month} onChange={(ev) => { setMonth(ev.target.value); setSkip(new Set()); }}>
              <option value="all">Tất cả</option>
              {months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select>
          </label>
          <label className="print-opt"><input type="checkbox" checked={withCover} onChange={(ev) => setWithCover(ev.target.checked)} /> Kèm trang tổng hợp</label>
          <label className="print-opt" title="Dưới mỗi log chừa vài dòng kẻ để ghi tay khi đọc lại">
            <input type="checkbox" checked={handwrite} onChange={(ev) => setHandwrite(ev.target.checked)} /> Chừa dòng ghi tay
          </label>
          <span className="field-hint" style={{ margin: 0 }}>{list.length} log · A4 ngang</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={!list.length || !!exporting} onClick={download} title="Tải về file PDF (A4 ngang) để lưu lên Google Drive">
            <Download size={14} /> {exporting ? `Đang tạo trang ${exporting.done}/${exporting.total}…` : "Tải PDF"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!list.length || !!exporting} onClick={() => window.print()}><Printer size={14} /> In</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}><X size={14} /> Đóng</button>
        </div>
        {inMonth.length ? (
          <div className="print-picks">
            {inMonth.map((e) => (
              <label key={e.id} className={`print-pick ${skip.has(e.id) ? "is-off" : ""}`} title={e.text}>
                <input type="checkbox" checked={!skip.has(e.id)} onChange={() => toggle(e.id)} />
                {moodMeta(e.mood) ? `${moodMeta(e.mood).icon} ` : ""}{e.scope === "week" ? "Tuần " : ""}{fmtDateVN(e.date).slice(0, 5)} · {String(e.text || "").split("\n")[0].slice(0, 28)}
              </label>
            ))}
          </div>
        ) : null}
        {exported ? <p className="field-hint" style={{ margin: "6px 0 0", color: exported.startsWith("Đã") ? "var(--win)" : "var(--loss)" }}>{exported}</p> : null}
        <p className="field-hint" style={{ margin: "6px 0 0" }}>
          In theo bộ lọc tag / cảm xúc / tìm kiếm đang chọn ở trang trước, trong kỳ chọn ở trên. Trong hộp thoại in: khổ A4, hướng <b>Ngang</b>, bỏ tick "Đầu trang và chân trang".
        </p>
      </div>
      <div className="print-pages" ref={pagesRef}>
        {withCover ? <Cover list={list} tagById={tagById} trades={trades} label={fullLabel} /> : null}
        {list.length ? (
          <section className="print-cover print-lsn-book">
            {groups.map((g) => (
              <div key={g.k} className="print-lsn-group">
                <h3 className="print-lsn-group-h" data-pdf-keep="with-next">{monthLabel(g.k)}<span>{g.items.length} log</span></h3>
                <div className="print-lsn-grid">
                  {g.items.map((e) => <Entry key={e.id} e={e} tagById={tagById} trades={trades} tradeById={tradeById} handwrite={handwrite} />)}
                </div>
              </div>
            ))}
          </section>
        ) : <p className="empty-note" style={{ padding: 24 }}>Không có log nào để in.</p>}
      </div>
    </div>,
    document.body
  );
}
