// Lịch tin lớn cho bot (alert-relay) và web (Lịch nhắc → Tin lớn).
//
// Cảnh báo giá TradingView bắn trong khoảng X phút trước → Y phút sau giờ một tin lớn của ĐỒNG TIỀN CÓ TRONG MÃ
// thì tin Telegram có dòng "⛔ SÁT TIN …" ở đầu. Mã không dính đồng của tin (vd NFP USD với EURJPY) không bị gắn.
//
// Nguồn lịch:
//   1. BUILTIN — chép từ chỉ báo TradingView "Tránh Tin Lớn · Forex" (tradingview/tranh-tin-lon-forex.pine), giờ UTC,
//      đổi từ giờ địa phương nơi công bố bằng Python zoneinfo. Chạy tới 02/2028.
//   2. Lịch dán (app_data "newsCalendar".text) — cùng mẫu ô "Lịch tin dán tay" của chỉ báo, GIỜ VIỆT NAM:
//        2026-11-06 20:30 USD NFP | Việc làm Mỹ tháng 10
//      Việc tự chạy tối Chủ nhật đẩy khối 14 ngày tới vào đây (alert-relay ?news=1), web sửa tay được.
//      Tin dán TRÙNG tin có sẵn (cùng đồng + tên, lệch ≤ 10 ngày) thì thay tin có sẵn — họ dời lịch chỉ cần dán.

export type NewsTier = 0 | 1 | 2 | 3; // ⚪ nhẹ · 🟡 vừa · 🟠 mạnh · 🔴 rất mạnh
export type NewsEvent = { t: number; cur: string; name: string; note: string; pasted: boolean; tier: NewsTier; h4?: number };
export type NewsGuard = { enabled?: boolean; before?: number; after?: number };
export type NewsStore = { text?: string; updatedAt?: string; by?: string } | null | undefined;

export const NEWS_KEY = "newsCalendar";
export const NEWS_CURS = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];

const BUILTIN = [
  "2026-11-03T03:30 AUD RBA",
  "2026-11-05T12:00 GBP BoE",
  "2026-11-06T13:30 USD NFP",
  "2026-11-10T13:30 USD CPI",
  "2026-12-04T13:30 USD NFP",
  "2026-12-08T03:30 AUD RBA",
  "2026-12-09T01:00 NZD RBNZ",
  "2026-12-09T14:45 CAD BoC",
  "2026-12-09T19:00 USD FOMC",
  "2026-12-10T08:30 CHF SNB",
  "2026-12-10T13:30 USD CPI",
  "2026-12-17T12:00 GBP BoE",
  "2026-12-17T13:15 EUR ECB",
  "2026-12-18T03:00 JPY BoJ",
  "2027-01-08T13:30 USD NFP",
  "2027-01-13T13:30 USD CPI",
  "2027-01-22T03:00 JPY BoJ",
  "2027-01-27T14:45 CAD BoC",
  "2027-01-27T19:00 USD FOMC",
  "2027-02-04T12:00 GBP BoE",
  "2027-02-04T13:15 EUR ECB",
  "2027-02-05T13:30 USD NFP",
  "2027-02-09T03:30 AUD RBA",
  "2027-02-10T01:00 NZD RBNZ",
  "2027-02-11T13:30 USD CPI",
  "2027-03-03T14:45 CAD BoC",
  "2027-03-05T13:30 USD NFP",
  "2027-03-10T13:30 USD CPI",
  "2027-03-17T01:00 NZD RBNZ",
  "2027-03-17T18:00 USD FOMC",
  "2027-03-18T03:00 JPY BoJ",
  "2027-03-18T08:30 CHF SNB",
  "2027-03-18T12:00 GBP BoE",
  "2027-03-18T13:15 EUR ECB",
  "2027-03-23T03:30 AUD RBA",
  "2027-04-02T12:30 USD NFP",
  "2027-04-13T12:30 USD CPI",
  "2027-04-28T03:00 JPY BoJ",
  "2027-04-28T13:45 CAD BoC",
  "2027-04-28T18:00 USD FOMC",
  "2027-04-29T11:00 GBP BoE",
  "2027-04-29T12:15 EUR ECB",
  "2027-05-04T04:30 AUD RBA",
  "2027-05-05T02:00 NZD RBNZ",
  "2027-05-07T12:30 USD NFP",
  "2027-05-12T12:30 USD CPI",
  "2027-06-02T13:45 CAD BoC",
  "2027-06-04T12:30 USD NFP",
  "2027-06-09T18:00 USD FOMC",
  "2027-06-10T12:15 EUR ECB",
  "2027-06-10T12:30 USD CPI",
  "2027-06-11T03:00 JPY BoJ",
  "2027-06-16T02:00 NZD RBNZ",
  "2027-06-17T11:00 GBP BoE",
  "2027-06-22T04:30 AUD RBA",
  "2027-06-24T07:30 CHF SNB",
  "2027-07-02T12:30 USD NFP",
  "2027-07-14T12:30 USD CPI",
  "2027-07-21T13:45 CAD BoC",
  "2027-07-22T03:00 JPY BoJ",
  "2027-07-22T12:15 EUR ECB",
  "2027-07-28T18:00 USD FOMC",
  "2027-07-29T11:00 GBP BoE",
  "2027-08-04T02:00 NZD RBNZ",
  "2027-08-06T12:30 USD NFP",
  "2027-08-10T04:30 AUD RBA",
  "2027-08-11T12:30 USD CPI",
  "2027-09-03T12:30 USD NFP",
  "2027-09-08T13:45 CAD BoC",
  "2027-09-09T12:15 EUR ECB",
  "2027-09-14T12:30 USD CPI",
  "2027-09-15T02:00 NZD RBNZ",
  "2027-09-15T18:00 USD FOMC",
  "2027-09-16T11:00 GBP BoE",
  "2027-09-22T03:00 JPY BoJ",
  "2027-09-23T07:30 CHF SNB",
  "2027-09-28T04:30 AUD RBA",
  "2027-10-08T12:30 USD NFP",
  "2027-10-14T12:30 USD CPI",
  "2027-10-27T01:00 NZD RBNZ",
  "2027-10-27T13:45 CAD BoC",
  "2027-10-27T18:00 USD FOMC",
  "2027-10-28T12:15 EUR ECB",
  "2027-10-29T03:00 JPY BoJ",
  "2027-11-02T03:30 AUD RBA",
  "2027-11-04T12:00 GBP BoE",
  "2027-11-05T12:30 USD NFP",
  "2027-11-10T13:30 USD CPI",
  "2027-12-03T13:30 USD NFP",
  "2027-12-08T01:00 NZD RBNZ",
  "2027-12-08T14:45 CAD BoC",
  "2027-12-08T19:00 USD FOMC",
  "2027-12-10T13:30 USD CPI",
  "2027-12-14T03:30 AUD RBA",
  "2027-12-16T08:30 CHF SNB",
  "2027-12-16T12:00 GBP BoE",
  "2027-12-16T13:15 EUR ECB",
  "2027-12-17T03:00 JPY BoJ",
  "2028-02-09T01:00 NZD RBNZ",
];

export const NEWS_NOTE: Record<string, string> = {
  FOMC: "Lãi suất Fed",
  NFP: "Việc làm Mỹ",
  CPI: "Lạm phát Mỹ",
  ECB: "Lãi suất euro",
  BoE: "Lãi suất Anh",
  BoJ: "Lãi suất Nhật · giờ ước tính",
  BoC: "Lãi suất Canada",
  RBA: "Lãi suất Úc",
  RBNZ: "Lãi suất NZ",
  SNB: "Lãi suất Thụy Sĩ",
};
// Mức tin theo độ giật đo được (06/11/2026): nến H4 chứa giờ tin so với trung vị nến H4 cùng khung giờ 20 ngày trước,
// 10 cặp OANDA, mọi tin đỏ ForexFactory 01/2024 → 11/2026. Người dùng chốt 4 mức:
//   🔴 ≥ 2×  ·  🟠 1.6–2×  ·  🟡 1.4–1.6×  ·  ⚪ < 1.4× (không gắn gì)
// 🔴🟠 → "⛔ … KHÔNG VÀO LỆNH"; 🟡 → "⚠️ … cẩn thận"; ⚪ bỏ qua. Tin lạ (phát biểu…) = 🟡.
// Ghi chú tin dán bắt đầu bằng 🔴/🟠/🟡/⚪ thì theo mức đó.
const TIERS: Record<string, [NewsTier, number]> = {
  "USD:FOMC": [3, 3.6], "NZD:RBNZ": [3, 3.23], "CHF:SNB": [3, 2.36], "USD:NFP": [3, 2.19], "NZD:CPI": [3, 2.14],
  "JPY:BOJ": [3, 2.13], "GBP:BOE": [3, 2.02],
  "NZD:JOBS": [2, 1.93], "CAD:JOBS": [2, 1.89], "NZD:GDP": [2, 1.86], "USD:CPI": [2, 1.77], "AUD:RBA": [2, 1.74],
  "AUD:JOBS": [2, 1.67],
  "CHF:CPI": [1, 1.53], "AUD:CPI": [1, 1.49], "EUR:ECB": [1, 1.48], "CAD:BOC": [1, 1.47], "GBP:CPI": [1, 1.44],
  "CAD:CPI": [0, 1.39], "GBP:JOBS": [0, 1.28], "EUR:CPI": [0, 1.27], "USD:PPI": [0, 1.24], "CAD:GDP": [0, 1.23],
  "USD:GDP": [0, 1.21], "AUD:GDP": [0, 1.14], "USD:JOLTS": [0, 1.12], "GBP:GDP": [0, 1.1], "USD:CLAIMS": [0, 1.09],
  "USD:RETAIL": [0, 1.08], "GBP:RETAIL": [0, 1.06], "USD:ADP": [0, 1.02], "USD:PCE": [0, 1.02], "CAD:RETAIL": [0, 0.81],
};
export const TIER_ICON = ["⚪", "🟡", "🟠", "🔴"];
const ICON_TIER: Record<string, NewsTier> = { "⚪": 0, "🟡": 1, "🟠": 2, "🔴": 3 };
export function tierOf(cur: string, name: string, note = ""): { tier: NewsTier; h4?: number } {
  const mark = [...note.trim()][0];
  const t = TIERS[`${cur}:${name.toUpperCase()}`];
  if (mark && mark in ICON_TIER) return { tier: ICON_TIER[mark], h4: t?.[1] };
  return t ? { tier: t[0], h4: t[1] } : { tier: 1 };
}

// BoJ không có giờ cố định (thường 11:30–13:00 Tokyo) → khoảng cấm nới ra ít nhất 90 phút mỗi bên
const WIDE: Record<string, number> = { BoJ: 90 };

const MIN = 60 * 1000;
const VN_OFFSET = 7 * 60 * MIN; // Việt Nam không đổi giờ mùa
const DAY = 24 * 60 * MIN;

export function builtinEvents(): NewsEvent[] {
  return BUILTIN.map((s) => {
    const [iso, cur, name] = s.split(" ");
    return { t: Date.parse(iso + ":00Z"), cur, name, note: NEWS_NOTE[name] || "", pasted: false, ...tierOf(cur, name) };
  });
}

const normCur = (c: string) => (c === "USDT" || c === "USDC" ? "USD" : c);

// "2026-11-06 20:30 USD NFP | ghi chú" hoặc "06/11/2026 20:30 …" (giờ VN). Dòng # bỏ qua.
export function parseNewsPaste(text: string | undefined): { events: NewsEvent[]; bad: string[] } {
  const events: NewsEvent[] = [];
  const bad: string[] = [];
  for (const ln of String(text || "").split("\n")) {
    const raw = ln.trim();
    if (!raw || raw.startsWith("#")) continue;
    const [head, ...rest] = raw.split("|");
    const note = rest.join("|").trim();
    const toks = head.trim().split(/\s+/);
    const dm = toks[0]?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || toks[0]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const tm = toks[1]?.match(/^(\d{1,2}):(\d{2})$/);
    if (!dm || !tm || toks.length < 4) { bad.push(raw); continue; }
    const [y, m, d] = toks[0].includes("-") ? [+dm[1], +dm[2], +dm[3]] : [+dm[3], +dm[2], +dm[1]];
    const hh = +tm[1], mi = +tm[2];
    if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) { bad.push(raw); continue; }
    const cur = normCur(toks[2].toUpperCase());
    const name = toks.slice(3).join(" ");
    events.push({ t: Date.UTC(y, m - 1, d, hh, mi) - VN_OFFSET, cur, name, note, pasted: true, ...tierOf(cur, name, note) });
  }
  return { events, bad };
}

export function newsEvents(store: NewsStore): NewsEvent[] {
  const pasted = parseNewsPaste(store?.text).events;
  const same = (a: NewsEvent, b: NewsEvent) =>
    a.cur === b.cur && a.name.toUpperCase() === b.name.toUpperCase() && Math.abs(a.t - b.t) <= 10 * DAY;
  const kept = builtinEvents().filter((b) => !pasted.some((p) => same(p, b)));
  return [...kept, ...pasted].sort((a, b) => a.t - b.t);
}

// Đồng tiền có tin của một mã. FX / vàng / crypto đọc từ 6 chữ đầu (EURUSD, XAUUSD, BTCUSDT); chỉ số và
// hàng hoá theo bảng dưới. Mã lạ (cổ phiếu…) → [] = không gắn.
const SYM_CUR: [RegExp, string][] = [
  [/^(US30|US100|US500|US2000|USTEC|USTECH|NAS100|NAS|NDX|SPX|SPX500|SP500|DJI|DJ30|DOW|DXY|USDX|USOIL|WTI|UKOIL|BRENT|NGAS|NATGAS|COPPER|HG|GOLD|SILVER)/, "USD"],
  [/^(GER40|GER30|DE40|DE30|DAX|EU50|EUSTX50|STOXX50|FRA40|ESP35|ITA40|NED25)/, "EUR"],
  [/^(UK100|FTSE)/, "GBP"],
  [/^(JP225|JPN225|NIKKEI|NI225)/, "JPY"],
  [/^(AUS200|ASX200)/, "AUD"],
  [/^(SWI20|SMI)/, "CHF"],
  [/^(CAN60|TSX)/, "CAD"],
];
export function symbolCurrencies(sym: string | undefined): string[] {
  const s = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return [];
  const a = normCur(s.slice(0, 3));
  let b = s.slice(3, 6);
  if (s.slice(3, 7) === "USDT" || s.slice(3, 7) === "USDC") b = "USD";
  const out = [a, b].filter((c) => NEWS_CURS.includes(c));
  if (out.length && s.length >= 6) return [...new Set(out)];
  for (const [re, cur] of SYM_CUR) if (re.test(s)) return [cur];
  return [];
}

export function guardOf(g: NewsGuard | undefined) {
  return {
    enabled: g?.enabled !== false,
    before: Math.max(0, Math.min(240, Number(g?.before ?? 30) || 0)),
    after: Math.max(0, Math.min(240, Number(g?.after ?? 30) || 0)),
  };
}

// Tin của mã đang nằm trong khoảng cấm lúc nowMs
export function newsHits(sym: string, events: NewsEvent[], nowMs: number, guard: NewsGuard | undefined): NewsEvent[] {
  const g = guardOf(guard);
  if (!g.enabled) return [];
  const curs = symbolCurrencies(sym);
  if (!curs.length) return [];
  return events.filter((e) => {
    if (!curs.includes(e.cur) || e.tier === 0) return false;
    const w = WIDE[e.name] || 0;
    return nowMs >= e.t - Math.max(g.before, w) * MIN && nowMs <= e.t + Math.max(g.after, w) * MIN;
  });
}

const hhmm = (t: number) => {
  const d = new Date(t + VN_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const ddmm = (t: number) => {
  const d = new Date(t + VN_OFFSET);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const newsTimeVn = (t: number, withDate = false) => (withDate ? `${ddmm(t)} ${hhmm(t)}` : hhmm(t));

export function newsWhen(e: NewsEvent, nowMs: number) {
  const m = Math.round((e.t - nowMs) / MIN);
  const dur = (x: number) => (x >= 60 ? `${Math.floor(x / 60)}g${String(x % 60).padStart(2, "0")}p` : `${x}p`);
  return m > 0 ? `còn ${dur(m)}` : m === 0 ? "đang ra" : `ra ${dur(-m)} trước`;
}

// 🔴🟠: "⛔ SÁT TIN 🔴 · NFP USD 20:30 (còn 12p) — KHÔNG VÀO LỆNH"; 🟡: "⚠️ GẦN TIN 🟡 · ECB EUR 19:15 (…) — cẩn thận"
export const newsStrong = (hits: NewsEvent[]) => hits.some((e) => e.tier >= 2);
export function newsLine(hits: NewsEvent[], nowMs: number) {
  const part = (e: NewsEvent) => `${TIER_ICON[e.tier]} ${e.name} ${e.cur} ${hhmm(e.t)} (${newsWhen(e, nowMs)})`;
  const strong = hits.filter((e) => e.tier >= 2), mild = hits.filter((e) => e.tier === 1);
  const out: string[] = [];
  if (strong.length) out.push(`⛔ SÁT TIN · ${strong.map(part).join(" · ")} — KHÔNG VÀO LỆNH`);
  if (mild.length) out.push(`⚠️ GẦN TIN · ${mild.map(part).join(" · ")} — cẩn thận`);
  return out.join("\n");
}

export function upcomingNews(events: NewsEvent[], nowMs: number, days = 14) {
  return events.filter((e) => e.t >= nowMs - 60 * MIN && e.t <= nowMs + days * DAY);
}
