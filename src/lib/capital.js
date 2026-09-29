// Bảng phân bổ vốn: một quỹ vốn tổng chia ra nhiều mảng (US Stock, VN Stock, FX...). Mỗi mảng
// có vài mức rủi ro — mức thấp cho lúc thị trường bất lợi, mức cao cho lúc thuận lợi — và mỗi
// cuối tuần chọn một mức cho tuần sau. Rủi ro tính theo % vốn của MẢNG, rồi quy ngược về % vốn
// tổng để các mảng so được với nhau trên cùng một thước.
//
// Lưu ở khoá `capitalPlan`. Bot Telegram (sl-reminder) đọc khoá này để nhắc chọn mức tuần sau —
// sửa cách tính sụt vốn ở đây thì sửa luôn bên đó, không thì tin nhắn và app nói hai con số.
import { accountFamily, computeResult, dateKey, shiftDate, todayStr, uid, weekStart } from "./helpers.js";

export const DD_WARN_DEFAULT = 8;
export const DD_CUT_DEFAULT = 12;

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function emptyCapitalMarket() {
  return {
    id: uid(), name: "", currency: "USD", rate: 1, allocated: 0, accountCount: 1, deposited: 0,
    tiers: [0.6, 1.2, 1.6], defaultTier: 1.2, accountIds: [],
    // Mốc cầm chừng: mức thấp nhất, dùng khi setup vẫn hợp lệ nhưng đang sụt sâu hoặc thua
    // liên tiếp. Tách riêng khỏi `tiers` để app biết mà gợi ý đúng nó lúc chạm ngưỡng.
    holdTier: null,
    // Tài khoản phụ (crypto, hàng hóa...): vốn ước lượng, trade nhẹ — không tính vào hệ số
    // cấp của quỹ chính và không bị nhắc chọn mức mỗi tuần.
    side: false,
  };
}

// Bảng mẫu dựng đúng theo sheet đang dùng — mở tab lần đầu là thấy ngay con số quen, chỉ còn
// việc gắn tài khoản. Chưa sửa gì thì chưa lưu.
export function defaultCapitalPlan() {
  return {
    totalCapital: 50000,
    startDate: todayStr(),
    ddWarnPct: DD_WARN_DEFAULT,
    ddCutPct: DD_CUT_DEFAULT,
    markets: [
      { ...emptyCapitalMarket(), id: "us-stock", name: "US Stock", allocated: 20000, deposited: 4800, holdTier: 0.3 },
      { ...emptyCapitalMarket(), id: "vn-stock", name: "VN Stock", currency: "VND", rate: 25000, allocated: 20000, deposited: 500000000, holdTier: 0.3 },
      { ...emptyCapitalMarket(), id: "fx", name: "FX", allocated: 37500, accountCount: 3, deposited: 3000, tiers: [0.6, 1.2, 1.4, 1.6], holdTier: 0.3 },
    ],
    picks: {},
  };
}

export function sortTiers(list) {
  return [...new Set((list || []).map((x) => num(x, null)).filter((x) => x !== null && x > 0))].sort((a, b) => a - b);
}

export function normalizeCapitalPlan(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.markets)) return null;
  return {
    totalCapital: num(raw.totalCapital, 0),
    startDate: typeof raw.startDate === "string" ? raw.startDate : "",
    ddWarnPct: num(raw.ddWarnPct, DD_WARN_DEFAULT),
    ddCutPct: num(raw.ddCutPct, DD_CUT_DEFAULT),
    markets: raw.markets.filter((m) => m && m.id).map((m) => ({
      ...emptyCapitalMarket(),
      ...m,
      rate: m.currency === "USD" ? 1 : num(m.rate, 1) || 1,
      allocated: num(m.allocated, 0),
      accountCount: Math.max(1, Math.round(num(m.accountCount, 1))),
      deposited: num(m.deposited, 0),
      tiers: sortTiers(m.tiers),
      accountIds: Array.isArray(m.accountIds) ? m.accountIds : [],
      holdTier: num(m.holdTier, 0) > 0 ? num(m.holdTier, 0) : null,
      side: !!m.side,
    })),
    picks: raw.picks && typeof raw.picks === "object" && !Array.isArray(raw.picks) ? raw.picks : {},
  };
}

// Hệ số cấp = tổng vốn đã chia / vốn tổng. Lớn hơn 1 là đang chia vượt vốn thật — có chủ ý,
// vì không phải lúc nào mọi mảng cũng chịu rủi ro cùng lúc.
export function capitalScale(plan) {
  const sum = (list) => list.reduce((s, m) => s + num(m.allocated, 0), 0);
  const markets = plan.markets || [];
  const allocated = sum(markets.filter((m) => !m.side));
  return { allocated, side: sum(markets.filter((m) => m.side)), factor: plan.totalCapital ? allocated / plan.totalCapital : null };
}

// Mọi mức chọn được của một mảng, mốc cầm chừng đứng đầu. Cầm chừng trùng một mức thường thì
// chỉ giữ một, gắn nhãn cầm chừng — không hiện hai nút cùng một con số.
export function marketTierList(m) {
  const hold = num(m.holdTier, 0) > 0 ? num(m.holdTier, 0) : null;
  const list = (m.tiers || []).map((pct) => ({ pct, hold: pct === hold }));
  if (hold !== null && !list.some((x) => x.hold)) list.unshift({ pct: hold, hold: true });
  return list.sort((a, b) => a.pct - b.pct);
}

// Chạm ngưỡng "giảm risk hẳn" thì gợi ý về mốc cầm chừng; chưa đặt mốc đó thì về mức thấp nhất.
export function safestTier(m) {
  const list = marketTierList(m);
  return list.length ? list[0].pct : null;
}

// Vốn tính rủi ro của MỘT tài khoản trong mảng, theo tiền của mảng. FX 37.500 chia 3 tài khoản
// thì mỗi tài khoản 12.500 — rủi ro 1,2% là 150 chứ không phải 450.
export function marketUnitBase(m) {
  return (num(m.allocated, 0) * (m.currency === "USD" ? 1 : num(m.rate, 1))) / Math.max(1, num(m.accountCount, 1));
}

export function roundMoney(v, currency) {
  if (!Number.isFinite(v)) return 0;
  return currency === "VND" ? Math.round(v) : Math.round(v * 100) / 100;
}

export function tierMoney(m, pct) {
  return roundMoney((marketUnitBase(m) * num(pct, 0)) / 100, m.currency);
}

// Một lệnh ở mức này chiếm bao nhiêu % vốn tổng — cột "Quy ra trên vốn tổng" trong sheet.
export function tierShareOfTotal(plan, m, pct) {
  if (!plan.totalCapital) return null;
  return (num(pct, 0) * (num(m.allocated, 0) / Math.max(1, num(m.accountCount, 1)))) / plan.totalCapital;
}

export function thisWeekKey(dateStr) { return weekStart(dateStr || todayStr()); }
export function nextWeekKey(dateStr) { return shiftDate(thisWeekKey(dateStr), 7); }

// Mức đang áp cho một tuần: lần chọn gần nhất tính tới tuần đó. Tuần mới mà chưa chọn thì giữ
// mức tuần trước — quên chọn không có nghĩa là muốn quay về mặc định.
export function pickedTier(plan, marketId, week) {
  const m = (plan.markets || []).find((x) => x.id === marketId);
  const keys = Object.keys(plan.picks || {}).filter((k) => k <= week).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    const v = plan.picks[keys[i]] && plan.picks[keys[i]][marketId];
    if (v !== undefined && v !== null && v !== "") return { pct: num(v, 0), from: keys[i], explicit: keys[i] === week };
  }
  const tiers = m ? m.tiers : [];
  const fallback = m && tiers.includes(num(m.defaultTier, NaN)) ? num(m.defaultTier, 0) : tiers[Math.floor((tiers.length - 1) / 2)];
  return { pct: fallback === undefined ? null : fallback, from: "", explicit: false };
}

export function setPick(plan, week, marketId, pct) {
  const cur = { ...((plan.picks || {})[week] || {}) };
  if (pct === null || pct === undefined) delete cur[marketId];
  else cur[marketId] = pct;
  const picks = { ...(plan.picks || {}) };
  if (Object.keys(cur).length) picks[week] = cur;
  else delete picks[week];
  return { ...plan, picks };
}

// Cuối tuần (T7, CN) mà còn mảng chưa chọn mức cho tuần sau.
export function marketsMissingNextPick(plan, dateStr) {
  const next = nextWeekKey(dateStr);
  return (plan.markets || []).filter((m) => !m.side && !pickedTier(plan, m.id, next).explicit);
}

export function isWeekend(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00").getDay();
  return d === 0 || d === 6;
}

function isGroup(accounts, a) {
  return (accounts || []).some((x) => x.parentId === a.id);
}

// Tài khoản gắn với mảng, kể cả tài khoản con khi gắn cả một nhóm.
export function marketAccountNames(m, accounts) {
  const out = new Set();
  (m.accountIds || []).forEach((id) => {
    const a = (accounts || []).find((x) => x.id === id);
    if (a) accountFamily(accounts, a.name).forEach((n) => out.add(n));
  });
  return out;
}

export function marketForAccount(plan, accountName, accounts) {
  if (!plan || !accountName) return null;
  return (plan.markets || []).find((m) => marketAccountNames(m, accounts).has(accountName)) || null;
}

// Lãi/lỗ quy về tiền của mảng. Tài khoản cùng loại tiền thì giữ nguyên; khác thì qua USD theo
// tỷ giá ở tab Tài khoản rồi nhân tỷ giá cố định của mảng.
function toMarketCurrency(amount, accCurrency, m, fxRates) {
  const cur = accCurrency || "USD";
  if (cur === m.currency) return amount;
  const r = cur === "USD" ? 1 : num(fxRates && fxRates[cur], 0);
  const usd = r > 0 ? amount / r : amount;
  return usd * (m.currency === "USD" ? 1 : num(m.rate, 1));
}

function curveDrawdown(events, base) {
  let equity = base;
  let peak = base;
  events.forEach((p) => { equity += p; if (equity > peak) peak = equity; });
  return { peak, current: equity, pct: peak > 0 ? Math.max(0, ((peak - equity) / peak) * 100) : 0 };
}

export function drawdownLevel(plan, pct) {
  if (pct >= num(plan.ddCutPct, DD_CUT_DEFAULT)) return "cut";
  if (pct >= num(plan.ddWarnPct, DD_WARN_DEFAULT)) return "warn";
  return "ok";
}

// Sụt vốn từ đỉnh, tính trên VỐN PHÂN CHIA (không phải tiền đã nạp) cộng lãi/lỗ các lệnh đã đóng
// kể từ ngày bắt đầu. Mảng nhiều tài khoản (FX) thì mỗi tài khoản một đường riêng — tài khoản
// quỹ có giới hạn sụt riêng — và mảng báo theo tài khoản đang tệ nhất.
export function marketDrawdown(plan, m, trades, resources) {
  const accounts = (resources && resources.accounts) || [];
  const fxRates = (resources && resources.fxRates) || {};
  const names = marketAccountNames(m, accounts);
  const from = plan.startDate || "";
  const base = marketUnitBase(m);
  const closed = (trades || [])
    .filter((t) => names.has(t.account) && (!from || (dateKey(t) || "") >= from))
    .map((t) => ({ t, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed" && x.r.profit !== null)
    .sort((a, b) => (dateKey(a.t) || "").localeCompare(dateKey(b.t) || "") || (a.t.createdAt || 0) - (b.t.createdAt || 0));
  const currencyOf = (name) => { const a = accounts.find((x) => x.name === name); return a ? a.currency : "USD"; };
  const pnl = (x) => toMarketCurrency(x.r.profit, currencyOf(x.t.account), m, fxRates);

  let curves;
  if (num(m.accountCount, 1) > 1) {
    const leaves = [...names].filter((n) => { const a = accounts.find((x) => x.name === n); return a && !isGroup(accounts, a); });
    const used = new Set(closed.map((x) => x.t.account));
    const list = [...new Set([...leaves, ...used])].sort();
    curves = list.map((name) => ({ name, ...curveDrawdown(closed.filter((x) => x.t.account === name).map(pnl), base) }));
  } else {
    curves = [{ name: "", ...curveDrawdown(closed.map(pnl), base) }];
  }
  if (!curves.length) curves = [{ name: "", ...curveDrawdown([], base) }];
  const worst = curves.reduce((w, c) => (c.pct > w.pct ? c : w), curves[0]);
  // Chuỗi thua đang chạy của cả mảng — lý do thứ hai để về mốc cầm chừng, bên cạnh sụt vốn.
  let lossStreak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].r.profit < 0; i--) lossStreak++;
  return { pct: worst.pct, level: drawdownLevel(plan, worst.pct), worst, curves, tradeCount: closed.length, linked: names.size > 0, lossStreak };
}

// Gợi ý cho form nhập lệnh: tài khoản này thuộc mảng nào, tuần của lệnh đang ở mức nào, và tiền
// rủi ro của từng mức. Tuần tính theo ngày vào lệnh, để sửa lệnh cũ vẫn thấy đúng mức lúc đó.
export function riskTierOptions(plan, accountName, dateStr, accounts) {
  const m = marketForAccount(plan, accountName, accounts);
  if (!m || !marketTierList(m).length) return null;
  const week = thisWeekKey(dateStr || todayStr());
  const picked = pickedTier(plan, m.id, week);
  return {
    market: m,
    week,
    picked,
    currency: m.currency,
    tiers: marketTierList(m).map(({ pct, hold }) => ({ pct, hold, money: tierMoney(m, pct), share: tierShareOfTotal(plan, m, pct), isPicked: pct === picked.pct })),
  };
}

// Số % viết kiểu Việt: 1.2 → "1,2%", 0.48 → "0,48%".
export function fmtPctVN(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = Number(v.toFixed(digits)).toString().replace(".", ",");
  return `${s}%`;
}
