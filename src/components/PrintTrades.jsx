import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download, ImageOff, Printer, X } from "lucide-react";
import { computeResult, fmtMoney, fmtR, mistakeImages, periodAccountReport, reviewEntries, shiftDate, tradeCurrency } from "../lib/helpers.js";
import { errorFrequency, errorTradesToPrint, fmtDateVN, hasAnyError, printableImage, reviewTradesToPrint, setupErrorNames, tradesToPrint, weekdayVN } from "../lib/printTrades.js";
import { entriesInRange, logRangeLabel, moodMeta, normalizeJourneyLog } from "../lib/journeyLog.js";
import { fmtPctVN, marketAccountNames, marketDrawdown, marketRStats, pickedTier, suggestNextTier } from "../lib/capital.js";

const ACTION_LABEL = { up: "▲ tăng", down: "▼ hạ", same: "= giữ", none: "—" };

// Ảnh trắng 1×1 thay cho ảnh nào không tải được — một ảnh lỗi không được làm hỏng cả file.
const BLANK_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PAGE_RATIO = 210 / 297;
const EXPORT_WIDTH = 2000;

// Tải về thành PDF để cất lên Google Drive: chụp từng tờ ĐANG HIỆN ở trang xem trước thành ảnh
// rồi xếp vào PDF A4 ngang — file ra đúng y như bản in. Hai thư viện (~400 KB) chỉ được tải lúc
// bấm nút, trang web bình thường không nặng thêm. Trang tổng kết cao hơn một tờ thì cắt ra nhiều tờ.
async function exportPdf(nodes, fileName, onProgress) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  let first = true;
  const addPage = (canvas) => {
    if (!first) pdf.addPage("a4", "landscape");
    first = false;
    const h = Math.min(210, (canvas.height / canvas.width) * 297);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.86), "JPEG", 0, 0, 297, h);
  };
  for (let i = 0; i < nodes.length; i += 1) {
    onProgress(i + 1, nodes.length);
    const node = nodes[i];
    const canvas = await toCanvas(node, {
      pixelRatio: EXPORT_WIDTH / Math.max(1, node.offsetWidth),
      backgroundColor: "#ffffff",
      imagePlaceholder: BLANK_PX,
      cacheBust: false,
      // Không nhúng font web: trang in dùng font hệ thống, còn nhúng thì thư viện tải về cả chục
      // file font Google của app — lần bấm đầu tiên đứng hàng chục giây ở trang 1.
      skipFonts: true,
    });
    const pageH = Math.round(canvas.width * PAGE_RATIO);
    if (canvas.height <= pageH + 4) { addPage(canvas); continue; }
    // Dải cuối mỏng hơn ~2% tờ chỉ là lề thừa, cắt ra thành một trang gần trắng thì bỏ.
    for (let y = 0; y < canvas.height && canvas.height - y > pageH * 0.02; y += pageH) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(pageH, canvas.height - y);
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -y);
      addPage(slice);
    }
  }
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { pages: pdf.getNumberOfPages(), size: blob.size };
}

// Ghi chú nhìn lại in dưới ảnh: tờ VÀO mang lý do đánh dấu, tờ THOÁT mang các lần đã nhìn lại.
function ReviewStrip({ trade, kind }) {
  if (kind === "entry") {
    const reason = String(trade.reviewReason || "").trim();
    return (
      <div className="print-review">
        <b>📌 Vì sao cần nhìn lại:</b> {reason || <i>chưa ghi lý do</i>}
      </div>
    );
  }
  const entries = reviewEntries(trade);
  return (
    <div className="print-review">
      <b>Đã nhìn lại {entries.length} lần{entries.length ? ":" : ""}</b>
      {entries.length ? entries.map((e, i) => (
        <span key={e.id || i} className="print-review-entry">
          <b>Lần {i + 1}{e.date ? ` · ${fmtDateVN(e.date)}` : ""}:</b> {String(e.note || "").trim() || <i>chỉ có ảnh</i>}
        </span>
      )) : <i> chưa lần nào — lần này ghi tay vào đây.</i>}
    </div>
  );
}

// Sổ lỗi: tờ VÀO mang lỗi setup đã tick, tờ THOÁT mang lỗi thực thi đã ghi (mục 8).
function ErrorStrip({ trade, kind, errors }) {
  if (kind === "entry") {
    const names = setupErrorNames(trade, errors);
    return (
      <div className="print-review">
        <b>⚠ Lỗi setup:</b> {names.length ? names.join(" · ") : <i>không tick lỗi setup nào</i>}
      </div>
    );
  }
  const note = String(trade.mistakeNote || "").trim();
  return (
    <div className="print-review">
      <b>⚠ Lỗi thực thi:</b> {trade.hasMistake ? (note || <i>đã đánh dấu có lỗi nhưng chưa ghi — viết tay vào đây.</i>) : <i>không đánh dấu</i>}
    </div>
  );
}

// Một tờ A4: dải thông tin trên cùng, ảnh phủ phần còn lại. Chữ đen nền trắng bất kể giao diện
// đang sáng hay tối — in mực màu nền tối vừa tốn mực vừa khó đọc.
// kind: "entry" | "exit" | "mistake" (ảnh lỗi thứ `shot` của mục 8, chỉ in ở Sổ lỗi).
function Sheet({ trade, kind, shot, index, total, resources, onImage, book, errors }) {
  const r = computeResult(trade);
  const entry = kind === "entry";
  const mis = kind === "mistake" ? mistakeImages(trade)[shot] || {} : null;
  const src = mis ? printableImage(mis.image, mis.link) : entry ? printableImage(trade.entryImage, trade.entryLink) : printableImage(trade.exitImage, trade.exitLink);
  const link = mis ? mis.link : entry ? trade.entryLink : trade.exitLink;
  const imageKey = mis ? `${trade.id}-mistake-${shot}` : `${trade.id}-${kind}`;
  const [state, setState] = useState(src ? "loading" : "missing");
  useEffect(() => { onImage(imageKey, state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const dir = trade.direction === "sell" ? "SELL" : "BUY";
  return (
    <section className="print-sheet">
      <header className="print-head">
        <div className="print-head-main">
          <span className="print-symbol">{trade.symbol || "—"}</span>
          <span className={`print-dir ${dir === "SELL" ? "is-sell" : ""}`}>{dir}</span>
          <span className="print-kind">{mis ? `ẢNH LỖI ${shot + 1}/${mistakeImages(trade).length}` : entry ? "VÀO LỆNH" : "THOÁT LỆNH"}</span>
          {trade.needsReview && book !== "review" ? <span className="print-pin">📌 cần nhìn lại</span> : null}
          {hasAnyError(trade) && book !== "errors" ? <span className="print-pin">⚠ có lỗi</span> : null}
          <span className="print-count">Lệnh {index + 1}/{total}</span>
        </div>
        <div className="print-head-meta">
          <span><b>Vào:</b> {fmtDateVN(trade.entryDate)} {trade.entryTime || ""}</span>
          {kind === "exit" ? <span><b>Thoát:</b> {trade.exitDate ? `${fmtDateVN(trade.exitDate)} ${trade.exitTime || ""}` : "đang mở"}</span> : null}
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
      {book === "review" && !mis ? <ReviewStrip trade={trade} kind={kind} /> : null}
      {book === "errors" && !mis ? <ErrorStrip trade={trade} kind={kind} errors={errors} /> : null}
    </section>
  );
}

function rCell(v, n) {
  return n ? fmtR(v) : "—";
}

// Trang đầu Sổ lỗi: mắc bao nhiêu lệnh, mất bao nhiêu R vì chúng, và lỗi nào lặp lại nhiều nhất.
function ErrorSummary({ list, errors }) {
  const freq = errorFrequency(list, errors);
  let rSum = 0; let rN = 0; let losses = 0;
  list.forEach((t) => {
    const r = computeResult(t);
    if (r.rr !== null && Number.isFinite(r.rr)) { rSum += r.rr; rN += 1; }
    if (r.outcome === "loss") losses += 1;
  });
  return (
    <>
      <div className="print-cover-kpis">
        <div><span>Lệnh có lỗi</span><b>{list.length}</b></div>
        <div><span>Trong đó thua</span><b>{losses}</b></div>
        <div><span>R của các lệnh lỗi</span><b>{rN ? fmtR(rSum) : "—"}</b></div>
        <div><span>Lỗi thực thi</span><b>{freq.execution}</b></div>
        <div><span>Loại lỗi setup</span><b>{freq.rows.length}</b></div>
      </div>
      {freq.rows.length ? (
        <>
          <h3 className="print-cover-h">Lỗi setup lặp lại</h3>
          <table className="print-table">
            <thead><tr><th>Lỗi</th><th>Số lệnh</th></tr></thead>
            <tbody>{freq.rows.map((r) => <tr key={r.name}><td>{r.name}</td><td><b>{r.n}</b></td></tr>)}</tbody>
          </table>
        </>
      ) : null}
    </>
  );
}

// Trang tổng kết đầu tập: kỳ từ ngày nào đến ngày nào, từng tài khoản ra sao, vốn tuần sau,
// tuần đó đã nghĩ gì (Log hành trình), rồi mục lục các lệnh — số thứ tự khớp "Lệnh n/N" ở
// từng tờ để lật tìm nhanh. Không cố nhét vừa một tờ: dài thì tự sang tờ thứ hai.
// book: "closed" (tổng kết kỳ) | "review" (Sổ nhìn lại) | "errors" (Sổ lỗi). Hai sổ chỉ cần mục lục
// (và bảng lỗi lặp lại cho Sổ lỗi), không cần bảng tài khoản/vốn/log.
function Cover({ title, from, to, list, trades, resources, capitalPlan, journeyLog, book, allMarked, weekly, errors }) {
  const review = book !== "closed";
  const rep = useMemo(() => periodAccountReport(trades, resources, from, to), [trades, resources, from, to]);
  const accounts = (resources && resources.accounts) || [];
  const nextFrom = shiftDate(to, 1);
  const nextTo = shiftDate(to, 7);
  const capital = useMemo(() => {
    // Vốn chọn theo TUẦN — in theo tháng thì "tuần sau" không có nghĩa, bỏ hẳn mục này.
    if (!weekly || !capitalPlan || !Array.isArray(capitalPlan.markets)) return [];
    return capitalPlan.markets.map((m) => {
      const dd = marketDrawdown(capitalPlan, m, trades, resources);
      const stats = marketRStats(m, trades, accounts, to);
      return {
        m, names: [...marketAccountNames(m, accounts)],
        now: pickedTier(capitalPlan, m.id, from).pct,
        picked: pickedTier(capitalPlan, m.id, nextFrom).pct,
        sug: suggestNextTier(capitalPlan, m, stats, dd, to),
      };
    // Mảng chưa gắn tài khoản nào thì không có gì để nói — bỏ cho trang đỡ rối.
    }).filter((x) => x.names.length && (x.now !== null || x.picked !== null || x.sug));
  }, [weekly, capitalPlan, trades, resources, accounts, from, to, nextFrom]);
  const jl = useMemo(() => normalizeJourneyLog(journeyLog), [journeyLog]);
  const logs = useMemo(() => entriesInRange(jl.entries, from, to)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))), [jl, from, to]);
  const tagName = (id) => (jl.tags.find((t) => t.id === id) || {}).name || "";
  const t = rep.total;

  return (
    <section className="print-cover">
      <header className="print-cover-head">
        <div className="print-cover-title">{title}</div>
        <div className="print-cover-range">
          {review && allMarked
            ? `${book === "errors" ? "Tất cả lệnh có lỗi" : "Tất cả lệnh đã đánh dấu 📌"} · ${list.length} lệnh`
            : `${weekdayVN(from)} ${fmtDateVN(from)} → ${weekdayVN(to)} ${fmtDateVN(to)}`}
        </div>
      </header>

      {!review ? (
        <>
          <div className="print-cover-kpis">
            <div><span>Lệnh đóng</span><b>{t.count}</b></div>
            <div><span>Thắng / Thua / Hoà</span><b>{t.wins} / {t.losses} / {t.be}</b></div>
            <div><span>Tỷ lệ thắng</span><b>{t.winRate === null ? "—" : `${Math.round(t.winRate)}%`}</b></div>
            <div><span>R ròng</span><b>{rCell(t.rNet, t.rCount)}</b></div>
            <div><span>R thắng · R lỗ</span><b>{rCell(t.rWin, t.rCount)} · {rCell(t.rLoss, t.rCount)}</b></div>
          </div>

          <h3 className="print-cover-h">Từng tài khoản</h3>
          {rep.rows.length ? (
            <table className="print-table">
              <thead>
                <tr><th>Tài khoản</th><th>Lệnh</th><th>Thắng/Thua</th><th>Tỷ lệ thắng</th><th>R ròng</th><th>R thắng · lỗ</th><th>Lãi/lỗ</th></tr>
              </thead>
              <tbody>
                {rep.rows.map((r) => (
                  <tr key={r.account}>
                    <td><b>{r.account}</b></td>
                    <td>{r.count}</td>
                    <td>{r.wins}/{r.losses}{r.be ? ` (+${r.be} hoà)` : ""}</td>
                    <td>{r.winRate === null ? "—" : `${Math.round(r.winRate)}%`}</td>
                    <td><b>{rCell(r.rNet, r.rCount)}</b></td>
                    <td>{rCell(r.rWin, r.rCount)} · {rCell(r.rLoss, r.rCount)}</td>
                    <td>{fmtMoney(r.profit, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="print-cover-empty">Không có lệnh nào đóng trong kỳ này.</p>}

          {capital.length ? (
            <>
              <h3 className="print-cover-h">Phân bổ vốn tuần sau ({fmtDateVN(nextFrom).slice(0, 5)} – {fmtDateVN(nextTo)})</h3>
              <table className="print-table">
                <thead><tr><th>Mảng</th><th>Tài khoản</th><th>Tuần này</th><th>Gợi ý theo R</th><th>Đã chọn</th><th>Lý do</th></tr></thead>
                <tbody>
                  {capital.map(({ m, names, now, picked, sug }) => (
                    <tr key={m.id}>
                      <td><b>{m.name}</b></td>
                      <td>{names.join(", ") || "—"}</td>
                      <td>{now === null ? "—" : fmtPctVN(now)}</td>
                      <td>{sug ? `${ACTION_LABEL[sug.action] || ""} ${fmtPctVN(sug.pct)}` : "—"}</td>
                      <td>{picked === null ? <i>chưa chọn</i> : fmtPctVN(picked)}</td>
                      <td className="print-small">{sug && sug.reasons ? sug.reasons.join(" · ") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {logs.length ? (
            <>
              <h3 className="print-cover-h">Log hành trình trong kỳ ({logs.length})</h3>
              <div className="print-logs">
                {logs.map((e) => {
                  const mood = moodMeta(e.mood);
                  const tags = (e.tags || []).map(tagName).filter(Boolean);
                  return (
                    <div key={e.id} className="print-log">
                      <div className="print-log-head">
                        <b>{logRangeLabel(e)}</b>
                        {mood ? <span>{mood.icon} {mood.label}</span> : null}
                        {tags.length ? <span className="print-dim">{tags.join(" · ")}</span> : null}
                      </div>
                      {e.text ? <p>{e.text}</p> : null}
                      {e.cause ? <p><b>Nguyên nhân:</b> {e.cause}</p> : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {book === "errors" ? <ErrorSummary list={list} errors={errors} /> : null}

      <h3 className="print-cover-h">{book === "review" ? "Các lệnh cần nhìn lại" : book === "errors" ? "Các lệnh có lỗi" : "Các lệnh trong tập này"}</h3>
      {list.length ? (
        <table className="print-table">
          <thead>
            <tr><th>#</th><th>Mã</th><th>Tài khoản</th><th>Vào</th><th>Đóng</th><th>Setup</th><th>Khung</th><th>RR</th><th>{book === "review" ? "Vì sao cần nhìn lại" : book === "errors" ? "Lỗi" : ""}</th></tr>
          </thead>
          <tbody>
            {list.map((x, i) => (
              <tr key={x.id}>
                <td>{i + 1}</td>
                <td><b>{x.symbol}</b> {x.direction === "sell" ? "SELL" : "BUY"}</td>
                <td>{x.account || "—"}</td>
                <td>{fmtDateVN(x.entryDate).slice(0, 5)}</td>
                <td>{x.exitDate ? fmtDateVN(x.exitDate).slice(0, 5) : "mở"}</td>
                <td>{x.setup || "—"}</td>
                <td>{x.timeframe || "—"}</td>
                <td><b>{fmtR(computeResult(x).rr)}</b></td>
                <td className="print-small">
                  {book === "review" ? x.reviewReason || ""
                    : book === "errors" ? [...setupErrorNames(x, errors), x.hasMistake ? `thực thi${x.mistakeNote ? `: ${String(x.mistakeNote).trim().slice(0, 80)}` : ""}` : ""].filter(Boolean).join(" · ")
                    : [x.needsReview ? "📌" : "", hasAnyError(x) ? "⚠" : ""].join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="print-cover-empty">Không có lệnh nào.</p>}
    </section>
  );
}

// Trang xem trước bản in, phủ toàn màn hình. Bấm In là gọi hộp thoại in của trình duyệt —
// chọn máy Canon ở đó; khổ A4 ngang và lề đã đặt sẵn bằng @page.
export function PrintTrades({ trades, resources, capitalPlan, journeyLog, setupErrors, mode, from, to, label, onClose }) {
  const [book, setBook] = useState("closed");
  const [allMarked, setAllMarked] = useState(false);
  const [withCover, setWithCover] = useState(true);
  const [withMistakeShots, setWithMistakeShots] = useState(true);
  const all = useMemo(() => {
    if (book === "review") return reviewTradesToPrint(trades, from, to, allMarked);
    if (book === "errors") return errorTradesToPrint(trades, from, to, allMarked);
    return tradesToPrint(trades, from, to);
  }, [book, trades, from, to, allMarked]);
  const [skip, setSkip] = useState(() => new Set());
  const [images, setImages] = useState({});
  const [exporting, setExporting] = useState(null);
  const [exported, setExported] = useState("");
  const pagesRef = useRef(null);
  const list = all.filter((t) => !skip.has(t.id));
  const onImage = (key, state) => setImages((prev) => (prev[key] === state ? prev : { ...prev, [key]: state }));

  useEffect(() => {
    document.body.classList.add("printing-trades");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("printing-trades"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Sổ lỗi in thêm mỗi ảnh lỗi (mục 8) một tờ — đó thường là chỗ thấy lỗi rõ nhất.
  const mistakeShots = (t) => (book === "errors" && withMistakeShots ? mistakeImages(t).map((_, n) => n) : []);
  const keys = list.flatMap((t) => [`${t.id}-entry`, `${t.id}-exit`, ...mistakeShots(t).map((n) => `${t.id}-mistake-${n}`)]);
  const loading = keys.filter((k) => images[k] === "loading").length;
  const bad = list.filter((t) => ["missing", "failed"].includes(images[`${t.id}-entry`]) || ["missing", "failed"].includes(images[`${t.id}-exit`]));
  const toggle = (id) => setSkip((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const noun = mode === "month" ? "THÁNG" : "TUẦN";
  const title = book === "review" ? "SỔ NHÌN LẠI" : book === "errors" ? "SỔ LỖI" : `TỔNG KẾT ${noun}`;
  const pages = list.reduce((n, t) => n + 2 + mistakeShots(t).length, 0) + (withCover ? 1 : 0);
  const filePrefix = book === "review" ? "So-nhin-lai" : book === "errors" ? "So-loi" : mode === "month" ? "Tong-ket-thang" : "Tong-ket-tuan";
  const fileName = `${filePrefix}_${book !== "closed" && allMarked ? "tat-ca" : `${from}_${to}`}.pdf`;
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
          <div className="seg" style={{ maxWidth: 480 }}>
            <button type="button" className={`seg-btn ${book === "closed" ? "seg-active" : ""}`} onClick={() => setBook("closed")}>Lệnh đóng · {label}</button>
            <button type="button" className={`seg-btn ${book === "review" ? "seg-active" : ""}`} onClick={() => setBook("review")}>📌 Sổ nhìn lại</button>
            <button type="button" className={`seg-btn ${book === "errors" ? "seg-active" : ""}`} onClick={() => setBook("errors")}>⚠ Sổ lỗi</button>
          </div>
          {book !== "closed" ? (
            <label className="print-opt"><input type="checkbox" checked={allMarked} onChange={(e) => setAllMarked(e.target.checked)} /> {book === "errors" ? "Mọi lệnh có lỗi" : "Mọi lệnh đã đánh dấu"} (không chỉ {label})</label>
          ) : null}
          {book === "errors" ? (
            <label className="print-opt"><input type="checkbox" checked={withMistakeShots} onChange={(e) => setWithMistakeShots(e.target.checked)} /> Kèm ảnh lỗi</label>
          ) : null}
          <label className="print-opt"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Kèm trang tổng kết</label>
          <span className="field-hint" style={{ margin: 0 }}>{list.length} lệnh · khoảng {pages} tờ A4 ngang</span>
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
        {exported ? <p className="field-hint" style={{ margin: "6px 0 0", color: exported.startsWith("Đã") ? "var(--win)" : "var(--loss)" }}>{exported}</p> : null}
        <p className="field-hint" style={{ margin: "6px 0 0" }}>
          "Tải PDF" lưu file vào thư mục Tải về — kéo thả lên Google Drive là xong. Trong hộp thoại in: chọn máy Canon, khổ A4, hướng <b>Ngang</b>, bỏ tick "Đầu trang và chân trang" để tờ sạch.
        </p>
      </div>
      <div className="print-pages" ref={pagesRef}>
        {withCover ? (
          <Cover title={title} from={from} to={to} list={list} trades={trades} resources={resources}
            capitalPlan={capitalPlan} journeyLog={journeyLog} book={book} allMarked={allMarked} weekly={mode !== "month"} errors={setupErrors} />
        ) : null}
        {list.length ? list.map((t, i) => (
          <Fragment key={t.id}>
            <Sheet trade={t} kind="entry" index={i} total={list.length} resources={resources} onImage={onImage} book={book} errors={setupErrors} />
            <Sheet trade={t} kind="exit" index={i} total={list.length} resources={resources} onImage={onImage} book={book} errors={setupErrors} />
            {mistakeShots(t).map((n) => (
              <Sheet key={`m${n}`} trade={t} kind="mistake" shot={n} index={i} total={list.length} resources={resources} onImage={onImage} book={book} errors={setupErrors} />
            ))}
          </Fragment>
        )) : (
          <p className="empty-note" style={{ padding: 24 }}>
            {book === "review" ? `Không có lệnh nào đánh dấu 📌 ${allMarked ? "" : `trong ${label}`}.`
              : book === "errors" ? `Không có lệnh nào có lỗi ${allMarked ? "" : `trong ${label}`}.`
              : `Không có lệnh nào đóng trong ${label}.`}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
