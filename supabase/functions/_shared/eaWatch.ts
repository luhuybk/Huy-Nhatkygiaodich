// Canh chừng EA + lịch sử SL từng lệnh — alert-relay tick (mỗi phút) gọi eaTick sau bảng dời SL (_shared/slBoard.ts).
//
// 1. Canh chừng EA: lệnh EA đang quản (có SL, mã có nến gần cả ngày: FX, kim loại, crypto, chỉ số, dầu) mà tới giờ nến
//    khung của nó đóng + X phút (mặc định 10) vẫn chưa có dòng bảng SL → tin "⚠️ EA CHƯA BÁO SL" vào nhóm MT5, mọi tài
//    khoản lỡ cùng lượt chung một tin; EA báo lại thì sửa tin, dòng tài khoản đó thêm "✅ đã báo lại HH:MM". Mỗi nến lỡ
//    báo một lần. Cổ phiếu không canh (nến H4 theo mốc New York rơi vào giờ đóng cửa nên EA không có nến để báo).
//    Lệnh mới khớp chưa có dòng nào thì tính từ mốc khớp lệnh của mt5-journal (slMove:<login>:<ticket>:0).
//    Cài đặt: slReminderSettings.eaWatch = { enabled (mặc định bật), graceMin (10), mute: [số MT5 không canh],
//    hide: [số MT5 ẩn hẳn — test/demo: web không hiện, tin sáng bỏ, không canh] }.
// 2. Lịch sử SL: dòng bảng SL chỉ giữ 3 ngày → chép từng dòng vào slHist:<login>:<ticket> (giữ luôn) — web hiện ở
//    chi tiết lệnh và mục "Đánh giá EA kéo SL" (dời mấy lần, mấy nến tới BE, đóng ở SL ban đầu hay SL đã kéo).
// Trạng thái ở app_data "eaWatch" (cảnh báo đã gửi, lệnh đã đóng tra từ hộp chờ, mốc đã chép lịch sử) — chỉ tick ghi.

import { isCryptoSymbol, nextRecheck, normTf, vnTime } from "./alertRecheck.ts";
import { fillChat, shortSymbol } from "./mt5Fill.ts";
import { openPositions, slAfter, type SlPos, type SlRawRow, type SlRow, type SlStatus } from "./slBoard.ts";

export const EA_WATCH_KEY = "eaWatch";
export const SL_HIST_PREFIX = "slHist:";

export type EaWatchCfg = { enabled?: boolean; graceMin?: number; mute?: string[]; hide?: string[] };
export type EaAlarm = { bar: number; mid?: number; line: string; at: string; okAt?: string; ok?: string };
export type EaWatchState = {
  alarms?: Record<string, EaAlarm>;   // theo số MT5: cảnh báo gần nhất
  closed?: Record<string, string>;    // <login>:<ticket> → lúc biết lệnh đã đóng (tra hộp chờ)
  checked?: Record<string, number>;   // <login>:<ticket> → nến lỡ đã tra hộp chờ (khỏi tra lại mỗi phút)
  histAt?: string;                    // updated_at lớn nhất đã chép sang slHist
};
export type SlHistEntry = { bar: number; st: SlStatus; old: number; nw: number; tf: string; note?: string };
export type SlHist = {
  login: string; ticket: string; symbol: string; side: "buy" | "sell"; open: number; digits: number; accountName: string;
  openedAt?: number; closedAt?: number; entries: SlHistEntry[];
};

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const FRESH_MS = 12 * 3600 * 1000; // nến lỡ cũ hơn thế (vd lúc mới bật, sau cuối tuần) thì không báo nữa

export function watchCfg(c: EaWatchCfg | undefined | null) {
  const g = Math.round(Number(c?.graceMin ?? 10));
  return {
    enabled: c?.enabled !== false,
    graceMin: Number.isFinite(g) && g > 0 ? Math.min(120, Math.max(3, g)) : 10,
    // hide = tài khoản ẩn hẳn (test, demo): không hiện trên web, không lên tin sáng, cũng không canh
    hide: Array.isArray(c?.hide) ? c!.hide.map((x) => String(x)) : [],
    mute: [...new Set([...(Array.isArray(c?.mute) ? c!.mute : []), ...(Array.isArray(c?.hide) ? c!.hide : [])].map((x) => String(x)))],
  };
}

const FX = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "ZAR",
  "MXN", "TRY", "CNH", "HUF", "CZK", "ILS", "THB"]);
// Mã có nến gần như cả ngày → mỗi lần nến khung đóng EA phải báo. Cổ phiếu nghỉ cả đêm → không canh.
export function watchable(symbol: string) {
  const s = shortSymbol(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (isCryptoSymbol(s) || /^(XAU|XAG|XPT|XPD|XCU|XAL|XNI|XPB|XZN)/.test(s)) return true;
  if (s.length >= 6 && FX.has(s.slice(0, 3)) && FX.has(s.slice(3, 6))) return true;
  return /^(US30|US100|US500|US2000|USTEC|NAS100|SPX500|SP500|DJ30|UK100|DE30|DE40|GER30|GER40|FR40|EU50|STOXX50|JP225|AUS200|HK50|USOIL|UKOIL|XTI|XBR|XNG|WTI|BRENT)/.test(s);
}

// Lần đóng nến gần nhất đã quá hạn (đóng + grace ≤ now) mà lệnh chưa báo dòng nào — 0 = không lỡ nến nào.
// Khung dưới H1 (thử EA trên Demo M1…) không canh.
export function lastMissedClose(p: SlPos, nowMs: number, graceMs: number): number {
  const tf = normTf(p.tf);
  const from = p.bar || p.openedAt || 0;
  if (!tf || !from) return 0;
  const sym = shortSymbol(p.symbol); // crypto nến 0h UTC, kim loại LME / XPT-XPD / dầu theo phiên riêng — như EA v2.92+
  let after = from * 1000, missed = 0;
  for (let i = 0; i < 400; i++) {
    const c = nextRecheck(tf, after, sym).close;
    if (c + graceMs > nowMs) break;
    missed = c;
    after = c;
  }
  return missed;
}

// ───────────── Lịch sử SL ─────────────

// Gộp các dòng (cùng một lệnh) vào lịch sử: mỗi nến một mục, dòng mới của cùng nến thay mục cũ (máy chủ đã giữ luật
// "đã dời không bị giữ đè"); mốc khớp / đóng điền giờ vào / giờ đóng.
export function mergeHist(prev: SlHist | null, rows: SlRow[]): SlHist | null {
  if (!rows.length) return prev;
  const f = rows[0];
  const h: SlHist = prev
    ? { ...prev, entries: [...(prev.entries || [])] }
    : { login: f.login, ticket: f.ticket, symbol: f.symbol, side: f.side, open: 0, digits: 5, accountName: f.accountName || "", entries: [] };
  for (const r of [...rows].sort((a, b) => (a.bar || 0) - (b.bar || 0))) {
    if (r.accountName) h.accountName = r.accountName;
    if (r.symbol) h.symbol = r.symbol;
    if (r.side) h.side = r.side;
    if (!r.bar) {
      if (r.openedAt) h.openedAt = r.openedAt;
      if (r.status === "gone" && r.closedAt) h.closedAt = r.closedAt;
      continue;
    }
    if (r.open > 0) h.open = r.open;
    if (r.digits) h.digits = r.digits;
    const e: SlHistEntry = { bar: r.bar, st: r.status as SlStatus, old: Number(r.slOld) || 0, nw: Number(r.slNew) || 0, tf: r.tf || "" };
    if (r.note) e.note = r.note;
    const i = h.entries.findIndex((x) => x.bar === r.bar);
    if (i >= 0) h.entries[i] = e;
    else h.entries.push(e);
  }
  h.entries.sort((a, b) => a.bar - b.bar);
  if (h.entries.length > 1500) h.entries = h.entries.slice(-1500);
  return h;
}

// Tóm tắt một lệnh: số lần dời, số nến tới BE (tính từ nến đầu sau khi vào — chỉ khi lịch sử đủ từ đầu: mục đầu là
// "mới vào, chưa kéo"), SL đầu / cuối.
export function histFacts(h: SlHist) {
  const buy = h.side !== "sell";
  const beyond = (sl: number) => h.open > 0 && sl > 0 && (buy ? sl >= h.open : sl <= h.open);
  const all = h.entries || [];
  const candles = all.filter((e) => e.st !== "now");
  const moves = candles.filter((e) => e.st === "moved" || e.st === "be").length;
  const beIdx = candles.findIndex((e) => beyond(slAfter(e)));
  const complete = all.length > 0 && all[0].st === "skip";
  return {
    moves, candles: candles.length, complete,
    reachedBe: beIdx >= 0, barsToBe: beIdx >= 0 && complete ? beIdx + 1 : null, beBar: beIdx >= 0 ? candles[beIdx].bar : 0,
    firstSl: all.length ? all[0].old : 0, lastSl: all.length ? slAfter(all[all.length - 1]) : 0,
    closedByEa: all.some((e) => e.st === "closed"),
  };
}

type Supa = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function syncHist(supabase: Supa, userId: string, raw: SlRawRow[], state: EaWatchState, nowMs: number) {
  const since = Date.parse(state.histAt || "") || 0;
  const fresh = raw.filter((r) => (Date.parse(r.updated_at || "") || 0) > since && r.value?.login && r.value.ticket);
  if (!fresh.length) return 0;
  const byKey = new Map<string, SlRow[]>();
  for (const r of fresh) {
    const k = `${SL_HIST_PREFIX}${r.value.login}:${r.value.ticket}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r.value);
  }
  const { data, error } = await supabase.from("app_data").select("key, value").eq("user_id", userId).in("key", [...byKey.keys()]);
  if (error) throw new Error(error.message);
  const prev = new Map<string, SlHist>((data || []).map((d: { key: string; value: SlHist }) => [d.key, d.value]));
  const ups: Record<string, unknown>[] = [];
  for (const [k, rows] of byKey) {
    const p = prev.get(k) || null;
    const next = mergeHist(p, rows);
    if (next && JSON.stringify(next) !== JSON.stringify(p)) {
      ups.push({ user_id: userId, key: k, value: next, updated_at: new Date().toISOString() });
    }
  }
  if (ups.length) {
    const { error: e2 } = await supabase.from("app_data").upsert(ups, { onConflict: "user_id,key" });
    if (e2) throw new Error(e2.message);
  }
  // Mốc không vượt quá "2 phút trước": dòng ghi trễ (giờ ghi nhỏ hơn mốc nhưng lưu xong sau lượt này) vẫn được chép ở lượt
  // sau; dòng vừa chép trong 2 phút đó bị chép lại 1–2 lần, kết quả như cũ nên không ghi
  const top = Math.min(Math.max(...fresh.map((r) => Date.parse(r.updated_at || "") || 0)), nowMs - 2 * MIN);
  if (top > since) state.histAt = new Date(top).toISOString();
  return ups.length;
}

// ───────────── Canh chừng EA ─────────────

async function tg(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  let info: { ok?: boolean; result?: { message_id?: number }; description?: string } = {};
  try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
  return info;
}

function alarmText(items: EaAlarm[], graceMin: number) {
  const done = items.every((a) => a.okAt);
  const lines = [done ? "✅ EA ĐÃ BÁO LẠI SL" : "⚠️ EA CHƯA BÁO SL"];
  for (const a of items) lines.push(a.ok ? `${a.line}\n   ${a.ok}` : a.line);
  if (!done) lines.push(`Quá ${graceMin} phút sau giờ đóng nến vẫn chưa thấy bảng SL — kiểm tra VPS: MT5 còn mở, EA còn gắn trên chart, Algo Trading đang bật.`);
  return lines.join("\n");
}

async function watchStep(supabase: Supa, userId: string, token: string, raw: SlRawRow[], state: EaWatchState,
  cfg: ReturnType<typeof watchCfg>, nowMs: number) {
  const alarms = state.alarms!;
  const graceMs = cfg.graceMin * MIN;
  const rows = raw.map((r) => r.value).filter((r) => r?.login && r.ticket);
  const pos = openPositions(rows, (login, ticket) => !!state.closed![`${login}:${ticket}`])
    .filter((p) => (p.sl > 0 || p.hasSl) && watchable(p.symbol) && !cfg.mute.includes(p.login));
  let missAll = pos.map((p) => ({ p, at: lastMissedClose(p, nowMs, graceMs) })).filter((x) => x.at > 0);

  // Lệnh đóng mà chưa có mốc "gone" (đóng trước bản này, hoặc ghi mốc lỗi): tra hộp chờ — mỗi nến lỡ của mỗi lệnh một lần
  const checked = state.checked!;
  if (missAll.some((m) => (checked[m.p.key] || 0) < m.at)) {
    const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", "mt5Inbox").maybeSingle();
    const inbox = (Array.isArray(data?.value) ? data!.value : []) as { event?: string; login?: string; ticket?: string }[];
    const closes = new Set(inbox.filter((x) => x?.event === "close").map((x) => `${x.login}:${x.ticket}`));
    for (const m of missAll) {
      checked[m.p.key] = m.at;
      if (closes.has(m.p.key)) state.closed![m.p.key] = new Date(nowMs).toISOString();
    }
    missAll = missAll.filter((m) => !closes.has(m.p.key));
  }
  const missKeys = new Set(missAll.map((m) => m.p.key));
  for (const k of Object.keys(checked)) if (!missKeys.has(k)) delete checked[k];
  // Nến lỡ quá 12 giờ (vừa bật tính năng, qua cuối tuần) thì không báo mới — nhưng vẫn tính là "còn lỡ", không phải đã báo lại
  const stillMissing = new Set(missAll.map((m) => m.p.login));
  const miss = missAll.filter((m) => nowMs - m.at <= FRESH_MS);

  const byLogin = new Map<string, { name: string; at: number; list: SlPos[] }>();
  for (const { p, at } of miss) {
    const g = byLogin.get(p.login) || { name: p.accountName || `#${p.login}`, at: 0, list: [] };
    g.at = Math.max(g.at, at);
    g.list.push(p);
    byLogin.set(p.login, g);
  }
  const { chatId, topic } = fillChat();
  const iso = new Date(nowMs).toISOString();
  const clock = vnTime(nowMs, nowMs);

  // EA báo lại (hoặc lệnh đã đóng / tắt canh) → sửa tin cảnh báo cũ
  const touched = new Set<number>();
  for (const [login, a] of Object.entries(alarms)) {
    if (a.okAt || stillMissing.has(login)) continue;
    const reported = rows.some((r) => r.login === login && r.bar * 1000 >= a.bar);
    a.okAt = iso;
    a.ok = cfg.mute.includes(login) ? "🔕 đã tắt canh tài khoản này" : reported ? `✅ EA đã báo lại lúc ${clock}` : "✅ không còn lệnh cần canh";
    if (a.mid) touched.add(a.mid);
  }
  for (const mid of touched) {
    const items = Object.values(alarms).filter((x) => x.mid === mid);
    const info = await tg(token, "editMessageText", { chat_id: chatId, message_id: mid, text: alarmText(items, cfg.graceMin) });
    if (!info.ok && !/not modified/i.test(info.description || "")) console.error("ea alarm edit failed", mid, info.description);
  }

  // Tài khoản mới lỡ nến (hoặc lỡ thêm nến mới) → một tin cho cả lượt
  const fresh = [...byLogin].filter(([login, g]) => !alarms[login] || alarms[login].bar < g.at);
  if (!fresh.length) return { missing: stillMissing.size, sent: 0, recovered: touched.size };
  const items: [string, EaAlarm][] = fresh.map(([login, g]) => {
    const tfs = [...new Set(g.list.map((p) => normTf(p.tf) || p.tf))].join("/");
    const syms = [...new Set(g.list.map((p) => shortSymbol(p.symbol)))];
    const line = `• ${g.name} · nến ${tfs} đóng ${vnTime(g.at, nowMs)} · ${g.list.length} lệnh: ${syms.slice(0, 10).join(", ")}${syms.length > 10 ? "…" : ""}`;
    return [login, { bar: g.at, line, at: iso }];
  });
  const payload: Record<string, unknown> = { chat_id: chatId, text: alarmText(items.map(([, a]) => a), cfg.graceMin) };
  if (topic) payload.message_thread_id = topic;
  const info = await tg(token, "sendMessage", payload);
  if (!info.ok) {
    console.error("ea alarm send failed", info.description); // không ghi → lượt sau thử lại
    return { missing: stillMissing.size, sent: 0, error: info.description };
  }
  for (const [login, a] of items) alarms[login] = { ...a, mid: info.result?.message_id };
  return { missing: stillMissing.size, sent: items.length, recovered: touched.size };
}

// Gọi mỗi lượt tick. raw = các ô slMove còn hạn (flushSlBoards trả về).
export async function eaTick(supabase: Supa, userId: string, token: string, settings: { eaWatch?: EaWatchCfg } | null | undefined,
  raw: SlRawRow[], nowMs = Date.now()) {
  const { data } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", EA_WATCH_KEY).maybeSingle();
  const state: EaWatchState = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {};
  const before = JSON.stringify(state);
  state.alarms = state.alarms || {};
  state.closed = state.closed || {};
  state.checked = state.checked || {};
  let hist: unknown = 0;
  try { hist = await syncHist(supabase, userId, raw, state, nowMs); } catch (e) { hist = String((e as Error).message || e); }
  const cfg = watchCfg(settings?.eaWatch);
  let watch: unknown = "off";
  if (cfg.enabled) {
    try { watch = await watchStep(supabase, userId, token, raw, state, cfg, nowMs); } catch (e) { watch = String((e as Error).message || e); }
  }
  for (const [k, at] of Object.entries(state.closed)) if (nowMs - Date.parse(at) > 5 * DAY) delete state.closed[k];
  for (const [k, a] of Object.entries(state.alarms)) if (nowMs - Date.parse(a.at) > 4 * DAY) delete state.alarms[k];
  if (JSON.stringify(state) !== before) {
    await supabase.from("app_data").upsert(
      { user_id: userId, key: EA_WATCH_KEY, value: state, updated_at: new Date(nowMs).toISOString() },
      { onConflict: "user_id,key" },
    );
  }
  return { hist, watch };
}
