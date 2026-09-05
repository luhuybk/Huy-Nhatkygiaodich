import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartCard, StatCard, FxWarning } from "./ui.jsx";
import { GRID, LOSS, MUTED, WIN, tooltipCursor, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { fmt, fmtR, shiftDate, todayStr, weekLabel, weeklyAccountReport, weeklyRTrend, weekStart } from "../lib/helpers.js";

const TREND_WEEKS = 8;

function rTone(v) {
  return v > 0 ? "text-win" : v < 0 ? "text-loss" : "";
}

// "+2R (thắng 3R | lỗ 1R)" — đúng dạng đọc một phát là hiểu, dùng lại ở cả bảng lẫn thẻ.
function rBreakdown(row) {
  if (!row.rCount) return "chưa lệnh nào ghi rủi ro";
  return `thắng ${row.rWin.toFixed(2)}R · lỗ ${Math.abs(row.rLoss).toFixed(2)}R`;
}

export function WeeklyReportPage({ trades, resources }) {
  const [anchor, setAnchor] = useState(() => weekStart(todayStr()));
  const to = shiftDate(anchor, 6);
  const thisWeek = weekStart(todayStr());

  const report = useMemo(() => weeklyAccountReport(trades, resources, anchor, to), [trades, resources, anchor, to]);
  const prev = useMemo(() => {
    const from = shiftDate(anchor, -7);
    return weeklyAccountReport(trades, resources, from, shiftDate(from, 6));
  }, [trades, resources, anchor]);
  const trend = useMemo(() => weeklyRTrend(trades, resources, anchor, TREND_WEEKS), [trades, resources, anchor]);

  const delta = report.total.rNet - prev.total.rNet;
  const prevByAccount = useMemo(() => {
    const m = {};
    prev.rows.forEach((r) => { m[r.account] = r.rNet; });
    return m;
  }, [prev]);

  return (
    <div>
      <div className="scope-bar">
        <button type="button" className="btn btn-ghost" onClick={() => setAnchor(shiftDate(anchor, -7))}>
          <ChevronLeft size={14} /> Tuần trước
        </button>
        <span className="week-title">{weekLabel(anchor, to)}</span>
        <button type="button" className="btn btn-ghost" disabled={anchor >= thisWeek}
          onClick={() => setAnchor(shiftDate(anchor, 7))}>
          Tuần sau <ChevronRight size={14} />
        </button>
        {anchor !== thisWeek ? (
          <button type="button" className="btn btn-ghost" onClick={() => setAnchor(thisWeek)}>Về tuần này</button>
        ) : <span className="field-hint" style={{ margin: 0 }}>Đang xem tuần hiện tại</span>}
      </div>

      <p className="field-hint" style={{ marginBottom: 12 }}>
        Lệnh được xếp vào tuần theo <b>ngày đóng</b> — đó là lúc kết quả thành hình. Tuần tính từ Thứ 2 đến Chủ nhật.
        R tách thành phần thắng và phần lỗ vì +2R do "thắng 3R lỗ 1R" khác hẳn +2R do "thắng 12R lỗ 10R".
      </p>

      <FxWarning resources={resources} what="Ô Lãi/lỗ quy đổi USD" />

      <div className="stat-grid">
        <StatCard label="R ròng cả tuần" value={report.total.rCount ? fmtR(report.total.rNet) : "—"}
          tone={report.total.rNet > 0 ? "win" : report.total.rNet < 0 ? "loss" : ""}
          sub={report.total.rCount ? `${fmtR(delta)} so với tuần trước` : "chưa lệnh nào ghi rủi ro"} />
        <StatCard label="R thắng" value={fmtR(report.total.rWin)} tone="win"
          sub={`${report.total.wins} lệnh thắng`} />
        <StatCard label="R lỗ" value={fmtR(report.total.rLoss)} tone="loss"
          sub={`${report.total.losses} lệnh thua`} />
        <StatCard label="Lệnh đóng trong tuần" value={report.total.count}
          sub={`${report.opened} lệnh mới mở · ${report.total.rCount}/${report.total.count} lệnh có ghi rủi ro`} />
      </div>

      {report.rows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <CalendarRange size={28} color="var(--text-dim)" />
          <p>Tuần này chưa đóng lệnh nào.</p>
        </div>
      ) : (
        <>
          <h4 className="rec-title" style={{ marginTop: 18 }}>Từng tài khoản</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tài khoản</th><th>Lệnh</th><th>Winrate</th>
                  <th>R thắng</th><th>R lỗ</th><th>R ròng</th><th>So tuần trước</th><th>Lãi/lỗ</th>
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

      <ChartCard title={`R ròng ${TREND_WEEKS} tuần gần nhất`} subtitle="Cột sáng là tuần đang xem" height={220}>
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
