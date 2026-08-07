import { useState, useEffect, useMemo } from "react";
import { LayoutDashboard, ChevronLeft } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { ACCENT, DIM_CONFIG, DRILL_DIMS, GRADE_OPTIONS, GRID, LOSS, MUTED, RANGE_OPTIONS, R_BUCKETS, WEEKDAY_LABEL, WEEKDAY_ORDER, WIN, tooltipCursor, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { ChartCard, StatCard } from "./ui.jsx";
import { JournalTable } from "./Journal.jsx";
import { avgPillarScore, closedOf, closedOfUSD, computeAdvancedMetrics, dateKey, fmt, fmtHold, fmtMoney, fmtR, groupStats, heatColor, inRange, keyForDim, monthKey, weekdayIndex } from "../lib/helpers.js";

function renderPieSliceLabel(total) {
  return ({ cx, cy, midAngle, outerRadius, value }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 16;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="var(--text)" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${((value / total) * 100).toFixed(0)}%`}
      </text>
    );
  };
}

export function DashboardFilters({ resources, account, onAccount, range, onRange, rangeFrom, rangeTo, onRangeFrom, onRangeTo }) {
  return (
    <div className="scope-bar">
      {resources.accounts.length > 0 ? (
        <>
          <span className="field-label" style={{ marginRight: 4 }}>Tài khoản:</span>
          <select className="input" style={{ maxWidth: 200 }} value={account} onChange={(e) => onAccount(e.target.value)}>
            <option value="">Tất cả tài khoản</option>
            {resources.accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </>
      ) : null}
      <span className="field-label" style={{ marginRight: 4, marginLeft: resources.accounts.length ? 14 : 0 }}>Thời gian:</span>
      <select className="input" style={{ maxWidth: 180 }} value={range} onChange={(e) => onRange(e.target.value)}>
        {RANGE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {range === "custom" ? (
        <>
          <span className="field-label" style={{ marginLeft: 4 }}>Từ ngày:</span>
          <input type="date" className="input" style={{ maxWidth: 160 }} value={rangeFrom} onChange={(e) => onRangeFrom(e.target.value)} />
          <span className="field-label">Đến ngày:</span>
          <input type="date" className="input" style={{ maxWidth: 160 }} value={rangeTo} onChange={(e) => onRangeTo(e.target.value)} />
        </>
      ) : null}
    </div>
  );
}

export function Dashboard({ trades, resources, account, onAccountChange, onViewTrade }) {
  const [range, setRange] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const scoped = trades.filter((t) => (!account || t.account === account) && inRange(dateKey(t) || t.entryDate, range, rangeFrom, rangeTo));
  const singleAccount = account ? resources.accounts.find((a) => a.name === account) : null;
  const currencyUnit = singleAccount ? singleAccount.currency : "USD";
  const closed = singleAccount ? closedOf(scoped) : closedOfUSD(scoped, resources);
  const scopeBar = <DashboardFilters resources={resources} account={account} onAccount={onAccountChange} range={range} onRange={setRange} rangeFrom={rangeFrom} rangeTo={rangeTo} onRangeFrom={setRangeFrom} onRangeTo={setRangeTo} />;
  if (closed.length === 0) {
    return (
      <div>
        {scopeBar}
        <div className="empty-state">
          <LayoutDashboard size={28} color="var(--text-dim)" />
          <p>Chưa có lệnh đã đóng để hiển thị tổng quan. Đóng vài lệnh rồi quay lại đây.</p>
        </div>
      </div>
    );
  }
  const sorted = [...closed].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
  let cum = 0;
  const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });

  const wins = closed.filter((x) => x.r.outcome === "win").length;
  const losses = closed.filter((x) => x.r.outcome === "loss").length;
  const be = closed.filter((x) => x.r.outcome === "be").length;
  const winRate = (wins / closed.length) * 100;
  const totalR = closed.reduce((s, x) => s + (x.r.rr || 0), 0);
  const totalPnl = closed.reduce((s, x) => s + x.r.profit, 0);
  const pieData = [{ name: "Thắng", value: wins, color: WIN }, { name: "Thua", value: losses, color: LOSS }, { name: "Hòa", value: be, color: MUTED }].filter((d) => d.value > 0);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0) || 1;
  const pieLegend = pieData.map((d) => ({ color: d.color, label: `${d.name} ${d.value} (${((d.value / pieTotal) * 100).toFixed(0)}%)` }));

  const scored = closed.filter((x) => avgPillarScore(x.t) !== null);
  const avgScoreAll = scored.length ? scored.reduce((s, x) => s + avgPillarScore(x.t), 0) / scored.length : null;
  const lowScoreTrades = scored.filter((x) => avgPillarScore(x.t) <= 2).map((x) => x.t);

  const byMonth = groupStats(closed, (t) => monthKey(dateKey(t)));
  const monthKeys = Object.keys(byMonth).sort();
  const pnlByMonth = monthKeys.map((k) => ({ month: k, pnl: Number(byMonth[k].pnl.toFixed(2)) }));
  const countByMonth = monthKeys.map((k) => ({ month: k, count: byMonth[k].count }));

  const bySession = groupStats(closed, (t) => t.session);
  const sessionData = Object.entries(bySession).map(([name, s]) => ({ name, pnl: Number(s.pnl.toFixed(2)) }));

  const bySymbol = groupStats(closed, (t) => t.symbol);
  const topSymbols = Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 6).map(([name, s]) => ({ name, pnl: Number(s.pnl.toFixed(2)) }));

  const violations = closed.filter((x) => x.t.ratingRisk > 0 && x.t.ratingRisk <= 2).length;
  const compliant = closed.filter((x) => x.t.ratingRisk >= 4).length;
  const rated = closed.filter((x) => x.t.ratingRisk > 0).length;

  const byWeekday = {};
  closed.forEach((x) => {
    // Theo ngày mở lệnh (entryDate), khác với PnL theo tháng vốn tính theo ngày đóng — winrate theo thứ phục vụ quyết định vào lệnh.
    const wd = weekdayIndex(x.t.entryDate);
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { pnl: 0, count: 0, wins: 0 };
    byWeekday[wd].pnl += x.r.profit; byWeekday[wd].count += 1;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const maxWeekdayAbs = Math.max(1, ...Object.values(byWeekday).map((v) => Math.abs(v.pnl)));

  const byGrade = {}; GRADE_OPTIONS.forEach((g) => (byGrade[g.id] = 0));
  closed.forEach((x) => { if (x.t.tradeGrade && byGrade[x.t.tradeGrade] !== undefined) byGrade[x.t.tradeGrade] += 1; });

  const m = computeAdvancedMetrics(closed);
  const expectancy = totalPnl / closed.length;

  return (
    <div>
      {scopeBar}
      <h3 className="block-title" style={{ marginTop: 0 }}>Chỉ số quan trọng</h3>
      <p className="field-hint" style={{ marginBottom: 10, marginTop: 4 }}>
        {singleAccount ? `Số liệu hiển thị theo đơn vị tiền tệ của tài khoản "${singleAccount.name}": ${currencyUnit}.` : "Đang gộp nhiều tài khoản — số tiền được quy đổi về USD theo tỷ giá cấu hình ở Tài khoản để cộng được giữa các đơn vị tiền tệ khác nhau."}
      </p>
      <div className="stat-grid">
        <StatCard label="Net Profit" value={fmtMoney(m.netProfit, currencyUnit)} tone={m.netProfit >= 0 ? "win" : "loss"} />
        <StatCard label="Net Profit (R)" value={fmtR(m.netProfitR)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
        <StatCard label="Max Drawdown" value={fmtMoney(m.maxDD, currencyUnit)} tone="loss" />
        <StatCard label="Max Drawdown (R)" value={m.maxDDR ? `${m.maxDDR.toFixed(2)}R` : "—"} tone="loss" />
        <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        <StatCard label="Kỳ vọng trung bình / lệnh" value={fmtMoney(expectancy, currencyUnit)} tone={expectancy >= 0 ? "win" : "loss"} />
        <StatCard label="Kỳ vọng trung bình / lệnh (R)" value={fmtR(m.netProfitR / closed.length)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chi tiết 1 — Tổng quan lệnh</h3>
      <div className="stat-grid">
        <StatCard label="Tổng lệnh đã đóng" value={closed.length} />
        <StatCard label="Thắng / Thua / Hòa" value={`${wins} / ${losses} / ${be}`} />
        <StatCard label="Tỷ lệ thắng" value={`${winRate.toFixed(1)}%`} tone={winRate >= 50 ? "win" : "loss"} />
        <StatCard label="RR trung bình / lệnh (theo tiền)" value={m.avgLoss ? (m.avgWin / Math.abs(m.avgLoss)).toFixed(2) : "—"} tone={m.avgWin >= Math.abs(m.avgLoss) ? "win" : "loss"} />
        <StatCard label="RR trung bình / lệnh (theo R)" value={m.avgLossR ? (m.avgWinR / Math.abs(m.avgLossR)).toFixed(2) : "—"} tone={m.avgWinR >= Math.abs(m.avgLossR) ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chi tiết 2 — Lãi / Lỗ</h3>
      <div className="stat-grid">
        <StatCard label="Tổng lãi/lỗ (theo tiền)" value={fmtMoney(totalPnl, currencyUnit)} tone={totalPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Tổng lãi/lỗ (theo R)" value={`${totalR > 0 ? "+" : ""}${totalR.toFixed(2)}R`} tone={totalR >= 0 ? "win" : "loss"} />
        <StatCard label="Tổng lời" value={fmtMoney(m.grossWin, currencyUnit)} tone="win" />
        <StatCard label="Tổng lỗ" value={fmtMoney(m.grossLoss, currencyUnit)} tone="loss" />
        <StatCard label="Lãi TB / lệnh thắng" value={fmtMoney(m.avgWin, currencyUnit)} tone="win" />
        <StatCard label="Lỗ TB / lệnh thua" value={fmtMoney(m.avgLoss, currencyUnit)} tone="loss" />
      </div>

      <h3 className="block-title">Chi tiết 3 — Kỷ lục & thời gian giữ lệnh</h3>
      <div className="stat-grid">
        <StatCard label="Lệnh thắng lớn nhất" value={fmtMoney(m.largestWin, currencyUnit)} tone="win" />
        <StatCard label="Lệnh thua lớn nhất" value={fmtMoney(m.largestLoss, currencyUnit)} tone="loss" />
        <StatCard label="Chuỗi thắng dài nhất" value={m.maxWinStreak} tone="win" />
        <StatCard label="Chuỗi thua dài nhất" value={m.maxLossStreak} tone="loss" />
        <StatCard label="TG giữ lệnh TB (thắng)" value={fmtHold(m.avgHoldWin)} />
        <StatCard label="TG giữ lệnh TB (thua)" value={fmtHold(m.avgHoldLoss)} />
      </div>

      <h3 className="block-title">Chi tiết 4 — Long / Short</h3>
      <div className="stat-grid">
        <StatCard label="Số lệnh Long" value={m.longsCount} />
        <StatCard label="Số lệnh Short" value={m.shortsCount} />
        <StatCard label="Winrate Long" value={m.longWinrate === null ? "—" : `${m.longWinrate.toFixed(1)}%`} tone={m.longWinrate >= 50 ? "win" : "loss"} />
        <StatCard label="Winrate Short" value={m.shortWinrate === null ? "—" : `${m.shortWinrate.toFixed(1)}%`} tone={m.shortWinrate >= 50 ? "win" : "loss"} />
        <StatCard label="Net Profit lệnh Long" value={fmtMoney(m.longsPnl, currencyUnit)} tone={m.longsPnl >= 0 ? "win" : "loss"} />
        <StatCard label="Net Profit lệnh Short" value={fmtMoney(m.shortsPnl, currencyUnit)} tone={m.shortsPnl >= 0 ? "win" : "loss"} />
      </div>

      <h3 className="block-title">Chấm điểm trung bình (4 trụ cột)</h3>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        <StatCard label="Chấm điểm trung bình (4 trụ cột)" value={avgScoreAll === null ? "—" : `${avgScoreAll.toFixed(1)} / 5 ★`} tone={avgScoreAll >= 3.5 ? "win" : avgScoreAll !== null && avgScoreAll <= 2.5 ? "loss" : ""} />
      </div>

      <div className="chart-row">
        <ChartCard title="Đường cong vốn" subtitle="Lãi/lỗ cộng dồn theo thời gian">
          <ResponsiveContainer>
            <LineChart data={equityData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} padding={{ left: 20, right: 20 }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Thắng / Thua" subtitle={`${wins} thắng · ${losses} thua · ${be} hòa`} legend={pieLegend}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}
                label={renderPieSliceLabel(pieTotal)} labelLine={{ stroke: "var(--border)" }}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-row">
        <ChartCard title="Lãi/Lỗ theo tháng" legend={[{ color: WIN, label: "Lãi" }, { color: LOSS, label: "Lỗ" }]}>
          <ResponsiveContainer>
            <BarChart data={pnlByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="pnl" maxBarSize={64}>{pnlByMonth.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tần suất giao dịch theo tháng" legend={[{ color: ACCENT, label: "Số lệnh" }]}>
          <ResponsiveContainer>
            <BarChart data={countByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="count" fill={ACCENT} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="chart-row">
        <ChartCard title="Theo phiên giao dịch" legend={[{ color: WIN, label: "Lãi" }, { color: LOSS, label: "Lỗ" }]}>
          <ResponsiveContainer>
            <BarChart data={sessionData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: MUTED }} width={110} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="pnl" maxBarSize={28}>{sessionData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Top cặp tiền theo lãi/lỗ" legend={[{ color: WIN, label: "Lãi" }, { color: LOSS, label: "Lỗ" }]}>
          <ResponsiveContainer>
            <BarChart data={topSymbols} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: MUTED }} width={80} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="pnl" maxBarSize={28}>{topSymbols.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h3 className="block-title">Kỷ luật quản lý rủi ro</h3>
      <p className="field-hint" style={{ marginBottom: 10 }}>Dựa trên sao tự đánh giá "Quản trị vốn" ở mỗi lệnh — 4-5 sao coi là tuân thủ, 1-2 sao coi là vi phạm.</p>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 24 }}>
        <StatCard label="Lệnh đã tự chấm điểm" value={rated} />
        <StatCard label="Tuân thủ (4-5 sao)" value={compliant} tone="win" />
        <StatCard label="Vi phạm (1-2 sao)" value={violations} tone="loss" />
      </div>

      <h3 className="block-title">Đánh giá giao dịch</h3>
      <div className="grade-grid" style={{ marginBottom: 24 }}>
        {GRADE_OPTIONS.map((g) => (
          <div key={g.id} className={`grade-stat ${g.tone}`}>
            <span>{g.tone === "win" ? "\ud83d\udc4d" : "\u2620\ufe0f"} {g.label}</span>
            <strong>{byGrade[g.id]}</strong>
          </div>
        ))}
      </div>

      {lowScoreTrades.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <h3 className="block-title">Lệnh chấm điểm thấp (≤ 2 sao) — cần xem lại</h3>
          <JournalTable trades={lowScoreTrades} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
        </div>
      ) : null}

      <h3 className="block-title">Bản đồ nhiệt theo thứ trong tuần</h3>
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

      <h3 className="block-title">Bản đồ nhiệt theo tháng</h3>
      <div className="heat-strip">
        {monthKeys.map((k) => (
          <div key={k} className="heat-cell" style={{ background: heatColor(byMonth[k].pnl, Math.max(1, ...monthKeys.map((x) => Math.abs(byMonth[x].pnl)))) }}>
            <span className="heat-label">{k}</span>
            <span className={`heat-value ${byMonth[k].pnl >= 0 ? "text-win" : "text-loss"}`}>{fmt(byMonth[k].pnl)}</span>
            <span className="heat-sub">{byMonth[k].count} lệnh</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RankTable({ title, rows, tone }) {
  return (
    <div>
      <h4 className="rank-title">{title}</h4>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Tên</th><th>Số lệnh</th><th>Tỷ lệ thắng</th><th>Tổng R</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="empty-note">Chưa đủ dữ liệu.</td></tr> : rows.map(([name, s]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="mono">{s.count}</td>
                <td className="mono">{((s.wins / s.count) * 100).toFixed(0)}%</td>
                <td className={`mono ${s.totalR >= 0 ? "text-win" : "text-loss"}`}>{s.totalR > 0 ? "+" : ""}{s.totalR.toFixed(2)}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopBottom({ closed }) {
  const bySetup = groupStats(closed, (t) => t.setup || "Chưa gắn setup");
  const bySymbol = groupStats(closed, (t) => t.symbol);
  const setupEntries = Object.entries(bySetup).filter(([, s]) => s.count >= 1);
  const symbolEntries = Object.entries(bySymbol).filter(([, s]) => s.count >= 1);
  const topSetup = [...setupEntries].sort((a, b) => b[1].totalR - a[1].totalR).slice(0, 5);
  const botSetup = [...setupEntries].sort((a, b) => a[1].totalR - b[1].totalR).slice(0, 5);
  const topSymbol = [...symbolEntries].sort((a, b) => b[1].totalR - a[1].totalR).slice(0, 5);
  const botSymbol = [...symbolEntries].sort((a, b) => a[1].totalR - b[1].totalR).slice(0, 5);
  return (
    <div>
      <div className="chart-row">
        <RankTable title="Top 5 Setup tốt nhất" rows={topSetup} />
        <RankTable title="Top 5 Setup kém nhất" rows={botSetup} />
      </div>
      <div className="chart-row">
        <RankTable title="Cặp tiền tốt nhất" rows={topSymbol} />
        <RankTable title="Cặp tiền kém nhất" rows={botSymbol} />
      </div>
    </div>
  );
}

export function RDistribution({ closed, resources, onViewTrade }) {
  const withR = closed.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const buckets = R_BUCKETS.map((b) => {
    const items = withR.filter((x) => x.r.rr > b.min && x.r.rr <= b.max);
    return {
      label: b.label,
      count: items.length,
      pct: withR.length ? (items.length / withR.length) * 100 : 0,
      totalR: items.reduce((s, x) => s + x.r.rr, 0),
      tone: b.max <= 0 ? "loss" : b.min >= 0 ? "win" : "neutral",
    };
  });
  const avg = withR.length ? withR.reduce((s, x) => s + x.r.rr, 0) / withR.length : 0;
  const variance = withR.length ? withR.reduce((s, x) => s + Math.pow(x.r.rr - avg, 2), 0) / withR.length : 0;
  const stdev = Math.sqrt(variance);
  const outliers = withR.filter((x) => Math.abs(x.r.rr - avg) > 2 * stdev);

  if (withR.length === 0) return <p className="empty-note">Chưa có lệnh nào có đủ dữ liệu Risk & Lãi/Lỗ để tính R-multiple.</p>;

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <StatCard label="R trung bình" value={`${avg.toFixed(2)}R`} tone={avg >= 0 ? "win" : "loss"} />
        <StatCard label="Độ lệch chuẩn" value={`${stdev.toFixed(2)}R`} />
        <StatCard label="Số lệnh outlier (>2σ)" value={outliers.length} />
      </div>
      <ChartCard title="Phân bố theo R-multiple" height={260} legend={[{ color: WIN, label: "Lãi" }, { color: LOSS, label: "Lỗ" }, { color: MUTED, label: "Hòa" }]}>
        <ResponsiveContainer>
          <BarChart data={buckets}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={36} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
            <Bar dataKey="count" maxBarSize={48}>{buckets.map((b, i) => <Cell key={i} fill={b.tone === "win" ? WIN : b.tone === "loss" ? LOSS : MUTED} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <h4 className="rank-title" style={{ marginTop: 16 }}>Tỷ trọng theo mốc R</h4>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Khoảng R</th><th>Số lệnh</th><th>Tỷ trọng</th><th>Tổng R</th></tr></thead>
          <tbody>
            {buckets.filter((b) => b.count > 0).map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td className="mono">{b.count}</td>
                <td className="mono">{b.pct.toFixed(1)}%</td>
                <td className={`mono ${b.totalR >= 0 ? "text-win" : "text-loss"}`}>{b.totalR > 0 ? "+" : ""}{b.totalR.toFixed(2)}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {outliers.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h4 className="rank-title">Lệnh outlier</h4>
          <JournalTable trades={outliers.map((x) => x.t)} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
        </div>
      ) : null}
    </div>
  );
}

export function PerformanceDrilldown({ closed }) {
  const [dim, setDim] = useState("symbol");
  const [selected, setSelected] = useState("");
  useEffect(() => setSelected(""), [dim]);

  const groups = groupStats(closed, (t) => keyForDim(t, dim));
  const entries = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);

  if (selected) {
    const items = closed.filter((x) => keyForDim(x.t, dim) === selected);
    const sorted = [...items].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
    let cum = 0;
    const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });
    const wins = items.filter((x) => x.r.outcome === "win").length;
    const s = groups[selected];
    return (
      <div>
        <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> Tất cả {DRILL_DIMS.find((d) => d.key === dim).label.toLowerCase()}</button>
        <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
          <StatCard label="Số lệnh" value={s.count} />
          <StatCard label="Tỷ lệ thắng" value={`${((wins / s.count) * 100).toFixed(0)}%`} tone={wins / s.count >= 0.5 ? "win" : "loss"} />
          <StatCard label="Tổng R" value={`${s.totalR.toFixed(2)}R`} tone={s.totalR >= 0 ? "win" : "loss"} />
          <StatCard label="Tổng lãi/lỗ" value={fmt(s.pnl)} tone={s.pnl >= 0 ? "win" : "loss"} />
        </div>
        <ChartCard title="Đường cong vốn riêng" height={200}>
          <ResponsiveContainer>
            <LineChart data={equityData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} padding={{ left: 20, right: 20 }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <h4 className="rank-title" style={{ marginTop: 18 }}>Lịch sử giao dịch</h4>
        <JournalTable trades={items.map((x) => x.t)} onEdit={() => {}} onDelete={() => {}} />
      </div>
    );
  }

  return (
    <div>
      <div className="subtabs">
        {DRILL_DIMS.map((d) => <button key={d.key} className={`subtab ${dim === d.key ? "subtab-active" : ""}`} onClick={() => setDim(d.key)}>{d.label}</button>)}
      </div>
      <div className="resource-list">
        {entries.length === 0 ? <p className="empty-note">Chưa có dữ liệu.</p> : null}
        {entries.map(([name, s]) => (
          <button type="button" key={name} className="drill-row" onClick={() => setSelected(name)}>
            <span className="drill-name">{name}</span>
            <span className="drill-stats">
              <span className="mono">{s.count} lệnh</span>
              <span className="mono">{((s.wins / s.count) * 100).toFixed(0)}% thắng</span>
              <span className={`mono ${s.totalR >= 0 ? "text-win" : "text-loss"}`}>{s.totalR > 0 ? "+" : ""}{s.totalR.toFixed(2)}R</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdvancedMetrics({ closed, currency = "USD" }) {
  const m = computeAdvancedMetrics(closed);
  return (
    <div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lợi nhuận</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <StatCard label="Net Profit (tiền)" value={fmtMoney(m.netProfit, currency)} tone={m.netProfit >= 0 ? "win" : "loss"} />
          <StatCard label="Net Profit (R)" value={fmtR(m.netProfitR)} tone={m.netProfitR >= 0 ? "win" : "loss"} />
          <StatCard label="Profit Factor" value={Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} tone={m.profitFactor >= 1 ? "win" : "loss"} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Winrate · RR trung bình · Kỳ vọng</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
          <StatCard label="Winrate" value={m.winRate === null ? "—" : `${m.winRate.toFixed(1)}%`} tone={m.winRate >= 50 ? "win" : "loss"} />
          <StatCard label="RR trung bình / lệnh (theo tiền)" value={m.rrRatioMoney === null ? "—" : m.rrRatioMoney.toFixed(2)} tone={m.rrRatioMoney >= 1 ? "win" : "loss"} />
          <StatCard label="RR trung bình / lệnh (theo R)" value={m.rrRatioR === null ? "—" : m.rrRatioR.toFixed(2)} tone={m.rrRatioR >= 1 ? "win" : "loss"} />
          <StatCard label="Kỳ vọng trung bình / lệnh ($)" value={fmtMoney(m.expectancyMoney, currency)} tone={m.expectancyMoney >= 0 ? "win" : "loss"} />
          <StatCard label="Kỳ vọng trung bình / lệnh (R)" value={fmtR(m.expectancyR)} tone={m.expectancyR >= 0 ? "win" : "loss"} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Max Drawdown</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Max DD (tiền)" value={fmtMoney(m.maxDD, currency)} tone="loss" />
          <StatCard label="Max DD (R)" value={m.maxDDR ? `${m.maxDDR.toFixed(2)}R` : "—"} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Tổng lời / lỗ</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Tổng lời" value={fmtMoney(m.grossWin, currency)} tone="win" />
          <StatCard label="Tổng lỗ" value={fmtMoney(m.grossLoss, currency)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lãi trung bình</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lãi TB (tiền)" value={fmtMoney(m.avgWin, currency)} tone="win" />
          <StatCard label="Lãi TB (R)" value={fmtR(m.avgWinR)} tone="win" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lỗ trung bình</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lỗ TB (tiền)" value={fmtMoney(m.avgLoss, currency)} tone="loss" />
          <StatCard label="Lỗ TB (R)" value={fmtR(m.avgLossR)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lãi lớn nhất</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lãi lớn nhất (tiền)" value={fmtMoney(m.largestWin, currency)} tone="win" />
          <StatCard label="Lãi lớn nhất (R)" value={fmtR(m.largestWinR)} tone="win" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Lỗ lớn nhất</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lỗ lớn nhất (tiền)" value={fmtMoney(m.largestLoss, currency)} tone="loss" />
          <StatCard label="Lỗ lớn nhất (R)" value={fmtR(m.largestLossR)} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Chuỗi thắng / thua</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Chuỗi thắng dài nhất" value={m.maxWinStreak} tone="win" />
          <StatCard label="Chuỗi thua dài nhất" value={m.maxLossStreak} tone="loss" />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Thời gian giữ lệnh trung bình</h4>
        <p className="field-hint" style={{ marginBottom: 10 }}>Tính theo ngày entry → ngày exit (chỉ có ngày, không có giờ, nên đây là ước lượng).</p>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <StatCard label="Lệnh thắng" value={fmtHold(m.avgHoldWin)} />
          <StatCard label="Lệnh thua" value={fmtHold(m.avgHoldLoss)} />
        </div>
      </div>
      <div className="metric-group">
        <h4 className="metric-group-title">Long / Short</h4>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <StatCard label="Số lệnh Long" value={m.longsCount} />
          <StatCard label="Winrate Long" value={m.longWinrate === null ? "—" : `${m.longWinrate.toFixed(1)}%`} tone={m.longWinrate >= 50 ? "win" : "loss"} />
          <StatCard label="Net Profit Long" value={fmtMoney(m.longsPnl, currency)} tone={m.longsPnl >= 0 ? "win" : "loss"} />
          <StatCard label="Số lệnh Short" value={m.shortsCount} />
          <StatCard label="Winrate Short" value={m.shortWinrate === null ? "—" : `${m.shortWinrate.toFixed(1)}%`} tone={m.shortWinrate >= 50 ? "win" : "loss"} />
          <StatCard label="Net Profit Short" value={fmtMoney(m.shortsPnl, currency)} tone={m.shortsPnl >= 0 ? "win" : "loss"} />
        </div>
      </div>
    </div>
  );
}

export function DimensionPerformance({ trades, resources, dimension, onViewTrade }) {
  const [selected, setSelected] = useState("");
  const cfg = DIM_CONFIG[dimension];
  const allItems = useMemo(() => cfg.allItems(trades, resources), [trades, resources, dimension]);
  const closedUSD = closedOfUSD(trades, resources);
  const quickStats = useMemo(() => {
    const out = {};
    allItems.forEach((s) => { out[s] = { count: 0, pnl: 0, wins: 0, totalR: 0 }; });
    closedUSD.forEach((x) => {
      const key = keyForDim(x.t, dimension);
      if (!out[key]) out[key] = { count: 0, pnl: 0, wins: 0, totalR: 0 };
      out[key].count += 1;
      out[key].pnl += x.r.profit;
      if (x.r.outcome === "win") out[key].wins += 1;
      if (x.r.rr !== null && Number.isFinite(x.r.rr)) out[key].totalR += x.r.rr;
    });
    return out;
  }, [allItems, closedUSD, dimension]);

  if (selected) {
    const items = closedUSD.filter((x) => keyForDim(x.t, dimension) === selected);
    if (items.length === 0) {
      return (
        <div>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> {cfg.backLabel}</button>
          <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
          <p className="empty-note">Chưa có giao dịch nào.</p>
        </div>
      );
    }
    const sorted = [...items].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
    let cum = 0;
    const equityData = sorted.map((x) => { cum += x.r.profit; return { date: dateKey(x.t), equity: Number(cum.toFixed(2)) }; });
    const wins = items.filter((x) => x.r.outcome === "win").length;
    const losses = items.filter((x) => x.r.outcome === "loss").length;
    const be = items.filter((x) => x.r.outcome === "be").length;
    const pieData = [{ name: "Thắng", value: wins, color: WIN }, { name: "Thua", value: losses, color: LOSS }, { name: "Hòa", value: be, color: MUTED }].filter((d) => d.value > 0);
    const pieTotal = pieData.reduce((s, d) => s + d.value, 0) || 1;
    const pieLegend = pieData.map((d) => ({ color: d.color, label: `${d.name} ${d.value} (${((d.value / pieTotal) * 100).toFixed(0)}%)` }));
    const byMonth = groupStats(items, (t) => monthKey(dateKey(t)));
    const monthKeys = Object.keys(byMonth).sort();
    const pnlByMonth = monthKeys.map((k) => ({ month: k, pnl: Number(byMonth[k].pnl.toFixed(2)) }));
    const otherDim = dimension === "setup" ? "symbol" : "setup";
    const byOther = groupStats(items, (t) => keyForDim(t, otherDim) || "—");
    const otherEntries = Object.entries(byOther);
    const bestOther = otherEntries.length ? [...otherEntries].sort((a, b) => b[1].pnl - a[1].pnl)[0] : null;
    const worstOther = otherEntries.length ? [...otherEntries].sort((a, b) => a[1].pnl - b[1].pnl)[0] : null;
    const otherLabel = otherDim === "setup" ? "Setup" : "Symbol";

    return (
      <div>
        <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected("")}><ChevronLeft size={14} /> {cfg.backLabel}</button>
        <h3 className="block-title" style={{ marginTop: 0 }}>{selected}</h3>
        <AdvancedMetrics closed={items} />
        <div className="chart-row">
          <ChartCard title="Đường cong vốn riêng" height={220}>
            <ResponsiveContainer>
              <LineChart data={equityData}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} padding={{ left: 20, right: 20 }} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Line type="monotone" dataKey="equity" stroke={ACCENT} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Thắng / Thua" legend={pieLegend}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}
                  label={renderPieSliceLabel(pieTotal)} labelLine={{ stroke: "var(--border)" }}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Hiệu suất theo tháng" height={200} legend={[{ color: WIN, label: "Lãi" }, { color: LOSS, label: "Lỗ" }]}>
          <ResponsiveContainer>
            <BarChart data={pnlByMonth}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis tick={{ fontSize: 10, fill: MUTED }} width={46} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor} />
              <Bar dataKey="pnl" maxBarSize={64}>{pnlByMonth.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? WIN : LOSS} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {bestOther ? (
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginTop: 18 }}>
            <StatCard label={`${otherLabel} tốt nhất: ${bestOther[0]}`} value={fmt(bestOther[1].pnl)} tone={bestOther[1].pnl >= 0 ? "win" : "loss"} />
            <StatCard label={`${otherLabel} kém nhất: ${worstOther[0]}`} value={fmt(worstOther[1].pnl)} tone={worstOther[1].pnl >= 0 ? "win" : "loss"} />
          </div>
        ) : null}
        <h4 className="rank-title" style={{ marginTop: 18 }}>Lịch sử giao dịch</h4>
        <JournalTable trades={items.map((x) => x.t)} resources={resources} onEdit={onViewTrade || (() => {})} onDelete={() => {}} />
      </div>
    );
  }

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Bấm vào một thẻ để xem phân tích sâu.</p>
      <div className="account-card-grid account-card-grid-lg">
        {allItems.map((s) => {
          const q = quickStats[s] || { count: 0, pnl: 0, wins: 0, totalR: 0 };
          return (
            <button type="button" key={s} className="account-card" onClick={() => setSelected(s)}>
              <div className="account-card-head"><strong>{s}</strong></div>
              {q.count === 0 ? (
                <span className="empty-note">Chưa có giao dịch</span>
              ) : (
                <>
                  <div className={`account-card-balance ${q.pnl >= 0 ? "text-win" : "text-loss"}`} style={{ fontSize: 19 }}>
                    {fmtMoney(q.pnl, "USD")}
                  </div>
                  <div className="account-card-rows">
                    <div><span>Số lệnh</span><span className="mono">{q.count}</span></div>
                    <div><span>Winrate</span><span className="mono">{((q.wins / q.count) * 100).toFixed(1)}%</span></div>
                    <div><span>Kỳ vọng TB / lệnh (R)</span><span className="mono">{fmtR(q.totalR / q.count)}</span></div>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
