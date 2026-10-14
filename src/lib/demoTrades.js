// Dữ liệu mẫu cho trang Thị trường chung — chỉ để xem bảng thống kê trông thế nào khi đã có đủ
// lệnh. Sinh trong bộ nhớ, KHÔNG BAO GIỜ được lưu: không đi qua onSave/persist nào cả.
// Hạt giống cố định để mỗi lần bật đều ra cùng một bộ số, dễ so khi đổi bộ lọc.
import { emptyTrade } from "./helpers.js";
import { activeStates, stateRiskBand } from "./marketRegime.js";
import { FX_MAJORS } from "./fxStrength.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const day = (r) => {
  const d = new Date(2026, 0, 2);
  d.setDate(d.getDate() + Math.floor(r() * 270));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function result(r, winP) {
  const win = r() < Math.max(0.08, Math.min(0.9, winP));
  const risk = 100;
  const profit = win ? Math.round(risk * (1.2 + r() * 1.8)) : (r() < 0.12 ? 0 : -risk);
  return { riskAmount: String(risk), profit: String(profit) };
}

// % rủi ro theo khung của trạng thái: phần lớn đúng khung, ~1/5 vượt khung — lệnh vượt khung
// thua nhiều hơn một chút để bảng "Kỷ luật đi vốn" có gì mà xem.
function demoRisk(r, state) {
  const band = stateRiskBand(state);
  if (!band) return { pct: Math.round((0.3 + r() * 1.2) * 10) / 10, over: false };
  const lo = band.min ?? 0.3;
  const hi = band.max === 0 ? 0 : (band.max ?? lo * 1.5);
  if (hi === 0 || r() < 0.2) return { pct: Math.round(((hi || lo) + 0.2 + r() * 0.6) * 10) / 10, over: true };
  return { pct: Math.round((lo + r() * (hi - lo)) * 10) / 10, over: false };
}

function demoTrade(r, id, extra) {
  const d = day(r);
  return { ...emptyTrade(), id: `demo-${id}`, createdAt: 0, entryDate: d, exitDate: d, ...extra };
}

export function buildDemoTrades(regimes) {
  const r = rng(20261012);
  const out = [];
  // Thị trường chung: nhóm Tích cực thắng nhiều hơn, Tiêu cực thua nhiều hơn — đủ chênh để
  // bảng nhìn ra khác biệt, không phải kết quả thật của ai.
  const toneWin = { good: 0.6, neutral: 0.45, bad: 0.28 };
  (regimes || []).forEach((reg, ri) => {
    const states = activeStates(reg);
    if (!states.length) return;
    for (let i = 0; i < 70; i++) {
      const st = pick(r, states);
      const dir = r() < 0.85 ? "buy" : "sell";
      const base = toneWin[st.tone] ?? 0.45;
      const risk = demoRisk(r, st);
      const winP = (dir === "buy" ? base : 0.9 - base) - (risk.over ? 0.1 : 0);
      out.push(demoTrade(r, `r${ri}-${i}`, {
        symbol: `MẪU${ri + 1}`, account: `Mẫu · ${reg.name || "Chỉ số"}`, direction: dir, riskPercent: String(risk.pct),
        marketCond: { regimeId: reg.id, stateId: st.id }, ...result(r, winP),
      }));
    }
    for (let i = 0; i < 6; i++) {
      out.push(demoTrade(r, `r${ri}-miss-${i}`, { symbol: `MẪU${ri + 1}`, account: `Mẫu · ${reg.name || "Chỉ số"}`, marketCond: { regimeId: reg.id, stateId: "" }, ...result(r, 0.45) }));
    }
  });

  // Cặp FX: Base thuận chiều lệnh là yếu tố chính; Quote ủng hộ cộng thêm, Quote cản trừ bớt;
  // ngắn hạn Base đang hồi (⏳) nhỉnh hơn đuổi theo (🚀) một chút.
  const trend = () => { const x = r(); return x < 0.42 ? 1 : x < 0.58 ? 0 : -1; };
  for (let i = 0; i < 220; i++) {
    const base = pick(r, FX_MAJORS);
    let quote = pick(r, FX_MAJORS);
    while (quote === base) quote = pick(r, FX_MAJORS);
    const dir = r() < 0.5 ? "buy" : "sell";
    const s = dir === "buy" ? 1 : -1;
    const b = { ct: trend(), nh: trend() };
    const q = { ct: trend(), nh: trend() };
    const bct = s * b.ct, bnh = s * b.nh, qct = -s * q.ct, qnh = -s * q.nh;
    let winP = 0.4 + bct * 0.1 + bnh * 0.03 + qct * 0.07 + qnh * 0.02;
    if (bct > 0 && bnh < 0) winP += 0.05;
    out.push(demoTrade(r, `fx-${i}`, {
      symbol: base + quote, account: "Mẫu · Forex", direction: dir,
      fxCond: i < 205 ? { base, quote, b, q } : { base, quote, b: { ct: b.ct }, q: {} }, ...result(r, winP),
    }));
  }
  return out;
}
