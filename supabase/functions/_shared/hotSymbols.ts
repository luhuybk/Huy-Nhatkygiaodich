// Mã tiềm năng (Thông báo → Lịch nhắc → Mã tiềm năng, lưu ở slReminderSettings.hotSymbols).
// Cảnh báo TradingView có nhắc tới một mã trong danh sách thì alert-relay thêm dòng 🔥 lên ĐẦU tin —
// màn hình khoá chỉ hiện vài dòng đầu, nên mã quan trọng không bị chìm giữa hàng chục cảnh báo khác.
// sl-reminder dùng lại để liệt kê các mã này (đã báo chưa) trong tin Kiểm tra setup.
//
// Dò mã: chỉ xét chữ IN HOA đứng riêng (tin TradingView ghi {{ticker}} in hoa), nên chữ tiếng Việt thường
// không bị nhận nhầm. Bỏ tiền tố sàn và dấu phân cách: OANDA:EUR_USD, EUR/USD, EURUSD đều là EURUSD.

export type HotSymbol = { id?: string; name?: string; note?: string; addedAt?: string };
export type HotSettings = { hotSymbols?: HotSymbol[]; hotEnabled?: boolean };

export const hotNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function hotList(settings: HotSettings | null | undefined): HotSymbol[] {
  if (!settings || settings.hotEnabled === false) return [];
  return (settings.hotSymbols || []).filter((h) => h && hotNorm(h.name));
}

const TOKEN = /(?<![\p{L}\p{N}])[A-Z0-9][A-Z0-9._:\/!-]*(?![\p{L}\p{N}])/gu;

function textTokens(text: string) {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    out.add(hotNorm(m[0]));
    // "OANDA:XAUUSD" hoặc "EURUSD:1.08" — xét riêng từng phần quanh dấu hai chấm
    for (const part of m[0].split(":")) out.add(hotNorm(part));
  }
  out.delete("");
  return out;
}

export function hotMatches(text: string, list: HotSymbol[]): HotSymbol[] {
  if (!list.length || !text) return [];
  const tokens = textTokens(text);
  const seen = new Set<string>();
  return list.filter((h) => {
    const k = hotNorm(h.name);
    if (!tokens.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Dòng đầu tin cảnh báo: "🔥🔥🔥 MÃ TIỀM NĂNG · EURUSD 🔥🔥🔥" + ghi chú của từng mã (nếu có)
export function hotHead(hits: HotSymbol[]) {
  if (!hits.length) return "";
  const name = (h: HotSymbol) => String(h.name || "").toUpperCase().trim();
  const lines = [`🔥🔥🔥 MÃ TIỀM NĂNG · ${hits.map(name).join(" · ")} 🔥🔥🔥`];
  for (const h of hits) {
    const note = String(h.note || "").trim();
    if (note) lines.push(`📝 ${hits.length > 1 ? `${name(h)}: ` : ""}${note}`);
  }
  return lines.join("\n");
}
