// Đối chiếu file CSV sàn xuất ra (Exness: Lịch sử giao dịch → Xuất CSV) với nhật ký, để
// bắt những lệnh đã đánh mà quên ghi. Sàn là bằng chứng gốc — thiếu ở nhật ký thì gần như
// chắc chắn là bỏ sót, chứ không phải sàn sai.
import { computeResult, emptyTrade, partialExitsOf } from "./helpers.js";

// Dấu phân cách tuỳ máy người xuất: máy dùng dấu phẩy thập phân thì Excel xuất ra ";".
function sniffDelimiter(line) {
  const counts = [",", ";", "\t"].map((d) => [d, line.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

// Tự viết thay vì kéo thư viện: chỉ cần đúng phần dấu nháy kép và xuống dòng trong ô.
export function parseCsv(text) {
  const clean = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!clean.trim()) return [];
  const delim = sniffDelimiter(clean.split("\n")[0]);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delim) { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

// Mỗi sàn đặt tên cột một kiểu — nhận theo nhiều tên để khỏi phải sửa code mỗi lần đổi sàn.
const FIELD_ALIASES = {
  ticket: ["ticket", "order", "deal", "position", "position_id", "id"],
  openAt: ["opening_time_utc", "opening_time", "open_time", "time", "open"],
  closeAt: ["closing_time_utc", "closing_time", "close_time", "close"],
  type: ["type", "side", "direction"],
  lots: ["lots", "volume", "size"],
  symbol: ["symbol", "instrument", "pair"],
  openPrice: ["opening_price", "open_price", "price_open"],
  closePrice: ["closing_price", "close_price", "price_close"],
  commission: ["commission", "commissions", "fee"],
  swap: ["swap", "swaps", "rollover"],
  profit: ["profit", "pnl", "net_profit", "result"],
  closeReason: ["close_reason", "reason", "comment"],
};

function headerIndex(headers) {
  const norm = headers.map((h) => String(h || "").trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = {};
  Object.entries(FIELD_ALIASES).forEach(([field, names]) => {
    const at = norm.findIndex((h) => names.includes(h));
    if (at >= 0) idx[field] = at;
  });
  return idx;
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  // "1 234,56" (định dạng châu Âu) và "1,234.56" đều phải ra cùng một số.
  const s = String(v).trim().replace(/\s/g, "");
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pad(n) { return String(n).padStart(2, "0"); }

// Sàn ghi giờ UTC còn nhật ký ghi giờ máy bạn — lệch 7 tiếng là đủ để một lệnh mở 23h
// (giờ VN) bị tính sang hôm trước, nên phải quy đổi trước khi so ngày.
function parseUtc(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function localDate(d) {
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
}

export function localTime(d) {
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}

// Sàn thêm hậu tố theo loại tài khoản (EURUSDm, XAUUSD.raw) và người dùng hay gõ EUR/USD —
// quy hết về chữ và số viết hoa rồi mới so.
export function normalizeSymbol(s) {
  let v = String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Bỏ hậu tố một chữ cái của tài khoản cent/raw, nhưng giữ nguyên mã 3 ký tự như XAU.
  if (v.length > 6 && /[A-Z]$/.test(v) && /^[A-Z]{6}/.test(v)) v = v.slice(0, 6);
  return v;
}

export function parseBrokerCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { rows: [], error: "File rỗng." };
  const idx = headerIndex(rows[0]);
  const missing = ["openAt", "symbol"].filter((f) => idx[f] === undefined);
  if (missing.length) {
    return { rows: [], error: "Không tìm thấy cột thời gian mở lệnh và tên symbol — file này có đúng là CSV sàn xuất ra không?" };
  }
  const get = (r, f) => (idx[f] === undefined ? "" : r[idx[f]]);
  const out = [];
  rows.slice(1).forEach((r, i) => {
    const openAt = parseUtc(get(r, "openAt"));
    const symbol = String(get(r, "symbol") || "").trim();
    if (!openAt || !symbol) return;
    const profit = num(get(r, "profit"));
    const commission = num(get(r, "commission"));
    const swap = num(get(r, "swap"));
    out.push({
      // Chốt bớt làm một vị thế xuất ra nhiều dòng CÙNG số ticket — thêm số thứ tự để hai
      // dòng đó không bị coi là một.
      key: `${get(r, "ticket") || "row"}#${i}`,
      ticket: String(get(r, "ticket") || "").trim(),
      openAt,
      closeAt: parseUtc(get(r, "closeAt")),
      type: String(get(r, "type") || "").trim().toLowerCase(),
      lots: num(get(r, "lots")),
      symbol,
      symbolKey: normalizeSymbol(symbol),
      // Sàn tách làm hai phần: lãi lỗ theo giá, và phí (hoa hồng + qua đêm). Cổ phiếu giữ
      // nhiều ngày thì phí qua đêm ăn thẳng vào kết quả, nên phải giữ riêng để đối chiếu.
      commission, swap,
      fees: commission === null && swap === null ? null : (commission || 0) + (swap || 0),
      net: profit === null ? null : profit + (commission || 0) + (swap || 0),
      profit,
      closeReason: String(get(r, "closeReason") || "").trim().toLowerCase(),
    });
  });
  if (!out.length) return { rows: [], error: "Đọc được file nhưng không có dòng lệnh nào." };
  return { rows: out.sort((a, b) => a.openAt - b.openAt), error: "" };
}

function tradeOpenMs(t) {
  if (!t.entryDate) return null;
  const d = new Date(`${t.entryDate}T${t.entryTime || "00:00"}:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// Lệch tiền bao nhiêu thì coi là gõ sai chứ không phải sàn làm tròn.
const PROFIT_TOLERANCE = 0.5;

// Cửa sổ so giờ mở lệnh. Rộng 2 ngày vì lệnh mở buổi tối giờ Mỹ rơi sang sáng hôm sau giờ
// VN (JNJ mở 17:37 UTC = 00:37 ngày hôm sau), nên ngày trên sàn và ngày bạn ghi lệch nhau
// đúng một ngày là chuyện thường — cùng symbol cùng tài khoản thì vẫn là một lệnh.
export const DEFAULT_TOLERANCE_HOURS = 48;

// Ghép mỗi dòng CSV với đúng một lệnh trong nhật ký: cùng symbol, cùng tài khoản, và giờ mở
// gần nhau nhất. Ghép 1-1 theo thứ tự lệch ít nhất trước, để hai lệnh cùng symbol trong một
// ngày không cùng nhận một bản ghi.
export function reconcileBrokerRows(rows, trades, { account, toleranceHours = DEFAULT_TOLERANCE_HOURS } = {}) {
  const tol = Math.max(1, Number(toleranceHours) || DEFAULT_TOLERANCE_HOURS) * 3600000;
  const pool = (trades || []).filter((t) => t.account === account && t.symbol && t.entryDate);
  const pairs = [];
  (rows || []).forEach((row) => {
    pool.forEach((t) => {
      if (normalizeSymbol(t.symbol) !== row.symbolKey) return;
      const ms = tradeOpenMs(t);
      if (ms === null) return;
      const gap = Math.abs(ms - row.openAt.getTime());
      if (gap <= tol) pairs.push({ row, trade: t, gap });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap);

  const rowTaken = new Map();
  const tradeTaken = new Map();
  pairs.forEach(({ row, trade, gap }) => {
    if (rowTaken.has(row.key) || tradeTaken.has(trade.id)) return;
    rowTaken.set(row.key, { trade, gap });
    tradeTaken.set(trade.id, row);
  });

  const matched = [];
  const missing = [];
  (rows || []).forEach((row) => {
    const hit = rowTaken.get(row.key);
    if (!hit) {
      // Cùng số ticket với một dòng đã khớp thì chắc chắn là lần chốt bớt của chính vị thế
      // đó, không phải lệnh bị quên; cùng symbol cùng ngày thì mới chỉ là khả năng.
      const samePosition = !!row.ticket && (rows || []).some((r) => r.key !== row.key
        && r.ticket === row.ticket && rowTaken.has(r.key));
      missing.push({ ...row, samePosition, maybePartial: samePosition || matchedSameDay(rowTaken, rows, row) });
      return;
    }
    const net = row.net;
    const journal = computeResult(hit.trade).profit;
    const diff = net === null || journal === null ? null : journal - net;
    const split = partialExitsOf(hit.trade).length > 0;
    // Phí chưa điền mà sàn có tính thì đó là lý do lệch — nói thẳng ra thay vì bắt người
    // dùng tự ngồi trừ, vì cổ phiếu giữ qua đêm phí ăn hẳn vào kết quả.
    const feeMissing = !split && row.fees !== null && row.fees !== 0
      && (hit.trade.fees === "" || hit.trade.fees === undefined || hit.trade.fees === null);
    matched.push({
      row, trade: hit.trade, gap: hit.gap,
      // Lệnh có chốt bớt thì tổng nhật ký gồm nhiều dòng CSV, so một dòng sẽ luôn lệch.
      profitDiff: split ? null : diff,
      profitOff: diff !== null && !split && Math.abs(diff) > PROFIT_TOLERANCE,
      feeMissing,
      // Ngày trên sàn (đã quy về giờ máy bạn) khác ngày bạn ghi — vẫn là một lệnh, nhưng
      // lệch ngày thì lịch và thống kê theo ngày sẽ đếm sai chỗ.
      dateOff: localDate(row.openAt) !== hit.trade.entryDate,
    });
  });

  // Lệnh trong nhật ký nằm trong khoảng thời gian của file mà sàn không có: hoặc gõ nhầm
  // tài khoản/symbol/ngày, hoặc là lệnh của sàn khác.
  const from = rows.length ? rows[0].openAt.getTime() : 0;
  const to = rows.length ? rows[rows.length - 1].openAt.getTime() : 0;
  const extra = pool.filter((t) => {
    if (tradeTaken.has(t.id)) return false;
    const ms = tradeOpenMs(t);
    return ms !== null && ms >= from - 86400000 && ms <= to + 86400000;
  });

  return { matched, missing, extra, tolerance: PROFIT_TOLERANCE };
}

function matchedSameDay(rowTaken, rows, row) {
  const day = localDate(row.openAt);
  return (rows || []).some((r) => r.key !== row.key && rowTaken.has(r.key)
    && r.symbolKey === row.symbolKey && localDate(r.openAt) === day);
}

// Dựng sẵn một lệnh từ dòng CSV để mở thẳng form — điền hộ đúng những gì sàn biết chắc,
// phần đánh giá/tâm lý vẫn để trống cho bạn tự viết. Lãi lỗ và phí để riêng đúng như sàn
// tách, để tổng cộng lại ra khớp con số cuối cùng.
export function tradeFromBrokerRow(row, account, symbols) {
  const known = (symbols || []).find((s) => normalizeSymbol(s) === row.symbolKey);
  return {
    ...emptyTrade(),
    account,
    symbol: known || row.symbol,
    direction: row.type === "sell" ? "sell" : "buy",
    entryDate: localDate(row.openAt),
    entryTime: localTime(row.openAt),
    exitDate: localDate(row.closeAt),
    exitTime: localTime(row.closeAt),
    profit: row.profit === null ? "" : String(Number(row.profit.toFixed(2))),
    fees: row.fees === null || row.fees === 0 ? "" : String(Number(row.fees.toFixed(2))),
  };
}

// Điền phí sàn vào một lệnh đã có. Giữ nguyên dấu của sàn: bị trừ là số âm.
export function withBrokerFees(trade, row) {
  return { ...trade, fees: row.fees === null ? "" : String(Number(row.fees.toFixed(2))) };
}
