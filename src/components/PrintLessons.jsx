import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, ImageOff, Printer, X } from "lucide-react";
import { computeResult, fmtR, lessonAttachments, lessonLevel, lessonLevelMeta, lessonTitle } from "../lib/helpers.js";
import { fmtDateVN, printableImage, weekdayVN } from "../lib/printTrades.js";
import { exportPdf } from "../lib/exportPdf.js";
import { NoteText } from "./ui.jsx";

// Sổ bài học: in bài học (Hành trình giao dịch → Bài học) ra giấy, cùng khổ A4 ngang với In lệnh.
// Bài học chủ yếu là chữ nên có hai kiểu: "Sổ tay gọn" dồn nhiều bài một tờ (hai cột, ảnh nhỏ) để
// đọc lướt một lượt, và "Mỗi bài một tờ" để ảnh to và chừa chỗ ghi tay. Trang đầu tổng hợp theo cấp,
// danh mục, tháng kèm mục lục. In đúng danh sách đang lọc.
const GROUPS = [
  { id: "level", label: "Cấp độ" },
  { id: "category", label: "Danh mục" },
  { id: "month", label: "Tháng" },
];
const MODES = [
  { id: "book", label: "Sổ tay gọn", hint: "Nhiều bài một tờ, hai cột — đọc lướt một lượt" },
  { id: "sheet", label: "Mỗi bài một tờ", hint: "Ảnh to, chừa chỗ ghi tay" },
];

const shotsOf = (n) => lessonAttachments(n).filter((a) => a && (a.image || a.link));
const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");
const byDateAsc = (a, b) => (a.date || "").localeCompare(b.date || "");
// Bài không đặt tiêu đề: câu đầu của nội dung làm tiêu đề, phần còn lại làm thân — không in lặp câu đầu.
function splitLesson(n) {
  const content = String(n.content || "").trim();
  if (n.title && n.title.trim()) return { title: n.title.trim(), body: content };
  const i = content.indexOf("\n");
  return i < 0 ? { title: content, body: "" } : { title: content.slice(0, i).trim(), body: content.slice(i + 1).trim() };
}
const monthLabel = (k) => (k ? `Tháng ${Number(k.slice(5, 7))}/${k.slice(0, 4)}` : "Chưa ghi ngày");

// Bài có nhiều danh mục chỉ in một lần, dưới danh mục đầu tiên — in lặp thì chồng giấy dày gấp đôi.
function groupLessons(list, by) {
  if (by === "month") {
    const m = new Map();
    [...list].sort(byDateAsc).forEach((n) => { const k = (n.date || "").slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(n); });
    return [...m.entries()].map(([k, items]) => ({ key: k || "none", title: monthLabel(k), items }));
  }
  if (by === "category") {
    const m = new Map();
    list.forEach((n) => { const k = (n.categories || [])[0] || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(n); });
    return [...m.entries()]
      .sort((a, b) => (a[0] === "") - (b[0] === "") || b[1].length - a[1].length)
      .map(([k, items]) => ({ key: k || "none", title: k || "Chưa có danh mục", items: items.sort((a, b) => (lessonLevel(a) || 9) - (lessonLevel(b) || 9) || byDateDesc(a, b)) }));
  }
  const m = new Map();
  list.forEach((n) => { const k = lessonLevel(n); if (!m.has(k)) m.set(k, []); m.get(k).push(n); });
  return [...m.entries()]
    .sort((a, b) => (a[0] === 0) - (b[0] === 0) || a[0] - b[0])
    .map(([k, items]) => {
      const meta = lessonLevelMeta(k);
      return { key: `lv${k}`, title: meta ? meta.label : "Chưa phân cấp", hint: meta ? meta.hint : "", items: items.sort(byDateDesc) };
    });
}

function LevelBadge({ n }) {
  const lv = lessonLevel(n);
  if (!lv) return null;
  return <span className={`print-dir ${lv === 1 ? "is-sell" : ""}`}>CẤP {lv}</span>;
}

function TradeRef({ n, tradeById }) {
  if (!n.tradeId) return n.symbol ? <span><b>Mã:</b> {n.symbol}</span> : null;
  const t = tradeById[n.tradeId];
  if (!t) return <span className="print-dim">(lệnh đã xoá)</span>;
  const r = computeResult(t);
  return (
    <span>
      <b>Lệnh:</b> {t.symbol || "—"} {t.direction === "sell" ? "↓" : "↑"} · {fmtDateVN(t.entryDate).slice(0, 5)}
      {r.status === "closed" && r.rr !== null ? ` · ${fmtR(r.rr)}` : r.status === "open" ? " · đang mở" : ""}
    </span>
  );
}

function Meta({ n, tradeById }) {
  return (
    <div className="print-lsn-meta">
      <span>{n.date ? `${weekdayVN(n.date)} ${fmtDateVN(n.date)}` : "—"}</span>
      {(n.categories || []).length ? <span><b>Danh mục:</b> {(n.categories || []).join(", ")}</span> : null}
      <TradeRef n={n} tradeById={tradeById} />
    </div>
  );
}

// Ảnh tự báo trạng thái lên trên để nút In chờ ảnh tải xong mới bật.
function Shot({ a, imageKey, onImage, className }) {
  const src = printableImage(a.image, a.link);
  const [state, setState] = useState(src ? "loading" : "missing");
  useEffect(() => { onImage(imageKey, state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (src && state !== "failed") return <img className={className} src={src} alt="" onLoad={() => setState("ok")} onError={() => setState("failed")} />;
  return (
    <div className={`print-noimg ${className || ""}`}>
      <ImageOff size={20} />
      <p>{state === "failed" ? "Không tải được ảnh từ link này" : a.link ? "Link này không phải ảnh — không in được" : "Chưa có ảnh"}</p>
      {a.link ? <p className="print-link">{a.link}</p> : null}
    </div>
  );
}

function Cover({ list, groups, label, tradeById }) {
  const dates = list.map((n) => n.date).filter(Boolean).sort();
  const range = dates.length ? `${fmtDateVN(dates[0])} – ${fmtDateVN(dates[dates.length - 1])}` : "";
  const lv = [0, 1, 2, 3].map((k) => list.filter((n) => lessonLevel(n) === k).length);
  const byCat = useMemo(() => {
    const m = new Map();
    list.forEach((n) => (n.categories && n.categories.length ? n.categories : ["Chưa có danh mục"]).forEach((c) => {
      const x = m.get(c) || { n: 0, core: 0 };
      x.n += 1; if (lessonLevel(n) === 1) x.core += 1;
      m.set(c, x);
    }));
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [list]);
  const byMonth = useMemo(() => {
    const m = new Map();
    [...list].sort(byDateAsc).forEach((n) => { const k = (n.date || "").slice(0, 7); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()];
  }, [list]);
  const linked = list.filter((n) => n.tradeId && tradeById[n.tradeId]).length;
  let no = 0;
  return (
    <section className="print-cover">
      <div className="print-cover-head">
        <span className="print-cover-title">SỔ BÀI HỌC</span>
        <span className="print-cover-range">{range}{label ? ` · ${label}` : ""}</span>
      </div>
      <div className="print-cover-kpis">
        <div><span>Số bài học</span><b>{list.length}</b></div>
        <div><span>Cấp 1 — Cốt lõi</span><b>{lv[1]}</b></div>
        <div><span>Cấp 2 · Cấp 3</span><b>{lv[2]} · {lv[3]}</b></div>
        <div><span>Danh mục nhiều nhất</span><b style={{ fontSize: 14 }}>{byCat.length ? `${byCat[0][0]} (${byCat[0][1].n})` : "—"}</b></div>
        <div><span>Gắn với lệnh</span><b>{linked}/{list.length}</b></div>
      </div>
      {lv[0] ? <p className="print-small" style={{ margin: "4px 0 0" }}>{lv[0]} bài chưa phân cấp.</p> : null}
      <div className="print-detail-body" style={{ gridTemplateColumns: "minmax(0, 30fr) minmax(0, 70fr)" }}>
        <div className="print-detail-facts">
          <h4 className="print-cover-h">Theo danh mục</h4>
          <table className="print-table print-kv"><tbody>
            {byCat.map(([k, x]) => <tr key={k}><th>{k}</th><td>{x.n} bài{x.core ? ` · ${x.core} cấp 1` : ""}</td></tr>)}
          </tbody></table>
          <h4 className="print-cover-h">Theo tháng</h4>
          <table className="print-table print-kv"><tbody>
            {byMonth.map(([k, c]) => <tr key={k || "none"}><th>{monthLabel(k)}</th><td>{c} bài</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <h4 className="print-cover-h">Mục lục</h4>
          {list.length ? (
            <table className="print-table">
              <thead><tr><th>#</th><th>Ngày</th><th>Cấp</th><th>Bài học</th><th>Danh mục</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="print-lsn-toc-group" data-pdf-keep><td colSpan={5}><b>{g.title}</b> · {g.items.length} bài</td></tr>
                    {g.items.map((n) => {
                      no += 1;
                      return (
                        <tr key={n.id} data-pdf-keep>
                          <td>{no}</td>
                          <td>{fmtDateVN(n.date)}</td>
                          <td>{lessonLevel(n) || ""}</td>
                          <td><b>{lessonTitle(n) || "(chưa có nội dung)"}</b></td>
                          <td className="print-small">{(n.categories || []).join(", ")}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : <p className="print-cover-empty">Không có bài học nào.</p>}
        </div>
      </div>
    </section>
  );
}

// Một bài trong Sổ tay gọn. data-pdf-keep: file PDF không cắt ngang giữa bài.
function BookItem({ n, no, tradeById, thumbs, onImage }) {
  const shots = thumbs ? shotsOf(n).slice(0, 2) : [];
  const { title, body } = splitLesson(n);
  return (
    <article className={`print-lsn-item print-lsn-lv${lessonLevel(n)}`} data-pdf-keep>
      <div className="print-lsn-item-head">
        <span className="print-lsn-no">{no}</span>
        <LevelBadge n={n} />
        <b className="print-lsn-title">{title || "(chưa có nội dung)"}</b>
      </div>
      <Meta n={n} tradeById={tradeById} />
      {body ? <div className="print-note-text print-lsn-text"><NoteText text={body} /></div> : null}
      {shots.length ? (
        <div className={`print-lsn-thumbs ${shots.length > 1 ? "is-two" : ""}`}>
          {shots.map((a, i) => <Shot key={i} a={a} imageKey={`${n.id}-${i}`} onImage={onImage} className="print-lsn-thumb" />)}
        </div>
      ) : null}
    </article>
  );
}

function Book({ groups, tradeById, thumbs, onImage }) {
  let no = 0;
  return (
    <section className="print-cover print-lsn-book">
      {groups.map((g) => (
        <div key={g.key} className="print-lsn-group">
          {/* Tiêu đề nhóm dính với hàng bài đầu tiên: không để tiêu đề nằm trơ cuối tờ. */}
          <h3 className="print-lsn-group-h" data-pdf-keep="with-next">{g.title}<span>{g.items.length} bài{g.hint ? ` · ${g.hint}` : ""}</span></h3>
          <div className="print-lsn-grid">
            {g.items.map((n) => {
              no += 1;
              return <BookItem key={n.id} n={n} no={no} tradeById={tradeById} thumbs={thumbs} onImage={onImage} />;
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function LessonSheet({ n, no, total, tradeById, firstOnly, onImage }) {
  const shots = shotsOf(n);
  const { title, body } = splitLesson(n);
  const extra = firstOnly ? [] : shots.slice(1);
  const head = (sub) => (
    <header className="print-head">
      <div className="print-head-main">
        <LevelBadge n={n} />
        <span className="print-lsn-sheet-title">{title || "(chưa có nội dung)"}</span>
        {sub ? <span className="print-kind">{sub}</span> : null}
        <span className="print-count">Bài {no}/{total}</span>
      </div>
      <Meta n={n} tradeById={tradeById} />
    </header>
  );
  return (
    <>
      <section className="print-sheet print-detail print-lsn-sheet">
        {head(shots.length > 1 && !firstOnly ? `ẢNH 1/${shots.length}` : "")}
        <div className={`print-lsn-sheet-body ${shots.length ? "" : "is-text"}`}>
          <div className="print-detail-notes">
            {body ? <div className="print-note-text print-lsn-sheet-text"><NoteText text={body} /></div> : null}
            <div className="print-handwrite"><span>Lần sau gặp lại tình huống này, mình sẽ…</span></div>
          </div>
          {shots.length ? <div className="print-img"><Shot a={shots[0]} imageKey={`${n.id}-0`} onImage={onImage} /></div> : null}
        </div>
      </section>
      {extra.map((a, i) => (
        <section key={i} className="print-sheet">
          {head(`ẢNH ${i + 2}/${shots.length}`)}
          <div className="print-img"><Shot a={a} imageKey={`${n.id}-${i + 1}`} onImage={onImage} /></div>
        </section>
      ))}
    </>
  );
}

export function PrintLessons({ items, trades, label, onClose }) {
  const [mode, setMode] = useState("book");
  const [groupBy, setGroupBy] = useState("level");
  const [withCover, setWithCover] = useState(true);
  const [thumbs, setThumbs] = useState(true);
  const [firstOnly, setFirstOnly] = useState(false);
  const [skip, setSkip] = useState(() => new Set());
  const [images, setImages] = useState({});
  const [exporting, setExporting] = useState(null);
  const [exported, setExported] = useState("");
  const pagesRef = useRef(null);
  const tradeById = useMemo(() => Object.fromEntries((trades || []).map((t) => [t.id, t])), [trades]);
  const all = useMemo(() => [...(items || [])].sort(byDateAsc), [items]);
  const list = useMemo(() => all.filter((n) => !skip.has(n.id)), [all, skip]);
  const groups = useMemo(() => groupLessons(list, groupBy), [list, groupBy]);
  const ordered = groups.flatMap((g) => g.items);
  const onImage = (key, state) => setImages((prev) => (prev[key] === state ? prev : { ...prev, [key]: state }));

  useEffect(() => {
    document.body.classList.add("printing-trades");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("printing-trades"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  // Đổi kiểu in thì bộ ảnh hiện trên trang đổi theo — trạng thái ảnh cũ không còn đúng nữa.
  useEffect(() => { setImages({}); }, [mode, thumbs, firstOnly]);

  // Chỉ đếm ảnh đang thật sự nằm trên trang theo kiểu in đang chọn.
  const keys = ordered.flatMap((n) => {
    const c = shotsOf(n).length;
    const shown = mode === "book" ? (thumbs ? Math.min(c, 2) : 0) : (firstOnly ? Math.min(c, 1) : c);
    return Array.from({ length: shown }, (_, i) => `${n.id}-${i}`);
  });
  const loading = keys.filter((k) => images[k] === "loading").length;
  const badIds = new Set(keys.filter((k) => ["missing", "failed"].includes(images[k])).map((k) => k.slice(0, k.lastIndexOf("-"))));
  const bad = ordered.filter((n) => badIds.has(n.id));
  const toggle = (id) => setSkip((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const dates = list.map((n) => n.date).filter(Boolean).sort();
  const fileName = `So-bai-hoc_${dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : "tat-ca"}.pdf`;
  const sheetCount = mode === "sheet" ? ordered.reduce((s, n) => s + (firstOnly ? 1 : Math.max(1, shotsOf(n).length)), 0) : 0;
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
          <b>SỔ BÀI HỌC{label ? ` · ${label}` : ""}</b>
          <span className="jl-seg">
            {MODES.map((m) => (
              <button key={m.id} type="button" title={m.hint} className={mode === m.id ? "jl-seg-on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </span>
          <label className="print-opt">Xếp theo
            <select className="input print-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
          <label className="print-opt"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Kèm trang tổng hợp</label>
          {mode === "book" ? (
            <label className="print-opt" title="Mỗi bài in tối đa 2 ảnh nhỏ dưới nội dung">
              <input type="checkbox" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} /> Kèm ảnh nhỏ
            </label>
          ) : (
            <label className="print-opt" title="Bài có nhiều ảnh thì chỉ in ảnh đầu tiên — mỗi bài đúng một tờ">
              <input type="checkbox" checked={firstOnly} onChange={(e) => setFirstOnly(e.target.checked)} /> Chỉ ảnh đầu tiên
            </label>
          )}
          <span className="field-hint" style={{ margin: 0 }}>
            {list.length} bài{mode === "sheet" ? ` · ${sheetCount + (withCover ? 1 : 0)} tờ A4 ngang` : " · A4 ngang"}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" disabled={!list.length || loading > 0 || !!exporting} onClick={download}
            title="Tải về file PDF (A4 ngang) để lưu lên Google Drive">
            <Download size={14} /> {exporting ? `Đang tạo trang ${exporting.done}/${exporting.total}…` : "Tải PDF"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!list.length || loading > 0 || !!exporting} onClick={() => window.print()}>
            <Printer size={14} /> {loading ? `Đang tải ảnh (${loading})…` : "In"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}><X size={14} /> Đóng</button>
        </div>
        {all.length ? (
          <div className="print-picks">
            {all.map((n) => (
              <label key={n.id} className={`print-pick ${skip.has(n.id) ? "is-off" : ""}`} title={lessonTitle(n)}>
                <input type="checkbox" checked={!skip.has(n.id)} onChange={() => toggle(n.id)} />
                {fmtDateVN(n.date).slice(0, 5)} · {(lessonTitle(n) || "—").slice(0, 32)}
              </label>
            ))}
          </div>
        ) : null}
        {bad.length ? (
          <p className="print-warn">
            <AlertTriangle size={13} /> {bad.length} bài có ảnh không in được — phần chữ vẫn in bình thường.
            Link TradingView (tradingview.com/x/…) và link ảnh trực tiếp thì in được; link loại khác thì không.
          </p>
        ) : null}
        {exported ? <p className="field-hint" style={{ margin: "6px 0 0", color: exported.startsWith("Đã") ? "var(--win)" : "var(--loss)" }}>{exported}</p> : null}
        <p className="field-hint" style={{ margin: "6px 0 0" }}>
          In đúng danh sách đang lọc ở trang trước — muốn in một danh mục, một cấp hay một khoảng ngày thì lọc trước rồi bấm In. Trong hộp thoại in: khổ A4, hướng <b>Ngang</b>, bỏ tick "Đầu trang và chân trang".
        </p>
      </div>
      <div className="print-pages" ref={pagesRef}>
        {withCover ? <Cover list={ordered} groups={groups} label={label} tradeById={tradeById} /> : null}
        {!list.length ? <p className="empty-note" style={{ padding: 24 }}>Không có bài học nào để in.</p> : mode === "book" ? (
          <Book groups={groups} tradeById={tradeById} thumbs={thumbs} onImage={onImage} />
        ) : ordered.map((n, i) => (
          <LessonSheet key={n.id} n={n} no={i + 1} total={ordered.length} tradeById={tradeById} firstOnly={firstOnly} onImage={onImage} />
        ))}
      </div>
    </div>,
    document.body
  );
}
