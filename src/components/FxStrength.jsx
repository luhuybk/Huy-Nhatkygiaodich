import { Fragment, useMemo } from "react";
import { Globe2 } from "lucide-react";
import { dateKey, fmtR } from "../lib/helpers.js";
import { REGIME_MIN_SAMPLE } from "../lib/marketRegime.js";
import {
  coinScore, FX_TRENDS, fxCondOf, fxPairOf, fxPhase, fxRecentCoin, fxScore, fxStats, signed, trendLabel,
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

export function FxStatsPanel({ trades, resources, direction, onOpenTrade }) {
  const st = useMemo(() => fxStats(trades, resources, { direction }), [trades, resources, direction]);
  const recorded = st.buckets.reduce((n, b) => n + b.count, 0);
  const gap = st.strong.winRate !== null && st.rest.winRate !== null ? st.strong.winRate - st.rest.winRate : null;
  const small = st.strong.count < REGIME_MIN_SAMPLE || st.rest.count < REGIME_MIN_SAMPLE;
  const heat = (wr) => (wr === null ? "transparent" : wr >= 50 ? `rgba(var(--win-rgb, 76,175,125), ${0.1 + (wr - 50) / 80})` : `rgba(var(--loss-rgb, 224,97,90), ${0.1 + (50 - wr) / 80})`);

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Tính theo hướng lệnh: lệnh Sell đảo dấu, nên <b>+</b> luôn là thị trường ủng hộ lệnh. Điểm cặp = 2 × CT + NH, với CT / NH = Base − Quote.
      </p>
      {recorded === 0 ? (
        <div className="empty-state">
          <Globe2 size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh FX đã đóng nào điền đủ Cấu trúc / Ngắn hạn cho hai đồng. Mở form lệnh cặp FX, ở mục 1 bấm Tăng / Ngang / Giảm.</p>
        </div>
      ) : (
        <>
          <div className={`mc-hero ${gap !== null && gap > 0 ? "mc-hero-ok" : "mc-hero-cost"}`}>
            {st.strong.count && st.rest.count ? (
              <>
                <span className="mc-hero-label">Điểm cặp theo lệnh từ +4 so với phần còn lại</span>
                <span className={`mc-hero-value ${gap > 0 ? "mc-hero-value-ok" : ""}`}>{fmtPct(st.strong.winRate)} <small>so với</small> {fmtPct(st.rest.winRate)}</span>
                <p className="mc-hero-why">
                  Winrate {st.strong.count} lệnh vào lúc hai đồng lệch nhau rõ theo hướng lệnh, so với {st.rest.count} lệnh còn lại.
                  R trung bình <b>{fmtR(st.strong.avgR)}</b> so với <b>{fmtR(st.rest.avgR)}</b>.
                </p>
              </>
            ) : (
              <>
                <span className="mc-hero-label">Chưa đủ hai phía để so</span>
                <p className="mc-hero-why">Cần cả lệnh có điểm cặp theo lệnh từ +4 lẫn lệnh dưới +4.</p>
              </>
            )}
            {small && st.strong.count && st.rest.count ? (
              <p className="mc-hero-warn">Mẫu còn nhỏ ({st.strong.count} và {st.rest.count} lệnh — nên có ít nhất {REGIME_MIN_SAMPLE} mỗi bên). Để tham khảo, chưa đủ kết luận.</p>
            ) : null}
          </div>

          <h3 className="block-title">Theo điểm cặp (theo hướng lệnh)</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Điểm cặp</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.buckets.map((b) => <tr key={b.id} className={b.count ? "" : "regime-row-dim"}><td>{b.label}</td><StatCells s={b} /></tr>)}
              </tbody>
            </table>
          </div>

          <h3 className="block-title" style={{ marginTop: 22 }}>Theo nhịp Cấu trúc / Ngắn hạn</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nhịp</th><th>Số lệnh</th><th>Winrate</th><th>R TB</th><th>Tổng R</th></tr></thead>
              <tbody>
                {st.phases.filter((p) => p.count).map((p) => <tr key={p.id}><td>{p.icon} {p.label}</td><StatCells s={p} /></tr>)}
              </tbody>
            </table>
          </div>

          <h3 className="block-title" style={{ marginTop: 22 }}>Lưới CT × NH</h3>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
            Mỗi ô: số lệnh · winrate. VD Base cấu trúc tăng / ngắn hạn giảm, Quote cấu trúc giảm / ngắn hạn tăng, lệnh Buy → CT +2, NH −2.
          </p>
          <div className="table-wrap">
            <table className="table fx-heat">
              <thead>
                <tr><th>CT ↓ · NH →</th>{LEVELS.map((n) => <th key={n} className="mono">{signed(n)}</th>)}</tr>
              </thead>
              <tbody>
                {LEVELS.map((ct) => (
                  <tr key={ct}>
                    <th className="mono">{signed(ct)}</th>
                    {LEVELS.map((nh) => {
                      const c = st.grid[`${ct}|${nh}`];
                      return (
                        <td key={nh} style={{ background: c ? heat(c.winRate) : "transparent" }} title={c ? `CT ${signed(ct)} · NH ${signed(nh)} · điểm cặp ${signed(2 * ct + nh)}\n${c.count} lệnh · winrate ${fmtPct(c.winRate)} · R TB ${fmtR(c.avgR)}` : `Điểm cặp ${signed(2 * ct + nh)} — chưa có lệnh`}>
                          {c ? <><b className="mono">{c.count}</b> <span className="mono">{fmtPct(c.winRate)}</span></> : <span className="fx-heat-empty">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
