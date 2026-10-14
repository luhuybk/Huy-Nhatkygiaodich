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
// riskMin / riskMax: khung đi vốn (% rủi ro mỗi lệnh) cho trạng thái đó — để trống là không đặt khung,
// riskMax = 0 là "đứng ngoài". Có khung thì form lệnh báo khi đi vốn lệch, trang thống kê so kết quả
// lệnh đi đúng khung với lệnh vượt khung.
// Lệnh ghi ở trade.marketCond = { regimeId, stateId }; regimeId = "none" là "không áp dụng".
// Trạng thái khoá theo id, không theo chữ: sửa chữ không mất dữ liệu cũ.
import { closedOfUSD, uid } from "./helpers.js";

export const REGIME_NONE = "none";
// Dưới mức này thì mỗi nhóm chỉ là vài lệnh — winrate nhảy 30% chỉ vì thêm một lệnh thắng.
export const REGIME_MIN_SAMPLE = 10;

// Ba nhóm cố định (id good / neutral / bad — thống kê gộp theo đây), tên và màu thì người dùng tự đặt,
// lưu ở resources.regimeGroups = { good: { label, color }, ... }, dùng chung cho mọi chỉ số.
// icon khác nhau theo nhóm để không phải dựa hẳn vào màu.
export const REGIME_TONES = [
  { id: "good", label: "Tích cực", color: "#4caf7d", icon: "▲" },
  { id: "neutral", label: "Trung tính", color: "#e0a64e", icon: "●" },
  { id: "bad", label: "Tiêu cực", color: "#e0615a", icon: "▼" },
];
export const GROUP_COLORS = ["#4caf7d", "#2fb5a3", "#5b9cf5", "#a3a9e8", "#c879e0", "#e0a64e", "#d8c94a", "#8d9198", "#ff8a65", "#e0615a"];
const HEX = /^#[0-9a-f]{6}$/i;

export function regimeGroupsOf(resources) {
  const saved = (resources && resources.regimeGroups) || {};
  return REGIME_TONES.map((g) => {
    const x = saved[g.id] || {};
    return { ...g, label: String(x.label || "").trim() || g.label, color: HEX.test(x.color || "") ? x.color : g.color };
  });
}
export const groupOf = (groups, tone) => (groups || REGIME_TONES).find((g) => g.id === tone) || (groups || REGIME_TONES)[1];
export const toneLabel = (id, groups) => groupOf(groups, id).label;

// Biến CSS màu nhóm: --tone cho chữ / viền, --tone-rgb cho nền mờ.
export function toneVars(group) {
  const c = (group && group.color) || "#8d9198";
  const n = parseInt(c.slice(1), 16);
  return { "--tone": c, "--tone-rgb": `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}` };
}

// Tên nhóm của trạng thái ("Tích cực").
export const stateName = (s, groups) => (s ? toneLabel(s.tone || "neutral", groups) : "");

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
  const list = Array.isArray(saved) ? saved.filter((r) => r && r.id) : defaultRegimes(resources && resources.accounts);
  // Bản lưu từ phiên bản chấm điểm từng điều kiện chưa có `states` — cấp bộ mặc định.
  return list.map((r) => (Array.isArray(r.states) ? r : { ...r, states: defaultStates(r.id) }));
}

export function emptyState(tone = "neutral") {
  return { id: uid(), label: "", tone, note: "", riskMin: "", riskMax: "" };
}

// Chép toàn bộ trạng thái của chỉ số nguồn sang chỉ số đích (thay hẳn). Trạng thái mặc định giữ đúng
// "đuôi" id ("sp500-up" → "vnindex-up") để lệnh của chỉ số đích đã tick theo bộ mặc định vẫn khớp;
// trạng thái tự thêm thì nhận id mới.
export function cloneStates(source, target) {
  const pre = `${source.id}-`;
  return activeStates(source).map((s) => ({ ...s, id: s.id.startsWith(pre) ? `${target.id}-${s.id.slice(pre.length)}` : uid() }));
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

const pctOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Khung đi vốn của một trạng thái, hoặc null nếu chưa đặt. Nhập ngược (từ > đến) thì đảo lại.
export function stateRiskBand(state) {
  if (!state) return null;
  let min = pctOrNull(state.riskMin);
  let max = pctOrNull(state.riskMax);
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min, max };
}

const fmtNum = (n) => String(Math.round(n * 100) / 100);
export function riskBandText(band) {
  if (!band) return "";
  if (band.max === 0) return "Đứng ngoài";
  if (band.min !== null && band.max !== null) return band.min === band.max ? `${fmtNum(band.min)}%` : `${fmtNum(band.min)}–${fmtNum(band.max)}%`;
  if (band.max !== null) return `≤ ${fmtNum(band.max)}%`;
  return `≥ ${fmtNum(band.min)}%`;
}

// Lệnh đi vốn so với khung: "in" | "over" | "under" — null khi trạng thái chưa có khung hoặc lệnh
// chưa ghi % rủi ro. Làm tròn 2 chữ số để 1.2000001 không bị tính là vượt 1.2.
export const RISK_FIT = [
  { id: "in", label: "Đúng khung" },
  { id: "over", label: "Vượt khung" },
  { id: "under", label: "Dưới khung" },
];
export function riskFit(t, state) {
  const band = stateRiskBand(state);
  const pct = pctOrNull(t && t.riskPercent);
  if (!band || pct === null) return null;
  const v = Math.round(pct * 100) / 100;
  if (band.max === 0) return v > 0 ? "over" : "in";
  if (band.max !== null && v > band.max) return "over";
  if (band.min !== null && v < band.min) return "under";
  return "in";
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

// Thống kê lệnh ĐÃ ĐÓNG của một chỉ số: theo từng trạng thái (xếp theo nhóm, giữ thứ tự), theo
// nhóm, nhóm Tích cực so với phần còn lại, và những lệnh chưa tick.
export function regimeStats(trades, regime, resources, opts = {}) {
  const regimes = marketRegimesOf(resources);
  const accounts = (resources && resources.accounts) || [];
  const groups = regimeGroupsOf(resources);
  const rank = (s) => REGIME_TONES.findIndex((g) => g.id === (s.tone || "neutral"));
  const states = activeStates(regime)
    .map((s, i) => ({ id: s.id, label: s.label, tone: s.tone || "neutral", note: s.note || "", order: i, ...emptyBucket() }))
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  const tones = groups.map((x) => ({ id: x.id, label: x.label, ...emptyBucket() }));
  const good = emptyBucket();
  const rest = emptyBucket();
  const missing = emptyBucket();
  const missingTrades = [];
  const fit = RISK_FIT.map((x) => ({ id: x.id, label: x.label, ...emptyBucket() }));
  const fitTrades = { over: [], under: [] };
  let noBand = 0;
  let noRisk = 0;

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
    const f = riskFit(t, st);
    if (f) {
      addTo(fit.find((x) => x.id === f), r);
      if (fitTrades[f]) fitTrades[f].push({ t, state: st });
    } else if (!stateRiskBand(st)) noBand += 1;
    else noRisk += 1;
  });

  return {
    states: states.map((s) => ({ ...finish(s), id: s.id, label: s.label, tone: s.tone, note: s.note })),
    tones: tones.map((x) => ({ ...finish(x), id: x.id, label: x.label })),
    good: finish(good),
    rest: finish(rest),
    missing: finish(missing),
    missingTrades,
    fit: fit.map((x) => ({ ...finish(x), id: x.id, label: x.label })),
    fitTrades,
    noBand,
    noRisk,
  };
}
