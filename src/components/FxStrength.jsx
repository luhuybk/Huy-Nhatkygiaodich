import { Fragment, useMemo, useState } from "react";
import { Globe2 } from "lucide-react";
import { dateKey, fmtR } from "../lib/helpers.js";
import { REGIME_MIN_SAMPLE } from "../lib/marketRegime.js";
import {
  coinScore, FX_TRENDS, fxBaseQuoteStats, fxCondOf, fxPairOf, fxPhase, fxRecentCoin, fxScore, fxStats, signed, trendLabel,
} from "../lib/fxStrength.js";

const fmtPct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const toneR = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");
const toneN = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");

function TrendSeg({ value, onChange, label }) {
  return (
    <div className="seg seg-sm fx-seg" data-label={label}>
      {FX_TRENDS.map((x) => (
        <button key={x.v} type="button"
          className={`seg-btn ${value === x.v ? (x.v > 0 ? "seg-active-win" : x.v < 0 ? "seg-active-loss" : "seg-active") : ""}`}
          onClick={() => onChange(value === x.v ? undefined : x.v)}>{x.label}</button>
      ))}
    </div>
  );
}

// Bảng điền Cấu trúc / Ngắn hạn cho hai đồng của cặp — chỉ hiện khi symbol là cặp FX.
export function FxCondPicker({ t, setT, trades }) {
  const pair = fxPairOf(t.symbol);
  const fc = fxCondOf(t);
  const recent = useMemo(() => (pair ? {
    b: fxRecentCoin(trades, t, pair.base),
    q: fxRecentCoin(trades, t, pair.quote),
  } : null), [pair && pair.base, pair && pair.quote, trades, t.entryDate, t.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pair) return null;

  const side = (k) => (fc && fc[k]) || {};
  const write = (patchFn) => setT((prev) => {
    const p = fxPairOf(prev.symbol);
    if (!p) return prev;
    const cur = fxCondOf(prev) || { base: p.base, quote: p.quote, b: {}, q: {} };
    return { ...prev, fxCond: patchFn({ ...cur, b: { ...(cur.b || {}) }, q: { ...(cur.q || {}) } }) };
  });
  const setVal = (k, field) => (v) => write((c) => {
    if (v === undefined) delete c[k][field]; else c[k][field] = v;
    return c;
  });
  const fillRecent = () => write((c) => {
    if (recent.b) c.b = { ct: recent.b.ct, nh: recent.b.nh };
    if (recent.q) c.q = { ct: recent.q.ct, nh: recent.q.nh };
    return c;
  });
  const sc = fxScore(t);
  const empty = !fc || (coinScore(fc.b) === null && coinScore(fc.q) === null);
  const canFill = recent && (recent.b || recent.q) && empty;
  const rows = [["b", pair.base, "◆ Base"], ["q", pair.quote, "◇ Quote"]];
  const ph = sc ? fxPhase(sc.aligned.ct, sc.aligned.nh) : null;

  return (
    <div className="regime-picker fx-picker">
      <div className="regime-picker-head">
        <span className="field-label">Sức mạnh đồng tiền · {pair.base}/{pair.quote}</span>
        {canFill ? (
          <button type="button" className="btn btn-ghost btn-xs" onClick={fillRecent}
            title={[recent.b && `${pair.base}: ${recent.b.symbol} ngày ${recent.b.date}`, recent.q && `${pair.quote}: ${recent.q.symbol} ngày ${recent.q.date}`].filter(Boolean).join("\n")}>
            Điền theo nhận định gần nhất{recent.b && recent.q ? "" : ` (chỉ ${recent.b ? pair.base : pair.quote})`}
          </button>
        ) : null}
      </div>
      <div className="fx-grid">
        <span />
        <span className="fx-col-head">Cấu trúc</span>
        <span className="fx-col-head">Ngắn hạn</span>
        <span className="fx-col-head fx-col-score">Điểm</span>
        {rows.map(([k, coin, tag]) => {
          const s = coinScore(side(k));
          return (
            <Fragment key={k}>
              <span className="fx-coin"><b>{coin}</b> <small>{tag}</small></span>
              <TrendSeg label="CT" value={side(k).ct} onChange={setVal(k, "ct")} />
              <TrendSeg label="NH" value={side(k).nh} onChange={setVal(k, "nh")} />
              <span className={`mono fx-col-score ${toneN(s)}`}>{s === null ? "—" : signed(s)}</span>
            </Fragment>
          );
        })}
      </div>
      {sc ? (
        <div className="fx-summary">
          <span>Cặp <b className={`mono ${toneN(sc.pair)}`}>{signed(sc.pair)}</b></span>
          <span className="mono">CT {signed(sc.ct)} · NH {signed(sc.nh)}</span>
          <span className={sc.aligned.pair > 0 ? "text-win" : sc.aligned.pair < 0 ? "text-loss" : ""}>
            Theo lệnh {t.direction === "sell" ? "Sell" : "Buy"}: {ph.icon} {ph.label}
          </span>
        </div>
      ) : (
        <p className="field-hint" style={{ marginTop: 8 }}>Điểm đồng = Cấu trúc × 2 + Ngắn hạn · điểm cặp = Base − Quote (giống chỉ báo Xu Hướng Tuần).</p>
      )}
    </div>
  );
}

export function fxDetailText(t) {
  const fc = fxCondOf(t);
  if (!fc) return "";
  const coin = (code, c) => `${code}: CT ${trendLabel(c && c.ct)} · NH ${trendLabel(c && c.nh)}${coinScore(c) === null ? "" : ` (${signed(coinScore(c))})`}`;
  const sc = fxScore(t);
  const tail = sc ? `\nCặp ${signed(sc.pair)} · CT ${signed(sc.ct)} · NH ${signed(sc.nh)} — ${fxPhase(sc.aligned.ct, sc.aligned.nh).icon} ${fxPhase(sc.aligned.ct, sc.aligned.nh).label}` : "";
  return `${coin(fc.base, fc.b)}\n${coin(fc.quote, fc.q)}${tail}`;
}

function StatCells({ s }) {
  return (
    <>
      <td className="mono">{s.count}</td>
      <td className="mono">
        <div className="regime-wr">
          <span className="regime-wr-bar" style={{ width: `${s.winRate === null ? 0 : s.winRate}%` }} />
          <span>{fmtPct(s.winRate)}</span>
        </div>
      </td>
      <td className={`mono ${toneR(s.avgR)}`}>{fmtR(s.avgR)}</td>
      <td className={`mono ${toneR(s.totalR)}`}>{s.rCount ? fmtR(s.totalR) : "—"}</td>
    </>
  );
}


const LEVELS = [2, 1, 0, -1, -2];
const SIDE_LEVELS = [[1, "Ủng hộ"], [0, "Ngang"], [-1, "Cản"]];
const heat = (wr) => (wr === null ? "transparent" : wr >= 50 ? `rgba(var(--win-rgb, 76,175,125), ${0.1 + (wr - 50) / 80})` : `rgba(var(--loss-rgb, 224,97,90), ${0.1 + (50 - wr) / 80})`);

function HeatCell({ c, title, total }) {
  return (
    <td className={total ? "fx-heat-total" : ""} style={{ background: c && !total ? heat(c.winRate) : "transparent" }} title={title}>
      {c && c.count ? (
        <>
          <b className="mono">{c.count}</b> <span className="mono">{fmtPct(c.winRate)}</span>
          <div className={`mono fx-heat-r ${toneR(c.avgR)}`}>{fmtR(c.avgR)}</div>
        </>
      ) : <span className="fx-heat-empty">·</span>}
    </td>
  );
}

// Bảng điểm cặp kiểu chỉ báo (Base − Quote) — giữ lại để đối chiếu, gấp vào mặc định.
function PairScoreDetails({ st }) {
  return (
    <details className="regime-missing fx-pair-details">
      <summary>Theo điểm cặp Base − Quote (cách chấm của chỉ báo Xu Hướng Tuần)</summary>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Điểm cặp theo lệnh</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
          <tbody>
            {st.buckets.map((b) => <tr key={b.id} className={b.count ? "" : "regime-row-dim"}><td>{b.label}</td><StatCells s={b} /></tr>)}
          </tbody>
        </table>
      </div>
      <p className="field-hint" style={{ margin: "12px 0 8px" }}>Lưới CT × NH của cặp (CT, NH = Base − Quote, theo hướng lệnh). Mỗi ô: số lệnh · winrate · R TB.</p>
      <div className="table-wrap">
        <table className="table fx-heat">
          <thead><tr><th>CT ↓ · NH →</th>{LEVELS.map((n) => <th key={n} className="mono">{signed(n)}</th>)}</tr></thead>
          <tbody>
            {LEVELS.map((ct) => (
              <tr key={ct}>
                <th className="mono">{signed(ct)}</th>
                {LEVELS.map((nh) => <HeatCell key={nh} c={st.grid[`${ct}|${nh}`]} title={`CT ${signed(ct)} · NH ${signed(nh)} · điểm cặp ${signed(2 * ct + nh)}`} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function FxStatsPanel({ trades, resources, direction, onOpenTrade }) {
  const [baseFilter, setBaseFilter] = useState("g:with");
  const bq = useMemo(() => fxBaseQuoteStats(trades, resources, { direction, baseFilter }), [trades, resources, direction, baseFilter]);
  const st = useMemo(() => fxStats(trades, resources, { direction }), [trades, resources, direction]);
  const good = bq.groups[0];
  const bad = bq.groups[2];
  const gap = good.winRate !== null && bad.winRate !== null ? good.winRate - bad.winRate : null;
  const small = good.count < REGIME_MIN_SAMPLE || bad.count < REGIME_MIN_SAMPLE;
  const pickedLabel = (() => {
    const [kind, id] = baseFilter.split(":");
    if (kind === "g") return (bq.groups.find((g) => g.id === id) || {}).label || "";
    const p = bq.phases.find((x) => x.id === id);
    return p ? `Base ${p.icon} ${p.label.toLowerCase()}` : "";
  })();
  const pickRow = (key) => ({
    className: `fx-pick-row ${baseFilter === key ? "fx-pick-on" : ""}`,
    onClick: () => setBaseFilter(key),
    title: "Bấm để xem Quote ảnh hưởng thế nào trong nhóm này",
  });

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mọi thứ quy về hướng lệnh. <b>Base ủng hộ</b> = Base đi cùng chiều lệnh (Buy cần Base tăng).
        <b> Quote ủng hộ</b> = Quote đi ngược Base (Buy EURUSD cần USD giảm); Quote <b>cản</b> = đi cùng chiều Base.
      </p>
      {bq.recorded === 0 ? (
        <div className="empty-state">
          <Globe2 size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh FX đã đóng nào điền đủ Cấu trúc / Ngắn hạn cho hai đồng. Mở form lệnh cặp FX, ở mục 1 bấm Tăng / Ngang / Giảm.</p>
        </div>
      ) : (
        <>
          <div className={`mc-hero ${gap !== null && gap > 0 ? "mc-hero-ok" : "mc-hero-cost"}`}>
            {good.count && bad.count ? (
              <>
                <span className="mc-hero-label">Vào đúng chiều đồng Base so với ngược chiều</span>
                <span className={`mc-hero-value ${gap > 0 ? "mc-hero-value-ok" : ""}`}>{fmtPct(good.winRate)} <small>so với</small> {fmtPct(bad.winRate)}</span>
                <p className="mc-hero-why">
                  {good.count} lệnh Base thuận chiều lệnh, {bad.count} lệnh Base ngược chiều. R trung bình <b>{fmtR(good.avgR)}</b> so với <b>{fmtR(bad.avgR)}</b>.
                </p>
              </>
            ) : (
              <>
                <span className="mc-hero-label">Chưa đủ hai phía để so</span>
                <p className="mc-hero-why">Cần cả lệnh Base thuận chiều lẫn lệnh Base ngược chiều.</p>
              </>
            )}
            {small && good.count && bad.count ? (
              <p className="mc-hero-warn">Mẫu còn nhỏ ({good.count} và {bad.count} lệnh — nên có ít nhất {REGIME_MIN_SAMPLE} mỗi bên). Để tham khảo, chưa đủ kết luận.</p>
            ) : null}
          </div>

          <h3 className="block-title">Bước 1 · Đồng Base so với chiều lệnh</h3>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>Bấm một dòng để xem bước 2 cho đúng nhóm đó.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Base</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {bq.groups.map((g) => (
                  <tr key={g.id} {...pickRow(`g:${g.id}`)}><td><b>{g.label}</b> <small className="fx-hint-inline">{g.hint}</small></td><StatCells s={g} /></tr>
                ))}
                <tr className="fx-sub-head"><td colSpan={5}>Chi tiết Cấu trúc / Ngắn hạn của Base</td></tr>
                {bq.phases.filter((x) => x.count).map((x) => (
                  <tr key={x.id} {...pickRow(`p:${x.id}`)}><td>{x.icon} {x.label}</td><StatCells s={x} /></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="block-title" style={{ marginTop: 22 }}>Bước 2 · Quote ảnh hưởng thế nào — khi {pickedLabel.charAt(0).toLowerCase() + pickedLabel.slice(1)}</h3>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
            {bq.picked.count} lệnh. Mỗi ô: số lệnh · winrate · R TB. Hàng = Cấu trúc của Quote, cột = Ngắn hạn của Quote.
          </p>
          {bq.picked.count ? (
            <div className="table-wrap">
              <table className="table fx-heat">
                <thead>
                  <tr><th>Quote CT ↓ · NH →</th>{SIDE_LEVELS.map(([v, l]) => <th key={v}>{l}</th>)}<th>Cả hàng</th></tr>
                </thead>
                <tbody>
                  {SIDE_LEVELS.map(([ct, cl]) => (
                    <tr key={ct}>
                      <th>{cl}</th>
                      {SIDE_LEVELS.map(([nh, nl]) => <HeatCell key={nh} c={bq.grid[`${ct}|${nh}`]} title={`Quote: cấu trúc ${cl.toLowerCase()} · ngắn hạn ${nl.toLowerCase()}`} />)}
                      <HeatCell total c={bq.rowTot[ct]} title={`Quote cấu trúc ${cl.toLowerCase()} — mọi ngắn hạn`} />
                    </tr>
                  ))}
                  <tr>
                    <th>Cả cột</th>
                    {SIDE_LEVELS.map(([nh, nl]) => <HeatCell total key={nh} c={bq.colTot[nh]} title={`Quote ngắn hạn ${nl.toLowerCase()} — mọi cấu trúc`} />)}
                    <HeatCell total c={bq.picked} title="Toàn bộ nhóm đang chọn" />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : <p className="empty-note">Chưa có lệnh nào trong nhóm này.</p>}
          <PairScoreDetails st={st} />
        </>
      )}

      {st.missingTrades.length ? (
        <details className="regime-missing">
          <summary>{st.missingTrades.length} lệnh FX đã đóng chưa điền đủ{st.partial ? ` (${st.partial} lệnh điền dở)` : ""}</summary>
          <div className="mc-worst">
            {[...st.missingTrades].sort((a, b) => (dateKey(b) || "").localeCompare(dateKey(a) || "")).slice(0, 40).map((t) => (
              <button type="button" key={t.id} className="mc-worst-row" onClick={() => onOpenTrade && onOpenTrade(t)}>
                <span className="mono mc-worst-date">{t.entryDate || "—"}</span>
                <b className="mc-worst-sym">{t.symbol || "—"}</b>
                <span className="mc-worst-note">{t.account}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
