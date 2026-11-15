// Trang "Kỳ vọng & R" (menu Phân tích): hệ thống đang lãi hay lỗ vì đâu — tỉ lệ thắng, cỡ thắng / thua, mấy lệnh
// home-run gánh bao nhiêu, dời SL sớm giữ lại bao nhiêu R, chia vốn theo niềm tin / thị trường đã giúp hay hại.
// Tính toán ở lib/edge.js.
import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { DashboardFilters } from "./Dashboard.jsx";
import { StatCard } from "./ui.jsx";
import { dateKey, expandAccountFilter, fmtR, inRange } from "../lib/helpers.js";
import { useAssetFilter, assetGroupInfo, assetGroupOf } from "../lib/assetGroups.js";
import { regimeGroupsOf } from "../lib/marketRegime.js";
import { closedR, EDGE_MIN_SAMPLE, edgeStats, groupEdge, lossShape, maxLossStreak, pctOf, rDistribution, regimeSizing, regimeToneOf, sizingImpact, tailDependence } from "../lib/edge.js";

const pct = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}R`);
const acc = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const tone = (v) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "");
const riskLevel = (t) => {
  const p = pctOf(t);
  if (p === null) return "Chưa ghi % rủi ro";
  return p <= 0.4 ? "≤ 0,4%" : p <= 0.7 ? "0,5 – 0,7%" : p <= 1 ? "0,8 – 1%" : "trên 1%";
};

const DIMENSIONS = [
  { id: "account", label: "Tài khoản", key: (t) => t.account },
  { id: "asset", label: "Nhóm tài sản", key: (t, _r, res) => assetGroupInfo(assetGroupOf(t, res)).label },
  { id: "timeframe", label: "Khung", key: (t) => t.timeframe },
  { id: "setup", label: "Setup", key: (t) => t.setup },
  { id: "risk", label: "Mức vốn", key: (t) => riskLevel(t) },
  { id: "regime", label: "Thị trường chung", key: (t, _r, res) => regimeToneOf(t, res) || "Không áp dụng" },
  { id: "month", label: "Tháng", key: (t) => (dateKey(t) || "").slice(0, 7) },
  { id: "direction", label: "Hướng", key: (t) => (t.direction === "sell" ? "Sell" : "Buy") },
];

function Bars({ dist }) {
  const max = Math.max(1, ...dist.map((b) => b.n));
  return (
    <div className="edge-bars">
      {dist.map((b) => (
        <div key={b.id} className="edge-bar-row">
          <span className="edge-bar-label">{b.label}{b.hint ? <small> {b.hint}</small> : null}</span>
          <span className="edge-bar-track"><span className={`edge-bar-fill edge-${b.tone || "flat"}`} style={{ width: `${(b.n / max) * 100}%` }} /></span>
          <span className="edge-bar-n mono">{b.n}</span>
          <span className={`edge-bar-r mono ${tone(b.totalR)}`}>{fmtR(b.totalR)}</span>
        </div>
      ))}
    </div>
  );
}

export function EdgePage({ trades, resources, onOpenTrade }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [dim, setDim] = useState("timeframe");
  const asset = useAssetFilter(trades, resources);
  const inScope = useMemo(() => expandAccountFilter(scope, resources.accounts), [resources.accounts, scope]);
  const list = useMemo(() => closedR(trades.filter((t) => asset.match(t) && (!inScope || inScope.has(t.account))
    && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo))), [trades, asset.match, inScope, range, rangeFrom, rangeTo]);
  const s = useMemo(() => edgeStats(list), [list]);
  const dist = useMemo(() => rDistribution(list), [list]);
  const tail = useMemo(() => tailDependence(list), [list]);
  const loss = useMemo(() => lossShape(list), [list]);
  const streak = useMemo(() => maxLossStreak(list), [list]);
  const sizing = useMemo(() => sizingImpact(list), [list]);
  const regime = useMemo(() => regimeSizing(list, resources), [list, resources]);
  const d = DIMENSIONS.find((x) => x.id === dim) || DIMENSIONS[0];
  const rows = useMemo(() => groupEdge(list, (t, r) => d.key(t, r, resources)), [list, d, resources]);
  const groups = regimeGroupsOf(resources);

  const scopeBar = <DashboardFilters asset={asset} multi resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;
  if (!s.n) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state"><Scale size={28} color="var(--text-dim)" /><p>Chưa có lệnh đã đóng nào tính được R trong phạm vi này (lệnh cần có "Rủi ro (tiền)").</p></div>
      </div>
    );
  }
  const gap = s.breakEvenWin !== null && s.winRate !== null ? s.winRate - s.breakEvenWin : null;
  const positive = s.expectancy > 0;

  return (
    <div>
      {scopeBar}
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {s.n} lệnh đã đóng có R · từ {(dateKey(list[0].t) || "").split("-").reverse().join("/")} tới {(dateKey(list[list.length - 1].t) || "").split("-").reverse().join("/")}.
        Lãi hay lỗ không do tỉ lệ thắng quyết định, mà do <b>kỳ vọng mỗi lệnh = tỉ lệ thắng × R thắng TB − tỉ lệ thua × R thua TB</b>.
      </p>

      <div className={`mc-hero ${positive ? "mc-hero-ok" : "mc-hero-cost"}`}>
        <span className="mc-hero-label">Kỳ vọng mỗi lệnh</span>
        <span className={`mc-hero-value ${positive ? "mc-hero-value-ok" : ""}`} style={positive ? { fontSize: 40 } : null}>{fmtR(s.expectancy)}</span>
        <p className="mc-hero-why">
          Thắng <b>{pct(s.winRate, 1)}</b> số lệnh, lệnh thắng trung bình <b>{r2(s.avgWin)}</b>, lệnh thua trung bình <b>{r2(s.avgLoss)}</b>.
          {" "}Với cỡ thắng / thua này, chỉ cần thắng <b>{pct(s.breakEvenWin, 1)}</b> là hoà vốn —
          {gap === null ? "" : gap >= 0 ? <> bạn đang <b className="text-win">dư {(gap * 100).toFixed(1)} điểm %</b>.</> : <> bạn đang <b className="text-loss">thiếu {(-gap * 100).toFixed(1)} điểm %</b>.</>}
          {!positive && s.needAvgWin !== null ? <> Hoặc giữ tỉ lệ thắng hiện tại thì lệnh thắng trung bình phải đạt <b>{r2(s.needAvgWin)}</b> (đang {r2(s.avgWin)}).</> : null}
        </p>
        {s.n < 50 ? <p className="mc-hero-warn">Mới {s.n} lệnh — kỳ vọng còn nhảy nhiều khi thêm vài lệnh lớn. Nên có trên 100 lệnh mới kết luận.</p> : null}
      </div>

      <div className="stat-grid">
        <StatCard label="Tỉ lệ thắng" value={pct(s.winRate, 1)} sub={`${s.wins} thắng · ${s.losses} thua`} />
        <StatCard label="R thắng trung bình" value={r2(s.avgWin)} tone="win" />
        <StatCard label="R thua trung bình" value={r2(s.avgLoss)} tone="loss" />
        <StatCard label="Thắng / thua (payoff)" value={s.payoff === null ? "—" : `${s.payoff.toFixed(2)} : 1`} />
        <StatCard label="Thắng tối thiểu để hoà" value={pct(s.breakEvenWin, 1)} />
        <StatCard label="Tổng R" value={fmtR(s.totalR)} tone={s.totalR >= 0 ? "win" : "loss"} />
        <StatCard label="Chuỗi thua dài nhất" value={`${streak} lệnh`} sub={sizing ? `≈ −${(streak * sizing.meanRisk * Math.abs(s.avgLoss || 1)).toFixed(1)}% tài khoản ở mức ${sizing.meanRisk.toFixed(2)}%` : ""} />
      </div>

      <h3 className="block-title">Phân phối R</h3>
      <p className="field-hint" style={{ marginTop: 4 }}>Số lệnh và tổng R mỗi khoảng. Hệ thống "sai nhiều vẫn lãi" có dạng: nhiều lệnh thua nhỏ bên trái, vài lệnh rất lớn bên phải.</p>
      <Bars dist={dist} />

      <h3 className="block-title">Mấy lệnh lớn gánh bao nhiêu</h3>
      <div className="stat-grid">
        <StatCard label={`${tail.k} lệnh tốt nhất (10%)`} value={fmtR(tail.topR)} tone="win" sub={`trên tổng ${fmtR(tail.totalR)}`} />
        <StatCard label="Kỳ vọng nếu bỏ 10% đó" value={fmtR(tail.restExpectancy)} tone={tail.restExpectancy >= 0 ? "win" : "loss"} />
        <StatCard label="Lệnh từ 3R trở lên" value={`${tail.big.n} lệnh`} sub={`${fmtR(tail.big.totalR)} · ${pct(s.n ? tail.big.n / s.n : null, 1)} số lệnh`} />
        <StatCard label="🚀 Đã đánh dấu home-run" value={`${tail.homeRuns.n} lệnh`} sub={tail.homeRuns.n ? fmtR(tail.homeRuns.totalR) : "tick ở mục Đóng lệnh"} />
      </div>
      <p className="field-hint">
        {tail.restExpectancy < 0
          ? "Bỏ 10% lệnh tốt nhất là hệ thống lỗ — tiền lãi nằm ở mấy lệnh chạy xa. Việc quan trọng nhất là không chốt / kéo SL quá sát làm mất những lệnh này."
          : "Bỏ 10% lệnh tốt nhất hệ thống vẫn lãi — lợi thế không chỉ nằm ở vài lệnh may mắn."}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Mã</th><th>Khung</th><th>Setup</th><th>Đóng</th><th className="num">% vốn</th><th className="num">R</th></tr></thead>
          <tbody>
            {tail.top.map((x, i) => (
              <tr key={x.t.id} className={onOpenTrade ? "row-click" : ""} onClick={onOpenTrade ? () => onOpenTrade(x.t) : undefined}>
                <td>{i + 1}</td><td><b>{x.t.symbol}</b>{x.t.homeRun ? " 🚀" : ""}</td><td>{x.t.timeframe || "—"}</td><td>{x.t.setup || "—"}</td>
                <td className="mono">{dateKey(x.t)}</td><td className="num mono">{pctOf(x.t) === null ? "—" : `${pctOf(x.t)}%`}</td><td className="num mono text-win">{fmtR(x.rr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="block-title">Cách thua</h3>
      <div className="stat-grid">
        <StatCard label="Thua đủ (≤ −0,9R)" value={`${loss.full} lệnh`} sub={pct(loss.losses ? loss.full / loss.losses : null) + " số lệnh thua"} />
        <StatCard label="Lỗ ít hơn 1R" value={`${loss.cut} lệnh`} sub="SL đã dời / cắt sớm" />
        <StatCard label="Hoà (±0,1R)" value={`${loss.scratch} lệnh`} />
        <StatCard label="R giữ lại so với thua đủ" value={fmtR(loss.saved)} tone="win" sub={`≈ ${fmtR(s.n ? loss.saved / s.n : null)} mỗi lệnh`} />
      </div>
      <p className="field-hint">Nếu mọi lệnh thua đều mất đủ 1R thì tổng R sẽ là {fmtR(s.totalR - loss.saved)}. Dời SL sớm là đúng hướng — miễn nó không cắt mất lệnh home-run (xem bảng trên và "Đánh giá EA kéo SL" ở trang SL hiện tại).</p>

      <h3 className="block-title">Chia vốn đã giúp hay hại</h3>
      {sizing ? (
        <div className="stat-grid">
          <StatCard label="Thực tế (Σ R × % rủi ro)" value={acc(sizing.actual)} tone={sizing.actual >= 0 ? "win" : "loss"} sub={`${sizing.n} lệnh có ghi % rủi ro`} />
          <StatCard label={`Nếu đi đều ${sizing.meanRisk.toFixed(2)}% mọi lệnh`} value={acc(sizing.flat)} tone={sizing.flat >= 0 ? "win" : "loss"} />
          <StatCard label="Chênh lệch nhờ cách chia vốn" value={acc(sizing.diff)} tone={sizing.diff >= 0 ? "win" : "loss"}
            sub={sizing.diff >= 0 ? "lệnh đi vốn to thường là lệnh tốt hơn" : "lệnh đi vốn to lại hay là lệnh kém hơn"} />
        </div>
      ) : <p className="field-hint">Chưa có lệnh nào ghi % rủi ro.</p>}
      <p className="field-hint">Cùng các lệnh đó, cùng mức vốn trung bình — chỉ khác là to / nhỏ ở lệnh nào. Số % là cộng dồn đơn giản, chưa tính lãi kép.</p>
      {regime.n >= 10 ? (
        <>
          <div className="stat-grid">
            <StatCard label="Đi theo khung vốn của thị trường chung" value={acc(regime.plan)} tone={regime.plan >= 0 ? "win" : "loss"} sub={`${regime.n} lệnh đã tick trạng thái có khung`} />
            <StatCard label={`Nếu đi đều ${regime.meanPlan.toFixed(2)}%`} value={acc(regime.flat)} tone={regime.flat >= 0 ? "win" : "loss"} />
            {regime.byTone.filter((x) => x.n).map((x) => (
              <StatCard key={x.tone} label={`Kỳ vọng lúc ${(groups.find((g) => g.id === x.tone) || {}).label || x.tone}`} value={fmtR(x.expectancy)} tone={x.expectancy >= 0 ? "win" : "loss"} sub={`${x.n} lệnh`} />
            ))}
          </div>
        </>
      ) : (
        <p className="field-hint">
          <b>Đi vốn theo thị trường chung (0,3% khi xấu / 1,6% khi tốt):</b> mới {regime.n} lệnh đã tick trạng thái có khung vốn
          {regime.untagged ? `, ${regime.untagged} lệnh có chỉ số nhưng chưa tick` : ""} — cần ít nhất 10 (tốt nhất trên 30) để so được.
          Tick trạng thái thị trường ở form lệnh (mục Thông tin lệnh) cho mỗi lệnh US / VN Stock.
        </p>
      )}

      <h3 className="block-title">Tách theo</h3>
      <div className="seg" style={{ maxWidth: 760, flexWrap: "wrap", marginBottom: 10 }}>
        {DIMENSIONS.map((x) => <button key={x.id} type="button" className={`seg-btn ${dim === x.id ? "seg-active" : ""}`} onClick={() => setDim(x.id)}>{x.label}</button>)}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{d.label}</th><th className="num">Lệnh</th><th className="num">Thắng</th><th className="num">R thắng TB</th><th className="num">R thua TB</th><th className="num">Cần thắng</th><th className="num">Kỳ vọng</th><th className="num">Tổng R</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className={x.n < EDGE_MIN_SAMPLE ? "edge-few" : ""} title={x.n < EDGE_MIN_SAMPLE ? `Dưới ${EDGE_MIN_SAMPLE} lệnh — chưa đủ để kết luận` : ""}>
                <td>{x.key}</td><td className="num mono">{x.n}</td><td className="num mono">{pct(x.winRate)}</td>
                <td className="num mono">{r2(x.avgWin)}</td><td className="num mono">{r2(x.avgLoss)}</td>
                <td className={`num mono ${x.winRate !== null && x.breakEvenWin !== null ? (x.winRate >= x.breakEvenWin ? "text-win" : "text-loss") : ""}`}>{pct(x.breakEvenWin)}</td>
                <td className={`num mono ${tone(x.expectancy)}`}><b>{fmtR(x.expectancy)}</b></td><td className={`num mono ${tone(x.totalR)}`}>{fmtR(x.totalR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">Dòng mờ = dưới {EDGE_MIN_SAMPLE} lệnh, chưa đủ để kết luận. "Cần thắng" xanh khi tỉ lệ thắng thực tế đã vượt mức đó.</p>
    </div>
  );
}
