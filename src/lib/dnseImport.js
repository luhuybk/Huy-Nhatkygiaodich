// Nhập lệnh chứng khoán Việt Nam từ file DNSE xuất ra. DNSE có hai báo cáo, mỗi cái
// thiếu đúng thứ cái kia có:
//   - "Lịch sử lệnh" (sao kê): có cả lệnh MUA lẫn BÁN, có ngày mua — nhưng KHÔNG có lãi vay margin.
//   - "Lịch sử lãi lỗ":        có lãi vay và con số sàn chốt — nhưng KHÔNG có ngày mua.
// Nên file sao kê là bắt buộc (dựng được lệnh trọn vẹn), file lãi lỗ là tuỳ chọn để bù
// lãi vay. Ghép hai file bằng khoá (mã + giây bán).
import { computeResult, emptyPartialExit, emptyTrade, partialExitsOf } from "./helpers.js";
import { excelDateParts } from "./xlsx.js";

export const DNSE_FILLED = "Đã khớp";

// Bỏ dấu và gộp khoảng trắng để so tên cột — file xuất ra có chỗ thừa dấu cách đầu dòng
// (" Ngày giao dịch"), và "huỷ"/"hủy" viết cả hai kiểu.
function norm(s) {
  return String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v === null || v === undefined ? "" : v).replace(/[\s,]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Header của báo cáo lịch sử lệnh nằm trên HAI dòng có ô gộp: dòng trên ghi nhóm
// ("Chi tiết giao dịch", "Phí"), dòng dưới ghi cột con ("KL khớp", "Phí DNSE").
// Chồng hai dòng lên nhau, ô nào có chữ ở dòng dưới thì lấy dòng dưới.
function mergeHeader(top, bottom) {
  const width = Math.max(top.length, (bottom || []).length);
  const out = [];
  for (let i = 0; i < width; i += 1) {
    const low = norm(bottom && bottom[i]);
    out.push(low || norm(top[i]));
  }
  return out;
}

function indexOfHeader(header, names) {
  for (let i = 0; i < names.length; i += 1) {
    const at = header.indexOf(names[i]);
    if (at >= 0) return at;
  }
  return -1;
}

const ORDER_COLS = {
  placedAt: ["thoi gian dat"],
  tradeDate: ["ngay giao dich"],
  side: ["lenh"],
  symbol: ["ma", "ma chung khoan"],
  cashRatio: ["ty le tien mat"],
  qty: ["kl khop"],
  price: ["gia khop"],
  value: ["gia tri khop"],
  feeExchange: ["phi tra so"],
  feeBroker: ["phi dnse"],
  tax: ["thue"],
  status: ["trang thai"],
  channel: ["kenh"],
};

// Dòng ngay dưới tiêu đề là tiêu đề PHỤ (cột con của ô gộp) chứ không phải dữ liệu khi:
// không ô nào là số, có từ hai ô có chữ, và ít nhất một ô nằm đúng chỗ dòng trên để trống.
// Dòng dữ liệu đầu tiên của báo cáo lãi lỗ có STT là số nên không lọt qua được.
function isSubHeader(top, next) {
  if (!next || !next.length) return false;
  let filled = 0;
  let fillsGap = false;
  for (let i = 0; i < next.length; i += 1) {
    if (typeof next[i] === "number") return false;
    if (norm(next[i])) {
      filled += 1;
      if (!norm(top[i])) fillsGap = true;
    }
  }
  return filled >= 2 && fillsGap;
}

// Dòng tiêu đề nằm sau mấy dòng tên công ty, không cố định vị trí — dò theo nội dung.
// Phải tìm đúng dòng TỰ NÓ có đủ tên cột, rồi mới ghép thêm dòng phụ bên dưới; ghép
// trước rồi mới xét thì dòng rác phía trên cũng "chứa" tên cột của dòng dưới.
function findHeader(rows, must) {
  for (let i = 0; i < rows.length; i += 1) {
    const single = mergeHeader(rows[i], []);
    if (!must.every((m) => single.includes(m))) continue;
    const next = rows[i + 1];
    if (isSubHeader(rows[i], next)) return { at: i, header: mergeHeader(rows[i], next), skip: 2 };
    return { at: i, header: single, skip: 1 };
  }
  return null;
}

export function parseDnseOrders(rows) {
  const found = findHeader(rows || [], ["thoi gian dat", "lenh", "ma"]);
  if (!found) {
    return { orders: [], skipped: 0, error: "Không thấy cột \"Thời gian đặt\" và \"Lệnh\" — file này có phải Lịch sử lệnh của DNSE không?" };
  }
  const idx = {};
  Object.entries(ORDER_COLS).forEach(([k, names]) => { idx[k] = indexOfHeader(found.header, names); });
  if (idx.qty < 0 || idx.price < 0) {
    return { orders: [], skipped: 0, error: "Thiếu cột \"KL khớp\" hoặc \"Giá khớp\" — hãy xuất lại báo cáo Lịch sử lệnh đầy đủ cột." };
  }
  const get = (r, k) => (idx[k] < 0 ? "" : r[idx[k]]);
  const orders = [];
  let skipped = 0;
  rows.slice(found.at + found.skip).forEach((r) => {
    const side = norm(get(r, "side"));
    const symbol = String(get(r, "symbol") || "").trim().toUpperCase();
    if (!symbol || (side !== "mua" && side !== "ban")) return;
    const qty = num(get(r, "qty"));
    // Lệnh huỷ / từ chối / hết hiệu lực không phải giao dịch, chỉ đếm để nói lại cho người dùng.
    if (norm(get(r, "status")) !== norm(DNSE_FILLED) || qty <= 0) { skipped += 1; return; }
    const placed = excelDateParts(get(r, "placedAt"));
    const traded = excelDateParts(get(r, "tradeDate"));
    if (!placed && !traded) return;
    orders.push({
      symbol,
      side: side === "mua" ? "buy" : "sell",
      qty,
      price: num(get(r, "price")),
      value: num(get(r, "value")),
      // Lệnh đặt buổi tối được sàn tính vào phiên HÔM SAU: ngày phải lấy từ "Ngày giao dịch",
      // lấy ngày của "Thời gian đặt" là lệch một ngày.
      date: (traded || placed).date,
      time: placed ? placed.time : "",
      at: placed ? placed.seconds : (traded ? traded.seconds : 0),
      fees: num(get(r, "feeExchange")) + num(get(r, "feeBroker")) + num(get(r, "tax")),
      cashRatio: num(get(r, "cashRatio")),
      channel: String(get(r, "channel") || "").trim(),
    });
  });
  if (!orders.length) {
    return { orders: [], skipped, error: "Đọc được file nhưng không có lệnh nào đã khớp." };
  }
  return { orders: orders.sort((a, b) => a.at - b.at), skipped, error: "" };
}

const PNL_COLS = {
  symbol: ["ma", "ma chung khoan"],
  soldAt: ["thoi gian ban"],
  qty: ["khoi luong ban"],
  fee: ["phi"],
  tax: ["thue"],
  interest: ["lai vay da tra", "lai vay"],
  net: ["lai/lo", "lai lo"],
};

// "13:00:48 08/09/2026" -> mốc giây. Đây là khoá ghép với lệnh BÁN bên file sao kê.
function parsePnlTime(s) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
  if (!m) return null;
  return Math.floor(Date.UTC(+m[6], +m[5] - 1, +m[4], +m[1], +m[2], +m[3]) / 1000);
}

// Một lần bán bị tách thành nhiều dòng theo từng lô khớp — gom lại theo (mã + giây bán).
export function parseDnsePnl(rows) {
  const found = findHeader(rows || [], ["thoi gian ban", "ma"]);
  if (!found) {
    return { groups: [], error: "Không thấy cột \"Thời gian bán\" — file này có phải Lịch sử lãi lỗ của DNSE không?" };
  }
  const idx = {};
  Object.entries(PNL_COLS).forEach(([k, names]) => { idx[k] = indexOfHeader(found.header, names); });
  if (idx.net < 0) return { groups: [], error: "Thiếu cột \"Lãi/Lỗ\" — hãy xuất lại báo cáo Lịch sử lãi lỗ đầy đủ cột." };
  const get = (r, k) => (idx[k] < 0 ? "" : r[idx[k]]);
  const map = new Map();
  rows.slice(found.at + found.skip).forEach((r) => {
    const symbol = String(get(r, "symbol") || "").trim().toUpperCase();
    const at = parsePnlTime(get(r, "soldAt"));
    if (!symbol || at === null) return;
    const key = `${symbol}@${at}`;
    const g = map.get(key) || { symbol, at, qty: 0, fee: 0, tax: 0, interest: 0, net: 0 };
    g.qty += num(get(r, "qty"));
    g.fee += num(get(r, "fee"));
    g.tax += num(get(r, "tax"));
    g.interest += num(get(r, "interest"));
    g.net += num(get(r, "net"));
    map.set(key, g);
  });
  const groups = [...map.values()].sort((a, b) => a.at - b.at);
  if (!groups.length) return { groups: [], error: "Đọc được file nhưng không có dòng lãi lỗ nào." };
  return { groups, error: "" };
}

// Hai file ghi giây lệch nhau chút: sao kê giữ số lẻ của Excel, báo cáo lãi lỗ cắt phần
// thập phân. Cho phép lệch vài giây thay vì đòi trùng khít.
const MATCH_TOLERANCE_SEC = 3;

function findPnl(groups, symbol, at) {
  let best = null;
  (groups || []).forEach((g) => {
    if (g.symbol !== symbol) return;
    const d = Math.abs(g.at - at);
    if (d > MATCH_TOLERANCE_SEC) return;
    if (!best || d < Math.abs(best.at - at)) best = g;
  });
  return best;
}

// Ghép mua với bán theo FIFO trên từng mã — đúng cách sàn Việt Nam tính giá vốn.
// Trả về cả lệnh đã đóng lẫn phần còn đang cầm, vì phần đang cầm cũng là thứ nhật ký thiếu.
export function buildDnseTrips(orders, pnlGroups) {
  const lots = new Map();
  const trips = [];
  const orphanSells = [];
  (orders || []).forEach((o) => {
    if (!lots.has(o.symbol)) lots.set(o.symbol, []);
    const queue = lots.get(o.symbol);
    if (o.side === "buy") {
      queue.push({ ...o, left: o.qty, feePerShare: o.qty ? o.fees / o.qty : 0 });
      return;
    }
    let remain = o.qty;
    const sellFeePerShare = o.qty ? o.fees / o.qty : 0;
    const pnl = findPnl(pnlGroups, o.symbol, o.at);
    while (remain > 0 && queue.length) {
      const lot = queue[0];
      const take = Math.min(remain, lot.left);
      lot.left -= take;
      remain -= take;
      const share = o.qty ? take / o.qty : 0;
      const gross = take * (o.price - lot.price);
      // Phí sàn tính tròn theo từng lô nên tự cộng lại lệch vài trăm đồng so với sàn.
      // Có file lãi lỗ thì lấy số của sàn, không có thì tự cộng. Lãi vay chỉ có ở file lãi lỗ;
      // một lần bán ăn vào nhiều lô mua thì chia theo tỷ lệ khối lượng.
      const interest = pnl ? pnl.interest * share : 0;
      const costs = pnl
        ? (pnl.fee + pnl.tax + pnl.interest) * share
        : take * (lot.feePerShare + sellFeePerShare);
      trips.push({
        id: `${o.symbol}-${lot.at}-${o.at}-${trips.length}`,
        symbol: o.symbol,
        qty: take,
        lotQty: lot.qty,
        entryDate: lot.date, entryTime: lot.time, entryPrice: lot.price, entryAt: lot.at,
        exitDate: o.date, exitTime: o.time, exitPrice: o.price, exitAt: o.at,
        cashRatio: lot.cashRatio,
        channel: o.channel || lot.channel,
        gross,
        costs,
        interest,
        // LUÔN là (lãi theo giá − phí), đúng bằng thứ sẽ lưu vào nhật ký — bảng xem trước phải
        // hiện đúng con số sẽ ghi. Chia đều lãi lỗ của sàn cho từng lô là sai khi các lô khác
        // giá vốn: cả hai dòng sẽ hiện cùng một số, mà không dòng nào đúng.
        net: gross - costs,
        // Số sàn chốt giữ riêng để đối chiếu, không dùng để hiển thị hay lưu.
        brokerNet: pnl ? pnl.net * share : null,
        source: pnl ? "dnse" : "tinh",
        partial: remain > 0 || take < o.qty,
      });
      if (lot.left <= 0) queue.shift();
    }
    // Bán mà không có lệnh mua nào trước đó: cổ phiếu mua trước kỳ báo cáo.
    if (remain > 0) orphanSells.push({ symbol: o.symbol, qty: remain, date: o.date, time: o.time, price: o.price });
  });
  const open = [];
  lots.forEach((queue) => queue.forEach((lot) => {
    if (lot.left > 0) {
      open.push({
        id: `open-${lot.symbol}-${lot.at}`,
        symbol: lot.symbol, qty: lot.left, lotQty: lot.qty, date: lot.date, time: lot.time, at: lot.at,
        price: lot.price, value: lot.left * lot.price, cashRatio: lot.cashRatio, channel: lot.channel,
      });
    }
  }));
  return {
    trips: trips.sort((a, b) => a.exitAt - b.exitAt),
    open: open.sort((a, b) => b.at - a.at || a.symbol.localeCompare(b.symbol)),
    orphanSells,
    mismatches: reconcile(trips),
  };
}

// Sai lệch dưới mức này là do sàn làm tròn phí theo từng lô (đo được nhiều nhất ~2.100đ);
// lớn hơn nghĩa là đọc file sai chỗ nào đó, phải nói ra chứ không nuốt.
const RECONCILE_TOLERANCE = 5000;

function reconcile(trips) {
  const bySell = new Map();
  trips.forEach((t) => {
    if (t.brokerNet === null) return;
    const key = `${t.symbol}@${t.exitAt}`;
    const g = bySell.get(key) || { symbol: t.symbol, exitDate: t.exitDate, ours: 0, broker: 0 };
    g.ours += t.net;
    g.broker += t.brokerNet;
    bySell.set(key, g);
  });
  return [...bySell.values()]
    .map((g) => ({ ...g, diff: g.ours - g.broker }))
    .filter((g) => Math.abs(g.diff) > RECONCILE_TOLERANCE);
}

function money(n) {
  return String(Math.round(n));
}

export function fmtMoney(n) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(Number(n) || 0));
}

export function fmtQty(n) {
  return new Intl.NumberFormat("vi-VN").format(Number(n) || 0);
}

// ---- Vị thế: một lần mua = một lệnh ------------------------------------------
// Mua 2.800 BSR rồi nhả 1.400 hôm 21/9, 1.400 hôm 2/10 là MỘT lệnh có chốt bớt, không phải hai
// lệnh — giống hệt cách bên Exness gom các lần đóng cùng ticket. Gom các chuyến FIFO theo lô
// mua: mọi lần bán ăn vào cùng một lô là các lần chốt của cùng một vị thế, phần lô chưa bán
// hết thì vị thế vẫn đang mở.
export function buildDnsePositions(result) {
  const map = new Map();
  const ensure = (symbol, at, base) => {
    const key = `${symbol}@${at}`;
    if (!map.has(key)) {
      map.set(key, {
        id: `pos-${symbol}-${at}`, symbol, entryAt: at,
        entryDate: base.date, entryTime: base.time, entryPrice: base.price,
        lotQty: base.lotQty, cashRatio: base.cashRatio, channel: base.channel,
        legs: [], openQty: 0,
      });
    }
    return map.get(key);
  };
  ((result && result.trips) || []).forEach((t) => {
    ensure(t.symbol, t.entryAt, { date: t.entryDate, time: t.entryTime, price: t.entryPrice, lotQty: t.lotQty, cashRatio: t.cashRatio, channel: t.channel })
      .legs.push(t);
  });
  ((result && result.open) || []).forEach((o) => {
    ensure(o.symbol, o.at, o).openQty += o.qty;
  });
  return [...map.values()].map((p) => {
    const legs = [...p.legs].sort((a, b) => a.exitAt - b.exitAt);
    const gross = legs.reduce((n, l) => n + l.gross, 0);
    const costs = legs.reduce((n, l) => n + l.costs, 0);
    const soldQty = legs.reduce((n, l) => n + l.qty, 0);
    const closed = p.openQty <= 0 && legs.length > 0;
    const last = legs[legs.length - 1];
    return {
      ...p, legs, gross, costs, net: gross - costs, soldQty, closed,
      lotQty: p.lotQty || soldQty + p.openQty,
      exitDate: closed ? last.exitDate : "", exitTime: closed ? last.exitTime : "",
      noInterest: legs.some((l) => l.source === "tinh"),
    };
  }).sort((a, b) => b.entryAt - a.entryAt || a.symbol.localeCompare(b.symbol));
}

function pctOf(qty, total) {
  if (!total) return "";
  const v = (qty / total) * 100;
  return String(Number(v.toFixed(v >= 10 ? 1 : 2)));
}

function filled(v) {
  return v !== "" && v !== null && v !== undefined;
}

// Kết quả sàn biết chắc của một vị thế, viết theo đúng quy ước nhật ký: các lần bán trước là
// chốt bớt (mục 1B), lần bán cuối là lần đóng — chỉ khi đã bán hết lô. `profit` theo giá,
// phí + thuế + lãi vay của cả vị thế gom vào `fees` (số âm).
export function dnseOutcome(pos) {
  const partialLegs = pos.closed ? pos.legs.slice(0, -1) : pos.legs;
  const final = pos.closed ? pos.legs[pos.legs.length - 1] : null;
  return {
    partials: partialLegs.map((l) => ({
      date: l.exitDate, time: l.exitTime || "", percent: pctOf(l.qty, pos.lotQty), profit: money(l.gross),
    })),
    close: final ? { exitDate: final.exitDate, exitTime: final.exitTime || "", profit: money(final.gross) } : null,
    fees: pos.legs.length ? money(-pos.costs) : null,
  };
}

// Ghi kết quả của sàn vào một lệnh.
//   - mặc định (lệnh còn mở trong nhật ký): chỉ điền chỗ còn trống, chốt bớt đã tự ghi thì
//     để nguyên vì không biết dòng nào ứng với lần nào;
//   - overwrite ("Lấy theo sàn" cho lệnh lệch tiền): dựng lại chốt bớt + lần đóng + phí theo
//     sàn, nhưng giữ ảnh/ghi chú của từng lần chốt nếu số lần chốt không đổi.
export function dnsePlan(trade, pos, overwrite = false) {
  const out = dnseOutcome(pos);
  const has = partialExitsOf(trade);
  const partials = overwrite || !has.length ? out.partials : [];
  const close = out.close && (overwrite || !filled(trade.profit)) ? out.close : null;
  const fees = out.fees !== null && (overwrite || !filled(trade.fees)) ? out.fees : null;
  return { changed: overwrite || !!(partials.length || close), partials, close, fees, replace: overwrite };
}

export function applyDnsePlan(trade, plan) {
  const next = { ...trade };
  const has = partialExitsOf(trade);
  if (plan.replace) {
    next.partialExits = plan.partials.map((p, i) => ({ ...(has.length === plan.partials.length ? has[i] : emptyPartialExit()), ...p }));
  } else if (plan.partials.length) {
    next.partialExits = [...has, ...plan.partials.map((p) => ({ ...emptyPartialExit(), ...p }))];
  }
  if (plan.close) Object.assign(next, plan.close);
  else if (plan.replace) { next.profit = ""; next.exitDate = ""; next.exitTime = ""; }
  if (plan.fees !== null) next.fees = plan.fees;
  return next;
}

export function tradeFromDnsePosition(pos, account, symbols) {
  const known = (symbols || []).find((s) => String(s).trim().toUpperCase() === pos.symbol);
  const base = {
    ...emptyTrade(), account, symbol: known || pos.symbol, direction: "buy",
    entryDate: pos.entryDate, entryTime: pos.entryTime,
  };
  return pos.legs.length ? applyDnsePlan(base, dnsePlan(base, pos)) : base;
}

// Lệch dưới mức này coi như làm tròn (mỗi lần chốt làm tròn về đồng).
export const DNSE_PROFIT_TOLERANCE = 1000;

// Đối chiếu vị thế DNSE với nhật ký, chia đúng các nhóm như bên Exness để mỗi nhóm có nút
// riêng: thiếu trong nhật ký / sàn đã có kết quả mà nhật ký bỏ ngỏ / lệch tiền / thừa.
// Ghép 1-1 theo (tài khoản, mã, ngày mua); cùng mã cùng ngày có hai lệnh thì ưu tiên lệnh có
// ngày thoát trùng — lệnh nhập theo kiểu cũ (BSR tách hai) sẽ có một bản khớp, bản kia hiện
// ra ở nhóm "chỉ có trong nhật ký" để bạn xoá.
export function reconcileDnse(positions, trades, account, orders) {
  const pool = (trades || []).filter((t) => t && (!account || t.account === account) && t.symbol && t.entryDate);
  const claimed = new Set();
  const out = { missing: [], outcome: [], off: [], ok: [], extra: [] };
  [...(positions || [])].sort((a, b) => a.entryAt - b.entryAt).forEach((pos) => {
    const cands = pool.filter((t) => !claimed.has(t.id)
      && String(t.symbol).trim().toUpperCase() === pos.symbol && t.entryDate === pos.entryDate);
    const hit = cands.find((t) => (t.exitDate || "") === pos.exitDate) || cands[0];
    if (!hit) { out.missing.push(pos); return; }
    claimed.add(hit.id);
    const res = computeResult(hit);
    if (res.status === "open") {
      const plan = dnsePlan(hit, pos);
      if (pos.legs.length && plan.changed) out.outcome.push({ pos, trade: hit, plan });
      else out.ok.push({ pos, trade: hit });
      return;
    }
    // Nhật ký đã đóng mà sàn còn cầm, hoặc đóng rồi mà tiền lệch — cả hai đều là "lệch".
    const diff = pos.closed ? res.profit - pos.net : null;
    if (!pos.closed || Math.abs(diff) > DNSE_PROFIT_TOLERANCE) {
      out.off.push({ pos, trade: hit, journal: res.profit, diff, plan: dnsePlan(hit, pos, true) });
    } else out.ok.push({ pos, trade: hit });
  });
  const dates = (orders || []).map((o) => o.date).filter(Boolean).sort();
  if (dates.length) {
    const from = dates[0];
    const to = dates[dates.length - 1];
    out.extra = pool.filter((t) => !claimed.has(t.id) && t.entryDate >= from && t.entryDate <= to);
  }
  return out;
}
