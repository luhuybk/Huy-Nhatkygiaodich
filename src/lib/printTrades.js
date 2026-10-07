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
