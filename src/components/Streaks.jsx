import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList } from "recharts";
import { DashboardFilters } from "./Dashboard.jsx";
import { ChartCard, StatCard } from "./ui.jsx";
import { ACCENT, GRID, LOSS, MUTED, WIN, tooltipStyle } from "../lib/constants.js";
import { accountFamily, buildStreakCurve, closedOf, closedOfUSD, dateKey, fmt, fmtR, inRange, streakErrorBreakdown, streakLadder } from "../lib/helpers.js";

const THRESHOLDS = [2, 3, 4, 5];

function streakText(s) {
  const r = s.rCount ? ` · ${fmtR(s.r)}` : "";
  return `${s.length} lệnh ${s.type === "win" ? "thắng" : "thua"}${r}`;
}

// Chỉ chú thích ở đỉnh/đáy, và chỉ những chuỗi đủ dài — gắn nhãn cho mọi chuỗi thì
// biểu đồ chỉ còn là một mảng chữ chồng lên nhau.
function labelRenderer(points) {
  return (props) => {
    const p = points[props.index];
    if (!p || !p.label) return null;
    const up = p.streakType === "win";
    // Chuỗi cuối cùng luôn nằm sát mép phải; canh giữa là chữ tràn ra ngoài khung và bị cắt.
    const ratio = points.length > 1 ? props.index / (points.length - 1) : 0;
    const anchor = ratio > 0.88 ? "end" : ratio < 0.12 ? "start" : "middle";
    return (
      <text x={props.x} y={props.y + (up ? -9 : 17)} textAnchor={anchor}
        fill={up ? WIN : LOSS} fontSize={10.5} fontWeight={600}>
        {p.label}
      </text>
    );
  };
}

function StreakTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  if (!p || !p.date) return null;
  const win = p.streakType === "win";
  return (
    <div style={{ ...tooltipStyle, padding: "8px 10px", lineHeight: 1.6 }}>
      <div style={{ color: MUTED }}>Lệnh {p.i} · {p.date} · {p.symbol}</div>
      <div style={{ color: win ? WIN : LOSS, fontWeight: 600 }}>
        {win ? "Thắng" : "Thua"} {p.streak} lệnh liên tiếp
      </div>
      <div>Lệnh này: {fmtR(p.rr)}</div>
      <div style={{ color: MUTED }}>
        Cộng dồn: {p.net > 0 ? "+" : ""}{p.net} lệnh · {fmtR(p.cumR)}
      </div>
    </div>
  );
}

function StreakTable({ streaks, currency }) {
  const sorted = [...streaks].sort((a, b) => b.length - a.length || a.r - b.r).slice(0, 12);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Chuỗi</th><th>Số lệnh</th><th>Tổng R</th><th>R mỗi lệnh</th><th>Lãi/lỗ</th><th>Từ ngày</th><th>Đến ngày</th></tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={i}>
              <td><b className={s.type === "win" ? "text-win" : "text-loss"}>{s.type === "win" ? "Thắng" : "Thua"}</b></td>
              <td>{s.length}</td>
              <td className={s.r > 0 ? "text-win" : s.r < 0 ? "text-loss" : ""}>
                {s.rCount ? fmtR(s.r) : "—"}
                {s.rCount && s.rCount < s.length ? <span className="err-note"> ({s.rCount}/{s.length} lệnh)</span> : null}
              </td>
              <td>{s.rCount ? fmtR(s.r / s.rCount) : "—"}</td>
              <td className={s.profit > 0 ? "text-win" : s.profit < 0 ? "text-loss" : ""}>{fmt(s.profit)}{currency ? "" : " USD"}</td>
              <td>{s.from || "—"}</td>
              <td>{s.to || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LadderTable({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Trạng thái ngay trước lệnh</th><th>Số lệnh</th><th>Winrate</th><th>R trung bình</th><th>Tâm lý TB</th><th>% giao dịch Tồi</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><b className={r.key > 0 ? "text-win" : r.key < 0 ? "text-loss" : ""}>{r.label}</b></td>
              <td>{r.count}</td>
              <td>{r.winRate.toFixed(0)}%</td>
              <td className={r.avgRR > 0 ? "text-win" : r.avgRR < 0 ? "text-loss" : ""}>{fmtR(r.avgRR)}</td>
              <td>{r.avgPsych === null ? "—" : `${r.avgPsych.toFixed(1)} ★`}</td>
              <td className={r.badRate >= 50 ? "text-loss" : ""}>
                {r.badRate === null ? "—" : `${r.badRate.toFixed(0)}%`}
                {r.gradedCount && r.gradedCount < r.count ? <span className="err-note"> ({r.gradedCount}/{r.count})</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pct(v) {
  return v === null ? "—" : `${v.toFixed(0)}%`;
}

function ErrorInStreakTable({ data, minLen, hasCatalog }) {
  if (!hasCatalog) {
    return <p className="empty-note">Chưa khai lỗi nào cho setup — sang tab "Lỗi theo setup" để thêm, rồi tick lỗi khi soi lại lệnh.</p>;
  }
  if (data.inside === 0) {
    return <p className="empty-note">Chưa có chuỗi thua nào dài từ {minLen} lệnh trong khoảng đang xem.</p>;
  }
  if (data.reviewedIn === 0) {
    return <p className="empty-note">{data.inside} lệnh nằm trong chuỗi thua từ {minLen} lệnh, nhưng chưa lệnh nào được soi lỗi — lọc "Chưa soi lỗi" ở tab Nhật ký để soi trước.</p>;
  }
  const top = data.rows.find((r) => r.lift !== null && r.lift > 0 && r.inHit > 0);
  return (
    <>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        {data.inside} lệnh nằm trong chuỗi thua từ {minLen} lệnh, đã soi {data.reviewedIn}.
        So với {data.reviewedOut} lệnh đã soi ở ngoài chuỗi.
        {top ? <> Nổi nhất: <b>{top.name}</b> — {pct(top.inShare)} trong chuỗi so với {pct(top.outShare)} ngoài chuỗi.</> : null}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Lỗi</th><th>Setup</th><th>Trong chuỗi thua</th><th>Ngoài chuỗi</th><th>Chênh lệch</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b>{r.note ? <span className="err-note"> — {r.note}</span> : null}</td>
                <td>{r.setup || "Chung"}</td>
                <td>{r.inHit}/{data.reviewedIn} <span className="err-note">({pct(r.inShare)})</span></td>
                <td>{r.outHit}/{data.reviewedOut} <span className="err-note">({pct(r.outShare)})</span></td>
                <td className={r.lift > 0 ? "text-loss" : r.lift < 0 ? "text-win" : ""}>
                  {r.lift === null ? "—" : `${r.lift > 0 ? "+" : ""}${r.lift.toFixed(0)} điểm %`}
                </td>
              </tr>
            ))}
            <tr className="week-total-row">
              <td><b>Không mắc lỗi nào</b></td>
              <td>—</td>
              <td>{data.clean.inHit}/{data.reviewedIn} <span className="err-note">({pct(data.clean.inShare)})</span></td>
              <td>{data.clean.outHit}/{data.reviewedOut} <span className="err-note">({pct(data.clean.outShare)})</span></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Dòng "Không mắc lỗi nào" là phép thử ngược: nếu phần lớn lệnh trong chuỗi thua đều sạch lỗi thì
        chuỗi đó không phải do bạn làm sai — đừng sửa cái đang đúng.
      </p>
    </>
  );
}

export function StreakPage({ trades, resources, setupErrors }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [minLen, setMinLen] = useState(3);

  const inScope = useMemo(() => accountFamily(resources.accounts, scope), [resources.accounts, scope]);
  const scoped = trades.filter((t) => (!scope || inScope.has(t.account)) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const curve = useMemo(() => buildStreakCurve(closed), [closed]);
  const ladder = useMemo(() => streakLadder(closed), [closed]);
  const errorSplit = useMemo(() => streakErrorBreakdown(curve, setupErrors, minLen), [curve, setupErrors, minLen]);

  // Nhãn gắn vào bản sao, không sửa dữ liệu gốc — đổi ngưỡng là vẽ lại chứ không tích tụ.
  const points = useMemo(() => {
    const marked = curve.points.map((p) => ({ ...p, label: "" }));
    curve.streaks.forEach((s) => {
      const keep = s.length >= minLen || s === curve.longestWin || s === curve.longestLoss || s === curve.costliestLoss;
      if (keep && marked[s.endIndex]) marked[s.endIndex].label = streakText(s);
    });
    return marked;
  }, [curve, minLen]);

  const scopeBar = (
    <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange}
      rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />
  );

  if (curve.total === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Activity size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh thắng/thua nào đã đóng để dựng chuỗi.</p>
        </div>
      </div>
    );
  }

  const cur = curve.current;
  const showR = curve.rCovered > 0;

  return (
    <div>
      {scopeBar}
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Mỗi lệnh thắng đẩy đường cong lên 1, mỗi lệnh thua kéo xuống 1 — nên mỗi đoạn lên hoặc xuống liền mạch
        chính là một chuỗi, và đỉnh/đáy là chỗ chuỗi đứt. Đường R chạy song song để thấy một chuỗi thua dài
        thực ra tốn bao nhiêu: thua 10 lệnh mà chỉ mất 6R nghĩa là bạn cắt lỗ tốt.
        {curve.beCount ? ` Bỏ qua ${curve.beCount} lệnh hòa (không làm đứt chuỗi).` : ""}
      </p>

      <div className="stat-grid">
        <StatCard label="Chuỗi hiện tại"
          value={cur ? `${cur.length} lệnh ${cur.type === "win" ? "thắng" : "thua"}` : "—"}
          tone={cur ? (cur.type === "win" ? "win" : "loss") : ""}
          sub={cur && cur.rCount ? fmtR(cur.r) : "chưa ghi rủi ro"} />
        <StatCard label="Chuỗi thắng dài nhất"
          value={curve.longestWin ? `${curve.longestWin.length} lệnh` : "—"} tone="win"
          sub={curve.longestWin && curve.longestWin.rCount ? fmtR(curve.longestWin.r) : ""} />
        <StatCard label="Chuỗi thua dài nhất"
          value={curve.longestLoss ? `${curve.longestLoss.length} lệnh` : "—"} tone="loss"
          sub={curve.longestLoss && curve.longestLoss.rCount ? `${fmtR(curve.longestLoss.r)} · ${fmtR(curve.longestLoss.r / curve.longestLoss.rCount)}/lệnh` : ""} />
        <StatCard label="Chuỗi thua tốn nhất"
          value={curve.costliestLoss ? fmtR(curve.costliestLoss.r) : "—"} tone="loss"
          sub={curve.costliestLoss ? `${curve.costliestLoss.length} lệnh · ${curve.costliestLoss.to}` : "chưa lệnh nào ghi rủi ro"} />
      </div>

      <div className="scope-bar" style={{ marginTop: 12 }}>
        <span className="field-label" style={{ marginRight: 4 }}>Chuỗi đáng chú ý từ:</span>
        {THRESHOLDS.map((n) => (
          <button key={n} type="button" className={`chip-btn ${minLen === n ? "chip-active" : ""}`} onClick={() => setMinLen(n)}>
            {n} lệnh
          </button>
        ))}
        <span className="field-hint" style={{ margin: "0 0 0 6px" }}>Dùng cho cả chú thích trên biểu đồ lẫn bảng lỗi bên dưới. Chuỗi dài nhất và tốn nhất luôn được chú thích.</span>
      </div>

      <ChartCard title="Đường cong chuỗi thắng / thua"
        subtitle={showR ? `Trục phải tính R trên ${curve.rCovered}/${curve.total} lệnh có ghi Rủi ro (số tiền)` : "Chưa lệnh nào ghi Rủi ro (số tiền) nên không vẽ được đường R"}
        height={360}
        legend={showR ? [
          { color: "var(--accent)", label: "Số lệnh cộng dồn (trục trái)" },
          { color: "var(--text-dim)", label: "R cộng dồn (trục phải)" },
        ] : null}>
        <ResponsiveContainer>
          <ComposedChart data={points} margin={{ top: 26, right: 16, bottom: 10, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="i" tick={{ fontSize: 10, fill: MUTED }} minTickGap={28} />
            {/* Nới hai đầu trục để đỉnh/đáy không nằm sát mép — chú thích ở đó sẽ đè lên trục hoành. */}
            <YAxis yAxisId="net" tick={{ fontSize: 10, fill: MUTED }} width={42} allowDecimals={false}
              domain={[(min) => min - 1, (max) => max + 1]} />
            {showR ? <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: MUTED }} width={46} domain={["auto", "auto"]} /> : null}
            <ReferenceLine yAxisId="net" y={0} stroke={MUTED} strokeDasharray="4 4" />
            <Tooltip content={<StreakTooltip />} cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: "3 3" }} />
            {showR ? <Line yAxisId="r" type="monotone" dataKey="cumR" stroke={MUTED} strokeWidth={1.5} strokeDasharray="5 3" dot={false} /> : null}
            <Line yAxisId="net" type="linear" dataKey="net" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false}>
              <LabelList dataKey="label" content={labelRenderer(points)} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <h4 className="rec-title">Ngưỡng tâm lý — chất lượng lệnh theo trạng thái trước đó</h4>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Mỗi lệnh được xếp theo chuỗi đang có NGAY TRƯỚC khi vào lệnh. Chỗ winrate và R tụt hẳn xuống
        là ngưỡng nên dừng tay.
      </p>
      <LadderTable rows={ladder} />

      <h4 className="rec-title" style={{ marginTop: 18 }}>Lỗi setup trong chuỗi thua</h4>
      <ErrorInStreakTable data={errorSplit} minLen={minLen} hasCatalog={(setupErrors || []).some((e) => e && e.name)} />

      <h4 className="rec-title" style={{ marginTop: 18 }}>Các chuỗi dài nhất</h4>
      <StreakTable streaks={curve.streaks} currency={singleAccount ? singleAccount.currency : ""} />
    </div>
  );
}
