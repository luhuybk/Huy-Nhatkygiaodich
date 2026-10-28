import { useMemo } from "react";
import { accountColor, buildTWRCurve, closedOf, computeResult, fmtMoney, fmtR, periodAccountReport, shiftDate } from "../lib/helpers.js";
import { ASSET_GROUPS, assetGroupOf } from "../lib/assetGroups.js";
import { fmtDateVN, weekdayVN } from "../lib/printTrades.js";

// Trang đầu của bản in tổng kết tuần / tháng: kỳ này đánh thế nào. Trên cùng là R cộng dồn theo
// từng ngày — mỗi tài khoản một đường, thêm đường tổng — để thấy ngày nào kéo lên, ngày nào kéo
// xuống. Giữa là từng tài khoản: đường cong vốn (chỉ số mốc 100, giống trang Đường cong vốn —
// nạp / rút không làm đường nhảy) của vài kỳ gần đây, kỳ đang in tô nền. Dưới cùng là từng ngày.
// Biểu đồ vẽ bằng SVG thường: in và xuất PDF ra đúng như trên màn hình, không phụ thuộc thư viện.

const TOTAL_COLOR = "#111111";
const SHORT_WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const wdShort = (d) => SHORT_WD[new Date(`${d}T00:00:00`).getDay()];
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pctText = (v) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`);

// Lãi lỗ kỳ này của một tài khoản chia theo nhóm tài sản (bằng TIỀN của tài khoản, kèm R): hai nhóm
// đi vốn khác nhau nên "R dương mà tiền âm" chỉ lộ ra khi đặt hai con số cạnh nhau. Một nhóm thì thôi.
function AssetSplitLine({ trades, resources, account, currency, from, to }) {
  const parts = useMemo(() => {
    const list = closedOf((trades || []).filter((t) => t && t.account === account && t.exitDate && t.exitDate >= from && t.exitDate <= to));
    return ASSET_GROUPS.map((g) => {
      const items = list.filter((x) => assetGroupOf(x.t, resources) === g.key);
      const withR = items.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
      return { g, n: items.length, pnl: items.reduce((s, x) => s + (x.r.profit || 0), 0), r: withR.reduce((s, x) => s + x.r.rr, 0), nR: withR.length };
    }).filter((x) => x.n);
  }, [trades, resources, account, from, to]);
  if (parts.length < 2) return null;
  return (
    <div className="print-acct-split">
      {parts.map((x) => (
        <span key={x.g.key}>
          <i style={{ background: x.g.color }} />{x.g.label} <b className={x.pnl > 0 ? "is-up" : x.pnl < 0 ? "is-down" : ""}>{x.pnl > 0 ? "+" : ""}{fmtMoney(Math.round(x.pnl * 100) / 100, currency)}</b>
          {x.nR ? <span className="print-dim"> ({fmtR(x.r)})</span> : null}
        </span>
      ))}
    </div>
  );
}

function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 400; d = shiftDate(d, 1)) out.push(d);
  return out;
}

// Vạch chia trục dọc "tròn" (1, 2, 5 × 10^n) cho khoảng [lo, hi].
function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < hi) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)));
  return ticks;
}

// series: [{ key, label, color, values: số | null theo từng mốc x, width, dash }]
// `width` là bề rộng hệ toạ độ: biểu đồ nhỏ trong thẻ tài khoản dùng số nhỏ để chữ trên trục không
// bị thu bé tí khi co vào thẻ hẹp.
// `dots`: chấm mọi điểm (đường theo tuần chỉ có vài điểm, mỗi điểm là một tuần). `pointLabels`: chữ nhỏ
// trên từng điểm của series đầu — [{ text, color } | null].
function SvgChart({ series, labels, width: W = 1000, height = 230, yFmt, zero, shade, base, dots, pointLabels }) {
  const padL = 54, padR = pointLabels ? 22 : 14, padT = pointLabels ? 20 : 10, padB = 26;
  const n = labels.length;
  const vals = series.flatMap((s) => s.values.filter((v) => v !== null && Number.isFinite(v)));
  if (!vals.length || n < 2) return <p className="print-cover-empty">Chưa có dữ liệu để vẽ.</p>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (base !== undefined) { lo = Math.min(lo, base); hi = Math.max(hi, base); }
  const ticks = niceTicks(lo, hi, 4);
  lo = ticks[0]; hi = ticks[ticks.length - 1];
  const x = (i) => padL + (i * (W - padL - padR)) / (n - 1);
  const y = (v) => padT + ((hi - v) * (height - padT - padB)) / (hi - lo || 1);
  const every = Math.max(1, Math.ceil(n / (W >= 800 ? 12 : 5)));
  return (
    <svg className="print-chart" viewBox={`0 0 ${W} ${height}`} style={{ aspectRatio: `${W} / ${height}` }} role="img">
      {shade ? <rect x={x(shade[0])} y={padT} width={Math.max(2, x(shade[1]) - x(shade[0]))} height={height - padT - padB} fill="#efe6d2" /> : null}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 && zero ? "#777" : "#e3e3e3"} strokeWidth={t === 0 && zero ? 1.4 : 1} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#555">{yFmt(t)}</text>
        </g>
      ))}
      {base !== undefined ? <line x1={padL} x2={W - padR} y1={y(base)} y2={y(base)} stroke="#999" strokeDasharray="4 4" /> : null}
      {/* Nhãn quá sát nhãn cuối thì bỏ, kẻo hai ngày chồng chữ lên nhau. */}
      {labels.map((l, i) => ((i % every === 0 && n - 1 - i >= every * 0.6) || i === n - 1 ? (
        <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11.5" fill="#555">{l}</text>
      ) : null))}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
        const lastI = s.values.reduce((a, v, i) => (v === null ? a : i), -1);
        return (
          <g key={s.key}>
            <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={s.width || 2.2} strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" />
            {dots ? s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill="#fff" stroke={s.color} strokeWidth={2} />)) : null}
            {lastI >= 0 ? <circle cx={x(lastI)} cy={y(s.values[lastI])} r={s.width ? s.width + 1.5 : 3.5} fill={s.color} /> : null}
          </g>
        );
      })}
      {pointLabels && series[0] ? pointLabels.map((pl, i) => {
        const v = series[0].values[i];
        if (!pl || v === null || !Number.isFinite(v)) return null;
        return <text key={`pl${i}`} x={x(i)} y={y(v) - 8} textAnchor={i === n - 1 ? "end" : "middle"} fontSize="11" fontWeight="700" fill={pl.color}>{pl.text}</text>;
      }) : null}
    </svg>
  );
}

// Mốc cuối từng kỳ cho đường vốn trong thẻ tài khoản: in tuần thì 8 tuần (mỗi điểm là cuối một tuần),
// in tháng thì 6 tháng. Điểm đầu là ngay trước kỳ đầu tiên để kỳ đầu cũng có % thay đổi.
function periodMarks(from, to, monthly) {
  if (!monthly) {
    const starts = Array.from({ length: 8 }, (_, i) => shiftDate(from, -7 * (7 - i)));
    return { base: shiftDate(starts[0], -1), ends: starts.map((st, i) => (i === 7 ? to : shiftDate(st, 6))), labels: starts.map(ddmm) };
  }
  const [y, m] = from.split("-").map(Number);
  const starts = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const ends = starts.map((st, i) => {
    if (i === 5) return to;
    return shiftDate(starts[i + 1], -1);
  });
  return { base: shiftDate(starts[0], -1), ends, labels: starts.map((st) => `T${Number(st.slice(5, 7))}/${st.slice(2, 4)}`) };
}

// Chỉ số vốn cuối mỗi ngày trong `days`, từ các điểm (đã xếp theo ngày) của buildTWRCurve.
function dailyIndex(points, days) {
  const dated = points.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  let i = 0;
  let cur = points.length ? points[0] : { index: 100, balance: 0 };
  return days.map((d) => {
    while (i < dated.length && dated[i].date <= d) { cur = dated[i]; i += 1; }
    return { date: d, index: cur.index, balance: cur.balance };
  });
}

export function EquityPage({ title, from, to, monthly, trades, resources, ledger }) {
  const accounts = (resources && resources.accounts) || [];
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const rep = useMemo(() => periodAccountReport(trades, resources, from, to), [trades, resources, from, to]);

  // Lệnh đóng trong kỳ theo ngày đóng — cùng cách tính với bảng "Từng tài khoản" ở trang sau.
  const closed = useMemo(() => (trades || [])
    .filter((t) => t && t.exitDate && t.exitDate >= from && t.exitDate <= to && computeResult(t).status === "closed")
    .map((t) => ({ t, r: computeResult(t) }))
    .sort((a, b) => `${a.t.exitDate} ${a.t.exitTime || ""}`.localeCompare(`${b.t.exitDate} ${b.t.exitTime || ""}`)), [trades, from, to]);

  const names = rep.rows.map((r) => r.account);
  const rOf = (x) => (x.r.rr !== null && Number.isFinite(x.r.rr) ? x.r.rr : 0);

  // R cộng dồn cuối mỗi ngày. Mốc 0 đầu tiên là "trước kỳ" để đường bắt đầu từ 0.
  const curve = useMemo(() => {
    const per = Object.fromEntries(names.map((n) => [n, [0]]));
    const total = [0];
    days.forEach((d) => {
      const today = closed.filter((x) => x.t.exitDate === d);
      names.forEach((n) => { const a = per[n]; a.push(a[a.length - 1] + today.filter((x) => x.t.account === n).reduce((s, x) => s + rOf(x), 0)); });
      total.push(total[total.length - 1] + today.reduce((s, x) => s + rOf(x), 0));
    });
    return { per, total };
  }, [closed, days, names.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayRows = useMemo(() => {
    let cum = 0;
    return days.map((d) => {
      const list = closed.filter((x) => x.t.exitDate === d);
      const r = list.reduce((s, x) => s + rOf(x), 0);
      cum += r;
      return {
        d, list, r, cum,
        wins: list.filter((x) => x.r.outcome === "win").length,
        losses: list.filter((x) => x.r.outcome === "loss").length,
      };
    });
  }, [closed, days]);
  const traded = dayRows.filter((x) => x.list.length);
  const best = traded.length ? traded.reduce((a, b) => (b.r > a.r ? b : a)) : null;
  const worst = traded.length ? traded.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  let peak = 0, maxDD = 0;
  curve.total.forEach((v) => { peak = Math.max(peak, v); maxDD = Math.max(maxDD, peak - v); });

  // Đường cong vốn từng tài khoản: 8 tuần (in tuần) hoặc ~6 tháng (in tháng) tính tới cuối kỳ.
  const lookFrom = shiftDate(from, monthly ? -150 : -49);
  const cards = useMemo(() => rep.rows.map((row) => {
    const acc = accounts.find((a) => a.name === row.account);
    if (!acc) return { row, acc: null };
    const pts = buildTWRCurve(acc, ledger || [], trades || []);
    const win = dailyIndex(pts, daysBetween(lookFrom, to));
    const before = dailyIndex(pts, [shiftDate(from, -1)])[0];
    const end = win[win.length - 1];
    const inPeriod = win.filter((p) => p.date >= from);
    let pk = before.index, dd = 0;
    inPeriod.forEach((p) => { pk = Math.max(pk, p.index); dd = Math.max(dd, pk ? ((pk - p.index) / pk) * 100 : 0); });
    // Đường vẽ trong thẻ: mỗi kỳ (tuần / tháng) một điểm, kèm % thay đổi của kỳ đó.
    const marks = periodMarks(from, to, monthly);
    const steps = dailyIndex(pts, [marks.base, ...marks.ends]);
    const stepPct = steps.map((p, i) => (i && steps[i - 1].index ? (p.index / steps[i - 1].index - 1) * 100 : null));
    return {
      row, acc, win, end, dd, steps, stepPct, stepLabels: ["Đầu", ...marks.labels],
      pct: before.index ? (end.index / before.index - 1) * 100 : null,
      hasBalance: Number(acc.initialBalance) > 0 || pts.length > 1,
    };
  }), [rep, accounts, ledger, trades, lookFrom, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = rep.total;
  const labels = ["Đầu kỳ", ...days.map((d) => (monthly ? ddmm(d) : `${wdShort(d)} ${ddmm(d)}`))];
  const series = [
    ...names.map((n) => ({ key: n, label: n, color: accountColor(n, accounts), values: curve.per[n] })),
    ...(names.length > 1 ? [{ key: "__total", label: "Tổng", color: TOTAL_COLOR, values: curve.total, width: 3.2, dash: "8 5" }] : []),
  ];
  const shownRows = monthly ? traded : dayRows;

  return (
    <section className="print-cover print-equity">
      <header className="print-cover-head">
        <div className="print-cover-title">{title}</div>
        <div className="print-cover-range">{weekdayVN(from)} {fmtDateVN(from)} → {weekdayVN(to)} {fmtDateVN(to)}</div>
      </header>

      <div className="print-cover-kpis">
        <div><span>R ròng cả kỳ</span><b>{t.rCount ? fmtR(t.rNet) : "—"}</b></div>
        <div><span>Lệnh đóng · tỷ lệ thắng</span><b>{t.count} · {t.winRate === null ? "—" : `${Math.round(t.winRate)}%`}</b></div>
        <div><span>Ngày tốt nhất</span><b>{best && best.r > 0 ? `${fmtR(best.r)} · ${wdShort(best.d)} ${ddmm(best.d)}` : "—"}</b></div>
        <div><span>Ngày tệ nhất</span><b>{worst && worst.r < 0 ? `${fmtR(worst.r)} · ${wdShort(worst.d)} ${ddmm(worst.d)}` : "—"}</b></div>
        <div><span>Sụt sâu nhất trong kỳ</span><b>{maxDD > 0 ? fmtR(-maxDD) : "không sụt"}</b></div>
      </div>

      <h3 className="print-cover-h">R cộng dồn theo ngày{names.length > 1 ? " — từng tài khoản và tổng" : ""}</h3>
      {closed.length ? (
        <>
          <SvgChart series={series} labels={labels} zero yFmt={(v) => `${v > 0 ? "+" : ""}${String(v).replace(".", ",")}R`} />
          <div className="print-legend">
            {series.map((s) => (
              <span key={s.key}><i style={{ background: s.color, height: s.width ? 3 : 2 }} />{s.label} <b>{fmtR(s.values[s.values.length - 1])}</b></span>
            ))}
          </div>
        </>
      ) : <p className="print-cover-empty">Không có lệnh nào đóng trong kỳ này.</p>}

      {cards.length ? (
        <>
          <h3 className="print-cover-h">Đường cong vốn từng tài khoản <span className="print-dim">(chỉ số mốc 100 · mỗi điểm là cuối một {monthly ? "tháng, 6 tháng" : "tuần, 8 tuần"} gần nhất kèm % thay đổi · nền vàng là kỳ này)</span></h3>
          <div className="print-acct-grid">
            {cards.map(({ row, acc, end, dd, pct, steps, stepPct, stepLabels, hasBalance }) => (
              <div key={row.account} className="print-acct" style={{ "--acct": accountColor(row.account, accounts) }}>
                <div className="print-acct-head">
                  <b>{row.account}</b>
                  {acc && hasBalance ? <span className={pct > 0 ? "is-up" : pct < 0 ? "is-down" : ""}>{pctText(pct)}</span> : null}
                </div>
                {acc && hasBalance ? (
                  <SvgChart width={440} height={170} base={100} shade={[steps.length - 2, steps.length - 1]} labels={stepLabels} dots
                    series={[{ key: "i", color: accountColor(row.account, accounts), values: steps.map((p) => p.index), width: 2.4 }]}
                    pointLabels={stepPct.map((v) => (v === null || Math.abs(v) < 0.005 ? null : { text: `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`, color: v > 0 ? "#1e7d3a" : "#b3261e" }))}
                    yFmt={(v) => String(Math.round(v * 10) / 10).replace(".", ",")} />
                ) : <p className="print-cover-empty">Chưa có vốn ban đầu / nạp tiền nên chưa vẽ được đường cong.</p>}
                <AssetSplitLine trades={trades} resources={resources} account={row.account} currency={row.currency} from={from} to={to} />
                <div className="print-acct-stats">
                  <span>Lệnh <b>{row.count}</b> ({row.wins}T/{row.losses}L{row.be ? `/${row.be}H` : ""})</span>
                  <span>R <b>{row.rCount ? fmtR(row.rNet) : "—"}</b></span>
                  <span>Lãi/lỗ <b>{fmtMoney(row.profit, row.currency)}</b></span>
                  {acc && hasBalance ? <span>Số dư <b>{fmtMoney(end.balance, acc.currency || row.currency)}</b></span> : null}
                  {acc && hasBalance && dd > 0 ? <span>Sụt trong kỳ <b>−{dd.toFixed(2).replace(".", ",")}%</b></span> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="print-cover-h">Từng ngày</h3>
      {shownRows.length ? (
        <table className="print-table print-days">
          <thead><tr><th>Ngày</th><th>Lệnh</th><th>T/L</th><th>R ngày</th><th>Cộng dồn</th><th>Các lệnh đóng</th></tr></thead>
          <tbody>
            {shownRows.map((x) => (
              <tr key={x.d} className={x.list.length ? "" : "is-empty"}>
                <td><b>{wdShort(x.d)}</b> {ddmm(x.d)}</td>
                <td>{x.list.length || "—"}</td>
                <td>{x.list.length ? `${x.wins}/${x.losses}` : ""}</td>
                <td><b>{x.list.length ? fmtR(x.r) : ""}</b></td>
                <td>{x.list.length ? fmtR(x.cum) : ""}</td>
                <td className="print-small">
                  {x.list.length ? x.list.map((y, i) => (
                    <span key={y.t.id} className="print-day-trade">
                      {i ? " · " : ""}<i style={{ background: accountColor(y.t.account, accounts) }} />
                      <b>{y.t.symbol || "—"}</b> ({y.t.direction === "sell" ? "S" : "B"} {y.r.rr !== null && Number.isFinite(y.r.rr) ? fmtR(y.r.rr) : "chưa có R"})
                    </span>
                  )) : <span className="print-dim">không đóng lệnh nào</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="print-cover-empty">Không có ngày nào đóng lệnh.</p>}
    </section>
  );
}
