// Bảng dời SL trên Telegram: EA KeoSLDuoiNen (v2.90+) báo mỗi lệnh mỗi nến một dòng ("event": "sl") lên
// mt5-journal → mỗi dòng một ô app_data riêng `slMove:<login>:<ticket>:<bar>` (ô riêng nên nhiều lệnh báo cùng giây
// không đè nhau). alert-relay tick (mỗi phút) gom các dòng cùng tài khoản + cùng giờ đóng nến thành MỘT tin vào nhóm
// MT5 (_shared/mt5Fill.ts) sau khi tài khoản đó im 60 giây; dòng đổi sau đó (chờ spread → đã dời) thì sửa lại chính
// tin đó. Trạng thái bảng (id tin + nội dung đã gửi) ở `slBoard:<login>:<bar>`. Cả hai dọn sau 3 ngày.
// Tắt: supabase secrets set MT5_SL_BOARD=off (EA vẫn gửi, máy chủ bỏ qua).

import { fillChat, shortSymbol } from "./mt5Fill.ts";

export type SlStatus = "moved" | "be" | "keep" | "skip" | "wait" | "closed" | "now";
export type SlRow = {
  login: string; accountName: string; ticket: string; symbol: string; side: "buy" | "sell"; status: SlStatus;
  no: string; tf: string; bar: number; slOld: number; slNew: number; level: number; open: number; digits: number;
  currency: string; note: string; at: string;
};

export const SL_MOVE_PREFIX = "slMove:";
export const SL_BOARD_PREFIX = "slBoard:";
const QUIET_MS = 60 * 1000;
const KEEP_MS = 3 * 24 * 3600 * 1000;
const STALE_MS = 3 * 3600 * 1000;
// Bảng đã im quá 12 giờ = xong, chỉ chờ dọn. Dọn theo từng ô nên ô bảng có khi bị xoá trước các dòng (EA khởi động lại
// gửi lại dòng y hệt → dòng mới hơn bảng) hoặc các dòng bị xoá lệch nhau — không có chặn này thì 3 ngày sau bot gửi lại
// bảng cũ như tin mới, hoặc sửa tin cũ mất bớt dòng.
const IDLE_MS = 12 * 3600 * 1000;
// now = hiện trạng lúc EA khởi động (EA v2.91+), không phải kết quả của nến nào
const STATUSES: SlStatus[] = ["moved", "be", "keep", "skip", "wait", "closed", "now"];
// Đã dời / về BE / đã đóng là kết quả cuối của nến đó: dòng "giữ" đến sau (lúc nến đóng hẳn, sau khi đã dời sớm
// trước giờ qua đêm) hay "chờ" không được đè lên
const FINAL: SlStatus[] = ["moved", "be", "closed"];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v: unknown, max = 64) => String(v ?? "").trim().slice(0, max);

export function parseSlRow(body: Record<string, unknown>): SlRow | null {
  const login = clean(body.login).replace(/\D/g, "");
  const ticket = clean(body.ticket).replace(/\D/g, "");
  const symbol = clean(body.symbol, 32);
  const bar = Math.round(Number(body.bar));
  const status = clean(body.status) as SlStatus;
  if (!login || !ticket || !symbol || !(bar > 0) || !STATUSES.includes(status)) return null;
  return {
    login, ticket, symbol, bar, status,
    accountName: clean(body.accountName, 120),
    side: clean(body.side).toLowerCase() === "sell" ? "sell" : "buy",
    no: clean(body.no, 12), tf: clean(body.tf, 8).toUpperCase(),
    slOld: num(body.slOld), slNew: num(body.slNew), level: num(body.level), open: num(body.open),
    digits: Math.max(0, Math.min(8, Math.round(num(body.digits)) || 5)),
    currency: clean(body.currency, 8).toUpperCase(),
    note: clean(body.note, 120), at: new Date().toISOString(),
  };
}

export const slRowKey = (r: SlRow) => `${SL_MOVE_PREFIX}${r.login}:${r.ticket}:${r.bar}`;

// Dòng mới có được thay dòng cũ cùng lệnh, cùng nến không
export const slReplaces = (prev: SlRow | null | undefined, next: SlRow) =>
  !prev || !FINAL.includes(prev.status) || FINAL.includes(next.status);

const VN = 7 * 3600 * 1000;
const hhmm = (sec: number) => {
  const d = new Date(sec * 1000 + VN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const ddmm = (sec: number) => {
  const d = new Date(sec * 1000 + VN);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const px = (v: number, d: number) => (v > 0 ? v.toFixed(d) : "—");
const ICON: Record<SlStatus, string> = { moved: "✅", be: "🔒", keep: "⏸", skip: "🆕", wait: "⏳", closed: "❌", now: "📍" };
const orderOf = (r: SlRow) => Number(r.no.split("/")[0]) || 999;
// Đã BE = SL đang có (sau lần dời này) ở hoặc qua giá vào
const isBe = (r: SlRow) => {
  const sl = r.status === "moved" || r.status === "be" ? r.slNew : r.slOld;
  return r.open > 0 && sl > 0 && (r.side === "buy" ? sl >= r.open : sl <= r.open);
};

// Chỉ tình trạng: dời hay giữ, đã BE chưa, SL bao nhiêu — không ghi lãi/lỗ (người dùng chọn 06/11)
function rowLine(r: SlRow) {
  const d = r.digits;
  const head = `${ICON[r.status]} ${r.no ? r.no + " " : ""}${shortSymbol(r.symbol)} ${r.side === "buy" ? "Buy" : "Sell"}`;
  let what = "";
  if (r.status === "moved") what = `dời SL ${px(r.slOld, d)} → ${px(r.slNew, d)}`;
  else if (r.status === "be") what = `dời về BE · SL ${px(r.slOld, d)} → ${px(r.slNew, d)}`;
  else if (r.status === "keep") what = `giữ SL ${px(r.slOld, d)}`;
  else if (r.status === "skip") what = `mới vào, chưa kéo · SL ${px(r.slOld, d)}`;
  else if (r.status === "wait") what = `CHƯA DỜI (${r.note || "đang chờ"}) · SL ${px(r.slOld, d)}, sẽ dời → ${px(r.slNew, d)}`;
  else if (r.status === "closed") what = `${r.note || "giá vượt SL mới"} → EA đã đóng lệnh`;
  else if (r.status === "now") what = r.slOld > 0 ? `SL ${px(r.slOld, d)}` : "⚠️ CHƯA CÓ SL";
  const early = (r.status === "moved" || r.status === "be") && r.note.startsWith("dời sớm") ? ` (${r.note})` : "";
  return `${head} · ${what}${early}${r.status === "closed" ? "" : ` · ${isBe(r) ? "đã BE" : "chưa BE"}`}`;
}

const SEP = "──────────────";

export function boardText(rows: SlRow[]) {
  const list = [...rows].sort((a, b) => orderOf(a) - orderOf(b) || a.symbol.localeCompare(b.symbol));
  const first = list[0];
  const tfs = [...new Set(list.map((r) => r.tf).filter(Boolean))].join("/");
  const snap = list.every((r) => r.status === "now");
  const who = first.accountName || "#" + first.login;
  const lines = [snap
    ? `🛡 SL hiện tại · ${who} · khung ${tfs} · lúc ${hhmm(first.bar)} ${ddmm(first.bar)}`
    : `🛡 SL · ${who} · nến ${tfs || ""} đóng ${hhmm(first.bar)} ${ddmm(first.bar)}`.replace(/\s+/g, " ")];
  lines.push(SEP);
  for (const r of list) lines.push(rowLine(r));
  lines.push(SEP);
  const open = list.filter((r) => r.status !== "closed");
  const moved = list.filter((r) => r.status === "moved" || r.status === "be").length;
  const foot = [snap ? `${list.length} lệnh` : `dời ${moved}/${list.length}`, `đã BE ${open.filter(isBe).length}/${open.length}`];
  if (list.some((r) => r.status === "now" && !(r.slOld > 0))) foot.push("⚠️ có lệnh chưa có SL");
  if (list.some((r) => r.status === "wait")) foot.push("⚠️ còn lệnh chưa dời");
  lines.push(foot.join(" · "));
  return lines.join("\n");
}

type Supa = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function tg(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  let info: { ok?: boolean; result?: { message_id?: number }; description?: string } = {};
  try { info = await res.json(); } catch (_e) { /* không phải JSON */ }
  return info;
}

// Gửi / sửa bảng của các tài khoản đã có dòng mới. Trả về số tin đã gửi + đã sửa.
export async function flushSlBoards(supabase: Supa, userId: string, token: string, nowMs = Date.now()) {
  if ((Deno.env.get("MT5_SL_BOARD") || "").toLowerCase() === "off") return { sent: 0, edited: 0 };
  const { data: moveRows } = await supabase.from("app_data").select("key, value, updated_at")
    .eq("user_id", userId).like("key", `${SL_MOVE_PREFIX}%`);
  const { data: boardRows } = await supabase.from("app_data").select("key, value, updated_at")
    .eq("user_id", userId).like("key", `${SL_BOARD_PREFIX}%`);
  const old = (r: { updated_at?: string }) => nowMs - Date.parse(r.updated_at || "") > KEEP_MS;
  const stale = [...(moveRows || []), ...(boardRows || [])].filter(old).map((r: { key: string }) => r.key);
  if (stale.length) await supabase.from("app_data").delete().eq("user_id", userId).in("key", stale);

  const groups = new Map<string, SlRow[]>();
  for (const r of moveRows || []) {
    if (old(r)) continue;
    const row = r.value as SlRow;
    if (!row?.login || !row.bar) continue;
    const g = `${row.login}:${row.bar}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(row);
  }
  const boards = new Map<string, { mid?: number; text?: string; skipped?: boolean }>(
    (boardRows || []).map((r: { key: string; value: { mid?: number; text?: string; skipped?: boolean } }) => [r.key.slice(SL_BOARD_PREFIX.length), r.value || {}]),
  );
  const { chatId, topic } = fillChat();
  let sent = 0, edited = 0;
  for (const [g, rows] of groups) {
    const text = boardText(rows);
    const board = boards.get(g);
    const newest = Math.max(...rows.map((r) => Date.parse(r.at) || 0));
    const save = (v: { mid?: number; text: string; skipped?: boolean }) => supabase.from("app_data").upsert(
      { user_id: userId, key: `${SL_BOARD_PREFIX}${g}`, value: v, updated_at: new Date(nowMs).toISOString() },
      { onConflict: "user_id,key" },
    );
    if (board?.skipped || nowMs - newest > IDLE_MS) continue;
    if (!board?.mid) {
      if (nowMs - newest < QUIET_MS) continue; // tài khoản còn đang báo các lệnh khác của nến này
      // EA khởi động lại thì tính lại nến đã đóng gần nhất → dòng "giữ" của nến cũ: không gửi bảng nến đóng quá 3 tiếng
      // (bảng hiện trạng "now" thì luôn gửi)
      const stale = !rows.every((r) => r.status === "now") && newest - rows[0].bar * 1000 > STALE_MS;
      if (stale) { await save({ text, skipped: true }); continue; }
      // Luôn có chuông (người dùng 06/11: tin im lặng thì tưởng không có tin); sửa tin sau đó thì không kêu
      const payload: Record<string, unknown> = { chat_id: chatId, text };
      if (topic) payload.message_thread_id = topic;
      const info = await tg(token, "sendMessage", payload);
      if (!info.ok) { console.error("sl board send failed", g, info.description); continue; }
      await save({ mid: info.result?.message_id, text });
      sent++;
    } else if (board.text !== text) {
      const info = await tg(token, "editMessageText", { chat_id: chatId, message_id: board.mid, text });
      if (!info.ok && !/not modified/i.test(info.description || "")) console.error("sl board edit failed", g, info.description);
      await save({ mid: board.mid, text });
      edited++;
    }
  }
  return { sent, edited };
}

// Soát nhanh (alert-relay ?slstat=1&key=…): các dòng + bảng 24 giờ qua, không gửi gì
export async function slStatus(supabase: Supa, userId: string, nowMs = Date.now()) {
  const since = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const { data: moves } = await supabase.from("app_data").select("key, value, updated_at")
    .eq("user_id", userId).like("key", `${SL_MOVE_PREFIX}%`).gte("updated_at", since);
  const { data: boards } = await supabase.from("app_data").select("key, value, updated_at")
    .eq("user_id", userId).like("key", `${SL_BOARD_PREFIX}%`).gte("updated_at", since);
  return {
    chat: fillChat(),
    moves: (moves || []).map((r: { key: string; value: SlRow }) => `${r.key} ${r.value?.status} ${r.value?.symbol} ${r.value?.at}`),
    boards: (boards || []).map((r: { key: string; value: { mid?: number }; updated_at: string }) => `${r.key} mid=${r.value?.mid} ${r.updated_at}`),
  };
}
