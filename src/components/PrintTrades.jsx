import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ImageOff, Printer, X } from "lucide-react";
import { computeResult, fmtMoney, fmtR, periodAccountReport, reviewEntries, shiftDate, tradeCurrency } from "../lib/helpers.js";
import { fmtDateVN, printableImage, reviewTradesToPrint, tradesToPrint, weekdayVN } from "../lib/printTrades.js";
import { entriesInRange, logRangeLabel, moodMeta, normalizeJourneyLog } from "../lib/journeyLog.js";
import { fmtPctVN, marketAccountNames, marketDrawdown, marketRStats, pickedTier, suggestNextTier } from "../lib/capital.js";

const ACTION_LABEL = { up: "▲ tăng", down: "▼ hạ", same: "= giữ", none: "—" };

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

// Một tờ A4: dải thông tin trên cùng, ảnh phủ phần còn lại. Chữ đen nền trắng bất kể giao diện
// đang sáng hay tối — in mực màu nền tối vừa tốn mực vừa khó đọc.
function Sheet({ trade, kind, index, total, resources, onImage, review }) {
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
          {trade.needsReview && !review ? <span className="print-pin">📌 cần nhìn lại</span> : null}
          <span className="print-count">Lệnh {index + 1}/{total}</span>
        </div>
        <div className="print-head-meta">
          <span><b>Vào:</b> {fmtDateVN(trade.entryDate)} {trade.entryTime || ""}</span>
          {!entry ? <span><b>Thoát:</b> {trade.exitDate ? `${fmtDateVN(trade.exitDate)} ${trade.exitTime || ""}` : "đang mở"}</span> : null}
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
      {review ? <ReviewStrip trade={trade} kind={kind} /> : null}
    </section>
  );
}

function rCell(v, n) {
  return n ? fmtR(v) : "—";
}

// Trang tổng kết đầu tập: kỳ từ ngày nào đến ngày nào, từng tài khoản ra sao, vốn tuần sau,
// tuần đó đã nghĩ gì (Log hành trình), rồi mục lục các lệnh — số thứ tự khớp "Lệnh n/N" ở
// từng tờ để lật tìm nhanh. Không cố nhét vừa một tờ: dài thì tự sang tờ thứ hai.
function Cover({ title, from, to, list, trades, resources, capitalPlan, journeyLog, review, allReview, weekly }) {
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
          {review && allReview
            ? `Tất cả lệnh đã đánh dấu 📌 · ${list.length} lệnh`
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

      <h3 className="print-cover-h">{review ? "Các lệnh cần nhìn lại" : "Các lệnh trong tập này"}</h3>
      {list.length ? (
        <table className="print-table">
          <thead>
            <tr><th>#</th><th>Mã</th><th>Tài khoản</th><th>Vào</th><th>Đóng</th><th>Setup</th><th>Khung</th><th>RR</th><th>{review ? "Vì sao cần nhìn lại" : ""}</th></tr>
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
                <td className="print-small">{review ? x.reviewReason || "" : x.needsReview ? "📌" : ""}</td>
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
export function PrintTrades({ trades, resources, capitalPlan, journeyLog, mode, from, to, label, onClose }) {
  const [kind, setKind] = useState("closed");
  const [allReview, setAllReview] = useState(false);
  const [withCover, setWithCover] = useState(true);
  const review = kind === "review";
  const all = useMemo(
    () => (review ? reviewTradesToPrint(trades, from, to, allReview) : tradesToPrint(trades, from, to)),
    [review, trades, from, to, allReview]
  );
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
  const noun = mode === "month" ? "THÁNG" : "TUẦN";
  const title = review ? "SỔ NHÌN LẠI" : `TỔNG KẾT ${noun}`;
  const pages = list.length * 2 + (withCover ? 1 : 0);

  return createPortal(
    <div className="print-root">
      <div className="print-toolbar">
        <div className="print-toolbar-row">
          <div className="seg" style={{ maxWidth: 360 }}>
            <button type="button" className={`seg-btn ${!review ? "seg-active" : ""}`} onClick={() => setKind("closed")}>Lệnh đóng · {label}</button>
            <button type="button" className={`seg-btn ${review ? "seg-active" : ""}`} onClick={() => setKind("review")}>📌 Sổ nhìn lại</button>
          </div>
          {review ? (
            <label className="print-opt"><input type="checkbox" checked={allReview} onChange={(e) => setAllReview(e.target.checked)} /> Mọi lệnh đã đánh dấu (không chỉ {label})</label>
          ) : null}
          <label className="print-opt"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Kèm trang tổng kết</label>
          <span className="field-hint" style={{ margin: 0 }}>{list.length} lệnh · khoảng {pages} tờ A4 ngang</span>
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
        {withCover ? (
          <Cover title={title} from={from} to={to} list={list} trades={trades} resources={resources}
            capitalPlan={capitalPlan} journeyLog={journeyLog} review={review} allReview={allReview} weekly={mode !== "month"} />
        ) : null}
        {list.length ? list.map((t, i) => (
          <Fragment key={t.id}>
            <Sheet trade={t} kind="entry" index={i} total={list.length} resources={resources} onImage={onImage} review={review} />
            <Sheet trade={t} kind="exit" index={i} total={list.length} resources={resources} onImage={onImage} review={review} />
          </Fragment>
        )) : (
          <p className="empty-note" style={{ padding: 24 }}>
            {review ? `Không có lệnh nào đánh dấu 📌 ${allReview ? "" : `trong ${label}`}.` : `Không có lệnh nào đóng trong ${label}.`}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
