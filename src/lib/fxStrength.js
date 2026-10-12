// Sức mạnh đồng tiền cho lệnh FX — cùng quy tắc với chỉ báo "Xu Hướng Tuần" trên TradingView:
//   mỗi đồng: Cấu trúc (Tăng +1 / Ngang 0 / Giảm −1) và Ngắn hạn (như vậy);
//   điểm đồng = Cấu trúc × 2 + Ngắn hạn (±3); điểm cặp = Base − Quote (±6);
//   CT cặp = Cấu trúc Base − Cấu trúc Quote (±2), NH cặp tương tự — điểm cặp = 2·CT + NH.
//
// Lệnh ghi ở trade.fxCond = { base, quote, b: { ct, nh }, q: { ct, nh } }. Lưu luôn tên hai đồng:
// sửa symbol thành cặp khác thì nhận định cũ không còn khớp và được coi là chưa ghi.
//
// Thống kê tính "theo hướng lệnh": lệnh Sell đảo dấu, để + luôn nghĩa là thị trường ủng hộ lệnh.
import { closedOfUSD } from "./helpers.js";

export const FX_MAJORS = ["USD", "AUD", "EUR", "GBP", "NZD", "CAD", "CHF", "JPY"];
export const FX_TRENDS = [
  { v: 1, label: "Tăng" },
  { v: 0, label: "Ngang" },
  { v: -1, label: "Giảm" },
];
// Nhận định đồng tiền là theo tuần — quá chừng này ngày thì không gợi ý chép nữa.
export const FX_RECENT_DAYS = 7;

const isTrend = (v) => v === 1 || v === 0 || v === -1;
export const trendLabel = (v) => (FX_TRENDS.find((x) => x.v === v) || {}).label || "—";
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// "EURUSD", "EUR/USD", "OANDA:EURUSD", "EURUSD.m" → { base: "EUR", quote: "USD" }. Vàng, bạc,
// chỉ số... không phải cặp hai đồng tiền nên trả null.
export function fxPairOf(symbol) {
  const s = String(symbol || "").toUpperCase().replace(/^[A-Z0-9_]+:/, "").replace(/[^A-Z]/g, "");
  if (s.length < 6) return null;
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6);
  if (!FX_MAJORS.includes(base) || !FX_MAJORS.includes(quote) || base === quote) return null;
  return { base, quote };
}

// Nhận định của lệnh, chỉ khi khớp đúng cặp của symbol hiện tại.
export function fxCondOf(t) {
  const pair = fxPairOf(t && t.symbol);
  const fc = t && t.fxCond;
  if (!pair || !fc || fc.base !== pair.base || fc.quote !== pair.quote) return null;
  return fc;
}

export const coinScore = (c) => (c && isTrend(c.ct) && isTrend(c.nh) ? c.ct * 2 + c.nh : null);

// Điểm của lệnh — null khi chưa điền đủ cả 4 ô.
export function fxScore(t) {
  const fc = fxCondOf(t);
  if (!fc) return null;
  const b = coinScore(fc.b);
  const q = coinScore(fc.q);
  if (b === null || q === null) return null;
  const sign = t.direction === "sell" ? -1 : 1;
  const ct = fc.b.ct - fc.q.ct;
  const nh = fc.b.nh - fc.q.nh;
  return { b, q, pair: b - q, ct, nh, aligned: { pair: sign * (b - q), ct: sign * ct, nh: sign * nh } };
}

export function fxFilled(t) {
  const fc = fxCondOf(t);
  if (!fc) return 0;
  return [fc.b && fc.b.ct, fc.b && fc.b.nh, fc.q && fc.q.ct, fc.q && fc.q.nh].filter(isTrend).length;
}

// Nhịp của cặp theo hướng lệnh, giữ biểu tượng của chỉ báo: 🚀 đồng pha, ⏳ đang hồi.
export function fxPhase(ct, nh) {
  if (ct > 0 && nh > 0) return { id: "with", icon: "🚀", label: "Cấu trúc + ngắn hạn cùng ủng hộ" };
  if (ct > 0 && nh < 0) return { id: "pullback", icon: "⏳", label: "Cấu trúc ủng hộ · ngắn hạn đang hồi ngược" };
  if (ct > 0) return { id: "ctOnly", icon: "➡️", label: "Cấu trúc ủng hộ · ngắn hạn chưa rõ" };
  if (ct === 0 && nh > 0) return { id: "nhOnly", icon: "〰️", label: "Cấu trúc chưa rõ · ngắn hạn ủng hộ" };
  if (ct === 0 && nh === 0) return { id: "flat", icon: "〰️", label: "Cả hai chưa rõ" };
  if (ct === 0) return { id: "nhAgainst", icon: "〰️", label: "Cấu trúc chưa rõ · ngắn hạn ngược" };
  if (nh > 0) return { id: "counter", icon: "⚠️", label: "Cấu trúc ngược · ngắn hạn ủng hộ (bắt hồi)" };
  return { id: "against", icon: "⛔", label: "Cấu trúc ngược · ngắn hạn ngược" };
}
export const FX_PHASE_ORDER = ["with", "pullback", "ctOnly", "nhOnly", "flat", "nhAgainst", "counter", "against"];

export const FX_SCORE_BUCKETS = [
  { id: "strong", label: "Thuận mạnh (+4 → +6)", test: (p) => p >= 4 },
  { id: "with", label: "Thuận (+1 → +3)", test: (p) => p >= 1 && p <= 3 },
  { id: "zero", label: "Trung tính (0)", test: (p) => p === 0 },
  { id: "against", label: "Ngược (−1 → −3)", test: (p) => p <= -1 && p >= -3 },
  { id: "strongAgainst", label: "Ngược mạnh (−4 → −6)", test: (p) => p <= -4 },
];

// Nhận định gần nhất của một đồng (≤ 7 ngày trước ngày vào lệnh), lấy từ bất kỳ lệnh FX nào có
// đồng đó — ở vị trí base hay quote đều được.
export function fxRecentCoin(trades, t, coin) {
  const day = (t && t.entryDate) || "";
  if (!day) return null;
  const from = new Date(`${day}T00:00:00`);
  from.setDate(from.getDate() - FX_RECENT_DAYS);
  const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  let best = null;
  (trades || []).forEach((x) => {
    if (!x || x.id === t.id || !x.entryDate || x.entryDate > day || x.entryDate < fromKey) return;
    const fc = fxCondOf(x);
    if (!fc) return;
    const side = fc.base === coin ? fc.b : fc.quote === coin ? fc.q : null;
    if (!side || !isTrend(side.ct) || !isTrend(side.nh)) return;
    if (!best || x.entryDate > best.date || (x.entryDate === best.date && (x.createdAt || 0) > (best.createdAt || 0))) {
      best = { ct: side.ct, nh: side.nh, date: x.entryDate, symbol: x.symbol, createdAt: x.createdAt };
    }
  });
  return best;
}

function emptyBucket() {
  return { count: 0, wins: 0, losses: 0, rCount: 0, totalR: 0 };
}
function addTo(b, r) {
  b.count += 1;
  if (r.outcome === "win") b.wins += 1;
  if (r.outcome === "loss") b.losses += 1;
  if (r.rr !== null && r.rr !== undefined && Number.isFinite(r.rr)) { b.rCount += 1; b.totalR += r.rr; }
}
function finish(b) {
  return { ...b, winRate: b.count ? (b.wins / b.count) * 100 : null, avgR: b.rCount ? b.totalR / b.rCount : null };
}

// Thống kê lệnh FX đã đóng: theo điểm cặp, theo nhịp, lưới CT × NH (đều theo hướng lệnh).
export function fxStats(trades, resources, opts = {}) {
  const buckets = FX_SCORE_BUCKETS.map((b) => ({ id: b.id, label: b.label, test: b.test, ...emptyBucket() }));
  const phases = new Map(FX_PHASE_ORDER.map((id) => [id, { id, ...emptyBucket() }]));
  const grid = {};
  const strong = emptyBucket();
  const rest = emptyBucket();
  const missingTrades = [];
  let partial = 0;

  closedOfUSD(trades || [], resources).forEach(({ t, r }) => {
    if (!fxPairOf(t.symbol)) return;
    if (opts.direction && t.direction !== opts.direction) return;
    const sc = fxScore(t);
    if (!sc) {
      if (fxFilled(t) > 0) partial += 1;
      missingTrades.push(t);
      return;
    }
    const a = sc.aligned;
    const bucket = buckets.find((b) => b.test(a.pair));
    if (bucket) addTo(bucket, r);
    const ph = fxPhase(a.ct, a.nh);
    addTo(phases.get(ph.id), r);
    const key = `${a.ct}|${a.nh}`;
    if (!grid[key]) grid[key] = emptyBucket();
    addTo(grid[key], r);
    addTo(a.pair >= 4 ? strong : rest, r);
  });

  return {
    buckets: buckets.map((b) => ({ ...finish(b), id: b.id, label: b.label })),
    phases: FX_PHASE_ORDER.map((id) => ({ ...finish(phases.get(id)), id, ...phaseMeta(id) })),
    grid: Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, finish(v)])),
    strong: finish(strong),
    rest: finish(rest),
    missingTrades,
    partial,
  };
}

// ---------------------------------------------------------------------------------------------
// Phân tích hai bước: Base trước, Quote sau. Mọi giá trị quy về hướng lệnh:
//   Base: Buy cần Base tăng → +1 = ủng hộ lệnh; Sell thì đảo dấu.
//   Quote: Buy cần Quote GIẢM → Quote giảm = ủng hộ (+1), Quote tăng = cản (−1); Sell đảo lại.
export function fxSides(t) {
  const fc = fxCondOf(t);
  if (!fc || coinScore(fc.b) === null || coinScore(fc.q) === null) return null;
  const s = t.direction === "sell" ? -1 : 1;
  return { base: { ct: s * fc.b.ct, nh: s * fc.b.nh }, quote: { ct: -s * fc.q.ct, nh: -s * fc.q.nh } };
}

export const FX_BASE_GROUPS = [
  { id: "with", label: "Base thuận chiều lệnh", hint: "Điểm Base theo lệnh > 0", test: (b) => b.ct * 2 + b.nh > 0 },
  { id: "flat", label: "Base trung tính", hint: "Điểm Base = 0", test: (b) => b.ct * 2 + b.nh === 0 },
  { id: "against", label: "Base ngược chiều lệnh", hint: "Điểm Base theo lệnh < 0", test: (b) => b.ct * 2 + b.nh < 0 },
];

// Lọc Base cho bước 2: "g:<nhóm>" hoặc "p:<nhịp>".
export function fxBaseMatch(filter, b) {
  if (!filter) return true;
  const [kind, id] = filter.split(":");
  if (kind === "g") { const g = FX_BASE_GROUPS.find((x) => x.id === id); return g ? g.test(b) : true; }
  if (kind === "p") return fxPhase(b.ct, b.nh).id === id;
  return true;
}

export function fxBaseQuoteStats(trades, resources, opts = {}) {
  const groups = FX_BASE_GROUPS.map((g) => ({ id: g.id, label: g.label, hint: g.hint, test: g.test, ...emptyBucket() }));
  const phases = new Map(FX_PHASE_ORDER.map((id) => [id, { id, ...emptyBucket() }]));
  const grid = {};
  const rowTot = {};
  const colTot = {};
  const picked = emptyBucket();
  let recorded = 0;

  closedOfUSD(trades || [], resources).forEach(({ t, r }) => {
    if (!fxPairOf(t.symbol)) return;
    if (opts.direction && t.direction !== opts.direction) return;
    const sd = fxSides(t);
    if (!sd) return;
    recorded += 1;
    const g = groups.find((x) => x.test(sd.base));
    addTo(g, r);
    addTo(phases.get(fxPhase(sd.base.ct, sd.base.nh).id), r);
    if (!fxBaseMatch(opts.baseFilter, sd.base)) return;
    addTo(picked, r);
    const { ct, nh } = sd.quote;
    const key = `${ct}|${nh}`;
    if (!grid[key]) grid[key] = emptyBucket();
    if (!rowTot[ct]) rowTot[ct] = emptyBucket();
    if (!colTot[nh]) colTot[nh] = emptyBucket();
    addTo(grid[key], r); addTo(rowTot[ct], r); addTo(colTot[nh], r);
  });

  const fin = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, finish(v)]));
  return {
    recorded,
    groups: groups.map((g) => ({ ...finish(g), id: g.id, label: g.label, hint: g.hint })),
    phases: FX_PHASE_ORDER.map((id) => ({ ...finish(phases.get(id)), id, ...phaseMeta(id) })),
    grid: fin(grid), rowTot: fin(rowTot), colTot: fin(colTot),
    picked: finish(picked),
  };
}

const PHASE_SAMPLE = { with: [1, 1], pullback: [1, -1], ctOnly: [1, 0], nhOnly: [0, 1], flat: [0, 0], nhAgainst: [0, -1], counter: [-1, 1], against: [-1, -1] };
function phaseMeta(id) {
  const m = fxPhase(...PHASE_SAMPLE[id]);
  return { icon: m.icon, label: m.label };
}
