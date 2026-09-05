// Đối chiếu file CSV sàn xuất ra (Exness: Lịch sử giao dịch → Xuất CSV) với nhật ký, để
// bắt những lệnh đã đánh mà quên ghi. Sàn là bằng chứng gốc — thiếu ở nhật ký thì gần như
// chắc chắn là bỏ sót, chứ không phải sàn sai.
import { computeResult, emptyPartialExit, emptyTrade, partialExitsOf } from "./helpers.js";

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
  originalSize: ["original_position_size", "original_size", "position_size", "original_volume"],
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
      // Khối lượng ban đầu của vị thế. Nhỏ hơn lots nghĩa là dòng này chỉ đóng một phần —
      // JNJ đóng 0.41/0.83 lot là chốt bớt 49%, lệnh vẫn còn chạy chứ chưa hề kết thúc.
      originalSize: num(get(r, "originalSize")),
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

// Sàn tách một vị thế thành nhiều dòng khi bạn chốt bớt: cùng số ticket, khác giờ đóng.
// Gom lại mới ra bức tranh thật — đóng hết chưa, tổng lãi lỗ và tổng phí bao nhiêu.
function positionKey(row) {
  return row.ticket || row.key;
}

export function buildPositions(rows) {
  const groups = new Map();
  (rows || []).forEach((r) => {
    const k = positionKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const out = new Map();
  groups.forEach((list, key) => {
    const sorted = [...list].sort((a, b) => (a.closeAt ? a.closeAt.getTime() : 0) - (b.closeAt ? b.closeAt.getTime() : 0));
    const closedLots = sorted.reduce((n, r) => n + (r.lots || 0), 0);
    const originalSize = sorted.reduce((n, r) => Math.max(n, r.originalSize || 0), 0);
    const profit = sorted.reduce((n, r) => n + (r.profit || 0), 0);
    const fees = sorted.reduce((n, r) => n + (r.fees || 0), 0);
    // Đóng hết = mọi dòng đều có giờ đóng VÀ tổng lot đã đóng đạt khối lượng ban đầu.
    // Sai số nhỏ cho phép vì lot là số thập phân.
    const fullyClosed = sorted.every((r) => r.closeAt) && (!originalSize || closedLots >= originalSize - 1e-6);
    out.set(key, {
      key, rows: sorted, first: sorted[0], closedLots, originalSize, profit, fees,
      net: profit + fees, fullyClosed,
      openLots: originalSize ? Math.max(0, Number((originalSize - closedLots).toFixed(4))) : 0,
      lastClose: sorted[sorted.length - 1].closeAt,
    });
  });
  return out;
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
export function reconcileBrokerRows(rows, trades, { account, toleranceHours = DEFAULT_TOLERANCE_HOURS, syncTime = true } = {}) {
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
  const positions = buildPositions(rows);

  const rowTaken = new Map();
  const tradeTaken = new Map();
  pairs.forEach(({ row, trade, gap }) => {
    if (rowTaken.has(row.key) || tradeTaken.has(trade.id)) return;
    rowTaken.set(row.key, { trade, gap });
    tradeTaken.set(trade.id, row);
  });

  const matched = [];
  const missing = [];
  // Đối chiếu theo VỊ THẾ chứ không theo từng dòng: một lần chốt bớt là một dòng, mà cả ba
  // thứ cần biết — đóng hết chưa, tổng lãi lỗ, tổng phí — chỉ đúng khi cộng cả vị thế lại.
  positions.forEach((pos) => {
    const hitRow = pos.rows.find((r) => rowTaken.has(r.key));
    if (!hitRow) {
      missing.push(pos);
      return;
    }
    const hit = rowTaken.get(hitRow.key);
    const journal = computeResult(hit.trade).profit;
    // Sàn còn để lệnh mở thì tổng của nó chưa phải tổng cuối — so tiền lúc này là so nhầm.
    const diff = pos.fullyClosed && journal !== null ? journal - pos.net : null;
    const feeMissing = pos.fees !== 0
      && (hit.trade.fees === "" || hit.trade.fees === undefined || hit.trade.fees === null);
    matched.push({
      row: hitRow, position: pos, trade: hit.trade, gap: hit.gap,
      profitDiff: diff,
      profitOff: diff !== null && Math.abs(diff) > PROFIT_TOLERANCE,
      feeMissing,
      // Giờ/ngày trên sàn (đã quy về giờ máy bạn) khác cái bạn ghi — vẫn là một lệnh, nhưng
      // lệch ngày thì lịch và thống kê theo ngày đếm sai chỗ, còn lệch giờ thì thời gian giữ
      // lệnh và phân tích theo phiên sai theo.
      timeFields: timeFieldsToSync(hit.trade, hitRow, syncTime),
      dateOff: localDate(hitRow.openAt) !== hit.trade.entryDate,
      // Sàn đã có kết quả mà nhật ký còn bỏ ngỏ — lệnh đóng quên ghi, hoặc chốt bớt chưa điền.
      outcome: brokerOutcomePlan(hit.trade, pos, syncTime),
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

  return { matched, missing, extra, tolerance: PROFIT_TOLERANCE, syncTime };
}

// % vị thế của một lần đóng. Sàn ghi lot đóng và khối lượng ban đầu, chia ra là ra đúng
// con số bạn vẫn tự gõ vào ô "% vị thế đóng".
function closedPercent(row, originalSize) {
  if (!originalSize || row.lots === null) return "";
  const pct = (row.lots / originalSize) * 100;
  return String(Number(pct.toFixed(pct >= 10 ? 1 : 2)));
}

function isFilled(v) {
  return v !== "" && v !== null && v !== undefined;
}

// Sàn đã có kết quả mà nhật ký còn bỏ ngỏ. Hai kiểu bỏ ngỏ:
//   - lệnh đã đóng hẳn trên sàn mà nhật ký chưa điền ngày thoát / lợi nhuận (AMZN);
//   - đã chốt bớt vài lần mà nhật ký chưa ghi lần nào, lệnh vẫn đang chạy (JNJ, MDLZ).
// Nhật ký đã điền lợi nhuận rồi thì KHÔNG đụng vào: lúc đó bảng "lệch tiền" mới là chỗ soi,
// còn thêm chốt bớt vào một lệnh đã chốt sổ sẽ cộng dồn thành số khống.
export function brokerOutcomePlan(trade, position, syncTime = true) {
  const none = { changed: false, partials: [], close: null, fees: null };
  if (!position || !position.rows.length) return none;
  const closedRows = position.rows.filter((r) => r.closeAt);
  if (!closedRows.length) return none;
  if (isFilled(trade.profit)) return none;

  const finalRow = position.fullyClosed ? closedRows[closedRows.length - 1] : null;
  const partialRows = position.fullyClosed ? closedRows.slice(0, -1) : closedRows;
  // Đã tự ghi chốt bớt thì không biết dòng nào của sàn ứng với lần nào — để nguyên.
  const addPartials = !partialExitsOf(trade).length ? partialRows : [];

  const partials = addPartials.map((r) => ({
    ...emptyPartialExit(),
    date: localDate(r.closeAt),
    time: syncTime ? localTime(r.closeAt) : "",
    percent: closedPercent(r, position.originalSize),
    profit: r.profit === null ? "" : String(Number(r.profit.toFixed(2))),
  }));

  const close = finalRow && !trade.exitDate ? {
    exitDate: localDate(finalRow.closeAt),
    exitTime: syncTime ? localTime(finalRow.closeAt) : "",
    profit: finalRow.profit === null ? "" : String(Number(finalRow.profit.toFixed(2))),
  } : null;

  const fees = position.fees !== 0 && !isFilled(trade.fees) ? String(Number(position.fees.toFixed(2))) : null;
  return { changed: !!(partials.length || close || fees), partials, close, fees, position };
}

export function withBrokerOutcome(trade, position, syncTime = true, stampedAt = null) {
  const plan = brokerOutcomePlan(trade, position, syncTime);
  if (!plan.changed) return trade;
  const next = { ...trade };
  if (plan.partials.length) next.partialExits = [...partialExitsOf(trade), ...plan.partials];
  if (plan.close) Object.assign(next, plan.close);
  if (plan.fees !== null) next.fees = plan.fees;
  // Sàn điền hộ lợi nhuận là lệnh thành "đã đóng" ngay, dù ảnh thoát, tâm lý, chấm điểm vẫn
  // trống — và nó rời khỏi đúng cái bảng bạn vừa bấm. Đánh dấu lại để còn tìm ra mà điền nốt;
  // dấu mất khi bạn mở lệnh ra lưu lại (clearBrokerFilled) hoặc khi lệnh đủ 100%.
  next.brokerFilled = stampedAt || localDate(new Date());
  return next;
}

// Những mốc thời gian mà file sàn nói khác nhật ký. Tài khoản tắt đồng bộ giờ (cổ phiếu —
// chỉ cần đúng ngày) thì chỉ soi ngày, bỏ qua giờ. Lệnh có chốt bớt thì KHÔNG đụng tới thời
// gian thoát: một vị thế chốt nhiều lần cho ra nhiều dòng, dòng khớp được chưa chắc là lần
// đóng cuối. Lệnh chưa điền ngày thoát cũng để yên — việc điền nó là của bảng "sàn đã có
// kết quả", nơi nói rõ đang đóng lệnh hộ bạn.
export function timeFieldsToSync(trade, row, syncTime = true) {
  const out = [];
  if (trade.entryDate !== localDate(row.openAt)) out.push("entryDate");
  if (syncTime && (trade.entryTime || "") !== localTime(row.openAt)) out.push("entryTime");
  if (trade.exitDate && row.closeAt && !partialExitsOf(trade).length) {
    if (trade.exitDate !== localDate(row.closeAt)) out.push("exitDate");
    if (syncTime && (trade.exitTime || "") !== localTime(row.closeAt)) out.push("exitTime");
  }
  return out;
}

export function withBrokerTimes(trade, row, syncTime = true) {
  const fields = timeFieldsToSync(trade, row, syncTime);
  if (!fields.length) return trade;
  const next = { ...trade };
  if (fields.includes("entryDate")) next.entryDate = localDate(row.openAt);
  if (fields.includes("entryTime")) next.entryTime = localTime(row.openAt);
  if (fields.includes("exitDate")) next.exitDate = localDate(row.closeAt);
  if (fields.includes("exitTime")) next.exitTime = localTime(row.closeAt);
  return next;
}

// Đoán file này là của tài khoản nào bằng chính lịch sử của bạn: tài khoản nào từng đánh
// nhiều symbol trùng với file nhất thì gần như chắc là nó. Hoà nhau hoặc không có gì trùng
// (tài khoản mới tinh) thì trả về rỗng để người dùng tự chọn — đoán bừa còn tệ hơn.
export function guessAccount(rows, trades, accounts) {
  const names = new Set((accounts || []).map((a) => a.name));
  const symbols = new Set((rows || []).map((r) => r.symbolKey));
  const hits = new Map();
  (trades || []).forEach((t) => {
    if (!t.account || !t.symbol || !names.has(t.account)) return;
    const key = normalizeSymbol(t.symbol);
    if (!symbols.has(key)) return;
    if (!hits.has(t.account)) hits.set(t.account, new Set());
    hits.get(t.account).add(key);
  });
  const ranked = [...hits.entries()]
    .map(([name, set]) => ({ name, n: set.size }))
    .sort((a, b) => b.n - a.n);
  if (!ranked.length) return "";
  if (ranked.length > 1 && ranked[0].n === ranked[1].n) return "";
  return ranked[0].name;
}

// Dựng sẵn một lệnh từ dòng CSV để mở thẳng form — điền hộ đúng những gì sàn biết chắc,
// phần đánh giá/tâm lý vẫn để trống cho bạn tự viết. Lãi lỗ và phí để riêng đúng như sàn
// tách, để tổng cộng lại ra khớp con số cuối cùng.
export function tradeFromBrokerPosition(position, account, symbols, syncTime = true) {
  const row = position.first;
  const known = (symbols || []).find((s) => normalizeSymbol(s) === row.symbolKey);
  const base = {
    ...emptyTrade(),
    account,
    symbol: known || row.symbol,
    direction: row.type === "sell" ? "sell" : "buy",
    entryDate: localDate(row.openAt),
    entryTime: syncTime ? localTime(row.openAt) : "",
  };
  // Lệnh mới nên chưa có gì để giữ — cứ để plan điền hết chốt bớt, ngày thoát, lợi nhuận và phí.
  return withBrokerOutcome(base, position, syncTime);
}

// Điền phí sàn vào một lệnh đã có. Giữ nguyên dấu của sàn: bị trừ là số âm.
export function withBrokerFees(trade, row) {
  return { ...trade, fees: row.fees === null ? "" : String(Number(row.fees.toFixed(2))) };
}
