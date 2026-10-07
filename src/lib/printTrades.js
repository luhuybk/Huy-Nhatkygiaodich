// In lệnh ra giấy: mỗi lệnh hai tờ A4 ngang — ảnh vào lệnh và ảnh thoát lệnh, đầu tờ ghi
// ngày, setup, khung, RR. Giấy nằm trên bàn thì hay được lật lại xem hơn một tab trình duyệt.
import { computeResult, dateKey } from "./helpers.js";

// Phần lớn ảnh trong nhật ký là LINK chứ không phải ảnh tải lên. Link chụp TradingView
// (tradingview.com/x/AbC123/) chỉ là một trang web — thẻ <img> không in được trang web — nhưng
// mỗi link đó đều có sẵn bản PNG ở s3.tradingview.com/snapshots/<chữ đầu viết thường>/<mã>.png.
// Link vốn đã là ảnh (.png/.jpg/...) thì dùng thẳng. Còn lại trả null để trang in báo thiếu.
export function imageFromLink(link) {
  const s = String(link || "").trim();
  if (!s) return null;
  const tv = /tradingview\.com\/x\/([A-Za-z0-9]+)/i.exec(s);
  if (tv) return `https://s3.tradingview.com/snapshots/${tv[1][0].toLowerCase()}/${tv[1]}.png`;
  if (/^https?:\/\/s3\.tradingview\.com\/snapshots\//i.test(s)) return s;
  if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
  return null;
}

// Ảnh tải lên được ưu tiên — đó là bản chắc chắn còn; không có mới đến lượt link.
export function printableImage(image, link) {
  return image || imageFromLink(link);
}

// Lệnh đóng trong khoảng ngày — xếp theo ngày đóng như Báo cáo tuần, cũ trước mới sau để
// chồng giấy đọc từ trên xuống đúng thứ tự đã đánh.
export function tradesToPrint(trades, from, to) {
  return (trades || [])
    .filter((t) => {
      if (computeResult(t).status !== "closed") return false;
      const d = dateKey(t);
      return d && d >= from && d <= to;
    })
    .sort((a, b) => `${dateKey(a)} ${a.exitTime || ""}`.localeCompare(`${dateKey(b)} ${b.exitTime || ""}`));
}

export function fmtDateVN(d) {
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
}

// Sổ nhìn lại: những lệnh đã đánh dấu 📌 — thứ đáng để trên giấy nhất. Lệnh còn mở vẫn lấy
// (đánh dấu là vì nó đáng xem, không phải vì đã đóng). `all` = mọi lệnh đã đánh dấu, không
// thì chỉ lệnh rơi vào kỳ đang xem theo ngày đóng (chưa đóng thì ngày vào).
export function reviewTradesToPrint(trades, from, to, all = false) {
  return (trades || [])
    .filter((t) => {
      if (!t || !t.needsReview) return false;
      if (all) return true;
      const d = dateKey(t);
      return d && d >= from && d <= to;
    })
    .sort((a, b) => `${dateKey(a)} ${a.exitTime || a.entryTime || ""}`.localeCompare(`${dateKey(b)} ${b.exitTime || b.entryTime || ""}`));
}

const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export function weekdayVN(d) {
  if (!d) return "";
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? "" : WEEKDAYS[x.getDay()];
}

// Sổ lỗi: lệnh có lỗi thực thi (bấm "Lệnh này có lỗi" ở mục 8) hoặc có tick lỗi setup. Cùng
// cách chọn kỳ như Sổ nhìn lại — trong kỳ theo ngày đóng, hoặc tất cả.
export function hasAnyError(t) {
  return !!(t && (t.hasMistake || (t.setupErrors || []).length));
}

export function errorTradesToPrint(trades, from, to, all = false) {
  return (trades || [])
    .filter((t) => {
      if (!hasAnyError(t)) return false;
      if (all) return true;
      const d = dateKey(t);
      return d && d >= from && d <= to;
    })
    .sort((a, b) => `${dateKey(a)} ${a.exitTime || a.entryTime || ""}`.localeCompare(`${dateKey(b)} ${b.exitTime || b.entryTime || ""}`));
}

// Tên các lỗi setup đã tick. Lỗi đã bị xoá khỏi bộ lỗi thì không còn tên — bỏ qua.
export function setupErrorNames(t, errors) {
  const byId = new Map((errors || []).filter((e) => e && e.id).map((e) => [e.id, e.name]));
  return (t.setupErrors || []).map((id) => byId.get(id)).filter(Boolean);
}

// Lỗi nào lặp lại nhiều nhất trong tập — đọc trang đầu là biết đang mắc gì, đếm cả lỗi thực
// thi (không có tên, gom chung một dòng) để không bỏ sót lệnh chỉ ghi chú tay.
export function errorFrequency(list, errors) {
  const counts = new Map();
  let execution = 0;
  (list || []).forEach((t) => {
    setupErrorNames(t, errors).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
    if (t.hasMistake) execution += 1;
  });
  const rows = [...counts.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { rows, execution };
}
