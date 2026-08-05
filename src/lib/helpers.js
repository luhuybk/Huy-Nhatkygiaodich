import { supabase } from "../supabaseClient.js";
import { DEFAULT_RESOURCES, NOTE_TYPES, WEEKDAY_LABEL } from "./constants.js";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyTrade() {
  return {
    id: uid(),
    createdAt: Date.now(),
    symbol: "", entryDate: "", entryLink: "", entryImage: "",
    direction: "buy", account: "", timeframe: "", session: "",
    riskPercent: "", riskAmount: "", riskAction: "", riskActionReason: "", ratingRisk: 0,
    setup: "", setupBonus: "", setupNote: "", entryReason: "", ratingKnowledge: 0, structureScore: "",
    exitDate: "", exitLink: "", exitImage: "", profit: "",
    entrySkill: "", inTradeSkill: "", exitSkill: "", ratingSkill: 0,
    psychology: "", ratingPsychology: 0,
    tradeGrade: "", reviewNote: "", checklist: {},
    hasLesson: false, lessonNote: "",
  };
}

export function emptyFlow(date) {
  return { id: uid(), type: "deposit", accountId: "", toAccountId: "", amount: "", date: date || "", note: "" };
}

export function emptyNote(date) {
  return { id: uid(), date: date || "", type: NOTE_TYPES[0], content: "" };
}

export function emptyLesson(date) {
  return { id: null, date: date || todayStr(), categories: [], symbol: "", tradeId: "", content: "", link: "", image: "" };
}

export function emptySetupDef() {
  return { id: null, name: "", note: "", image: "" };
}

export function emptyMissed() {
  return { id: null, symbol: "", missDate: "", timeframe: "", link: "", image: "", reason: "", note: "" };
}

export function emptySkipped() {
  return {
    id: null, symbol: "", skipDate: "", timeframe: "", link: "", image: "", reason: "", note: "",
    reviewDate: "", reviewDirection: "", reviewNote: "",
  };
}

export function emptyReminder() {
  return { id: null, title: "", frequency: "weekly", weekday: 0, dayOfMonth: 1, date: "", active: true, doneDates: [] };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reminderDueToday(r, ts) {
  if (!r.active) return false;
  if ((r.doneDates || []).includes(ts)) return false;
  const d = new Date(ts + "T00:00:00");
  if (r.frequency === "weekly") return Number(r.weekday) === d.getDay();
  if (r.frequency === "monthly") return Number(r.dayOfMonth) === d.getDate();
  if (r.frequency === "once") return r.date === ts;
  return false;
}

export function reminderScheduleLabel(r) {
  if (r.frequency === "weekly") return `Hằng tuần · ${WEEKDAY_LABEL[Number(r.weekday)]}`;
  if (r.frequency === "monthly") return `Hằng tháng · ngày ${r.dayOfMonth}`;
  if (r.frequency === "once") return `Một lần · ${r.date || "—"}`;
  return "—";
}

export function emptyCapitalAccount() {
  return { id: null, name: "", currency: "USD" };
}

export function emptyCapitalEntry(date, reserveCapital) {
  return { id: null, accountId: "", date: date || "", reserveCapital: reserveCapital ?? "", tradeCapital: "", note: "" };
}

export function emptyCapitalFlow(date) {
  return { id: null, accountId: "", type: "deposit", amount: "", direction: "reserveToTrade", date: date || "", note: "" };
}

export function buildCapitalIndexCurve(entries, flows) {
  const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (!sorted.length) return [];
  const points = [];
  let index = 100;
  let prevDate = null, prevTotal = null;
  sorted.forEach((e, i) => {
    const total = (Number(e.reserveCapital) || 0) + (Number(e.tradeCapital) || 0);
    if (i === 0) {
      index = 100;
    } else {
      const netCF = flows
        .filter((f) => (f.type === "deposit" || f.type === "withdraw") && f.date > prevDate && f.date <= e.date)
        .reduce((s, f) => s + (f.type === "deposit" ? Number(f.amount) || 0 : -(Number(f.amount) || 0)), 0);
      const growth = prevTotal ? (total - netCF) / prevTotal : 1;
      index = index * growth;
    }
    points.push({ date: e.date, index: Number(index.toFixed(2)), total, reserve: Number(e.reserveCapital) || 0, trade: Number(e.tradeCapital) || 0 });
    prevDate = e.date; prevTotal = total;
  });
  return points;
}

export let currentUserId = null;

export function setCurrentUserId(id) { currentUserId = id; }

export async function safeGet(key, fallback) {
  if (!currentUserId) return fallback;
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("value")
      .eq("user_id", currentUserId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch (e) {
    return fallback;
  }
}

export async function safeSet(key, value) {
  if (!currentUserId) return false;
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert({ user_id: currentUserId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) { console.error("storage set failed", key, error); return false; }
    return true;
  } catch (e) {
    console.error("storage set failed", key, e);
    return false;
  }
}

export function normalizeResources(rs) {
  const merged = { ...DEFAULT_RESOURCES, ...(rs || {}) };
  merged.accounts = (merged.accounts || []).map((a) =>
    typeof a === "string"
      ? { id: uid(), name: a, broker: "", currency: "USD", initialBalance: 0, parentId: "" }
      : { initialBalance: 0, parentId: "", ...a }
  );
  if (!merged.sessions || !merged.sessions.length) merged.sessions = DEFAULT_RESOURCES.sessions;
  merged.fxRates = { ...DEFAULT_RESOURCES.fxRates, ...(merged.fxRates || {}), USD: 1 };
  return merged;
}

export function toUSD(amount, currency, fxRates) {
  if (!currency || currency === "USD") return amount;
  const rate = (fxRates && fxRates[currency]) || 1;
  return amount / rate;
}

export function computeResult(trade) {
  const profit = trade.profit === "" || trade.profit === null || trade.profit === undefined ? null : Number(trade.profit);
  const riskAmount = trade.riskAmount === "" || trade.riskAmount === null || trade.riskAmount === undefined ? null : Number(trade.riskAmount);
  let rr = null;
  if (profit !== null && riskAmount && riskAmount !== 0) rr = profit / riskAmount;
  let outcome = null;
  if (profit !== null) outcome = profit > 0 ? "win" : profit < 0 ? "loss" : "be";
  const status = profit !== null ? "closed" : "open";
  return { profit, riskAmount, rr, outcome, status };
}

export function accountBalance(account, ledger, trades) {
  let bal = Number(account.initialBalance) || 0;
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") bal += amt;
      else if (e.type === "withdraw") bal -= amt;
      else if (e.type === "transfer") bal -= amt;
    }
    if (e.type === "transfer" && e.toAccountId === account.id) bal += amt;
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) bal += r.profit;
    }
  });
  return bal;
}

export function accountOpenRisk(account, ledger, trades) {
  const openTrades = trades.filter((t) => t.account === account.name && computeResult(t).status === "open");
  if (!openTrades.length) return { pct: 0, count: 0 };
  const balance = accountBalance(account, ledger, trades);
  let pct = 0;
  openTrades.forEach((t) => {
    if (t.riskPercent !== "" && t.riskPercent !== null && t.riskPercent !== undefined && !Number.isNaN(Number(t.riskPercent))) {
      pct += Number(t.riskPercent);
    } else if (t.riskAmount !== "" && t.riskAmount !== null && balance) {
      pct += (Number(t.riskAmount) / balance) * 100;
    }
  });
  return { pct, count: openTrades.length };
}

export function avgPillarScore(t) {
  const vals = [t.ratingRisk, t.ratingKnowledge, t.ratingSkill, t.ratingPsychology].filter((v) => v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function checklistProgress(t, resources) {
  const items = (resources && resources.checklistItems) || [];
  if (items.length === 0) return null;
  const checked = items.filter((item) => t.checklist && t.checklist[item]).length;
  return { checked, total: items.length };
}

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function dateKey(t) { return t.exitDate || t.entryDate || ""; }

export function monthKey(d) { return d ? d.slice(0, 7) : ""; }

export function yearKey(d) { return d ? d.slice(0, 4) : ""; }

export function weekdayIndex(d) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").getDay(); } catch (e) { return null; }
}

export function closedOf(trades) {
  return trades
    .map((t) => ({ t, r: computeResult(t) }))
    .filter((x) => x.r.status === "closed" && x.r.profit !== null);
}

export function closedOfUSD(trades, resources) {
  return closedOf(trades).map((x) => {
    const acc = resources.accounts.find((a) => a.name === x.t.account);
    const currency = acc ? acc.currency : "USD";
    return { t: x.t, r: { ...x.r, profit: toUSD(x.r.profit, currency, resources.fxRates) } };
  });
}

export function groupStats(items, keyFn) {
  const out = {};
  items.forEach(({ t, r }) => {
    const key = keyFn(t) || "—";
    if (!out[key]) out[key] = { count: 0, wins: 0, losses: 0, totalR: 0, pnl: 0 };
    out[key].count += 1;
    if (r.outcome === "win") out[key].wins += 1;
    if (r.outcome === "loss") out[key].losses += 1;
    out[key].totalR += r.rr || 0;
    out[key].pnl += r.profit || 0;
  });
  return out;
}

export function heatColor(value, max) {
  if (!value || !max) return "transparent";
  const alpha = Math.min(0.85, 0.18 + 0.67 * (Math.abs(value) / max));
  const base = value >= 0 ? "76,175,125" : "224,97,90";
  return `rgba(${base},${alpha.toFixed(2)})`;
}

export function formatVN(n) {
  if (n === "" || n === null || n === undefined) return "";
  const num = Number(n);
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

export function buildBalanceCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, delta: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, delta: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, delta: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, delta: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), delta: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let bal = Number(account.initialBalance) || 0;
  const points = [{ date: "Bắt đầu", balance: Number(bal.toFixed(2)) }];
  events.forEach((e) => { bal += e.delta; points.push({ date: e.date || "—", balance: Number(bal.toFixed(2)) }); });
  return points;
}

export function buildTWRCurve(account, ledger, trades) {
  const events = [];
  ledger.forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.accountId === account.id) {
      if (e.type === "deposit") events.push({ date: e.date, cashflow: amt });
      else if (e.type === "withdraw") events.push({ date: e.date, cashflow: -amt });
      else if (e.type === "transfer") events.push({ date: e.date, cashflow: -amt });
    }
    if (e.type === "transfer" && e.toAccountId === account.id) events.push({ date: e.date, cashflow: amt });
  });
  trades.forEach((t) => {
    if (t.account === account.name) {
      const r = computeResult(t);
      if (r.profit) events.push({ date: dateKey(t), pnl: r.profit });
    }
  });
  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let periodStartBalance = Number(account.initialBalance) || 0;
  let periodStartIndex = 100;
  let runningBalance = periodStartBalance;
  const points = [{ date: "Bắt đầu", index: 100, balance: Number(runningBalance.toFixed(2)) }];

  events.forEach((e) => {
    if (e.pnl !== undefined) {
      runningBalance += e.pnl;
      const idx = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      points.push({ date: e.date || "—", index: Number(idx.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    } else {
      const idxBeforeFlow = periodStartBalance ? periodStartIndex * (runningBalance / periodStartBalance) : periodStartIndex;
      runningBalance += e.cashflow;
      periodStartBalance = runningBalance;
      periodStartIndex = idxBeforeFlow;
      points.push({ date: e.date || "—", index: Number(idxBeforeFlow.toFixed(2)), balance: Number(runningBalance.toFixed(2)) });
    }
  });
  return points;
}

export function buildGrowthSeries(curve, initialBalance, granularity) {
  const dated = curve.slice(1).filter((p) => p.date && p.date !== "—");
  if (!dated.length) return [];
  const byPeriod = {};
  dated.forEach((p) => {
    let key;
    if (granularity === "month") key = p.date.slice(0, 7);
    else if (granularity === "week") {
      const d = new Date(p.date + "T00:00:00");
      const dow = (d.getDay() + 6) % 7;
      const monday = new Date(d); monday.setDate(d.getDate() - dow);
      key = monday.toISOString().slice(0, 10);
    } else key = p.date;
    byPeriod[key] = p.balance;
  });
  const keys = Object.keys(byPeriod).sort();
  return keys.map((k) => ({ period: k, growth: initialBalance ? Number((((byPeriod[k] - initialBalance) / Math.abs(initialBalance)) * 100).toFixed(2)) : 0 }));
}

export function applyFilters(trades, filters, resources) {
  return trades.filter((t) => {
    const r = computeResult(t);
    if (filters.q && !t.symbol.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.account && t.account !== filters.account) return false;
    if (filters.year && yearKey(t.entryDate) !== filters.year) return false;
    if (filters.month && (t.entryDate || "").slice(5, 7) !== filters.month) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.session && t.session !== filters.session) return false;
    if (filters.psychology && t.psychology !== filters.psychology) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.result) {
      if (filters.result === "open" && r.status !== "open") return false;
      if (["win", "loss", "be"].includes(filters.result) && r.outcome !== filters.result) return false;
    }
    if (filters.score) {
      const s = avgPillarScore(t);
      if (s === null) return false;
      if (filters.score === "low" && s > 2) return false;
      if (filters.score === "mid" && (s <= 2 || s >= 4)) return false;
      if (filters.score === "high" && s < 4) return false;
    }
    if (filters.checklist) {
      const cp = checklistProgress(t, resources);
      if (cp === null) return false;
      if (filters.checklist === "complete" && cp.checked !== cp.total) return false;
      if (filters.checklist === "none" && cp.checked !== 0) return false;
      if (filters.checklist === "partial" && (cp.checked === 0 || cp.checked === cp.total)) return false;
    }
    if (filters.hasLesson === "yes" && !t.hasLesson) return false;
    if (filters.hasLesson === "no" && t.hasLesson) return false;
    return true;
  });
}

export function inRange(dateStr, range, customFrom, customTo) {
  if (!range || !dateStr) return true;
  if (range === "custom") {
    if (customFrom && dateStr < customFrom) return false;
    if (customTo && dateStr > customTo) return false;
    return true;
  }
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (range === "7d") { const from = new Date(now); from.setDate(from.getDate() - 7); return d >= from; }
  if (range === "30d") { const from = new Date(now); from.setDate(from.getDate() - 30); return d >= from; }
  if (range === "90d") { const from = new Date(now); from.setDate(from.getDate() - 90); return d >= from; }
  if (range === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (range === "quarter") return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

export function buildInsights(closed) {
  const insights = [];
  const MIN = 3;
  const bySetup = groupStats(closed, (t) => t.setup || "Chưa gắn setup");
  const setupEntries = Object.entries(bySetup).filter(([, s]) => s.count >= MIN);
  if (setupEntries.length) {
    const best = [...setupEntries].sort((a, b) => b[1].totalR - a[1].totalR)[0];
    const worst = [...setupEntries].sort((a, b) => a[1].totalR - b[1].totalR)[0];
    if (best[1].totalR > 0) insights.push(`Setup "${best[0]}" đang hiệu quả nhất: tổng ${best[1].totalR.toFixed(2)}R sau ${best[1].count} lệnh, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
    if (worst[0] !== best[0] && worst[1].totalR < 0) insights.push(`Setup "${worst[0]}" đang kéo hiệu suất xuống: ${worst[1].totalR.toFixed(2)}R sau ${worst[1].count} lệnh — cân nhắc xem lại điều kiện vào lệnh của setup này.`);
  }
  const byWeekday = {};
  closed.forEach((x) => {
    const wd = weekdayIndex(dateKey(x.t));
    if (wd === null) return;
    if (!byWeekday[wd]) byWeekday[wd] = { count: 0, wins: 0, pnl: 0 };
    byWeekday[wd].count += 1; byWeekday[wd].pnl += x.r.profit;
    if (x.r.outcome === "win") byWeekday[wd].wins += 1;
  });
  const wdEntries = Object.entries(byWeekday).filter(([, s]) => s.count >= MIN);
  if (wdEntries.length) {
    const best = wdEntries.sort((a, b) => b[1].pnl - a[1].pnl)[0];
    insights.push(`Bạn giao dịch tốt nhất vào ${WEEKDAY_LABEL[best[0]]}: lãi ${fmt(best[1].pnl)}, tỷ lệ thắng ${((best[1].wins / best[1].count) * 100).toFixed(0)}%.`);
  }
  const highRisk = closed.filter((x) => x.t.ratingRisk >= 4);
  const lowRisk = closed.filter((x) => x.t.ratingRisk > 0 && x.t.ratingRisk <= 2);
  if (highRisk.length >= MIN && lowRisk.length >= MIN) {
    const wrHigh = (highRisk.filter((x) => x.r.outcome === "win").length / highRisk.length) * 100;
    const wrLow = (lowRisk.filter((x) => x.r.outcome === "win").length / lowRisk.length) * 100;
    if (Math.abs(wrHigh - wrLow) >= 10) {
      insights.push(`Khi tự đánh giá quản trị vốn 4-5 sao, tỷ lệ thắng của bạn là ${wrHigh.toFixed(0)}%, so với chỉ ${wrLow.toFixed(0)}% khi tự chấm 1-2 sao — kỷ luật rủi ro đang ảnh hưởng rõ tới kết quả.`);
    }
  }
  const buys = closed.filter((x) => x.t.direction === "buy");
  const sells = closed.filter((x) => x.t.direction === "sell");
  if (buys.length >= MIN && sells.length >= MIN) {
    const wrBuy = (buys.filter((x) => x.r.outcome === "win").length / buys.length) * 100;
    const wrSell = (sells.filter((x) => x.r.outcome === "win").length / sells.length) * 100;
    if (Math.abs(wrBuy - wrSell) >= 15) {
      insights.push(`Lệnh ${wrBuy > wrSell ? "Buy" : "Sell"} đang có tỷ lệ thắng cao hơn hẳn (${Math.max(wrBuy, wrSell).toFixed(0)}% so với ${Math.min(wrBuy, wrSell).toFixed(0)}%).`);
    }
  }
  if (insights.length === 0) insights.push("Chưa đủ dữ liệu để đưa ra phân tích tự động đáng tin cậy — cần thêm lệnh đã đóng ở mỗi nhóm (tối thiểu 3 lệnh/nhóm).");
  return insights.slice(0, 5);
}

export function keyForDim(t, dim) {
  if (dim === "symbol") return t.symbol || "—";
  if (dim === "setup") return t.setup || "Chưa gắn setup";
  if (dim === "weekday") { const wd = weekdayIndex(dateKey(t)); return wd === null ? "—" : WEEKDAY_LABEL[wd]; }
  if (dim === "structure") return t.structureScore !== "" && t.structureScore !== undefined && t.structureScore !== null ? `ĐCT ${t.structureScore}` : "Chưa chấm";
  return "—";
}

export function computeAdvancedMetrics(closed) {
  const sorted = [...closed].sort((a, b) => dateKey(a.t).localeCompare(dateKey(b.t)));
  const withR = sorted.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const wins = sorted.filter((x) => x.r.outcome === "win");
  const losses = sorted.filter((x) => x.r.outcome === "loss");
  const winsR = wins.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));
  const lossesR = losses.filter((x) => x.r.rr !== null && Number.isFinite(x.r.rr));

  const netProfit = sorted.reduce((s, x) => s + x.r.profit, 0);
  const netProfitR = withR.reduce((s, x) => s + x.r.rr, 0);
  const grossWin = wins.reduce((s, x) => s + x.r.profit, 0);
  const grossLoss = losses.reduce((s, x) => s + x.r.profit, 0);
  const profitFactor = grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgWinR = winsR.length ? winsR.reduce((s, x) => s + x.r.rr, 0) / winsR.length : 0;
  const avgLossR = lossesR.length ? lossesR.reduce((s, x) => s + x.r.rr, 0) / lossesR.length : 0;
  const largestWin = wins.length ? Math.max(...wins.map((x) => x.r.profit)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map((x) => x.r.profit)) : 0;
  const largestWinR = winsR.length ? Math.max(...winsR.map((x) => x.r.rr)) : 0;
  const largestLossR = lossesR.length ? Math.min(...lossesR.map((x) => x.r.rr)) : 0;

  let cum = 0, peak = 0, maxDD = 0;
  sorted.forEach((x) => { cum += x.r.profit; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; });
  let cumR = 0, peakR = 0, maxDDR = 0;
  withR.forEach((x) => { cumR += x.r.rr; if (cumR > peakR) peakR = cumR; const dd = peakR - cumR; if (dd > maxDDR) maxDDR = dd; });

  let curWin = 0, maxWinStreak = 0, curLoss = 0, maxLossStreak = 0;
  sorted.forEach((x) => {
    if (x.r.outcome === "win") { curWin += 1; maxWinStreak = Math.max(maxWinStreak, curWin); curLoss = 0; }
    else if (x.r.outcome === "loss") { curLoss += 1; maxLossStreak = Math.max(maxLossStreak, curLoss); curWin = 0; }
    else { curWin = 0; curLoss = 0; }
  });

  const holdDays = (x) => {
    if (!x.t.entryDate || !x.t.exitDate) return null;
    const d1 = new Date(x.t.entryDate + "T00:00:00"), d2 = new Date(x.t.exitDate + "T00:00:00");
    const diff = (d2 - d1) / 86400000;
    return diff >= 0 ? diff : null;
  };
  const winHolds = wins.map(holdDays).filter((v) => v !== null);
  const lossHolds = losses.map(holdDays).filter((v) => v !== null);
  const avgHoldWin = winHolds.length ? winHolds.reduce((a, b) => a + b, 0) / winHolds.length : null;
  const avgHoldLoss = lossHolds.length ? lossHolds.reduce((a, b) => a + b, 0) / lossHolds.length : null;

  const longs = sorted.filter((x) => x.t.direction === "buy");
  const shorts = sorted.filter((x) => x.t.direction === "sell");
  const longWinrate = longs.length ? (longs.filter((x) => x.r.outcome === "win").length / longs.length) * 100 : null;
  const shortWinrate = shorts.length ? (shorts.filter((x) => x.r.outcome === "win").length / shorts.length) * 100 : null;
  const longsPnl = longs.reduce((s, x) => s + x.r.profit, 0);
  const shortsPnl = shorts.reduce((s, x) => s + x.r.profit, 0);
  const winRate = sorted.length ? (wins.length / sorted.length) * 100 : null;
  const rrRatioMoney = avgLoss ? avgWin / Math.abs(avgLoss) : null;
  const rrRatioR = avgLossR ? avgWinR / Math.abs(avgLossR) : null;
  const expectancyMoney = sorted.length ? netProfit / sorted.length : null;
  const expectancyR = sorted.length ? netProfitR / sorted.length : null;

  return {
    netProfit, netProfitR, profitFactor, grossWin, grossLoss, avgWin, avgLoss, avgWinR, avgLossR,
    largestWin, largestLoss, largestWinR, largestLossR, maxDD, maxDDR, maxWinStreak, maxLossStreak,
    avgHoldWin, avgHoldLoss, longsCount: longs.length, shortsCount: shorts.length, longWinrate, shortWinrate,
    longsPnl, shortsPnl, winRate, rrRatioMoney, rrRatioR, expectancyMoney, expectancyR,
  };
}

export function fmtR(v) { return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}R`; }

export function fmtDays(v) { return v === null ? "—" : `${v.toFixed(1)} ngày`; }

export function fmtMoney(value, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const cur = currency || "USD";
  const neg = value < 0;
  const numStr = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (cur === "USD") return `${neg ? "-" : ""}$${numStr}`;
  if (cur === "VND") return `${neg ? "-" : ""}${numStr}₫`;
  return `${neg ? "-" : ""}${numStr} ${cur}`;
}

export function applyMissSkipFilters(items, filters, dateField) {
  return items.filter((n) => {
    if (filters.q && !(n.symbol || "").toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.timeframe && n.timeframe !== filters.timeframe) return false;
    if (filters.reason && n.reason !== filters.reason) return false;
    if (filters.from && (n[dateField] || "") < filters.from) return false;
    if (filters.to && (n[dateField] || "") > filters.to) return false;
    return true;
  });
}

export function applyLessonFilters(items, filters) {
  return items.filter((n) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!(n.symbol || "").toLowerCase().includes(q) && !(n.content || "").toLowerCase().includes(q)) return false;
    }
    if (filters.category && !(n.categories || []).includes(filters.category)) return false;
    if (filters.from && (n.date || "") < filters.from) return false;
    if (filters.to && (n.date || "") > filters.to) return false;
    return true;
  });
}
