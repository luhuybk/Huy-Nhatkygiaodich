// Tin buổi sáng — sl-reminder gửi vào chat chính lúc 8:45 (mặc định, thứ 2–6): tin lớn 24 giờ tới, SL các tài khoản theo
// lần EA báo gần nhất (đã BE chưa, chưa có SL, chưa dời được), EA chưa báo, cảnh báo TradingView chưa xử lý (cả loạt bắn
// đêm qua đã hết lượt nhắc mà chưa bấm), hẹn kiểm lại 24 giờ tới, mã tiềm năng. Hàm thuần — sl-reminder đọc dữ liệu rồi gọi.
// Cài đặt: slReminderSettings.morningBrief = { enabled (mặc định bật), time "08:45", days ["T2"…"T6"], threadId }.

import { alertSymbol, vnTime } from "./alertRecheck.ts";
import { hotMatches, type HotSymbol } from "./hotSymbols.ts";
import { shortSymbol } from "./mt5Fill.ts";
import { TIER_ICON, type NewsEvent } from "./newsCalendar.ts";
import type { SlPos } from "./slBoard.ts";

export type BriefCfg = { enabled?: boolean; time?: string; days?: string[]; threadId?: string };
export const BRIEF_DEFAULT = { enabled: true, time: "08:45", days: ["T2", "T3", "T4", "T5", "T6"], threadId: "" };
export function briefCfg(c?: BriefCfg | null) {
  return {
    enabled: c?.enabled !== false,
    time: /^\d{2}:\d{2}$/.test(String(c?.time || "")) ? String(c!.time) : BRIEF_DEFAULT.time,
    days: Array.isArray(c?.days) ? c!.days.map(String) : [...BRIEF_DEFAULT.days],
    threadId: String(c?.threadId || ""),
  };
}

export type BriefRepeat = {
  text?: string; tf?: string | null; kind?: string; ackedAt?: string; doneAt?: string; recheckAt?: string; createdAt?: string;
};

const HOUR = 3600 * 1000;
function uniq<T>(a: T[]): T[] { return [...new Set(a)]; }
const cap = (list: string[], n: number) => (list.length > n ? `${list.slice(0, n).join(" · ")} +${list.length - n}` : list.join(" · "));

export function briefBody(o: {
  nowMs: number; news: NewsEvent[]; positions: SlPos[]; nameOf: (p: SlPos) => string;
  alarms: { name: string; bar: number }[]; repeats: BriefRepeat[]; hot: HotSymbol[];
}): string {
  const { nowMs } = o;
  const out: string[] = [];

  const news = o.news.filter((e) => e.tier > 0 && e.t >= nowMs - 30 * 60000 && e.t <= nowMs + 24 * HOUR);
  out.push("📅 Tin lớn 24 giờ tới");
  if (news.length) for (const e of news) out.push(`${TIER_ICON[e.tier]} ${vnTime(e.t, nowMs)} ${e.cur} ${e.name}`);
  else out.push("Không có tin lớn");

  out.push("", "🛡 SL các tài khoản (lần EA báo gần nhất)");
  const byAcc = new Map<string, SlPos[]>();
  for (const p of o.positions) {
    const n = o.nameOf(p);
    byAcc.set(n, [...(byAcc.get(n) || []), p]);
  }
  if (!byAcc.size) out.push("Không có lệnh đang mở");
  const sym = (p: SlPos) => shortSymbol(p.symbol);
  for (const [name, list] of [...byAcc].sort((a, b) => a[0].localeCompare(b[0]))) {
    const real = list.filter((p) => !p.marker);
    const parts = [`${list.length} lệnh`, `đã BE ${real.filter((p) => p.be).length}/${list.length}`];
    const notBe = real.filter((p) => !p.be && p.sl > 0);
    if (notBe.length) parts.push(`chưa BE: ${notBe.map(sym).join(", ")}`);
    const noSl = real.filter((p) => !(p.sl > 0));
    if (noSl.length) parts.push(`⚠️ chưa có SL: ${noSl.map(sym).join(", ")}`);
    const wait = real.filter((p) => p.status === "wait");
    if (wait.length) parts.push(`⏳ chưa dời được: ${wait.map(sym).join(", ")}`);
    const fresh = list.filter((p) => p.marker);
    if (fresh.length) parts.push(`🆕 mới khớp: ${fresh.map(sym).join(", ")}`);
    out.push(`• ${name}: ${parts.join(" · ")}`);
  }
  if (o.alarms.length) out.push(`⚠️ EA chưa báo: ${o.alarms.map((a) => `${a.name} (nến ${vnTime(a.bar, nowMs)})`).join(" · ")}`);

  // Đang nhắc, hoặc đã hết lượt nhắc trong 12 giờ qua mà chưa bấm ✅ / ⏳ (bắn lúc ngủ)
  const cutoff = nowMs - 12 * HOUR;
  const ringing = o.repeats.filter((r) => r.kind !== "reentry" && !r.ackedAt && !r.recheckAt && (!r.doneAt || Date.parse(r.doneAt) > cutoff));
  const soon = o.repeats.filter((r) => r.recheckAt && Date.parse(r.recheckAt) <= nowMs + 24 * HOUR)
    .sort((a, b) => Date.parse(a.recheckAt!) - Date.parse(b.recheckAt!));
  const fire = (r: BriefRepeat) => (o.hot.length && hotMatches(String(r.text || ""), o.hot).length ? "🔥" : "");
  if (ringing.length || soon.length || o.hot.length) out.push("");
  if (ringing.length) out.push(`🔔 Cảnh báo chưa xử lý (${ringing.length}): ${cap(uniq(ringing.map((r) => `${fire(r)}${alertSymbol(r.text)}`)), 12)}`);
  if (soon.length) {
    out.push(`⏳ Hẹn kiểm lại: ${cap(soon.map((r) => `${fire(r)}${alertSymbol(r.text)} ${r.kind === "reentry" ? "dời SL tay" : r.tf || "D"} ${vnTime(Date.parse(r.recheckAt!), nowMs)}`), 12)}`);
  }
  if (o.hot.length) out.push(`🔥 Mã tiềm năng: ${cap(uniq(o.hot.map((h) => String(h.name || "").toUpperCase()).filter(Boolean)), 15)}`);
  return out.join("\n");
}
