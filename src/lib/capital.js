// Bảng phân bổ vốn: một quỹ vốn tổng chia ra nhiều mảng (US Stock, VN Stock, FX...). Mỗi mảng
// có vài mức rủi ro — mức thấp cho lúc thị trường bất lợi, mức cao cho lúc thuận lợi — và mỗi
// cuối tuần chọn một mức cho tuần sau. Rủi ro tính theo % vốn của MẢNG, rồi quy ngược về % vốn
// tổng để các mảng so được với nhau trên cùng một thước.
//
// Lưu ở khoá `capitalPlan`. Bot Telegram (sl-reminder) đọc khoá này để nhắc chọn mức tuần sau —
// sửa cách tính sụt vốn ở đây thì sửa luôn bên đó, không thì tin nhắn và app nói hai con số.
import { accountColor, accountFamily, computeResult, dateKey, shiftDate, todayStr, uid, weekStart } from "./helpers.js";
import { ASSET_GROUPS, assetGroupOfSymbol, isAssetGroupKey } from "./assetGroups.js";

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
    // Màu nhận diện của mảng (viền trái + chấm cạnh tên) — rỗng là không tô.
    color: "",
    // Chỉ tính những nhóm tài sản này (VD hàng hóa + crypto) — rỗng là mọi lệnh của tài khoản.
    // Hàng hóa đánh chung tài khoản FX cùng khung mà đi vốn nhỏ hơn: một mảng "Hàng hóa" gắn cả
    // ba tài khoản, chỉ nhận nhóm Hàng hóa / Crypto; mảng FX của từng tài khoản tự nhả các lệnh đó.
    assetGroups: [],
    // Bậc vốn tự tăng (null = tắt): vốn tính rủi ro lên một bậc mỗi khi vốn thật vượt +20%, hạ
    // bậc khi thủng mốc dưới. Bật thì "Vốn phân chia" do app tự đặt — xem ladderState.
    ladder: null,
  };
}

// Bảng màu cho mảng — cùng bộ với nhóm tình trạng thị trường để cả app một tông.
export const MARKET_COLORS = ["#5b9cf5", "#2fb5a3", "#4caf7d", "#d8c94a", "#e0a64e", "#ff8a65", "#e0615a", "#c879e0", "#a3a9e8", "#8d9198"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ASSET_GROUP_KEYS = new Set(ASSET_GROUPS.map((g) => g.key));

// Màu của mảng: chọn riêng thì dùng màu đó, không thì lấy màu của tài khoản đầu tiên gắn vào
// mảng (màu đặt ở tab Tài khoản) — để US Stock ở Nhật ký, Báo cáo tuần và Phân bổ vốn cùng một màu
// mà không phải chọn hai nơi. Chưa gắn tài khoản nào thì không tô.
export function marketColor(m, accounts) {
  if (!m) return "";
  if (m.color) return m.color;
  // Mảng chỉ nhận vài nhóm tài sản (Hàng hóa) thường gắn chung tài khoản với mảng FX — lấy màu tài
  // khoản thì hai mảng trùng màu, nên để trống cho người dùng tự chọn.
  if ((m.assetGroups || []).length) return "";
  const acc = (accounts || []).find((a) => a && (m.accountIds || []).includes(a.id));
  return acc ? accountColor(acc.name, accounts) : "";
}

// Style gắn vào thẻ / ô của mảng: CSS đọc biến --mk, không có màu thì không đặt gì.
export function marketColorStyle(m, accounts) {
  const c = marketColor(m, accounts);
  return c ? { "--mk": c } : undefined;
}

// Dời mảng sang trái / phải (dir = -1 / 1) — chỉ đổi chỗ với mảng kề bên CÙNG nhóm (chính / phụ),
// vì hai nhóm hiện ở hai lưới riêng.
export function moveMarket(plan, id, dir) {
  const list = [...plan.markets];
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return plan;
  let j = i + dir;
  while (j >= 0 && j < list.length && !!list[j].side !== !!list[i].side) j += dir;
  if (j < 0 || j >= list.length) return plan;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...plan, markets: list };
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

export const LADDER_STEP_DEFAULT = 20;
export const LADDER_DOWN_DEFAULT = 5;

export function normalizeLadder(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    on: !!raw.on,
    capital: Math.max(0, num(raw.capital, 0)),
    from: typeof raw.from === "string" ? raw.from : "",
    stepPct: num(raw.stepPct, LADDER_STEP_DEFAULT) > 0 ? num(raw.stepPct, LADDER_STEP_DEFAULT) : LADDER_STEP_DEFAULT,
    downPct: Math.max(0, num(raw.downPct, LADDER_DOWN_DEFAULT)),
    // Nạp thêm (số âm = rút ra): cộng thẳng vào vốn, vào vốn tính rủi ro và vào sàn của bậc.
    deposits: Array.isArray(raw.deposits)
      ? raw.deposits.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && num(d.amount, 0) !== 0)
        .map((d) => ({ id: d.id || uid(), date: d.date, amount: num(d.amount, 0) })).sort((a, b) => a.date.localeCompare(b.date))
      : [],
    // Lộ trình tới mục tiêu — chỉ để dự phóng / theo dõi, không đụng tới cách tính bậc.
    plan: normalizeRoadmap(raw.plan, raw),
  };
}

// Lộ trình: mục tiêu (1 lệnh ở mức `pct`% đạt `targetRisk`), kế hoạch nạp (mỗi tháng hoặc mỗi năm
// vào tháng `depMonth`), R/tháng dự tính, hạn muốn đạt (YYYY-MM). `snapshot` = lộ trình đã chốt để so
// tiến độ thật với kế hoạch. Dữ liệu cũ (yearlyDeposit / monthlyR / targetRisk) tự chuyển sang.
export function normalizeRoadmap(raw, legacy = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const ym = (v) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "");
  const snap = r.snapshot && typeof r.snapshot === "object" && /^\d{4}-\d{2}-\d{2}$/.test(r.snapshot.date || "") ? {
    date: r.snapshot.date,
    equity: num(r.snapshot.equity, 0), base: num(r.snapshot.base, 0),
    monthlyR: num(r.snapshot.monthlyR, 0), pct: num(r.snapshot.pct, 0),
    depAmount: Math.max(0, num(r.snapshot.depAmount, 0)), depEvery: r.snapshot.depEvery === "month" ? "month" : "year",
    depMonth: Math.min(12, Math.max(1, Math.round(num(r.snapshot.depMonth, 1)))),
    targetRisk: Math.max(0, num(r.snapshot.targetRisk, 0)), deadline: ym(r.snapshot.deadline),
    reachYm: ym(r.snapshot.reachYm),
  } : null;
  const legacyDep = Math.max(0, num(legacy.yearlyDeposit, 0));
  return {
    targetRisk: Math.max(0, num(r.targetRisk, num(legacy.targetRisk, 0))),
    pct: Math.max(0, num(r.pct, 0)),
    monthlyR: num(r.monthlyR, num(legacy.monthlyR, 0)),
    depAmount: Math.max(0, num(r.depAmount, legacyDep)),
    depEvery: r.depEvery === "month" ? "month" : "year",
    depMonth: Math.min(12, Math.max(1, Math.round(num(r.depMonth, 1)))),
    deadline: ym(r.deadline),
    snapshot: snap,
  };
}

export const ladderOn = (m) => !!(m && m.ladder && m.ladder.on && m.ladder.capital > 0 && m.ladder.from);

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
      color: HEX_COLOR.test(m.color || "") ? m.color : "",
      assetGroups: Array.isArray(m.assetGroups) ? m.assetGroups.filter((g) => ASSET_GROUP_KEYS.has(g)) : [],
      ladder: normalizeLadder(m.ladder),
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

// Mảng của một lệnh: trong các mảng gắn tài khoản của lệnh, mảng ghi đúng nhóm tài sản của lệnh
// được ưu tiên; không có thì tới mảng không giới hạn nhóm. Lệnh XAU ở "Trading - Ngắn" vào mảng
// Hàng hóa, lệnh EUR/USD cùng tài khoản vào mảng FX Ngắn.
export function marketResolver(plan, accounts) {
  const markets = ((plan && plan.markets) || []).map((m) => ({ m, names: marketAccountNames(m, accounts), groups: m.assetGroups || [] }));
  const currency = new Map((accounts || []).filter((a) => a && a.name).map((a) => [a.name, a.currency]));
  // `group`: loại tài sản chọn tay ở lệnh — có thì dùng luôn, không đoán theo mã.
  return (accountName, symbol, group = "") => {
    if (!accountName) return null;
    const cands = markets.filter((x) => x.names.has(accountName));
    if (!cands.length) return null;
    if (cands.some((x) => x.groups.length)) {
      const g = isAssetGroupKey(group) ? group : assetGroupOfSymbol(symbol, currency.get(accountName));
      const hit = cands.find((x) => x.groups.includes(g));
      if (hit) return hit.m;
    }
    const open = cands.find((x) => !x.groups.length);
    return open ? open.m : null;
  };
}

export function marketForAccount(plan, accountName, accounts, symbol = "", group = "") {
  if (!plan || !accountName) return null;
  return marketResolver(plan, accounts)(accountName, symbol, group);
}

// Nhóm tài sản đã có mảng riêng trên cùng tài khoản với `m` — tách thêm lần nữa thì hai mảng giành
// nhau một lệnh, nên nút Tách không cho chọn lại. Trả về { nhóm: tên mảng đang giữ }.
export function claimedAssetGroups(plan, m, accounts) {
  const mine = marketAccountNames(m, accounts);
  const out = {};
  ((plan && plan.markets) || []).forEach((x) => {
    if (x.id === m.id || !(x.assetGroups || []).length) return;
    if (![...marketAccountNames(x, accounts)].some((n) => mine.has(n))) return;
    x.assetGroups.forEach((g) => { if (!out[g]) out[g] = x.name; });
  });
  return out;
}

// Gom mảng theo tài khoản: mảng chỉ nhận vài nhóm (Hàng hóa + Crypto) mà mọi tài khoản của nó đều
// thuộc một mảng chung (không chọn nhóm) là "mảng con" của mảng chung đó — hai mảng chia nhau đúng một
// tài khoản sàn. Mảng Hàng hóa gắn cả ba tài khoản thì không thuộc mảng nào, đứng riêng.
export function marketFamilies(plan, accounts) {
  const markets = (plan && plan.markets) || [];
  const open = markets.filter((m) => !(m.assetGroups || []).length && (m.accountIds || []).length);
  const parentOf = new Map();
  markets.forEach((m) => {
    if (!(m.assetGroups || []).length || !(m.accountIds || []).length) return;
    const p = open.find((o) => m.accountIds.every((id) => o.accountIds.includes(id)));
    if (p) parentOf.set(m.id, p.id);
  });
  const families = open
    .map((p) => ({ parent: p, children: markets.filter((m) => parentOf.get(m.id) === p.id) }))
    .filter((f) => f.children.length)
    .map((f) => ({ ...f, accounts: (accounts || []).filter((a) => f.parent.accountIds.includes(a.id)) }));
  const inFamily = new Set(families.flatMap((f) => [f.parent.id, ...f.children.map((c) => c.id)]));
  return { families, loose: markets.filter((m) => !inFamily.has(m.id)), parentOf };
}

// Thứ tự hiện ở bảng tóm tắt / phong độ R: mảng chính trước, tài khoản phụ sau, mảng con đứng ngay
// sau mảng chung của nó (dù mảng con để ở tài khoản phụ).
export function marketDisplayOrder(plan, accounts) {
  const markets = (plan && plan.markets) || [];
  const { parentOf } = marketFamilies(plan, accounts);
  const tops = [...markets.filter((m) => !m.side && !parentOf.has(m.id)), ...markets.filter((m) => m.side && !parentOf.has(m.id))];
  return tops.flatMap((m) => [m, ...markets.filter((c) => parentOf.get(c.id) === m.id)])
    .map((m) => ({ m, parentId: parentOf.get(m.id) || "" }));
}

// Tách vài nhóm tài sản của mảng `sourceId` ra một mảng mới cùng tài khoản (VD "Trading - H4 ·
// Hàng hóa") để đi vốn riêng. Mảng gốc giữ nguyên — nó không chọn nhóm nên tự nhả các lệnh thuộc
// nhóm vừa tách. Vốn mặc định 10% mảng gốc, mức risk nhỏ; người dùng sửa ngay sau khi tạo.
export function splitMarketByAssets(plan, sourceId, groups, side, accounts) {
  const src = (plan.markets || []).find((x) => x.id === sourceId);
  if (!src || !(groups || []).length) return { plan, id: null };
  const linked = (accounts || []).filter((a) => (src.accountIds || []).includes(a.id));
  const base = linked.length === 1 ? linked[0].name : src.name;
  const labels = ASSET_GROUPS.filter((g) => groups.includes(g.key)).map((g) => g.label).join(" + ");
  const m = {
    ...emptyCapitalMarket(),
    name: `${base} · ${labels}`,
    currency: src.currency, rate: src.rate,
    allocated: Math.round((num(src.allocated, 0) * 0.1) / 100) * 100 || 1000,
    tiers: [0.5, 1], defaultTier: 0.5,
    accountIds: [...(src.accountIds || [])],
    assetGroups: [...groups], side: !!side,
    rRule: { ...normalizeRRule(src.rRule) },
  };
  const markets = [...plan.markets];
  markets.splice(markets.findIndex((x) => x.id === sourceId) + 1, 0, m);
  return { plan: { ...plan, markets }, id: m.id };
}

// Lệnh thuộc mảng `m`. Không có `plan` (lời gọi cũ) thì chỉ xét tài khoản như trước.
function marketTradeFilter(plan, m, accounts) {
  if (!plan) {
    const names = marketAccountNames(m, accounts);
    return (t) => names.has(t.account);
  }
  const resolve = marketResolver(plan, accounts);
  return (t) => { const hit = resolve(t.account, t.symbol, t.assetGroup); return !!hit && hit.id === m.id; };
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

// Lệnh đã đóng của mảng từ ngày `from`, lãi/lỗ quy về tiền của mảng, cũ trước mới sau.
function marketClosedPnl(plan, m, trades, resources, from) {
  const accounts = (resources && resources.accounts) || [];
  const fxRates = (resources && resources.fxRates) || {};
  const owns = marketTradeFilter(plan, m, accounts);
  const currencyOf = (name) => { const a = accounts.find((x) => x.name === name); return a ? a.currency : "USD"; };
  return (trades || [])
    .filter((t) => t && owns(t) && (!from || (dateKey(t) || "") >= from))
    .map((t) => ({ t, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed" && x.r.profit !== null)
    .sort((a, b) => (dateKey(a.t) || "").localeCompare(dateKey(b.t) || "") || (a.t.createdAt || 0) - (b.t.createdAt || 0))
    .map((x) => ({ ...x, date: dateKey(x.t) || "", pnl: toMarketCurrency(x.r.profit, currencyOf(x.t.account), m, fxRates) }));
}

// Sụt vốn từ đỉnh, tính trên VỐN PHÂN CHIA (không phải tiền đã nạp) cộng lãi/lỗ các lệnh đã đóng
// kể từ ngày bắt đầu. Gắn nhiều tài khoản vào một mảng (VD hai sàn chứng khoán) thì chúng dùng
// chung vốn nên chung một đường. Mảng bật bậc vốn thì "vốn phân chia" đã được nâng theo lãi, cộng
// lãi thêm lần nữa là đếm hai lần — nên tính trên vốn gốc của bậc + tiền nạp + lãi/lỗ từ ngày của bậc.
export function marketDrawdown(plan, m, trades, resources) {
  const accounts = (resources && resources.accounts) || [];
  const names = marketAccountNames(m, accounts);
  const lad = ladderOn(m) ? m.ladder : null;
  const rate = m.currency === "USD" ? 1 : num(m.rate, 1);
  const closed = marketClosedPnl(plan, m, trades, resources, lad ? lad.from : plan.startDate || "");
  const base = lad ? lad.capital * rate : marketUnitBase(m);
  const events = lad
    ? [...lad.deposits.filter((d) => d.date >= lad.from && d.date <= todayStr()).map((d) => ({ date: d.date, k: 0, v: d.amount * rate })), ...closed.map((x) => ({ date: x.date, k: 1, v: x.pnl }))]
      .sort((a, b) => a.date.localeCompare(b.date) || a.k - b.k).map((e) => e.v)
    : closed.map((x) => x.pnl);
  const c = curveDrawdown(events, base);
  return {
    pct: c.pct, level: drawdownLevel(plan, c.pct), current: c.current, peak: c.peak,
    tradeCount: closed.length, linked: names.size > 0,
    // Chuỗi thua đang chạy — lý do thứ hai để về mốc cầm chừng, bên cạnh sụt vốn.
    lossStreak: lossStreakOf(closed),
  };
}

// ——— Bậc vốn tự tăng ———
// Vốn tính rủi ro = mốc gần nhất đã vượt, không phải số dư từng ngày: tiền rủi ro chỉ đổi khi
// chạm mốc. Đi lại đường vốn từ ngày của bậc (mọi thứ tính bằng USD):
//   • Lên bậc: chỉ xét lúc CHỐT TUẦN — vốn cuối tuần ≥ vốn tính rủi ro × (1 + bước) thì từ thứ 2
//     tuần sau vốn tính rủi ro nhân thêm một bước (lãi đột biến thì lên nhiều bậc một lúc).
//   • Hạ bậc: xét NGAY sau mỗi lệnh — vốn thủng mốc của bậc dưới thêm `downPct`% thì về bậc dưới.
//     Không hạ dưới vốn gốc: lỗ sâu hơn đã có mức cầm chừng / luật sụt vốn lo.
//   • Nạp thêm: CHỈ cộng vào vốn thật. Vốn tính rủi ro vẫn nằm trên các mốc cố định vốn gốc × 1,2ⁿ,
//     chốt tuần vượt mốc mới đổi (nạp lớn thì lên vài bậc một lúc) — tiền rủi ro chỉ đổi khi đổi bậc.
//     Rút ra làm thủng mốc thì hạ bậc ngay như lỗ.
// Không lưu trạng thái: cùng dữ liệu lệnh thì luôn ra cùng một bậc, máy nào mở cũng như nhau.
export function ladderState(plan, m, trades, resources, today = todayStr()) {
  if (!ladderOn(m)) return null;
  const lad = m.ladder;
  const rate = m.currency === "USD" ? 1 : num(m.rate, 1) || 1;
  const up = 1 + lad.stepPct / 100;
  const cut = 1 - lad.downPct / 100;
  // Lần nạp ghi trước cho ngày sau này thì chưa tính.
  const closed = marketClosedPnl(plan, m, trades, resources, lad.from).filter((x) => x.date <= today);
  const events = [
    ...lad.deposits.filter((d) => d.date >= lad.from && d.date <= today).map((d) => ({ date: d.date, k: 0, v: d.amount })),
    ...closed.map((x) => ({ date: x.date, k: 1, v: x.pnl / rate })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.k - b.k);
  let equity = lad.capital;
  let base = lad.capital;
  const floor = lad.capital;
  let peakBase = base;
  const history = [];
  const upCheck = (date) => {
    while (equity >= base * up - 0.005) {
      const to = Math.round(base * up * 100) / 100;
      history.push({ date, kind: "up", from: base, to, equity });
      base = to;
    }
    peakBase = Math.max(peakBase, base);
  };
  const downCheck = (date) => {
    while (base > floor + 0.005 && equity < (base / up) * cut) {
      const to = Math.max(floor, Math.round((base / up) * 100) / 100);
      history.push({ date, kind: "down", from: base, to, equity });
      base = to;
    }
  };
  let week = weekStart(lad.from);
  events.forEach((e) => {
    const wk = weekStart(e.date);
    if (wk > week) { upCheck(wk); week = wk; }
    if (e.k === 0) {
      history.push({ date: e.date, kind: "deposit", from: base, to: base, equity: equity + e.v, amount: e.v });
      equity += e.v;
      downCheck(e.date);
    } else {
      equity += e.v;
      downCheck(e.date);
    }
  });
  const thisWeek = weekStart(today);
  if (thisWeek > week) upCheck(thisWeek);
  const next = Math.round(base * up * 100) / 100;
  const downAt = base > floor + 0.005 ? (base / up) * cut : null;
  // R thực tế mỗi tháng kể từ ngày của bậc — gợi ý sẵn cho ô dự phóng.
  const withR = closed.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const days = (new Date(`${today}T00:00:00`) - new Date(`${lad.from}T00:00:00`)) / 86400000;
  // R theo từng tuần (ngày đóng) — để so với mục tiêu R/tuần của lộ trình.
  const weekR = {};
  withR.forEach((x) => { const k = weekStart(x.date); const w = weekR[k] || (weekR[k] = { r: 0, n: 0 }); w.r += x.r.rr; w.n += 1; });
  return {
    weekR,
    // Kỳ vọng mỗi lệnh và số lệnh/tuần thực tế từ ngày của bậc — quy R/tuần cần ra số lệnh cần đánh.
    perTrade: withR.length ? withR.reduce((t, x) => t + x.r.rr, 0) / withR.length : null,
    rTrades: withR.length,
    tradesPerWeek: days >= 7 ? withR.length / (days / 7) : null,
    rPerMonth: days >= 28 && withR.length ? withR.reduce((t, x) => t + x.r.rr, 0) / (days / 30.44) : null,
    base, equity, floor, next, downAt, history, tradeCount: closed.length, rate,
    level: base > 0 && floor > 0 ? Math.max(0, Math.round(Math.log(base / floor) / Math.log(up))) : 0,
    // Vốn đã đủ mốc nhưng tuần chưa chốt: sẽ lên bậc từ thứ 2 tuần sau.
    pendingUp: equity >= next - 0.005,
    toNext: equity > 0 ? next / equity - 1 : null,
  };
}

// Vốn tính rủi ro mà mỗi mảng bật bậc nên có ngay lúc này — App dùng để tự đặt lại "Vốn phân
// chia" (form vào lệnh, tin MT5, bot Telegram đều đọc ô đó). Trả về null khi không có gì đổi.
export function syncLadderBases(plan, trades, resources, today = todayStr()) {
  if (!plan || !(plan.markets || []).some(ladderOn)) return null;
  let changed = false;
  const markets = plan.markets.map((m) => {
    const st = ladderState(plan, m, trades, resources, today);
    if (!st) return m;
    const target = Math.round(st.base * 100) / 100;
    if (Math.abs(num(m.allocated, 0) - target) < 0.01) return m;
    changed = true;
    return { ...m, allocated: target };
  });
  return changed ? { ...plan, markets } : null;
}

// ——— Lộ trình vốn ———
// Mô phỏng theo tháng từ tháng sau tháng `fromYm`: đầu tháng nạp (nếu kế hoạch có), trong tháng ra
// đều `monthlyR` R (R tính trên vốn tính rủi ro hiện tại × `pct`%), cuối tháng xét lên bậc. Nạp chỉ
// cộng vào vốn — đúng luật bậc thật. Dừng khi 1 lệnh đạt `targetRisk`.
export const ymAdd = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const ymDiff = (a, b) => { const [ya, ma] = a.split("-").map(Number); const [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
export const depositIn = (plan, ym) => {
  if (!plan || !(plan.depAmount > 0)) return 0;
  return plan.depEvery === "month" || Number(ym.slice(5, 7)) === Number(plan.depMonth) ? plan.depAmount : 0;
};

export function simulateRoadmap({ equity, base, stepPct, pct, monthlyR, plan, targetRisk, fromYm, maxMonths = 600, full = false }) {
  const up = 1 + num(stepPct, LADDER_STEP_DEFAULT) / 100;
  const p = num(pct, 0) / 100;
  let E = num(equity, 0);
  let B = num(base, 0);
  const path = [{ i: 0, ym: fromYm, equity: E, base: B }];
  const events = [];
  if (!(p > 0)) return { months: null, path, events };
  const reached = () => targetRisk > 0 && B * p >= targetRisk - 0.005;
  if (reached() && !full) return { months: 0, path, events, base: B, equity: E };
  let months = reached() ? 0 : null;
  for (let i = 1; i <= maxMonths; i++) {
    const ym = ymAdd(fromYm, i);
    const dep = depositIn(plan, ym);
    if (dep) { E += dep; events.push({ i, ym, kind: "deposit", amount: dep, base: B, equity: E }); }
    E += num(monthlyR, 0) * p * B;
    while (E >= B * up - 0.005) { B *= up; events.push({ i, ym, kind: "step", base: B, equity: E }); }
    path.push({ i, ym, equity: E, base: B });
    if (E <= 0) break;
    if (months === null && reached()) { months = i; if (!full) break; }
    if (full && months !== null && i >= months + 1) break;
  }
  return { months, path, events, base: B, equity: E };
}

// R/tháng tối thiểu để kịp hạn (tìm nhị phân). Chỉ nạp thôi đã kịp thì 0; 30R/tháng vẫn không kịp thì null.
export function requiredMonthlyR(opts, monthsLimit) {
  if (!(monthsLimit > 0)) return null;
  const ok = (r) => { const x = simulateRoadmap({ ...opts, monthlyR: r, maxMonths: monthsLimit }); return x.months !== null && x.months <= monthsLimit; };
  if (ok(0)) return 0;
  if (!ok(30)) return null;
  let lo = 0, hi = 30;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

// Vốn đáng lẽ phải có ở ngày `dateStr` theo lộ trình đã chốt — nội suy giữa hai mốc tháng.
export function snapshotEquityAt(snap, stepPct, dateStr) {
  if (!snap) return null;
  const fromYm = snap.date.slice(0, 7);
  const months = Math.max(0, ymDiff(fromYm, dateStr.slice(0, 7)));
  const sim = simulateRoadmap({ equity: snap.equity, base: snap.base, stepPct, pct: snap.pct, monthlyR: snap.monthlyR, plan: snap, targetRisk: 0, fromYm, maxMonths: months + 1, full: true });
  // Ngày chốt nằm giữa tháng: tháng đầu chỉ tính phần còn lại; các tháng sau tính theo ngày đã qua.
  const dim = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const day = Number(dateStr.slice(8, 10));
  if (months === 0) {
    const startDay = Number(snap.date.slice(8, 10));
    const span = dim(fromYm) - startDay + 1;
    const f = span > 0 ? Math.max(0, Math.min(1, (day - startDay) / span)) : 0;
    const a = sim.path[0]; const b = sim.path[1] || a;
    return a.equity + (b.equity - a.equity) * f;
  }
  const a = sim.path[months] || sim.path[sim.path.length - 1];
  const b = sim.path[months + 1] || a;
  return a.equity + (b.equity - a.equity) * (day / dim(dateStr.slice(0, 7)));
}

// Gợi ý cho form nhập lệnh: tài khoản này thuộc mảng nào, tuần của lệnh đang ở mức nào, và tiền
// rủi ro của từng mức. Tuần tính theo ngày vào lệnh, để sửa lệnh cũ vẫn thấy đúng mức lúc đó.
export function riskTierOptions(plan, accountName, dateStr, accounts, symbol = "", group = "") {
  const m = marketForAccount(plan, accountName, accounts, symbol, group);
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

export function marketRStats(m, trades, accounts, dateStr, plan = null) {
  const names = marketAccountNames(m, accounts);
  const owns = marketTradeFilter(plan, m, accounts);
  const ranges = rWindowRanges(dateStr);
  const oldest = ranges[ranges.length - 1].from;
  const to = ranges[0].to;
  const closed = (trades || [])
    .filter((t) => t && owns(t) && t.exitDate && t.exitDate >= oldest && t.exitDate <= to)
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
  if (!stats.linked) return { base, pct: base, action: "none", reasons: ["Chưa gắn tài khoản"], rule, hits: {}, steps: 0 };
  // Khung nào chạm ngưỡng — để giao diện tô đúng ô đó.
  const hits = {};
  const { w1, w2, w4 } = stats.windows;
  let target = idx;
  let fired = false;
  let toHold = false;
  if (w4.r <= rule.holdM && w4.n) { toHold = true; hits.w4 = "hold"; reasons.push(`4 tuần ${fmtRShort(w4.r)} ≤ ${fmtRShort(rule.holdM)}`); }
  if (dd && dd.level === "cut") { toHold = true; hits.dd = "hold"; reasons.push(`sụt vốn ${fmtPctVN(dd.pct, 1)}`); }
  let down = 0;
  if (w1.r <= rule.downW1 && w1.n) { down++; hits.w1 = "down"; reasons.push(`1 tuần ${fmtRShort(w1.r)} ≤ ${fmtRShort(rule.downW1)}`); }
  if (w2.r <= rule.downW2 && w2.n) { down++; hits.w2 = "down"; reasons.push(`2 tuần ${fmtRShort(w2.r)} ≤ ${fmtRShort(rule.downW2)}`); }
  if (toHold) { target = 0; fired = true; } else if (down) { target = Math.max(0, (list[idx] === base ? idx : idx + 1) - down); fired = true; }
  else if (w1.r >= rule.upW1 && w4.r >= rule.upM) {
    if (w1.n < rule.minUp) reasons.push(`1 tuần mới ${w1.n} lệnh — cần ${rule.minUp} lệnh mới tăng`);
    else if (dd && dd.level === "warn") reasons.push(`đang cảnh báo sụt vốn ${fmtPctVN(dd.pct, 1)} — chưa tăng`);
    else { target = Math.min(list.length - 1, idx + 1); fired = true; hits.w1 = "up"; hits.w4 = "up"; reasons.push(`1 tuần ${fmtRShort(w1.r)} ≥ ${fmtRShort(rule.upW1)}, 4 tuần ${fmtRShort(w4.r)}`); }
  }
  // Không luật nào chạm thì giữ đúng mức đang đi, kể cả khi mức đó đã bị gỡ khỏi danh sách.
  const pct = fired ? list[target] : base;
  const action = pct > base ? "up" : pct < base ? "down" : "same";
  if (action === "same" && !reasons.length) reasons.push(w1.n || w4.n ? "Chưa chạm ngưỡng nào" : "Chưa có lệnh đóng trong 4 tuần");
  if (action === "same" && (toHold || down)) reasons.push("đã ở mức thấp nhất");
  const steps = Math.abs(list.indexOf(pct) - (list.includes(base) ? list.indexOf(base) : idx + (action === "down" ? 1 : 0)));
  return { base, pct, action, reasons, rule, hold: pct === m.holdTier, hits, steps };
}

