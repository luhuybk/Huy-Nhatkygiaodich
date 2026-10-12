// Điều kiện thị trường chung: mỗi loại thị trường có một chỉ số làm "nhiệt kế" — S&P 500 cho
// US Stock, VN-Index cho VN Stock. Cùng một setup, vào lệnh lúc chỉ số đang khoẻ thường thắng
// nhiều hơn lúc chỉ số yếu — nhưng phải ghi lại từng lệnh thì mới biết "thường" là bao nhiêu.
// Hàng hoá, forex... không có chỉ số chung thì để tài khoản đó không gắn chỉ số nào.
//
// Mỗi chỉ số có một danh sách TRẠNG THÁI loại trừ nhau ("Trên EMA9, EMA9 trên EMA21, dốc lên",
// "Trên EMA9 nhưng dưới EMA21"...). Mỗi lệnh tick đúng một trạng thái. Không chấm điểm từng
// điều kiện rời: "trên EMA9 dưới EMA21" và "dưới EMA9 trên EMA21" cùng là 2/3 nhưng là hai
// thị trường khác hẳn nhau.
//
// Cấu hình ở resources.marketRegimes = [{ id, name, accountIds, states: [{ id, label, tone, note }] }].
// note: ghi chú tự do (VD khuyến nghị đi vốn), hiện khi rê chuột vào trạng thái trong form lệnh.
// Lệnh ghi ở trade.marketCond = { regimeId, stateId }; regimeId = "none" là "không áp dụng".
// Trạng thái khoá theo id, không theo chữ: sửa chữ không mất dữ liệu cũ.
import { closedOfUSD, uid } from "./helpers.js";

export const REGIME_NONE = "none";
// Dưới mức này thì mỗi nhóm chỉ là vài lệnh — winrate nhảy 30% chỉ vì thêm một lệnh thắng.
export const REGIME_MIN_SAMPLE = 10;

export const REGIME_TONES = [
  { id: "good", label: "Thuận" },
  { id: "neutral", label: "Trung tính" },
  { id: "bad", label: "Nghịch" },
];
export const toneLabel = (id) => (REGIME_TONES.find((x) => x.id === id) || REGIME_TONES[1]).label;

// Id cố định để bộ mặc định (chưa lưu lần nào) vẫn khớp với những lệnh đã ghi theo nó.
const defaultStates = (prefix) => [
  { id: `${prefix}-up`, label: "Trên EMA9 · EMA9 trên EMA21 · dốc lên", tone: "good" },
  { id: `${prefix}-pullback`, label: "Dưới EMA9 · vẫn trên EMA21 (điều chỉnh)", tone: "neutral" },
  { id: `${prefix}-recover`, label: "Trên EMA9 · nhưng dưới EMA21 (hồi phục)", tone: "neutral" },
  { id: `${prefix}-side`, label: "Đi ngang · EMA9 và EMA21 đan xen", tone: "neutral" },
  { id: `${prefix}-down`, label: "Dưới EMA9 · EMA9 dưới EMA21 · dốc xuống", tone: "bad" },
];

// Gắn sẵn tài khoản theo tên: "US Stock" → S&P 500, "VN Stock" → VN-Index.
export function defaultRegimes(accounts) {
  const list = (accounts || []).filter((a) => a && a.id && a.name);
  const match = (re) => list.filter((a) => re.test(a.name)).map((a) => a.id);
  return [
    { id: "sp500", name: "S&P 500", accountIds: match(/\bUS\b|Mỹ/i), states: defaultStates("sp500") },
    { id: "vnindex", name: "VN-Index", accountIds: match(/\bVN\b|Việt/i), states: defaultStates("vnindex") },
  ];
}

export function marketRegimesOf(resources) {
  const saved = resources && resources.marketRegimes;
  if (!Array.isArray(saved)) return defaultRegimes(resources && resources.accounts);
  // Bản lưu từ phiên bản chấm điểm từng điều kiện chưa có `states` — cấp bộ mặc định.
  return saved.filter((r) => r && r.id).map((r) => (Array.isArray(r.states) ? r : { ...r, states: defaultStates(r.id) }));
}

export function emptyState() {
  return { id: uid(), label: "", tone: "neutral", note: "" };
}

export function emptyRegime() {
  return { id: uid(), name: "", accountIds: [], states: [emptyState()] };
}

// Trạng thái vừa bấm "Thêm" mà chưa đặt tên thì coi như chưa có.
export function activeStates(regime) {
  return ((regime && regime.states) || []).filter((s) => s && s.id && String(s.label || "").trim());
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

// Trạng thái đã tick (chỉ khi lệnh ghi đúng theo chỉ số này và trạng thái đó còn tồn tại).
export function tradeState(t, regime) {
  const mc = t && t.marketCond;
  if (!regime || !mc || mc.regimeId !== regime.id || !mc.stateId) return null;
  return activeStates(regime).find((s) => s.id === mc.stateId) || null;
}

// Lệnh khác cùng ngày vào, cùng chỉ số, đã tick trạng thái — để bấm một cái là chép sang.
export function sameDayState(trades, t, regime) {
  if (!t || !t.entryDate || !regime) return null;
  const hit = (trades || []).find((x) => x && x.id !== t.id && x.entryDate === t.entryDate && tradeState(x, regime));
  return hit ? { trade: hit, state: tradeState(hit, regime) } : null;
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

// Thống kê lệnh ĐÃ ĐÓNG của một chỉ số: theo từng trạng thái, theo nhóm Thuận/Trung tính/Nghịch,
// Thuận so với phần còn lại, và những lệnh chưa tick.
export function regimeStats(trades, regime, resources, opts = {}) {
  const regimes = marketRegimesOf(resources);
  const accounts = (resources && resources.accounts) || [];
  const states = activeStates(regime).map((s) => ({ id: s.id, label: s.label, tone: s.tone || "neutral", ...emptyBucket() }));
  const tones = REGIME_TONES.map((x) => ({ id: x.id, label: x.label, ...emptyBucket() }));
  const good = emptyBucket();
  const rest = emptyBucket();
  const missing = emptyBucket();
  const missingTrades = [];

  closedOfUSD(trades || [], resources).forEach(({ t, r }) => {
    if (opts.direction && t.direction !== opts.direction) return;
    const reg = tradeRegime(t, regimes, accounts);
    if (!reg || reg.id !== regime.id) return;
    const st = tradeState(t, regime);
    if (!st) { addTo(missing, r); missingTrades.push(t); return; }
    addTo(states.find((s) => s.id === st.id), r);
    const tone = REGIME_TONES.some((x) => x.id === st.tone) ? st.tone : "neutral";
    addTo(tones.find((x) => x.id === tone), r);
    addTo(tone === "good" ? good : rest, r);
  });

  return {
    states: states.map((s) => ({ ...finish(s), id: s.id, label: s.label, tone: s.tone })),
    tones: tones.map((x) => ({ ...finish(x), id: x.id, label: x.label })),
    good: finish(good),
    rest: finish(rest),
    missing: finish(missing),
    missingTrades,
  };
}
