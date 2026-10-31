// Lệnh mới khớp trên MT5 → lệnh trong nhật ký.
//
// EA KeoSLDuoiNen trên VPS gửi mỗi vị thế mới lên function `mt5-journal`, function cất vào
// app_data "mt5Inbox" (không ghi thẳng vào "trades": app đang mở sẽ ghi đè mất). App đọc hộp này
// lúc mở / quay lại tab, tạo lệnh, rồi ghi id đã nhận vào "mt5InboxSeen" — khoá riêng của app nên
// không tranh ghi với function. Xoá lệnh tạo ra thì nó không quay lại, vì id vẫn nằm trong Seen.
import { accountBalance, accountSyncsTime, accountTimeframes, canonicalSymbol, emptyTrade, isForexSymbol, sessionFromTime, todayStr } from "./helpers.js";
import { buildPositions, withBrokerOutcome } from "./brokerCsv.js";
import { marketForAccount, marketUnitBase } from "./capital.js";

export const MT5_INBOX_KEY = "mt5Inbox";
export const MT5_SEEN_KEY = "mt5InboxSeen";

const pad = (n) => String(n).padStart(2, "0");

// Exness thêm hậu tố chữ thường theo loại tài khoản (EURUSDm, XAUUSDc) — bỏ đi cho khớp mã đã ghi.
export function mt5Symbol(raw, known) {
  const s = String(raw || "").trim().replace(/^([A-Z0-9.]{3,})[a-z]+$/, "$1");
  return canonicalSymbol(s, known);
}

export function mt5Account(item, accounts) {
  const list = (accounts || []).filter((a) => a && a.name);
  const login = String(item.login || "").trim();
  const byLogin = login && list.find((a) => String(a.mt5Login || "").replace(/\D/g, "") === login);
  if (byLogin) return byLogin;
  // Chưa khai số MT5: thử tên đặt trên Exness trùng tên tài khoản trong app
  const name = String(item.accountName || "").trim().toLowerCase();
  return (name && list.find((a) => a.name.trim().toLowerCase() === name)) || null;
}

// Lệnh trong nhật ký đã ghi tay trước khi hộp kịp đổ về: cùng tài khoản, mã, chiều, ngày vào lệnh
// lệch không quá 1 ngày và chưa có ticket → gắn ticket vào lệnh đó thay vì đẻ thêm lệnh trùng.
function sameTrade(t, draft) {
  if (!t || t.ticket || !t.symbol || t.account !== draft.account || t.direction !== draft.direction) return false;
  if (canonicalSymbol(t.symbol).replace(/[^A-Z0-9]/g, "") !== draft.symbol.replace(/[^A-Z0-9]/g, "")) return false;
  if (!t.entryDate || !draft.entryDate) return false;
  return Math.abs(Date.parse(t.entryDate) - Date.parse(draft.entryDate)) <= 86400000;
}

// Lệnh đóng hẳn: các lần đóng của EA thành dòng "file sàn" rồi đi đúng đường của Đối chiếu Exness
// (withBrokerOutcome) — chốt bớt thành phần chốt, lần cuối thành ngày giờ thoát + lợi nhuận, phí riêng.
// Nhật ký đã có lợi nhuận (bạn tự điền) thì để nguyên.
function closeTrade(trade, item, acc) {
  const closes = (item.closes || []).filter((c) => c && Number(c.time) > 0);
  if (!closes.length) return trade;
  const rows = closes.map((c, i) => ({
    key: `${item.ticket}#${i}`, ticket: String(item.ticket), closeAt: new Date(Number(c.time) * 1000),
    lots: Number(c.lots) || null, originalSize: Number(item.volume) || null, profit: Number(c.profit),
    fees: i === closes.length - 1 ? Number(item.fees) || 0 : 0,
  }));
  const position = buildPositions(rows).get(String(item.ticket));
  if (!position) return trade;
  const next = withBrokerOutcome(trade, { ...position, fullyClosed: true }, accountSyncsTime(acc), todayStr());
  // Dấu riêng của MT5: khác brokerFilled (lưu một lần là gỡ), cái này giữ lệnh trong module
  // "đã đóng, chưa ghi xong" tới khi điền đủ.
  return next === trade ? trade : { ...next, mt5Closed: true };
}

// EA gửi kèm số tiền mất nếu chạm SL ban đầu (MT5 tự tính, đúng con số Exness hiện) → "Rủi ro (số tiền)".
// % quy theo gốc vốn của mảng trong bảng Đi vốn — cùng gốc với các nút mức % trong form; tài khoản chưa
// vào bảng thì theo số dư. Lệnh đã có rủi ro (ghi tay, hoặc đã sửa) thì để nguyên.
function withMt5Risk(trade, item, acc, ctx) {
  const risk = Number(item.risk);
  if (!acc || !(risk > 0) || String(trade.riskAmount ?? "").trim()) return trade;
  const cur = acc.currency || "USD";
  // Khác loại tiền (VD tài khoản cent báo USC) thì không đoán quy đổi
  if (item.currency && item.currency !== cur) return trade;
  const m = marketForAccount(ctx.capitalPlan, acc.name, ctx.accounts, trade.symbol, trade.assetGroup);
  const base = m && m.currency === cur ? marketUnitBase(m) : accountBalance(acc, ctx.ledger || [], ctx.trades || []);
  const pct = base > 0 ? (risk / base) * 100 : null;
  return { ...trade, riskAmount: String(risk), riskPercent: pct === null ? trade.riskPercent : String(Number(pct.toFixed(2))) };
}

function openDraft(item, acc, known, trades, resources) {
  const when = new Date((Number(item.time) || 0) * 1000);
  const valid = Number(item.time) > 0 && !Number.isNaN(when.getTime());
  const symbol = mt5Symbol(item.symbol, known);
  const draft = {
    ...emptyTrade(),
    symbol,
    direction: item.side === "sell" ? "sell" : "buy",
    account: acc ? acc.name : "",
    timeframe: acc ? accountTimeframes(acc, trades).list[0] || "" : "",
    entryDate: valid ? `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` : "",
    entryTime: valid && accountSyncsTime(acc) ? `${pad(when.getHours())}:${pad(when.getMinutes())}` : "",
    ticket: String(item.ticket || "").trim(),
    // Còn cờ này thì mở form là chạy luồng vào lệnh như lệnh mới; lưu một lần là gỡ.
    mt5Draft: true,
  };
  const guess = draft.entryTime && isForexSymbol(symbol) ? sessionFromTime(draft.entryTime) : "";
  if (guess && (resources.sessions || []).includes(guess)) draft.session = guess;
  return draft;
}

// Trả { trades: danh sách mới, added: [lệnh tạo], linked: [lệnh gắn ticket], closed: [lệnh vừa đóng],
// filled: [lệnh chỉ được điền bù rủi ro], seen: id đã xử lý }.
// `extra` = { capitalPlan, ledger } để quy rủi ro ra %.
export function applyMt5Inbox(inbox, seen, trades, resources, extra = {}) {
  const seenSet = new Set(seen || []);
  const fresh = (Array.isArray(inbox) ? inbox : []).filter((x) => x && x.id && !seenSet.has(x.id));
  if (!fresh.length) return null;
  const known = new Set([...(resources.symbols || []), ...(trades || []).map((x) => x && x.symbol)].filter(Boolean).map((x) => String(x).toUpperCase()));
  let next = [...(trades || [])];
  const added = [];
  const linked = [];
  const closed = [];
  const filled = []; // chỉ điền bù rủi ro, không đổi gì khác
  const ctx = { ...extra, accounts: resources.accounts, trades };
  // Gói vào lệnh trước, gói đóng lệnh sau — cùng một lượt có cả hai thì lệnh phải có rồi mới đóng được
  const order = (x) => (x.event === "close" ? 1 : 0);
  fresh.sort((a, b) => order(a) - order(b) || (Number(a.time) || 0) - (Number(b.time) || 0)).forEach((item) => {
    const ticket = String(item.ticket || "").trim();
    const acc = mt5Account(item, resources.accounts);
    const have = ticket ? next.find((t) => t && String(t.ticket || "") === ticket) : null;
    if (item.event === "close") {
      // Gói vào lệnh đã nhận mà không còn lệnh mang ticket này = bạn đã xoá nó — không đẻ lại
      if (!have && seenSet.has(`${item.login}-${ticket}`)) return;
      // Lỡ mất gói vào lệnh (lệnh vào rồi đóng trong lúc EA tắt): tạo lệnh luôn rồi đóng
      // Gói vào lệnh tới mà chưa có SL thì gói đóng (SL gắn trên lệnh gốc) vẫn điền bù được rủi ro
      const base = withMt5Risk(have || openDraft(item, acc, known, trades, resources), item, acc, ctx);
      const done = closeTrade(base, item, acc);
      if (have) {
        if (done !== have) next = next.map((t) => (t === have ? done : t));
        if (done !== base) closed.push(done);
        else if (done !== have) filled.push(done);
      } else {
        next.push(done);
        added.push(done);
        if (done !== base) closed.push(done);
      }
      return;
    }
    // Cùng ticket đã nằm trong nhật ký (nhận ở máy khác) thì thôi
    if (have) return;
    const draft = withMt5Risk(openDraft(item, acc, known, trades, resources), item, acc, ctx);
    const twin = next.find((t) => sameTrade(t, draft));
    if (twin) {
      next = next.map((t) => (t === twin ? withMt5Risk({ ...t, ticket: draft.ticket }, item, acc, ctx) : t));
      linked.push(twin);
      return;
    }
    next.push(draft);
    added.push(draft);
  });
  // Giữ Seen gọn: chỉ những id còn nằm trong hộp (function tự cắt hộp khi quá dài)
  const inboxIds = new Set((inbox || []).map((x) => x && x.id));
  return {
    trades: next, added, linked, closed, filled,
    seen: [...new Set([...(seen || []).filter((id) => inboxIds.has(id)), ...fresh.map((x) => x.id)])],
  };
}
