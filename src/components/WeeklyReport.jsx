import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartCard, StatCard, FxWarning } from "./ui.jsx";
import { GRID, LOSS, MUTED, WIN, tooltipCursor, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { fmt, fmtR, periodAccountReport, periodEnd, periodLabel, periodOf, periodRTrend, periodStart, PERIODS, readLocalUi, shiftPeriod, todayStr, weeksOfMonth, writeLocalUi } from "../lib/helpers.js";

const MODES = [PERIODS.week, PERIODS.month];

function rTone(v) {
  return v > 0 ? "text-win" : v < 0 ? "text-loss" : "";
}

// "+2R (thắng 3R | lỗ 1R)" — đúng dạng đọc một phát là hiểu, dùng lại ở cả bảng lẫn thẻ.
function rBreakdown(row) {
  if (!row.rCount) return "chưa lệnh nào ghi rủi ro";
  return `thắng ${row.rWin.toFixed(2)}R · lỗ ${Math.abs(row.rLoss).toFixed(2)}R`;
}

// Tháng dương nhờ đánh đều hay nhờ đúng một tuần gánh? Chỉ nhìn con số tháng thì không biết,
// nên tháng nào cũng xẻ ra từng tuần — và các tuần đã cắt gọn trong tháng nên cộng lại khớp tổng.
function MonthWeeks({ trades, resources, monthStart }) {
  const weeks = useMemo(() => {
    return weeksOfMonth(monthStart).map((w) => {
      const rep = periodAccountReport(trades, resources, w.from, w.to);
      return { ...w, rNet: rep.total.rNet, rCount: rep.total.rCount, count: rep.total.count };
    });
  }, [trades, resources, monthStart]);

  const peak = Math.max(1, ...weeks.map((w) => Math.abs(w.rNet)));

  return (
    <>
      <h4 className="rec-title" style={{ marginTop: 18 }}>Từng tuần trong tháng</h4>
      <div className="week-lines">
        {weeks.map((w) => (
          <div key={w.from} className="week-line">
            <span className="week-line-name">{w.label}</span>
            <span className="mini-bar">
              <span className={`mini-bar-fill ${w.rNet >= 0 ? "is-win" : "is-loss"}`}
                style={{ width: `${(Math.abs(w.rNet) / peak) * 100}%` }} />
            </span>
            <b className={rTone(w.rNet)}>{w.rCount ? fmtR(w.rNet) : "—"}</b>
            <span className="err-note">({w.count} lệnh đóng)</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function WeeklyReportPage({ trades, resources }) {
  const [mode, setMode] = useState(() => (readLocalUi("reportMode", "week") === "month" ? "month" : "week"));
  const [anchor, setAnchor] = useState(() => periodStart(mode, todayStr()));
  const meta = periodOf(mode);
  const to = periodEnd(mode, anchor);
  const thisPeriod = periodStart(mode, todayStr());

  // Đổi tuần ↔ tháng thì giữ nguyên khoảng thời gian đang xem chứ không nhảy về hôm nay:
  // đang soi tuần giữa tháng 3 mà bấm "Tháng" thì phải ra tháng 3, không phải tháng này.
  function switchMode(next) {
    if (next === mode) return;
    setAnchor(periodStart(next, anchor));
    setMode(next);
    writeLocalUi("reportMode", next);
  }

  const report = useMemo(() => periodAccountReport(trades, resources, anchor, to), [trades, resources, anchor, to]);
  const prev = useMemo(() => {
    const from = shiftPeriod(mode, anchor, -1);
    return periodAccountReport(trades, resources, from, periodEnd(mode, from));
  }, [trades, resources, mode, anchor]);
  const trend = useMemo(() => periodRTrend(trades, resources, mode, anchor, meta.trendCount), [trades, resources, mode, anchor, meta.trendCount]);

  const delta = report.total.rNet - prev.total.rNet;
  const prevByAccount = useMemo(() => {
    const m = {};
    prev.rows.forEach((r) => { m[r.account] = r.rNet; });
    return m;
  }, [prev]);

  return (
    <div>
      <div className="seg" style={{ marginBottom: 12, maxWidth: 260 }}>
        {MODES.map((m) => (
          <button key={m.key} type="button" className={`seg-btn ${mode === m.key ? "seg-active" : ""}`}
            onClick={() => switchMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="scope-bar">
        <button type="button" className="btn btn-ghost" onClick={() => setAnchor(shiftPeriod(mode, anchor, -1))}>
          <ChevronLeft size={14} /> {meta.prev}
        </button>
        <span className="week-title">{periodLabel(mode, anchor, to)}</span>
        <button type="button" className="btn btn-ghost" disabled={anchor >= thisPeriod}
          onClick={() => setAnchor(shiftPeriod(mode, anchor, 1))}>
          {meta.next} <ChevronRight size={14} />
        </button>
        {anchor !== thisPeriod ? (
          <button type="button" className="btn btn-ghost" onClick={() => setAnchor(thisPeriod)}>{meta.back}</button>
        ) : <span className="field-hint" style={{ margin: 0 }}>{meta.current}</span>}
      </div>

      <p className="field-hint" style={{ marginBottom: 12 }}>
        Lệnh được xếp vào kỳ theo <b>ngày đóng</b> — đó là lúc kết quả thành hình. {meta.note}
        {" "}R tách thành phần thắng và phần lỗ vì +2R do "thắng 3R lỗ 1R" khác hẳn +2R do "thắng 12R lỗ 10R".
      </p>

      <FxWarning resources={resources} what="Ô Lãi/lỗ quy đổi USD" />

      <div className="stat-grid">
        <StatCard label={`R ròng cả ${meta.noun}`} value={report.total.rCount ? fmtR(report.total.rNet) : "—"}
          tone={report.total.rNet > 0 ? "win" : report.total.rNet < 0 ? "loss" : ""}
          sub={report.total.rCount ? `${fmtR(delta)} ${meta.vsPrev}` : "chưa lệnh nào ghi rủi ro"} />
        <StatCard label="R thắng" value={fmtR(report.total.rWin)} tone="win"
          sub={`${report.total.wins} lệnh thắng`} />
        <StatCard label="R lỗ" value={fmtR(report.total.rLoss)} tone="loss"
          sub={`${report.total.losses} lệnh thua`} />
        <StatCard label={`Lệnh đóng trong ${meta.noun}`} value={report.total.count}
          sub={`${report.opened} lệnh mới mở · ${report.total.rCount}/${report.total.count} lệnh có ghi rủi ro`} />
      </div>

      {report.rows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <CalendarRange size={28} color="var(--text-dim)" />
          <p>{meta.empty}</p>
        </div>
      ) : (
        <>
          <h4 className="rec-title" style={{ marginTop: 18 }}>Từng tài khoản</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tài khoản</th><th>Lệnh</th><th>Winrate</th>
                  <th>R thắng</th><th>R lỗ</th><th>R ròng</th><th>So {meta.noun} trước</th><th>Lãi/lỗ</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => {
                  const d = r.rNet - (prevByAccount[r.account] || 0);
                  return (
                    <tr key={r.account}>
                      <td><b>{r.account}</b></td>
                      <td>{r.count} <span className="err-note">({r.wins} thắng / {r.losses} thua{r.be ? ` / ${r.be} hòa` : ""})</span></td>
                      <td>{r.winRate === null ? "—" : `${r.winRate.toFixed(0)}%`}</td>
                      <td className="text-win">{r.rCount ? fmtR(r.rWin) : "—"}</td>
                      <td className="text-loss">{r.rCount ? fmtR(r.rLoss) : "—"}</td>
                      <td className={rTone(r.rNet)}><b>{r.rCount ? fmtR(r.rNet) : "—"}</b></td>
                      <td className={rTone(d)}>{r.rCount ? fmtR(d) : "—"}</td>
                      <td className={rTone(r.profit)}>{fmt(r.profit)} {r.currency}</td>
                    </tr>
                  );
                })}
                <tr className="week-total-row">
                  <td><b>Tổng</b></td>
                  <td>{report.total.count}</td>
                  <td>{report.total.winRate === null ? "—" : `${report.total.winRate.toFixed(0)}%`}</td>
                  <td className="text-win">{fmtR(report.total.rWin)}</td>
                  <td className="text-loss">{fmtR(report.total.rLoss)}</td>
                  <td className={rTone(report.total.rNet)}><b>{fmtR(report.total.rNet)}</b></td>
                  <td className={rTone(delta)}>{fmtR(delta)}</td>
                  <td className={rTone(report.total.profit)}>{fmt(report.total.profit)} USD</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="week-lines">
            {report.rows.map((r) => (
              <div key={r.account} className="week-line">
                <span className="week-line-name">{r.account}</span>
                <b className={rTone(r.rNet)}>{r.rCount ? fmtR(r.rNet) : "—"}</b>
                <span className="err-note">({rBreakdown(r)})</span>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "month" && report.rows.length > 0
        ? <MonthWeeks trades={trades} resources={resources} monthStart={anchor} /> : null}

      <ChartCard title={`R ròng ${meta.trendTitle}`} subtitle={`Cột sáng là ${meta.noun} đang xem`} height={220}>
        <ResponsiveContainer>
          <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis tick={{ fontSize: 10, fill: MUTED }} width={44} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={tooltipCursor}
              formatter={(v, _n, p) => [`${fmtR(v)} · ${p.payload.count} lệnh`, "R ròng"]} />
            <Bar dataKey="rNet" radius={[3, 3, 0, 0]}>
              {trend.map((w) => (
                <Cell key={w.from} fill={w.rNet >= 0 ? WIN : LOSS} fillOpacity={w.from === anchor ? 1 : 0.42} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
