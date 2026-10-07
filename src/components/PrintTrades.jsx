import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ImageOff, Printer, X } from "lucide-react";
import { computeResult, fmtMoney, fmtR, tradeCurrency } from "../lib/helpers.js";
import { fmtDateVN, printableImage, tradesToPrint } from "../lib/printTrades.js";

// Một tờ A4: dải thông tin trên cùng, ảnh phủ phần còn lại. Chữ đen nền trắng bất kể giao diện
// đang sáng hay tối — in mực màu nền tối vừa tốn mực vừa khó đọc.
function Sheet({ trade, kind, index, total, resources, onImage }) {
  const r = computeResult(trade);
  const entry = kind === "entry";
  const src = entry ? printableImage(trade.entryImage, trade.entryLink) : printableImage(trade.exitImage, trade.exitLink);
  const link = entry ? trade.entryLink : trade.exitLink;
  const [state, setState] = useState(src ? "loading" : "missing");
  useEffect(() => { onImage(`${trade.id}-${kind}`, state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const dir = trade.direction === "sell" ? "SELL" : "BUY";
  return (
    <section className="print-sheet">
      <header className="print-head">
        <div className="print-head-main">
          <span className="print-symbol">{trade.symbol || "—"}</span>
          <span className={`print-dir ${dir === "SELL" ? "is-sell" : ""}`}>{dir}</span>
          <span className="print-kind">{entry ? "VÀO LỆNH" : "THOÁT LỆNH"}</span>
          <span className="print-count">Lệnh {index + 1}/{total}</span>
        </div>
        <div className="print-head-meta">
          <span><b>Vào:</b> {fmtDateVN(trade.entryDate)} {trade.entryTime || ""}</span>
          {!entry ? <span><b>Thoát:</b> {fmtDateVN(trade.exitDate)} {trade.exitTime || ""}</span> : null}
          <span><b>Setup:</b> {trade.setup || "—"}</span>
          <span><b>Khung:</b> {trade.timeframe || "—"}</span>
          <span className="print-rr"><b>RR:</b> {fmtR(r.rr)}</span>
          {r.profit !== null ? <span><b>Kết quả:</b> {fmtMoney(r.profit, tradeCurrency(trade, resources))}</span> : null}
          {trade.account ? <span className="print-dim">{trade.account}</span> : null}
        </div>
      </header>
      <div className="print-img">
        {src && state !== "failed" ? (
          <img src={src} alt="" onLoad={() => setState("ok")} onError={() => setState("failed")} />
        ) : (
          <div className="print-noimg">
            <ImageOff size={28} />
            <p>{state === "failed" ? "Không tải được ảnh từ link này" : link ? "Link này không phải ảnh — không in được" : "Lệnh chưa có ảnh"}</p>
            {link ? <p className="print-link">{link}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}

// Trang xem trước bản in, phủ toàn màn hình. Bấm In là gọi hộp thoại in của trình duyệt —
// chọn máy Canon ở đó; khổ A4 ngang và lề đã đặt sẵn bằng @page.
export function PrintTrades({ trades, resources, from, to, label, onClose }) {
  const all = useMemo(() => tradesToPrint(trades, from, to), [trades, from, to]);
  const [skip, setSkip] = useState(() => new Set());
  const [images, setImages] = useState({});
  const list = all.filter((t) => !skip.has(t.id));
  const onImage = (key, state) => setImages((prev) => (prev[key] === state ? prev : { ...prev, [key]: state }));

  useEffect(() => {
    document.body.classList.add("printing-trades");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("printing-trades"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const keys = list.flatMap((t) => [`${t.id}-entry`, `${t.id}-exit`]);
  const loading = keys.filter((k) => images[k] === "loading").length;
  const bad = list.filter((t) => ["missing", "failed"].includes(images[`${t.id}-entry`]) || ["missing", "failed"].includes(images[`${t.id}-exit`]));
  const toggle = (id) => setSkip((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return createPortal(
    <div className="print-root">
      <div className="print-toolbar">
        <div className="print-toolbar-row">
          <b>In lệnh đóng · {label}</b>
          <span className="field-hint" style={{ margin: 0 }}>{list.length} lệnh · {list.length * 2} tờ A4 ngang</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={!list.length || loading > 0} onClick={() => window.print()}>
            <Printer size={14} /> {loading ? `Đang tải ảnh (${loading})…` : "In"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}><X size={14} /> Đóng</button>
        </div>
        {all.length ? (
          <div className="print-picks">
            {all.map((t) => (
              <label key={t.id} className={`print-pick ${skip.has(t.id) ? "is-off" : ""}`}>
                <input type="checkbox" checked={!skip.has(t.id)} onChange={() => toggle(t.id)} />
                {t.symbol} · {fmtDateVN(t.exitDate || t.entryDate).slice(0, 5)} · {fmtR(computeResult(t).rr)}
              </label>
            ))}
          </div>
        ) : null}
        {bad.length ? (
          <p className="print-warn">
            <AlertTriangle size={13} /> {bad.length} lệnh thiếu ảnh ({bad.map((t) => t.symbol).join(", ")}) — tờ đó vẫn in phần thông tin.
            Link TradingView (tradingview.com/x/…) và link ảnh trực tiếp thì in được; link loại khác thì không.
          </p>
        ) : null}
        <p className="field-hint" style={{ margin: "6px 0 0" }}>
          Trong hộp thoại in: chọn máy Canon, khổ A4, hướng <b>Ngang</b>, bỏ tick "Đầu trang và chân trang" để tờ sạch.
        </p>
      </div>
      <div className="print-pages">
        {list.length ? list.map((t, i) => (
          <Fragment key={t.id}>
            <Sheet trade={t} kind="entry" index={i} total={list.length} resources={resources} onImage={onImage} />
            <Sheet trade={t} kind="exit" index={i} total={list.length} resources={resources} onImage={onImage} />
          </Fragment>
        )) : <p className="empty-note" style={{ padding: 24 }}>Không có lệnh nào đóng trong {label}.</p>}
      </div>
    </div>,
    document.body
  );
}
