// Log hành trình: chỗ ghi nhanh chuyện đã xảy ra và tâm sự của mình — "hôm qua tham lam khi
// có quét thanh khoản, lệnh chạy mất". Không phải bài học, không phải lỗi của một lệnh cụ thể:
// chỉ là ghi lại để về sau nhìn cả tháng thấy chuyện gì đang lặp lại, và vì sao.
//
// Lưu ở khoá `journeyLog`: { entries, tags }. Tag do người dùng sửa được nên nằm chung một khoá
// với log — xoá một tag thì log cũ vẫn giữ id, chỉ là không hiện chip nữa.
import { computeResult, dateKey, shiftDate, todayStr, uid, weekStart } from "./helpers.js";

export const LOG_MOODS = [
  { v: 1, icon: "😣", label: "Rất tệ" },
  { v: 2, icon: "😟", label: "Tệ" },
  { v: 3, icon: "😐", label: "Bình thường" },
  { v: 4, icon: "🙂", label: "Ổn" },
  { v: 5, icon: "😌", label: "Rất tốt" },
];
export const moodMeta = (v) => LOG_MOODS.find((m) => m.v === Number(v)) || null;

export const LOG_TAG_COLORS = ["#a77bd6", "#d4a24e", "#e0615a", "#5b9bd5", "#4caf7d", "#cddc39", "#e88a3c", "#8d9198"];

export function defaultLogTags() {
  return [
    { id: "psy", name: "Tâm lý", color: "#a77bd6" },
    { id: "lesson", name: "Bài học", color: "#d4a24e" },
    { id: "discipline", name: "Kỷ luật", color: "#e0615a" },
    { id: "market", name: "Thị trường", color: "#5b9bd5" },
    { id: "life", name: "Cuộc sống", color: "#4caf7d" },
    { id: "idea", name: "Ý tưởng", color: "#cddc39" },
  ];
}

export function normalizeJourneyLog(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    entries: Array.isArray(r.entries) ? r.entries.filter((e) => e && e.id) : [],
    tags: Array.isArray(r.tags) && r.tags.length ? r.tags.filter((t) => t && t.id) : defaultLogTags(),
  };
}

export function emptyLogEntry(date) {
  return { id: null, date: date || todayStr(), scope: "day", mood: 0, tags: [], text: "", cause: "", tradeIds: [] };
}

// Log "cả tuần" luôn neo vào thứ 2 của tuần đó, để lịch và danh sách xếp đúng chỗ dù lúc ghi
// bạn chọn ngày nào trong tuần.
export function finalizeLogEntry(e) {
  const date = e.scope === "week" ? weekStart(e.date || todayStr()) : e.date || todayStr();
  return { ...e, id: e.id || uid(), date, createdAt: e.createdAt || Date.now(), text: String(e.text || "").trim(), cause: String(e.cause || "").trim() };
}

export function logRange(e) {
  if (e.scope === "week") { const from = weekStart(e.date); return { from, to: shiftDate(from, 6) }; }
  return { from: e.date, to: e.date };
}

export function fmtDayVN(d) {
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
}
export function logRangeLabel(e) {
  const { from, to } = logRange(e);
  return e.scope === "week" ? `Tuần ${from.slice(8, 10)}/${from.slice(5, 7)} – ${to.slice(8, 10)}/${to.slice(5, 7)}/${to.slice(0, 4)}` : fmtDayVN(from);
}

// Kết quả giao dịch trong khoảng ngày — cùng mốc ngày với lịch ở Nhật ký (ngày đóng, chưa
// đóng thì ngày vào), để hai lịch nói cùng một con số.
export function tradesInRange(trades, from, to) {
  const list = (trades || []).filter((t) => { const d = dateKey(t); return d && d >= from && d <= to; });
  let r = 0; let wins = 0; let losses = 0; let closed = 0; let withR = 0;
  list.forEach((t) => {
    const res = computeResult(t);
    if (res.status !== "closed") return;
    closed += 1;
    if (res.outcome === "win") wins += 1;
    else if (res.outcome === "loss") losses += 1;
    if (res.rr !== null && Number.isFinite(res.rr)) { r += res.rr; withR += 1; }
  });
  return { list, count: list.length, closed, wins, losses, r, withR, open: list.length - closed };
}

export function fmtRShortVN(v) {
  if (!Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Number(Math.abs(v).toFixed(1)).toString().replace(".", ",")}R`;
}

const byNewest = (a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);

export function applyLogFilters(entries, filters) {
  const q = String((filters && filters.q) || "").trim().toLowerCase();
  const tag = filters && filters.tag;
  const mood = filters && Number(filters.mood);
  return (entries || []).filter((e) => {
    if (tag && !(e.tags || []).includes(tag)) return false;
    if (mood && Number(e.mood) !== mood) return false;
    if (q && !`${e.text || ""}\n${e.cause || ""}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort(byNewest);
}

// Log chạm khoảng ngày này — log ngày nằm trong khoảng, hoặc log tuần có tuần giao với khoảng.
export function entriesInRange(entries, from, to) {
  return (entries || []).filter((e) => { const r = logRange(e); return r.from <= to && r.to >= from; });
}

// Đếm theo tag và cảm xúc trung bình — để thấy trong tháng chuyện gì đang lặp lại.
export function logStats(entries) {
  const byTag = {};
  let moodSum = 0; let moodN = 0;
  (entries || []).forEach((e) => {
    (e.tags || []).forEach((id) => { byTag[id] = (byTag[id] || 0) + 1; });
    if (Number(e.mood) > 0) { moodSum += Number(e.mood); moodN += 1; }
  });
  return { count: (entries || []).length, byTag, avgMood: moodN ? moodSum / moodN : null };
}

export function monthRange(y, m) {
  const pad = (n) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  return { from, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export function firstLine(text) {
  return String(text || "").split("\n").map((x) => x.trim()).find(Boolean) || "";
}

// Log đã gắn vào một lệnh — để chi tiết lệnh hiện lại đúng những dòng tâm sự về lệnh đó.
export function logsForTrade(data, tradeId) {
  const entries = (data && data.entries) || [];
  return entries.filter((e) => (e.tradeIds || []).includes(tradeId)).sort(byNewest);
}
