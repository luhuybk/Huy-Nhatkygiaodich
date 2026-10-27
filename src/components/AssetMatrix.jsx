import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { ChartCard } from "./ui.jsx";
import { GRID, MUTED, RANGE_OPTIONS, tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "../lib/constants.js";
import { closedOfUSD, dateKey, fmtMoney, fmtR, inRange } from "../lib/helpers.js";
import { ASSET_GROUPS, assetGroupOf } from "../lib/assetGroups.js";
import { MARKET_COLORS, marketColor, marketResolver } from "../lib/capital.js";

// Ma trận Khung × Nhóm tài sản: tài khoản đặt theo khung (Ngắn / Trung / Dài) mà mỗi khung đánh cả FX
// lẫn hàng hóa — bảng này trả lời "vàng hợp khung nào, FX hợp khung nào" trong một lần nhìn.
// Bên dưới là đường lãi lỗ bằng TIỀN, không phải R: mỗi nhóm đi một lượng vốn khác nhau, nên R dương
// mà tiền vẫn âm là chuyện có thật (thắng nhiều lệnh vốn nhỏ, thua một lệnh vốn lớn).

const GROUP_COLORS = Object.fromEntries(ASSET_GROUPS.map((g) => [g.key, g.color]));
const METRICS = [
  { id: "r", label: "R ròng" },
  { id: "pnl", label: "Lãi lỗ ($)" },
  { id: "exp", label: "Kỳ vọng R/lệnh" },
  { id: "win", label: "Tỷ lệ thắng" },
];
const TOTAL = "__total";

const emptyCell = () => ({ n: 0, wins: 0, r: 0, nR: 0, pnl: 0 });
function addTo(cell, x) {
  cell.n += 1;
  if (x.r.outcome === "win") cell.wins += 1;
  if (x.r.rr !== null && Number.isFinite(x.r.rr)) { cell.r += x.r.rr; cell.nR += 1; }
  cell.pnl += x.r.profit || 0;
}
const metricOf = (c, id) => {
  if (!c || !c.n) return null;
  if (id === "r") return c.nR ? c.r : null;
  if (id === "pnl") return c.pnl;
  if (id === "exp") return c.nR ? c.r / c.nR : null;
  return (c.wins / c.n) * 100;
};
const fmtMetric = (v, id) => {
  if (v === null) return "—";
  if (id === "r" || id === "exp") return fmtR(v);
  if (id === "pnl") return `${v > 0 ? "+" : ""}${fmtMoney(Math.round(v * 100) / 100, "USD")}`;
  return `${Math.round(v)}%`;
};
const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export function AssetMatrixPage({ trades, resources, capitalPlan }) {
  const accounts = resources.accounts || [];
  const [range, setRange] = useState("");
  const [rowsBy, setRowsBy] = useState("account");
  const [metric, setMetric] = useState("r");
  const [curveBy, setCurveBy] = useState("group");
  const [pick, setPick] = useState(null); // { row, group } — ô đang chọn để vẽ đường bên dưới

  const closed = useMemo(
    () => closedOfUSD((trades || []).filter((t) => t && inRange(dateKey(t), range)), resources)
      .map((x) => ({ ...x, g: assetGroupOf(x.t, resources), row: rowsBy === "account" ? x.t.account || "Chưa chọn tài khoản" : x.t.timeframe || "Chưa ghi khung" })),
    [trades, resources, range, rowsBy],
  );

  const { rows, groups, cells } = useMemo(() => {
    const cellMap = new Map();
    const at = (row, g) => {
      const k = `${row}|${g}`;
      if (!cellMap.has(k)) cellMap.set(k, emptyCell());
      return cellMap.get(k);
    };
    closed.forEach((x) => { [x.row, TOTAL].forEach((row) => [x.g, TOTAL].forEach((g) => addTo(at(row, g), x))); });
    const present = new Set(closed.map((x) => x.row));
    // Giữ thứ tự quen thuộc: tài khoản theo tab Tài khoản, khung theo Tài nguyên; tên lạ xếp cuối.
    const order = rowsBy === "account" ? accounts.map((a) => a.name) : resources.timeframes || [];
    const known = order.filter((n) => present.has(n));
    const rest = [...present].filter((n) => !order.includes(n)).sort();
    const usedGroups = ASSET_GROUPS.filter((g) => closed.some((x) => x.g === g.key));
    return { rows: [...known, ...rest], groups: usedGroups, cells: (row, g) => cellMap.get(`${row}|${g}`) };
  }, [closed, rowsBy, accounts, resources.timeframes]);

  // Màu ô theo độ lớn so với ô lớn nhất trong bảng (không tính hàng/cột Tổng) — tỷ lệ thắng thì so với 50%.
  const scale = useMemo(() => {
    let max = 0;
    rows.forEach((row) => groups.forEach((g) => {
      const v = metricOf(cells(row, g.key), metric);
      if (v !== null) max = Math.max(max, Math.abs(metric === "win" ? v - 50 : v));
    }));
    return max || 1;
  }, [rows, groups, cells, metric]);
  const tint = (v) => {
    if (v === null) return undefined;
    const d = metric === "win" ? v - 50 : v;
    const a = Math.min(1, Math.abs(d) / scale) * 0.42;
    if (a < 0.02) return undefined;
    return { background: d > 0 ? `rgba(76, 175, 125, ${a})` : `rgba(224, 97, 90, ${a})` };
  };

  const scoped = useMemo(() => closed.filter((x) => (!pick || pick.row === TOTAL || x.row === pick.row) && (!pick || pick.group === TOTAL || x.g === pick.group)), [closed, pick]);
  const curve = useMemo(() => buildCurve(scoped, curveBy, capitalPlan, accounts), [scoped, curveBy, capitalPlan, accounts]);

  const toggle = (row, group) => setPick((p) => (p && p.row === row && p.group === group ? null : { row, group }));
  const isPicked = (row, group) => !!pick && pick.row === row && pick.group === group;
  const pickLabel = !pick ? "tất cả lệnh trong bảng"
    : [pick.row === TOTAL ? "" : pick.row, pick.group === TOTAL ? "" : (ASSET_GROUPS.find((g) => g.key === pick.group) || {}).label].filter(Boolean).join(" · ") || "tất cả lệnh trong bảng";

  const cellView = (row, g) => {
    const c = cells(row, g);
    const v = metricOf(c, metric);
    return (
      <td key={g} className={`amx-cell ${row === TOTAL || g === TOTAL ? "amx-total" : ""} ${isPicked(row, g) ? "amx-on" : ""}`}
        style={row === TOTAL || g === TOTAL ? undefined : tint(v)}>
        {c && c.n ? (
          <button type="button" className="amx-btn" onClick={() => toggle(row, g)} title="Bấm để vẽ đường lãi lỗ của ô này">
            <b className="mono">{fmtMetric(v, metric)}</b>
            <small>{c.n} lệnh · {Math.round((c.wins / c.n) * 100)}% thắng</small>
            {metric !== "pnl" ? <small className="mono amx-sub">{`${c.pnl >= 0 ? "+" : ""}${fmtMoney(Math.round(c.pnl), "USD")}`}</small>
              : <small className="mono amx-sub">{c.nR ? fmtR(c.r) : "—"}</small>}
          </button>
        ) : <span className="amx-empty">·</span>}
      </td>
    );
  };

  return (
    <div>
      <div className="scope-bar">
        <span className="field-label" style={{ marginRight: 4 }}>Hàng:</span>
        <div className="lsn-pick">
          <button type="button" className={`lsn-pick-btn ${rowsBy === "account" ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => { setRowsBy("account"); setPick(null); }}>Tài khoản</button>
          <button type="button" className={`lsn-pick-btn ${rowsBy === "timeframe" ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => { setRowsBy("timeframe"); setPick(null); }}>Khung</button>
        </div>
        <span className="field-label" style={{ marginRight: 4, marginLeft: 14 }}>Số chính:</span>
        <select className="input" style={{ maxWidth: 170 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <span className="field-label" style={{ marginRight: 4, marginLeft: 14 }}>Thời gian:</span>
        <select className="input" style={{ maxWidth: 180 }} value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGE_OPTIONS.filter((r) => r.id !== "custom").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      {!closed.length ? <p className="empty-note">Chưa có lệnh đã đóng nào trong khoảng thời gian này.</p> : (
        <>
          <div className="amx-wrap">
            <table className="amx">
              <thead>
                <tr>
                  <th>{rowsBy === "account" ? "Tài khoản" : "Khung"}</th>
                  {groups.map((g) => <th key={g.key}><span className="amx-dot" style={{ background: GROUP_COLORS[g.key] }} />{g.label}</th>)}
                  <th className="amx-total">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row}>
                    <th className="amx-row">{row}</th>
                    {groups.map((g) => cellView(row, g.key))}
                    {cellView(row, TOTAL)}
                  </tr>
                ))}
                <tr className="amx-foot">
                  <th className="amx-row">Tổng</th>
                  {groups.map((g) => cellView(TOTAL, g.key))}
                  {cellView(TOTAL, TOTAL)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            Mỗi ô: số chính đang chọn · số lệnh · tỷ lệ thắng · dòng nhỏ dưới cùng là {metric === "pnl" ? "R ròng" : "lãi lỗ quy USD"}.
            Nhóm tài sản tự nhận theo mã. Tính theo ngày đóng lệnh. Bấm một ô để vẽ đường lãi lỗ của riêng ô đó.
          </p>

          <ChartCard
            title={curveBy === "group" ? "Lãi lỗ cộng dồn theo nhóm tài sản (USD)" : "Đường vốn theo mảng (% trên vốn phân chia)"}
            subtitle={pickLabel}
            height={260}
            legend={curve.lines.map((l) => ({ color: l.color, label: `${l.label} ${l.last >= 0 ? "+" : ""}${curveBy === "group" ? fmtMoney(Math.round(l.last), "USD") : `${l.last.toFixed(1)}%`}` }))}>
            <ResponsiveContainer>
              <LineChart data={curve.data}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={ddmm} tick={{ fontSize: 10, fill: MUTED }} minTickGap={30} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={52} tickFormatter={(v) => (curveBy === "group" ? Math.round(v) : `${v}%`)} />
                <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                  labelFormatter={ddmm} formatter={(v) => (curveBy === "group" ? fmtMoney(v, "USD") : `${v}%`)} />
                {curve.lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="lsn-pick" style={{ marginTop: 8 }}>
            <button type="button" className={`lsn-pick-btn ${curveBy === "group" ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => setCurveBy("group")}>Theo nhóm ($)</button>
            <button type="button" className={`lsn-pick-btn ${curveBy === "market" ? "lsn-pick-on lsn-pick-on-1" : ""}`} onClick={() => setCurveBy("market")} disabled={!capitalPlan}>Theo mảng vốn (%)</button>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            {curveBy === "group"
              ? "Tiền thật, không phải R: nhóm đi vốn nhỏ có thể dương R mà vẫn ít tiền, nhóm đi vốn lớn thua một lệnh là âm tiền dù R ròng còn dương."
              : "Mỗi mảng ở tab Phân bổ vốn là một đường: lãi lỗ cộng dồn chia cho vốn phân chia của mảng đó — mảng Hàng hóa 1.000 và mảng FX 12.500 so được với nhau trên cùng thước %. Mảng có chọn nhóm tài sản thì chỉ nhận lệnh của nhóm đó."}
          </p>
        </>
      )}
    </div>
  );
}

// Đường cộng dồn theo ngày đóng lệnh. "group": mỗi nhóm tài sản một đường, đơn vị USD. "market": mỗi
// mảng vốn một đường, % trên vốn phân chia (USD) của mảng.
function buildCurve(list, by, plan, accounts) {
  const resolve = by === "market" && plan ? marketResolver(plan, accounts) : null;
  const meta = new Map();
  const events = [];
  list.forEach((x) => {
    let key;
    if (by === "market") {
      const m = resolve ? resolve(x.t.account, x.t.symbol) : null;
      if (!m || !(Number(m.allocated) > 0)) return;
      key = `m_${m.id}`;
      if (!meta.has(key)) {
        const used = new Set([...meta.values()].map((x) => x.color));
        const own = marketColor(m, accounts);
        meta.set(key, { label: m.name, color: own && !used.has(own) ? own : MARKET_COLORS.find((c) => !used.has(c)) || MUTED, base: Number(m.allocated) });
      }
    } else {
      key = `g_${x.g}`;
      if (!meta.has(key)) meta.set(key, { label: (ASSET_GROUPS.find((g) => g.key === x.g) || {}).label || x.g, color: GROUP_COLORS[x.g] || MUTED, base: null, order: ASSET_GROUPS.findIndex((g) => g.key === x.g) });
    }
    events.push({ date: dateKey(x.t), key, pnl: x.r.profit || 0 });
  });
  events.sort((a, b) => a.date.localeCompare(b.date));
  const sums = {};
  const data = [];
  events.forEach((e) => {
    sums[e.key] = (sums[e.key] || 0) + e.pnl;
    let row = data[data.length - 1];
    if (!row || row.date !== e.date) { row = { date: e.date }; data.push(row); }
    meta.forEach((m, k) => {
      if (sums[k] === undefined) return;
      row[k] = m.base ? Number(((sums[k] / m.base) * 100).toFixed(2)) : Number(sums[k].toFixed(2));
    });
  });
  // Điểm xuất phát chung ở 0 để các đường cùng bắt đầu một chỗ.
  if (data.length) data.unshift({ date: data[0].date, ...Object.fromEntries([...meta.keys()].map((k) => [k, 0])) });
  const lines = [...meta.entries()]
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([key, m]) => ({ key, label: m.label, color: m.color, last: m.base ? ((sums[key] || 0) / m.base) * 100 : sums[key] || 0 }));
  return { data, lines };
}
