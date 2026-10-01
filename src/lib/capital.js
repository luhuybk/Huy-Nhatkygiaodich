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

// Luật gợi ý theo R (cộng dồn, tính theo ngày đóng lệnh):
//   downW1 / downW2: 1 tuần / 2 tuần ≤ ngưỡng → hạ 1 bậc mỗi điều kiện chạm.
//   holdM: 4 tuần ≤ ngưỡng → về mốc cầm chừng.
//   upW1 + upM: 1 tuần ≥ upW1 VÀ 4 tuần ≥ upM → tăng 1 bậc (mỗi tuần tối đa 1 bậc).
//   minUp: 1 tuần phải có ít nhất chừng này lệnh mới được tăng — 1 lệnh ăn 3R chưa nói lên gì.
export const R_RULE_DEFAULT = { downW1: -2, downW2: -3, holdM: -5, upW1: 2, upM: 0, minUp: 2 };
export const R_RULE_FIELDS = ["downW1", "downW2", "holdM", "upW1", "upM", "minUp"];

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function emptyCapitalMarket() {
  return {
    id: uid(), name: "", currency: "USD", rate: 1, allocated: 0, deposited: 0,
    tiers: [0.6, 1.2, 1.6], defaultTier: 1.2, accountIds: [],
    // Mốc cầm chừng: mức thấp nhất, dùng khi setup vẫn hợp lệ nhưng đang sụt sâu hoặc thua
    // liên tiếp. Tách riêng khỏi `tiers` để app biết mà gợi ý đúng nó lúc chạm ngưỡng.
    holdTier: null,
    // Tài khoản phụ (crypto, hàng hóa...): vốn ước lượng, trade nhẹ — không tính vào hệ số
    // cấp của quỹ chính và không bị nhắc chọn mức mỗi tuần.
    side: false,
    // Luật gợi ý mức tuần sau theo phong độ R — mỗi mảng một bộ riêng.
    rRule: { ...R_RULE_DEFAULT },
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
      // FX là 3 tài khoản riêng biệt, mỗi tài khoản một mảng — tuần này tài khoản này tệ, tài
      // khoản kia tốt thì đi vốn khác nhau.
      ...[1, 2, 3].map((i) => ({ ...emptyCapitalMarket(), id: `fx-${i}`, name: `FX ${i}`, allocated: 12500, deposited: 1000, tiers: [0.6, 1.2, 1.4, 1.6], holdTier: 0.3 })),
    ],
    picks: {},
  };
}

export function normalizeRRule(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = {};
  R_RULE_FIELDS.forEach((k) => { out[k] = num(r[k], R_RULE_DEFAULT[k]); });
  out.minUp = Math.max(0, Math.round(out.minUp));
  return out;
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
      // Chỉ còn ở dữ liệu cũ (FX 37.500 "× 3 tài khoản"); splitMultiAccountMarkets tách nó ra.
      accountCount: Math.max(1, Math.round(num(m.accountCount, 1))),
      deposited: num(m.deposited, 0),
      tiers: sortTiers(m.tiers),
      accountIds: Array.isArray(m.accountIds) ? m.accountIds : [],
      holdTier: num(m.holdTier, 0) > 0 ? num(m.holdTier, 0) : null,
      side: !!m.side,
      rRule: normalizeRRule(m.rRule),
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

// Vốn tính rủi ro của mảng, theo tiền của mảng. (Chia cho accountCount chỉ để dữ liệu cũ chưa kịp
// tách vẫn ra đúng số; sau khi tách thì luôn là 1.)
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
    const v = (plan.picks[keys[i]] || {})[marketId];
    if (has(v)) return { pct: num(v, 0), from: keys[i], explicit: keys[i] === week };
  }
  const tiers = m ? m.tiers : [];
  const fallback = m && tiers.includes(num(m.defaultTier, NaN)) ? num(m.defaultTier, 0) : tiers[Math.floor((tiers.length - 1) / 2)];
  return { pct: fallback === undefined ? null : fallback, from: "", explicit: false };
}

const has = (v) => v !== undefined && v !== null && v !== "";

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

// Tài khoản lá của một mảng dữ liệu cũ kiểu "FX × 3 tài khoản" — dùng khi tách mảng đó ra.
export function marketUnits(m, accounts) {
  if (!m || num(m.accountCount, 1) <= 1) return [];
  const names = marketAccountNames(m, accounts);
  const leaves = (accounts || []).filter((a) => a && names.has(a.name) && !isGroup(accounts, a));
  return leaves.length >= 2 ? leaves : [];
}

// Tên ngắn của tài khoản con, bỏ phần chung của cả nhóm: "Forex - H3", "Forex - H8",
// "Forex - D" → "H3", "H8", "D". Chỉ cắt tới dấu phân cách (cách, -, _, ·, :, /, |, .) để không
// cắt đôi một chữ — "H3" với "H8" chung chữ "H" nhưng không được thành "3" với "8".
export function unitLabel(m, account, siblings) {
  const name = (account && account.name) || "";
  const names = (siblings || []).map((a) => (a && a.name) || "").filter(Boolean);
  if (names.length >= 2 && names.includes(name)) {
    let common = names[0];
    names.forEach((n) => { while (common && !n.startsWith(common)) common = common.slice(0, -1); });
    const hit = /^(.*[\s\-_·:/|.])/.exec(common);
    const cut = hit ? hit[1].length : 0;
    if (cut && names.every((n) => n.slice(cut).trim())) return name.slice(cut).trim();
  }
  const prefix = `${(m && m.name) || ""} `.toLowerCase();
  return prefix.trim() && name.toLowerCase().startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name;
}

// Dữ liệu cũ: một mảng "FX 37.500 × 3 tài khoản" dùng chung mức và bắt chọn mức theo tài khoản
// con. Giờ mỗi tài khoản là một mảng riêng biệt, nên tách nó thành 3 mảng 12.500, mỗi mảng gắn
// đúng một tài khoản. Mức đã chọn riêng cho tài khoản con (khoá "fx/<id>") theo sang mảng mới;
// tuần nào chỉ có mức chung thì mảng mới nhận mức chung đó. Tiền đã nạp chia đều.
// Chưa gắn đủ tài khoản con thì vẫn tách theo số tài khoản, đặt tên 1, 2, 3 và để trống tài khoản.
export function splitMultiAccountMarkets(plan, accounts) {
  if (!plan || !(plan.markets || []).some((m) => num(m.accountCount, 1) > 1)) return { plan, changed: false };
  const picks = {};
  Object.entries(plan.picks || {}).forEach(([k, row]) => { picks[k] = { ...(row || {}) }; });
  const markets = [];
  plan.markets.forEach((m) => {
    const n = Math.max(1, Math.round(num(m.accountCount, 1)));
    if (n <= 1) { markets.push(m); return; }
    const units = marketUnits(m, accounts);
    const parts = units.length
      ? units.map((a) => ({ acc: a, label: unitLabel(m, a, units) }))
      : Array.from({ length: n }, (_, i) => ({ acc: null, label: String(i + 1) }));
    const taken = new Set(plan.markets.map((x) => x.id));
    parts.forEach(({ acc, label }, i) => {
      let id = `${m.id}-${acc ? acc.id : i + 1}`;
      while (taken.has(id)) id += "x";
      taken.add(id);
      markets.push({
        ...m, id, name: `${m.name} ${label}`.trim(), accountCount: 1,
        allocated: num(m.allocated, 0) / n,
        deposited: roundMoney(num(m.deposited, 0) / parts.length, m.currency),
        accountIds: acc ? [acc.id] : [],
      });
      Object.values(picks).forEach((row) => {
        const own = acc ? row[`${m.id}/${acc.id}`] : undefined;
        const v = has(own) ? own : row[m.id];
        if (has(v)) row[id] = v;
      });
    });
    Object.values(picks).forEach((row) => {
      delete row[m.id];
      Object.keys(row).forEach((k) => { if (k.startsWith(`${m.id}/`)) delete row[k]; });
    });
  });
  Object.keys(picks).forEach((k) => { if (!Object.keys(picks[k]).length) delete picks[k]; });
  return { plan: { ...plan, markets, picks }, changed: true };
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

function lossStreakOf(closed) {
  let n = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].r.profit < 0; i--) n++;
  return n;
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
// kể từ ngày bắt đầu. Gắn nhiều tài khoản vào một mảng (VD hai sàn chứng khoán) thì chúng dùng
// chung vốn nên chung một đường.
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

  const c = curveDrawdown(closed.map(pnl), base);
  return {
    pct: c.pct, level: drawdownLevel(plan, c.pct), current: c.current, peak: c.peak,
    tradeCount: closed.length, linked: names.size > 0,
    // Chuỗi thua đang chạy — lý do thứ hai để về mốc cầm chừng, bên cạnh sụt vốn.
    lossStreak: lossStreakOf(closed),
  };
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

// ——— Phong độ R → gợi ý mức tuần sau ———
// Ba khung cộng dồn, cùng kết thúc ở cuối tuần này (tuần đang chạy là tuần sát tuần sau nhất):
// 1 tuần = tuần này, 2 tuần = tuần này + tuần trước, 4 tuần ≈ 1 tháng. Giữa tuần thì tuần này
// chưa xong — gợi ý vẫn tính được nhưng chỉ chốt lúc cuối tuần.
// Lệnh tính theo NGÀY ĐÓNG: R thật sự xảy ra lúc đóng, không phải lúc vào.
export const R_WINDOWS = [
  { key: "w1", weeks: 1, label: "1 tuần" },
  { key: "w2", weeks: 2, label: "2 tuần" },
  { key: "w4", weeks: 4, label: "4 tuần" },
];

export function rWindowRanges(dateStr) {
  const now = thisWeekKey(dateStr);
  const to = shiftDate(now, 6);
  return R_WINDOWS.map((w) => ({ ...w, from: shiftDate(now, -7 * (w.weeks - 1)), to }));
}

export function marketRStats(m, trades, accounts, dateStr) {
  const names = marketAccountNames(m, accounts);
  const ranges = rWindowRanges(dateStr);
  const oldest = ranges[ranges.length - 1].from;
  const to = ranges[0].to;
  const closed = (trades || [])
    .filter((t) => t && names.has(t.account) && t.exitDate && t.exitDate >= oldest && t.exitDate <= to)
    .map((t) => ({ d: t.exitDate, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed");
  const windows = {};
  ranges.forEach((w) => {
    const list = closed.filter((x) => x.d >= w.from);
    const withR = list.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
    const r = withR.reduce((s, x) => s + x.r.rr, 0);
    windows[w.key] = {
      ...w, r, n: withR.length, wins: withR.filter((x) => x.r.rr > 0).length,
      avg: withR.length ? r / withR.length : null,
      // Lệnh đã đóng mà thiếu tiền rủi ro thì không ra R — báo ra để biết số R đang thiếu lệnh nào.
      missing: list.length - withR.length,
    };
  });
  return { linked: names.size > 0, windows };
}

const fmtRShort = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Number(Math.abs(v).toFixed(1)).toString().replace(".", ",")}R`;
export { fmtRShort as fmtRVN };

// Gợi ý mức cho tuần sau, tính từ mức tuần này. Xấu thì được hạ nhiều bậc một lúc, tốt thì chỉ
// tăng 1 bậc. Sụt vốn chạm ngưỡng "giảm risk hẳn" cũng kéo về cầm chừng như luật 4 tuần; đang ở
// ngưỡng cảnh báo thì không tăng.
export function suggestNextTier(plan, m, stats, dd, dateStr) {
  const rule = normalizeRRule(m.rRule);
  const list = marketTierList(m).map((x) => x.pct);
  const base = pickedTier(plan, m.id, thisWeekKey(dateStr)).pct;
  if (!list.length || base === null) return null;
  let idx = -1;
  list.forEach((p, i) => { if (p <= base) idx = i; });
  if (idx < 0) idx = 0;
  const reasons = [];
  if (!stats.linked) return { base, pct: base, action: "none", reasons: ["Chưa gắn tài khoản"], rule };
  const { w1, w2, w4 } = stats.windows;
  let target = idx;
  let fired = false;
  let toHold = false;
  if (w4.r <= rule.holdM && w4.n) { toHold = true; reasons.push(`4 tuần ${fmtRShort(w4.r)} ≤ ${fmtRShort(rule.holdM)}`); }
  if (dd && dd.level === "cut") { toHold = true; reasons.push(`sụt vốn ${fmtPctVN(dd.pct, 1)}`); }
  let down = 0;
  if (w1.r <= rule.downW1 && w1.n) { down++; reasons.push(`1 tuần ${fmtRShort(w1.r)} ≤ ${fmtRShort(rule.downW1)}`); }
  if (w2.r <= rule.downW2 && w2.n) { down++; reasons.push(`2 tuần ${fmtRShort(w2.r)} ≤ ${fmtRShort(rule.downW2)}`); }
  if (toHold) { target = 0; fired = true; } else if (down) { target = Math.max(0, (list[idx] === base ? idx : idx + 1) - down); fired = true; }
  else if (w1.r >= rule.upW1 && w4.r >= rule.upM) {
    if (w1.n < rule.minUp) reasons.push(`1 tuần mới ${w1.n} lệnh — cần ${rule.minUp} lệnh mới tăng`);
    else if (dd && dd.level === "warn") reasons.push(`đang cảnh báo sụt vốn ${fmtPctVN(dd.pct, 1)} — chưa tăng`);
    else { target = Math.min(list.length - 1, idx + 1); fired = true; reasons.push(`1 tuần ${fmtRShort(w1.r)} ≥ ${fmtRShort(rule.upW1)}, 4 tuần ${fmtRShort(w4.r)}`); }
  }
  // Không luật nào chạm thì giữ đúng mức đang đi, kể cả khi mức đó đã bị gỡ khỏi danh sách.
  const pct = fired ? list[target] : base;
  const action = pct > base ? "up" : pct < base ? "down" : "same";
  if (action === "same" && !reasons.length) reasons.push(w1.n || w4.n ? "Chưa chạm ngưỡng nào" : "Chưa có lệnh đóng trong 4 tuần");
  if (action === "same" && (toHold || down)) reasons.push("đã ở mức thấp nhất");
  return { base, pct, action, reasons, rule, hold: pct === m.holdTier };
}

