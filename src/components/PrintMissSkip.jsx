import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, ImageOff, Printer, X } from "lucide-react";
import { lessonAttachments } from "../lib/helpers.js";
import { REVIEW_DIRECTIONS } from "../lib/constants.js";
import { fmtDateVN, printableImage, weekdayVN } from "../lib/printTrades.js";
import { exportPdf } from "../lib/exportPdf.js";

// In setup bị miss / skip ra giấy, cùng khổ và cùng kiểu với In lệnh: trang đầu là bảng tổng hợp
// (lý do nào lặp lại nhiều nhất, danh sách từng lần), sau đó mỗi ảnh một tờ A4 ngang, đầu tờ ghi
// symbol, ngày, setup, lý do; chân tờ là ghi chú và phần review. In đúng danh sách đang lọc.
const KIND = {
  missed: { title: "SETUP BỊ MISS", badge: "MISS", dateField: "missDate", file: "Setup-miss" },
  skipped: { title: "SETUP BỊ SKIP", badge: "SKIP", dateField: "skipDate", file: "Setup-skip" },
};

const shotsOf = (n) => lessonAttachments(n).filter((a) => a && (a.image || a.link));
const dirLabel = (id) => (REVIEW_DIRECTIONS.find((d) => d.id === id) || {}).label || "";

function Sheet({ item, kind, shot, shotCount, index, total, onImage }) {
  const meta = KIND[kind];
  const a = shotsOf(item)[shot] || {};
  const src = printableImage(a.image, a.link);
  const imageKey = `${item.id}-${shot}`;
  const [state, setState] = useState(src ? "loading" : "missing");
  useEffect(() => { onImage(imageKey, state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = item[meta.dateField];
  const dir = dirLabel(item.reviewDirection);
  const note = String(item.note || "").trim();
  const review = String(item.reviewNote || "").trim();
  return (
    <section className="print-sheet">
      <header className="print-head">
        <div className="print-head-main">
          <span className="print-symbol">{item.symbol || "—"}</span>
          <span className="print-dir is-sell">{meta.badge}</span>
          {shotCount > 1 ? <span className="print-kind">ẢNH {shot + 1}/{shotCount}</span> : null}
          {item.watch ? <span className="print-pin">{item.watchDone ? "👁 đã theo dõi" : "👁 cần theo dõi"}</span> : null}
          <span className="print-count">Setup {index + 1}/{total}</span>
        </div>
        <div className="print-head-meta">
          <span><b>Ngày:</b> {d ? `${weekdayVN(d)} ${fmtDateVN(d)}` : "—"}</span>
          <span><b>Setup:</b> {item.setup || "—"}</span>
          <span><b>Khung:</b> {item.timeframe || "—"}</span>
          <span><b>Lý do:</b> {item.reason || "—"}</span>
          {dir ? <span><b>Diễn biến:</b> {dir}</span> : null}
        </div>
      </header>
      <div className="print-img">
        {src && state !== "failed" ? (
          <img src={src} alt="" onLoad={() => setState("ok")} onError={() => setState("failed")} />
        ) : (
          <div className="print-noimg">
            <ImageOff size={28} />
            <p>{state === "failed" ? "Không tải được ảnh từ link này" : a.link ? "Link này không phải ảnh — không in được" : "Chưa có ảnh"}</p>
            {a.link ? <p className="print-link">{a.link}</p> : null}
          </div>
        )}
      </div>
      {note || review || item.watch ? (
        <div className="print-review">
          {note ? <span className="print-review-entry"><b>Ghi chú:</b> {note}</span> : null}
          {review ? (
            <span className="print-review-entry"><b>Review{item.reviewDate ? ` · ${fmtDateVN(item.reviewDate)}` : ""}:</b> {review}</span>
          ) : item.watch ? <span className="print-review-entry"><b>Review:</b> <i>chưa ghi — viết tay vào đây.</i></span> : null}
        </div>
      ) : null}
    </section>
  );
}

function Cover({ kind, list, label }) {
  const meta = KIND[kind];
  const dates = list.map((n) => n[meta.dateField]).filter(Boolean).sort();
  const range = dates.length ? `${fmtDateVN(dates[0])} – ${fmtDateVN(dates[dates.length - 1])}` : "";
  const byReason = useMemo(() => {
    const m = new Map();
    list.forEach((n) => { const k = n.reason || "Chưa ghi lý do"; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [list]);
  const bySetup = useMemo(() => {
    const m = new Map();
    list.forEach((n) => { const k = n.setup || "Chưa gán setup"; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [list]);
  const reviewed = list.filter((n) => n.reviewDirection);
  const right = reviewed.filter((n) => n.reviewDirection === "dung-huong").length;
  const watching = list.filter((n) => n.watch && !n.watchDone).length;
  return (
    <section className="print-cover">
      <div className="print-cover-head">
        <span className="print-cover-title">{meta.title}</span>
        <span className="print-cover-range">{range}{label ? ` · ${label}` : ""}</span>
      </div>
      <div className="print-cover-kpis">
        <div><span>Số lần</span><b>{list.length}</b></div>
        <div><span>Lý do hay gặp nhất</span><b style={{ fontSize: 14 }}>{byReason.length ? `${byReason[0][0]} (${byReason[0][1]})` : "—"}</b></div>
        <div><span>Setup hay {kind === "missed" ? "miss" : "skip"} nhất</span><b style={{ fontSize: 14 }}>{bySetup.length ? `${bySetup[0][0]} (${bySetup[0][1]})` : "—"}</b></div>
        <div><span>Đã review · đi đúng hướng</span><b>{reviewed.length ? `${right}/${reviewed.length}` : "—"}</b></div>
        <div><span>Còn cần theo dõi</span><b>{watching}</b></div>
      </div>
      <div className="print-detail-body" style={{ gridTemplateColumns: "minmax(0, 30fr) minmax(0, 70fr)" }}>
        <div className="print-detail-facts">
          <h4 className="print-cover-h">Theo lý do</h4>
          <table className="print-table print-kv"><tbody>
            {byReason.map(([k, c]) => <tr key={k}><th>{k}</th><td>{c} lần</td></tr>)}
          </tbody></table>
          <h4 className="print-cover-h">Theo setup</h4>
          <table className="print-table print-kv"><tbody>
            {bySetup.map(([k, c]) => <tr key={k}><th>{k}</th><td>{c} lần</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <h4 className="print-cover-h">Danh sách</h4>
          {list.length ? (
            <table className="print-table">
              <thead><tr><th>#</th><th>Ngày</th><th>Symbol</th><th>Khung</th><th>Setup</th><th>Lý do</th><th>Diễn biến</th></tr></thead>
              <tbody>
                {list.map((n, i) => (
                  <tr key={n.id}>
                    <td>{i + 1}</td>
                    <td>{fmtDateVN(n[meta.dateField])}</td>
                    <td><b>{n.symbol || "—"}</b></td>
                    <td>{n.timeframe || ""}</td>
                    <td>{n.setup || ""}</td>
                    <td>{n.reason || ""}</td>
                    <td className="print-small">{dirLabel(n.reviewDirection) || (n.watch && !n.watchDone ? "đang theo dõi" : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="print-cover-empty">Không có setup nào.</p>}
        </div>
      </div>
    </section>
  );
}

export function PrintMissSkip({ kind, items, label, onClose }) {
  const meta = KIND[kind];
  const all = useMemo(
    () => [...(items || [])].sort((a, b) => (a[meta.dateField] || "").localeCompare(b[meta.dateField] || "")),
    [items, meta.dateField]
  );
  const [withCover, setWithCover] = useState(true);
  const [firstOnly, setFirstOnly] = useState(false);
  const [skip, setSkip] = useState(() => new Set());
  const [images, setImages] = useState({});
  const [exporting, setExporting] = useState(null);
  const [exported, setExported] = useState("");
  const pagesRef = useRef(null);
  const list = all.filter((n) => !skip.has(n.id));
  const onImage = (key, state) => setImages((prev) => (prev[key] === state ? prev : { ...prev, [key]: state }));

  useEffect(() => {
    document.body.classList.add("printing-trades");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("printing-trades"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Setup không có ảnh vẫn in một tờ — phần thông tin và ghi chú vẫn đáng xem.
  const shotIdx = (n) => {
    const c = shotsOf(n).length;
    return c ? (firstOnly ? [0] : Array.from({ length: c }, (_, i) => i)) : [0];
  };
  const keys = list.flatMap((n) => shotIdx(n).map((i) => `${n.id}-${i}`));
  const loading = keys.filter((k) => images[k] === "loading").length;
  const bad = list.filter((n) => shotIdx(n).some((i) => ["missing", "failed"].includes(images[`${n.id}-${i}`])));
  const toggle = (id) => setSkip((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const pages = keys.length + (withCover ? 1 : 0);
  const dates = list.map((n) => n[meta.dateField]).filter(Boolean).sort();
  const fileName = `${meta.file}_${dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : "tat-ca"}.pdf`;
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
          <b>{meta.title}{label ? ` · ${label}` : ""}</b>
          <label className="print-opt"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Kèm trang tổng hợp</label>
          <label className="print-opt" title="Setup có nhiều ảnh thì chỉ in ảnh đầu tiên — mỗi setup đúng một tờ">
            <input type="checkbox" checked={firstOnly} onChange={(e) => setFirstOnly(e.target.checked)} /> Chỉ ảnh đầu tiên
          </label>
          <span className="field-hint" style={{ margin: 0 }}>{list.length} setup · {pages} tờ A4 ngang</span>
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
              <label key={n.id} className={`print-pick ${skip.has(n.id) ? "is-off" : ""}`}>
                <input type="checkbox" checked={!skip.has(n.id)} onChange={() => toggle(n.id)} />
                {n.symbol || "—"} · {fmtDateVN(n[meta.dateField]).slice(0, 5)}{n.setup ? ` · ${n.setup}` : ""}
              </label>
            ))}
          </div>
        ) : null}
        {bad.length ? (
          <p className="print-warn">
            <AlertTriangle size={13} /> {bad.length} setup thiếu ảnh ({bad.map((n) => n.symbol || "—").join(", ")}) — tờ đó vẫn in phần thông tin.
            Link TradingView (tradingview.com/x/…) và link ảnh trực tiếp thì in được; link loại khác thì không.
          </p>
        ) : null}
        {exported ? <p className="field-hint" style={{ margin: "6px 0 0", color: exported.startsWith("Đã") ? "var(--win)" : "var(--loss)" }}>{exported}</p> : null}
        <p className="field-hint" style={{ margin: "6px 0 0" }}>
          In đúng danh sách đang lọc ở trang trước — muốn in một khoảng ngày hay một lý do thì lọc trước rồi bấm In. Trong hộp thoại in: khổ A4, hướng <b>Ngang</b>, bỏ tick "Đầu trang và chân trang".
        </p>
      </div>
      <div className="print-pages" ref={pagesRef}>
        {withCover ? <Cover kind={kind} list={list} label={label} /> : null}
        {list.length ? list.map((n, i) => {
          const idx = shotIdx(n);
          const count = shotsOf(n).length;
          return (
            <Fragment key={n.id}>
              {idx.map((s) => (
                <Sheet key={s} item={n} kind={kind} shot={s} shotCount={count} index={i} total={list.length} onImage={onImage} />
              ))}
            </Fragment>
          );
        }) : <p className="empty-note" style={{ padding: 24 }}>Không có setup nào để in.</p>}
      </div>
    </div>,
    document.body
  );
}
