// Kỳ vọng & R: lãi hay lỗ không do tỉ lệ thắng quyết định mà do
//   kỳ vọng mỗi lệnh = tỉ lệ thắng × R thắng TB − tỉ lệ thua × |R thua TB|.
// Trang "Kỳ vọng & R" (components/EdgeAnalysis.jsx) dùng các hàm ở đây: phân phối R, hệ thống dựa vào mấy lệnh lớn
// tới đâu (bỏ 10% lệnh tốt nhất còn lãi không), dời SL sớm giữ lại bao nhiêu R, và cách chia vốn đã giúp hay hại.
// Mọi con số tính theo R của từng lệnh (computeResult: lãi lỗ sau phí ÷ Rủi ro (tiền)) — không phụ thuộc tiền tệ.
import { computeResult, dateKey } from "./helpers.js";
import { activeStates, marketRegimesOf, regimeGroupsOf, stateRiskBand, tradeRegime, tradeState } from "./marketRegime.js";

// Dưới mức này kỳ vọng nhảy mạnh chỉ vì thêm một lệnh lớn — bảng tách nhóm làm mờ dòng ít lệnh.
export const EDGE_MIN_SAMPLE = 20;
const SCRATCH = 0.1; // |R| dưới mức này coi là hoà (dời về BE rồi bị quét)

export const pctOf = (t) => {
  const v = Number(String(t && t.riskPercent !== undefined && t.riskPercent !== null ? t.riskPercent : "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Lệnh đã đóng có R, cũ trước mới sau
export function closedR(trades) {
  return (trades || [])
    .map((t) => ({ t, rr: computeResult(t).rr, status: computeResult(t).status }))
    .filter((x) => x.status === "closed" && x.rr !== null && Number.isFinite(x.rr))
    .map(({ t, rr }) => ({ t, rr }))
    .sort((a, b) => `${dateKey(a.t) || ""} ${a.t.exitTime || ""}`.localeCompare(`${dateKey(b.t) || ""} ${b.t.exitTime || ""}`));
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : null);

export function edgeStats(list) {
  const rs = (list || []).map((x) => x.rr);
  const n = rs.length;
  const w = rs.filter((v) => v > 0);
  const l = rs.filter((v) => v < 0);
  const avgWin = avg(w);
  const avgLoss = avg(l);
  const winRate = n ? w.length / n : null;
  const lossRate = n ? l.length / n : null;
  const expectancy = avg(rs);
  // Tỉ lệ thắng tối thiểu để hoà với cỡ thắng / thua hiện tại; và R thắng TB cần có nếu giữ tỉ lệ thắng hiện tại
  const breakEvenWin = avgWin !== null && avgLoss !== null ? -avgLoss / (avgWin - avgLoss) : null;
  const needAvgWin = winRate && avgLoss !== null ? (lossRate * -avgLoss) / winRate : null;
  return {
    n, wins: w.length, losses: l.length, scratch: rs.filter((v) => Math.abs(v) < SCRATCH).length,
    winRate, avgWin, avgLoss, payoff: avgWin !== null && avgLoss ? avgWin / -avgLoss : null,
    expectancy, totalR: sum(rs), breakEvenWin, needAvgWin,
  };
}

export const R_BUCKETS = [
  { id: "full", label: "≤ −0,9R", hint: "thua đủ", lo: -Infinity, hi: -0.9, tone: "loss" },
  { id: "cut", label: "−0,9 → −0,1R", hint: "lỗ ít hơn 1R", lo: -0.9, hi: -SCRATCH, tone: "loss" },
  { id: "flat", label: "±0,1R", hint: "hoà", lo: -SCRATCH, hi: SCRATCH, tone: "" },
  { id: "s", label: "0,1 → 1R", hint: "", lo: SCRATCH, hi: 1, tone: "win" },
  { id: "m", label: "1 → 2R", hint: "", lo: 1, hi: 2, tone: "win" },
  { id: "l", label: "2 → 3R", hint: "", lo: 2, hi: 3, tone: "win" },
  { id: "xl", label: "3 → 5R", hint: "", lo: 3, hi: 5, tone: "win" },
  { id: "hr", label: "≥ 5R", hint: "", lo: 5, hi: Infinity, tone: "win" },
];
export function rDistribution(list) {
  return R_BUCKETS.map((b) => {
    const inB = list.filter((x) => (b.lo === -Infinity ? x.rr <= b.hi : x.rr > b.lo && (b.hi === Infinity || x.rr <= b.hi)));
    return { ...b, n: inB.length, totalR: sum(inB.map((x) => x.rr)) };
  });
}

// Hệ thống dựa vào lệnh lớn tới đâu: 10% lệnh tốt nhất góp bao nhiêu R, bỏ chúng thì kỳ vọng còn bao nhiêu
export function tailDependence(list) {
  const sorted = [...list].sort((a, b) => b.rr - a.rr);
  const n = sorted.length;
  const k = n ? Math.max(1, Math.round(n * 0.1)) : 0;
  const top = sorted.slice(0, k);
  const rest = sorted.slice(k);
  const homeRuns = list.filter((x) => x.t.homeRun);
  const big = list.filter((x) => x.rr >= 3);
  return {
    k, topR: sum(top.map((x) => x.rr)), restExpectancy: avg(rest.map((x) => x.rr)), totalR: sum(list.map((x) => x.rr)),
    top: sorted.slice(0, 10),
    homeRuns: { n: homeRuns.length, totalR: sum(homeRuns.map((x) => x.rr)) },
    big: { n: big.length, totalR: sum(big.map((x) => x.rr)) },
  };
}

// Cách thua: thua đủ 1R, lỗ ít hơn (dời SL / cắt sớm), hoà. "Giữ lại" = so với nếu mọi lệnh thua đều mất đủ 1R.
export function lossShape(list) {
  const losses = list.filter((x) => x.rr < 0);
  const full = losses.filter((x) => x.rr <= -0.9);
  const cut = losses.filter((x) => x.rr > -0.9 && x.rr <= -SCRATCH);
  return {
    losses: losses.length, full: full.length, cut: cut.length,
    scratch: list.filter((x) => Math.abs(x.rr) < SCRATCH).length,
    saved: sum(losses.map((x) => Math.max(0, x.rr + 1))),
    avgLoss: avg(losses.map((x) => x.rr)),
  };
}

export function maxLossStreak(list) {
  let s = 0, best = 0;
  for (const x of list) { s = x.rr < 0 ? s + 1 : 0; best = Math.max(best, s); }
  return best;
}

export function groupEdge(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x.t, x.rr) || "—";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m].map(([key, l]) => ({ key, ...edgeStats(l) })).sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key)));
}

// Cách chia vốn đã giúp hay hại: % tài khoản thực tế (Σ R × % rủi ro) so với cùng các lệnh đó nhưng đi đều mức vốn
// trung bình. Dương = những lệnh bạn đi vốn to thường là lệnh tốt hơn.
export function sizingImpact(list) {
  const w = list.filter((x) => pctOf(x.t) !== null);
  if (!w.length) return null;
  const meanRisk = avg(w.map((x) => pctOf(x.t)));
  const actual = sum(w.map((x) => x.rr * pctOf(x.t)));
  const flat = sum(w.map((x) => x.rr)) * meanRisk;
  return { n: w.length, meanRisk, actual, flat, diff: actual - flat };
}

// Nhãn trạng thái thị trường chung của lệnh (theo nhóm Tích cực / Trung tính / Tiêu cực) — "" khi chưa tick
export function regimeToneOf(t, resources) {
  const regimes = marketRegimesOf(resources);
  const reg = tradeRegime(t, regimes, (resources && resources.accounts) || []);
  const st = reg ? tradeState(t, reg) : null;
  if (!st) return reg ? "Chưa tick" : "";
  const g = regimeGroupsOf(resources).find((x) => x.id === (st.tone || "neutral"));
  return g ? g.label : st.tone;
}

// Đi vốn theo khung của trạng thái thị trường (giữa khung; "đứng ngoài" = 0%) so với đi đều — chỉ trên lệnh đã tick
// trạng thái có khung vốn. Trả cả số lệnh có chỉ số mà chưa tick, để biết còn thiếu bao nhiêu dữ liệu.
export function regimeSizing(list, resources) {
  const regimes = marketRegimesOf(resources);
  const accounts = (resources && resources.accounts) || [];
  const rows = [];
  let untagged = 0;
  for (const x of list) {
    const reg = tradeRegime(x.t, regimes, accounts);
    if (!reg || !activeStates(reg).length) continue;
    const st = tradeState(x.t, reg);
    const band = st ? stateRiskBand(st) : null;
    if (!band) { untagged += 1; continue; }
    const plan = band.max === 0 ? 0 : band.min !== null && band.max !== null ? (band.min + band.max) / 2 : band.max !== null ? band.max : band.min;
    rows.push({ ...x, plan, tone: st.tone || "neutral" });
  }
  if (!rows.length) return { n: 0, untagged };
  const meanPlan = avg(rows.map((r) => r.plan));
  return {
    n: rows.length, untagged, meanPlan,
    plan: sum(rows.map((r) => r.rr * r.plan)),
    flat: sum(rows.map((r) => r.rr)) * meanPlan,
    byTone: ["good", "neutral", "bad"].map((tone) => ({ tone, ...edgeStats(rows.filter((r) => r.tone === tone)) })),
  };
}
