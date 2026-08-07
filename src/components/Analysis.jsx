import { useState } from "react";
import { LineChart as LineChartIcon, Layers, Target } from "lucide-react";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { AdvancedMetrics, DashboardFilters, RDistribution, TopBottom } from "./Dashboard.jsx";
import { CATEGORY_COLORS, GRADE_OPTIONS, LOSS, WEEKDAY_LABEL, WEEKDAY_ORDER, WIN, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { ChartCard, StatCard } from "./ui.jsx";
import { avgPillarScore, buildInsights, closedOf, closedOfUSD, dateKey, fmt, groupStats, heatColor, inRange, monthKey, weekdayIndex, yearKey } from "../lib/helpers.js";

export function HeatmapPage({ trades, resources }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;

  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Layers size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để vẽ bản đồ nhiệt.</p>
        </div>
      </div>
    );
  }

  const byWeekday = {};
  closed.forEach((x) => {
    // Theo ngày mở lệnh (entryDate), khác với các bản đồ nhiệt theo tháng/năm vốn tính theo ngày đóng.
    const wd = weekdayIndex(x.t.entryDate);
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { pnl: 0, count: 0, wins: 0 };
    byWeekday[wd].pnl += x.r.profit; byWeekday[wd].count += 1;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const maxWeekdayAbs = Math.max(1, ...Object.values(byWeekday).map((v) => Math.abs(v.pnl)));

  const byMonth = groupStats(closed, (t) => monthKey(dateKey(t)));
  const monthKeys = Object.keys(byMonth).sort();
  const maxMonthAbs = Math.max(1, ...monthKeys.map((k) => Math.abs(byMonth[k].pnl)));

  const byYear = groupStats(closed, (t) => yearKey(dateKey(t)));
  const yearKeys = Object.keys(byYear).sort();
  const maxYearAbs = Math.max(1, ...yearKeys.map((k) => Math.abs(byYear[k].pnl)));

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Theo thứ trong tuần</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: 4 }}>Tính theo ngày mở lệnh (entry) — giúp thấy thứ nào trong tuần bạn có winrate cao để cân nhắc khi vào lệnh.</p>
      <div className="heat-strip">
        {WEEKDAY_ORDER.filter((wd) => byWeekday[wd]).map((wd) => (
          <div key={wd} className="heat-cell" style={{ background: heatColor(byWeekday[wd].pnl, maxWeekdayAbs) }}>
            <span className="heat-label">{WEEKDAY_LABEL[wd]}</span>
            <span className={`heat-value ${byWeekday[wd].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byWeekday[wd].pnl)}</span>
            <span className="heat-sub">{byWeekday[wd].count} lệnh · {((byWeekday[wd].wins / byWeekday[wd].count) * 100).toFixed(0)}% thắng</span>
          </div>
        ))}
      </div>

      <h3 className="block-title">Theo tháng</h3>
      <div className="heat-strip">
        {monthKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byMonth[k].pnl, maxMonthAbs) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byMonth[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byMonth[k].pnl)}</span>
            <span className="heat-sub">{byMonth[k].count} lệnh</span>
          </div>
        ))}
      </div>

      <h3 className="block-title">Theo năm</h3>
      <div className="heat-strip">
        {yearKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byYear[k].pnl, maxYearAbs) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byYear[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byYear[k].pnl)}</span>
            <span className="heat-sub">{byYear[k].count} lệnh</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryPie({ label, trades, fieldKey }) {
  const counts = {};
  let total = 0;
  trades.forEach((t) => { const v = t[fieldKey]; if (!v) return; counts[v] = (counts[v] || 0) + 1; total += 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const pieData = entries.map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  return (
    <ChartCard title={label} subtitle={total ? `${total} lệnh` : undefined} height={220}>
      {total === 0 ? <p className="empty-note">Chưa có lệnh nào điền mục này.</p> : (
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={75} paddingAngle={2} label={(d) => `${((d.value / total) * 100).toFixed(0)}%`}>
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function CategoryPieWithTable({ label, trades, fieldKey }) {
  const counts = {};
  let total = 0;
  trades.forEach((t) => { const v = t[fieldKey]; if (!v) return; counts[v] = (counts[v] || 0) + 1; total += 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <CategoryPie label={label} trades={trades} fieldKey={fieldKey} />
      {entries.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead><tr><th>{label}</th><th>Số lệnh</th><th>Tỷ trọng</th></tr></thead>
            <tbody>
              {entries.map(([name, count], i) => (
                <tr key={name}>
                  <td><span className="pie-swatch" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />{name}</td>
                  <td className="mono">{count}</td>
                  <td className="mono">{((count / total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function PillarBreakdown({ title, ratings, trades, fields }) {
  const rated = ratings.filter((v) => v > 0);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", marginBottom: 14 }}>
        <StatCard label={`${title} — Điểm trung bình`} value={avg === null ? "—" : `${avg.toFixed(1)} / 5 ★`} tone={avg >= 3.5 ? "win" : avg !== null && avg <= 2.5 ? "loss" : ""} />
      </div>
      <div className="chart-row">
        {fields.map((f) => <CategoryPieWithTable key={f.key} label={f.label} trades={trades} fieldKey={f.key} />)}
      </div>
    </div>
  );
}

export function TradeAnalysisPage({ trades, resources }) {
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const closed = closedOf(scoped);
  const closedTrades = closed.map((x) => x.t);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;

  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <Target size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để phân tích chấm điểm.</p>
        </div>
      </div>
    );
  }

  const knowledgeRatings = closed.map((x) => x.t.ratingKnowledge);
  const skillRatings = closed.map((x) => x.t.ratingSkill);
  const riskRatings = closed.map((x) => x.t.ratingRisk);
  const psychRatings = closed.map((x) => x.t.ratingPsychology);
  const avgOf = (arr) => { const r = arr.filter((v) => v > 0); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; };
  const scored = closed.filter((x) => avgPillarScore(x.t) !== null);
  const avgOverall = scored.length ? scored.reduce((s, x) => s + avgPillarScore(x.t), 0) / scored.length : null;

  const byGrade = {}; GRADE_OPTIONS.forEach((g) => (byGrade[g.id] = 0));
  closed.forEach((x) => { if (x.t.tradeGrade && byGrade[x.t.tradeGrade] !== undefined) byGrade[x.t.tradeGrade] += 1; });
  const gradedTotal = GRADE_OPTIONS.reduce((s, g) => s + byGrade[g.id], 0);
  const gradePie = GRADE_OPTIONS.map((g) => ({ name: g.label, value: byGrade[g.id], color: g.tone === "win" ? WIN : LOSS })).filter((d) => d.value > 0);

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Module 1 — Tổng quan 4 trụ cột</h3>
      <div className="stat-grid">
        <StatCard label="Kiến thức" value={avgOf(knowledgeRatings) === null ? "—" : `${avgOf(knowledgeRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Kỹ năng" value={avgOf(skillRatings) === null ? "—" : `${avgOf(skillRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Quản trị vốn" value={avgOf(riskRatings) === null ? "—" : `${avgOf(riskRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Tâm lý" value={avgOf(psychRatings) === null ? "—" : `${avgOf(psychRatings).toFixed(1)} / 5 ★`} />
        <StatCard label="Điểm sao trung bình" value={avgOverall === null ? "—" : `${avgOverall.toFixed(1)} / 5 ★`} tone={avgOverall >= 3.5 ? "win" : avgOverall !== null && avgOverall <= 2.5 ? "loss" : ""} />
      </div>

      <h3 className="block-title">Module 2 — Kiến thức</h3>
      <PillarBreakdown title="Kiến thức" ratings={knowledgeRatings} trades={closedTrades}
        fields={[{ key: "setup", label: "Setup" }, { key: "setupNote", label: "Nhận xét Setup" }]} />

      <h3 className="block-title">Module 3 — Kỹ năng</h3>
      <PillarBreakdown title="Kỹ năng" ratings={skillRatings} trades={closedTrades}
        fields={[{ key: "entrySkill", label: "Vào lệnh" }, { key: "inTradeSkill", label: "Trong lệnh" }, { key: "exitSkill", label: "Thoát lệnh" }]} />

      <h3 className="block-title">Module 4 — Quản trị vốn</h3>
      <PillarBreakdown title="Quản trị vốn" ratings={riskRatings} trades={closedTrades}
        fields={[{ key: "riskAction", label: "Quản trị vốn" }]} />

      <h3 className="block-title">Module 5 — Tâm lý</h3>
      <PillarBreakdown title="Tâm lý" ratings={psychRatings} trades={closedTrades}
        fields={[{ key: "psychology", label: "Tâm lý" }]} />

      <h3 className="block-title">Module 6 — Tỷ trọng đánh giá giao dịch</h3>
      {gradedTotal === 0 ? <p className="empty-note">Chưa có lệnh nào được đánh giá ở mục "Đánh giá giao dịch".</p> : (
        <div className="chart-row">
          <ChartCard title="Đánh giá giao dịch" subtitle={`${gradedTotal} lệnh đã đánh giá`} height={220}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={gradePie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2} label={(d) => `${((d.value / gradedTotal) * 100).toFixed(0)}%`}>
                  {gradePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grade-grid" style={{ alignSelf: "center" }}>
            {GRADE_OPTIONS.map((g) => (
              <div key={g.id} className={`grade-stat ${g.tone}`}>
                <span>{g.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"} {g.label}</span>
                <strong>{byGrade[g.id]} <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({gradedTotal ? ((byGrade[g.id] / gradedTotal) * 100).toFixed(0) : 0}%)</span></strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Analysis({ trades, resources, onViewTrade }) {
  const [tab, setTab] = useState("topbottom");
  const [scope, setScope] = useState("");
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const scoped = trades.filter((t) => (!scope || t.account === scope) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const singleAccount = scope ? resources.accounts.find((a) => a.name === scope) : null;
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={scope} onAccount={setScope} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;
  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <LineChartIcon size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để phân tích.</p>
        </div>
      </div>
    );
  }
  const insights = buildInsights(closed);
  return (
    <div>
      {scopeBar}
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {singleAccount ? `Số liệu hiển thị theo đơn vị tiền tệ của tài khoản "${singleAccount.name}": ${singleAccount.currency}.` : "Đang gộp nhiều tài khoản — số tiền được quy đổi về USD theo tỷ giá cấu hình ở Tài khoản."}
      </p>
      <div className="insight-box">
        <span className="insight-title">🤖 Phân tích tự động</span>
        <ul className="insight-list">{insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
      <div className="subtabs">
        <button className={`subtab ${tab === "topbottom" ? "subtab-active" : ""}`} onClick={() => setTab("topbottom")}>Top / Cuối bảng</button>
        <button className={`subtab ${tab === "rdist" ? "subtab-active" : ""}`} onClick={() => setTab("rdist")}>Phân bố R-multiple</button>
        <button className={`subtab ${tab === "metrics" ? "subtab-active" : ""}`} onClick={() => setTab("metrics")}>Chỉ số nâng cao</button>
      </div>
      {tab === "topbottom" ? <TopBottom closed={closed} /> :
        tab === "rdist" ? <RDistribution closed={closed} resources={resources} onViewTrade={onViewTrade} /> :
        <AdvancedMetrics closed={closed} />}
    </div>
  );
}
