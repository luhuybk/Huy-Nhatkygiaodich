// Điều kiện thị trường chung: mỗi loại thị trường có một chỉ số làm "nhiệt kế" — S&P 500 cho
// US Stock, VN-Index cho VN Stock. Cùng một setup, vào lệnh lúc chỉ số đang khoẻ thường thắng
// nhiều hơn lúc chỉ số yếu — nhưng phải ghi lại từng lệnh thì mới biết "thường" là bao nhiêu.
// Hàng hoá, forex... không có chỉ số chung thì để tài khoản đó không gắn chỉ số nào.
//
// Cấu hình ở resources.marketRegimes = [{ id, name, accountIds, conditions: [{ id, label }] }].
// Lệnh ghi ở trade.marketCond = { regimeId, checks: { [conditionId]: true | false } };
// regimeId = "none" nghĩa là bạn đã chọn "không áp dụng" cho lệnh đó.
// Điều kiện khoá theo id, không theo chữ: đổi "Trên EMA9" thành "Giá > EMA9" không mất dữ liệu cũ.
import { closedOfUSD, uid } from "./helpers.js";

export const REGIME_NONE = "none";
// Dưới mức này thì mỗi nhóm chỉ là vài lệnh — winrate nhảy 30% chỉ vì thêm một lệnh thắng.
export const REGIME_MIN_SAMPLE = 10;

const defaultConditions = (prefix) => [
  { id: `${prefix}-ema9`, label: "Chỉ số trên EMA9" },
  { id: `${prefix}-ema21`, label: "Chỉ số trên EMA21" },
  { id: `${prefix}-slope`, label: "EMA9 & EMA21 dốc lên" },
];

// Id cố định để bộ mặc định (chưa lưu lần nào) vẫn khớp với những lệnh đã ghi theo nó.
// Gắn sẵn tài khoản theo tên: "US Stock" → S&P 500, "VN Stock" → VN-Index.
export function defaultRegimes(accounts) {
  const list = (accounts || []).filter((a) => a && a.id && a.name);
  const match = (re) => list.filter((a) => re.test(a.name)).map((a) => a.id);
  return [
    { id: "sp500", name: "S&P 500", accountIds: match(/\bUS\b|Mỹ/i), conditions: defaultConditions("sp500") },
    { id: "vnindex", name: "VN-Index", accountIds: match(/\bVN\b|Việt/i), conditions: defaultConditions("vnindex") },
  ];
}

export function marketRegimesOf(resources) {
  const saved = resources && resources.marketRegimes;
  return Array.isArray(saved) ? saved.filter((r) => r && r.id) : defaultRegimes(resources && resources.accounts);
}

export function emptyRegime() {
  return { id: uid(), name: "", accountIds: [], conditions: [{ id: uid(), label: "" }] };
}

export function emptyCondition() {
  return { id: uid(), label: "" };
}

// Điều kiện vừa bấm "Thêm" mà chưa đặt tên thì coi như chưa có — không thì mọi lệnh cũ lập tức
// thành "ghi thiếu" chỉ vì một ô trống.
export function activeConditions(regime) {
  return ((regime && regime.conditions) || []).filter((c) => c && c.id && String(c.label || "").trim());
}

// Tài khoản con chưa gắn riêng thì đi theo nhóm cha: gắn "US Stock" là mọi tài khoản trong
// nhóm đó đều dùng S&P 500. Gắn riêng cho tài khoản con thì cái gần nhất thắng.
export function regimeForAccount(regimes, accountName, accounts) {
  const list = accounts || [];
  let acc = list.find((a) => a && a.name === accountName);
  const seen = new Set();
  while (acc && !seen.has(acc.id)) {
    seen.add(acc.id);
    const hit = regimes.find((r) => (r.accountIds || []).includes(acc.id));
    if (hit) return hit;
    acc = acc.parentId ? list.find((a) => a.id === acc.parentId) : null;
  }
  return null;
}

// Chỉ số mà lệnh này thuộc về: ưu tiên cái đã ghi trên lệnh, không có thì suy từ tài khoản.
export function tradeRegime(t, regimes, accounts) {
  const picked = t && t.marketCond && t.marketCond.regimeId;
  if (picked === REGIME_NONE) return null;
  if (picked) {
    const hit = regimes.find((r) => r.id === picked);
    if (hit) return hit;
  }
  return regimeForAccount(regimes, t && t.account, accounts);
}

// { met, answered, total } — chỉ đếm khi lệnh ghi đúng theo chỉ số này.
export function condScore(t, regime) {
  const conds = activeConditions(regime);
  const mc = t && t.marketCond;
  const checks = mc && mc.regimeId === regime.id && mc.checks ? mc.checks : {};
  let met = 0;
  let answered = 0;
  conds.forEach((c) => {
    if (checks[c.id] === true) { met += 1; answered += 1; } else if (checks[c.id] === false) answered += 1;
  });
  return { met, answered, total: conds.length };
}

export function condScoreText(t, regime) {
  const s = condScore(t, regime);
  if (!s.answered) return "";
  return s.answered < s.total ? `Đạt ${s.met}/${s.answered} (ghi ${s.answered}/${s.total} điều kiện)` : `Đạt ${s.met}/${s.total}`;
}

// Lệnh khác cùng ngày vào, cùng chỉ số, đã ghi điều kiện — để bấm một cái là chép sang.
export function sameDayCond(trades, t, regime) {
  if (!t || !t.entryDate || !regime) return null;
  return (trades || []).find((x) => x && x.id !== t.id && x.entryDate === t.entryDate
    && x.marketCond && x.marketCond.regimeId === regime.id && condScore(x, regime).answered > 0) || null;
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

// Thống kê lệnh ĐÃ ĐÓNG của một chỉ số:
//   levels: nhóm theo số điều kiện đạt (chỉ lệnh đã ghi đủ mọi điều kiện) — N/N trước, 0/N cuối.
//   partial: ghi thiếu vài điều kiện; missing: chưa ghi gì.
//   byCondition: từng điều kiện riêng lẻ, đạt vs không đạt.
//   full / rest: đạt đủ mọi điều kiện so với phần còn lại (trong số lệnh đã ghi đủ).
export function regimeStats(trades, regime, resources, opts = {}) {
  const regimes = marketRegimesOf(resources);
  const accounts = (resources && resources.accounts) || [];
  const conds = activeConditions(regime);
  const total = conds.length;
  const levels = Array.from({ length: total + 1 }, (_, i) => ({ met: total - i, ...emptyBucket() }));
  const partial = emptyBucket();
  const missing = emptyBucket();
  const full = emptyBucket();
  const rest = emptyBucket();
  const byCondition = conds.map((c) => ({ id: c.id, label: c.label, yes: emptyBucket(), no: emptyBucket() }));
  const missingTrades = [];

  closedOfUSD(trades || [], resources).forEach(({ t, r }) => {
    if (opts.direction && t.direction !== opts.direction) return;
    const reg = tradeRegime(t, regimes, accounts);
    if (!reg || reg.id !== regime.id) return;
    const s = condScore(t, regime);
    if (!s.answered) { addTo(missing, r); missingTrades.push(t); return; }
    const checks = t.marketCond.checks || {};
    byCondition.forEach((c) => {
      if (checks[c.id] === true) addTo(c.yes, r);
      else if (checks[c.id] === false) addTo(c.no, r);
    });
    if (s.answered < total) { addTo(partial, r); return; }
    addTo(levels[total - s.met], r);
    addTo(s.met === total ? full : rest, r);
  });

  return {
    total,
    levels: levels.map((l) => ({ ...finish(l), met: l.met })),
    partial: finish(partial),
    missing: finish(missing),
    missingTrades,
    full: finish(full),
    rest: finish(rest),
    byCondition: byCondition.map((c) => ({ ...c, yes: finish(c.yes), no: finish(c.no) })),
  };
}
