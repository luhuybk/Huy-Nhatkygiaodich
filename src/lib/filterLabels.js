// Nhãn cho các ô lọc của Nhật ký. Để riêng ra vì cả bảng lọc lẫn bảng so sánh đều cần —
// để trong Journal.jsx thì hai file phải import chéo nhau.
import { GRADE_OPTIONS, RESULT_FILTERS } from "./constants.js";
import { cleanFilters, toFilterList } from "./helpers.js";

// Các ô chọn và phần mô tả bộ lọc đã lưu dùng chung một nguồn nhãn. Tách đôi thì sớm muộn
// cũng lệch nhau, và cái chip hiện tên bộ lọc sẽ mô tả sai thứ nó đang lọc.
export const GRADE_FILTERS = [
  { id: "good", label: "Giao dịch Tốt (cả thắng & thua)", short: "Giao dịch Tốt" },
  { id: "bad", label: "Giao dịch Tồi (cả thắng & thua)", short: "Giao dịch Tồi" },
  ...GRADE_OPTIONS.map((g) => ({ id: g.id, label: g.label, short: g.label })),
  { id: "none", label: "Chưa chấm", short: "Chưa chấm" },
];
export const ERROR_FILTERS = [
  { id: "clean", label: "Không lỗi (đã soi)" },
  { id: "any", label: "Có lỗi (bất kỳ)" },
  { id: "unreviewed", label: "Chưa soi lỗi" },
];
export const SCORE_FILTERS = [
  { id: "under5", label: "Chưa đạt 5 sao" },
  { id: "low", label: "Thấp (≤ 2 sao)" },
  { id: "mid", label: "Trung bình (2-4 sao)" },
  { id: "high", label: "Cao (≥ 4 sao)" },
  { id: "none", label: "Chưa chấm điểm" },
];
export const CHECKLIST_FILTERS = [
  { id: "complete", label: "Đã hoàn thành đủ" },
  { id: "partial", label: "Đang làm dở" },
  { id: "none", label: "Chưa làm gì" },
];
export const LESSON_FILTERS = [
  { id: "yes", label: "Có bài học" },
  { id: "no", label: "Không có bài học" },
];
export const COMPLETION_FILTERS = [
  { id: "under100", label: "Chưa xong (< 100%)" },
  { id: "low", label: "Thấp (< 40%)" },
  { id: "mid", label: "Trung bình (40-79%)" },
  { id: "high", label: "Sắp xong (80-99%)" },
  { id: "full", label: "Đã hoàn thành đủ (100%)" },
];
const pick = (list, id) => { const x = list.find((o) => o.id === id); return x ? (x.short || x.label) : id; };

// Bộ lọc đã lưu chỉ hiện cái tên do bạn đặt. Vài tuần sau "Cần soi lại" nghĩa là gì thì
// không ai nhớ, nên rê chuột vào chip là thấy đúng những gì nó đang lọc.
export function describeFilters(filters, resources, setupErrors) {
  const f = cleanFilters(filters);
  const errName = (id) => {
    const e = (setupErrors || []).find((x) => x.id === id);
    return e ? `Lỗi "${e.name}"` : "Lỗi setup đã xóa";
  };
  const many = (v) => toFilterList(v).join(", ");
  const parts = [];
  if (f.q) parts.push(`Symbol chứa "${f.q}"`);
  if (f.account) parts.push(`Tài khoản ${many(f.account)}`);
  if (f.year) parts.push(`Năm ${many(f.year)}`);
  if (f.month) parts.push(`Tháng ${many(f.month)}`);
  if (f.setup) parts.push(`Setup ${many(f.setup)}`);
  if (f.psychology) parts.push(`Tâm lý ${many(f.psychology)}`);
  if (f.result) parts.push(pick(RESULT_FILTERS, f.result));
  if (f.grade) parts.push(pick(GRADE_FILTERS, f.grade));
  if (f.setupError) parts.push(ERROR_FILTERS.some((o) => o.id === f.setupError) ? pick(ERROR_FILTERS, f.setupError) : errName(f.setupError));
  if (f.rrFrom || f.rrTo) parts.push(`RR ${f.rrFrom || "…"} → ${f.rrTo || "…"}`);
  if (f.score) parts.push(`Điểm ${pick(SCORE_FILTERS, f.score)}`);
  if (f.checklist) parts.push(`Checklist ${pick(CHECKLIST_FILTERS, f.checklist)}`);
  if (f.hasLesson) parts.push(pick(LESSON_FILTERS, f.hasLesson));
  if (f.completion) parts.push(`Tiến độ ${pick(COMPLETION_FILTERS, f.completion)}`);
  return parts.length ? parts.join(" · ") : "Không lọc gì — hiện mọi lệnh";
}

