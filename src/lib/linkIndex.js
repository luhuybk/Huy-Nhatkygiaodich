// Link ảnh dán trùng: cùng một link TradingView nằm ở hai chỗ thường là dán nhầm — ảnh thoát lệnh
// lại là ảnh vào lệnh, hay ảnh của lệnh hôm qua dán sang lệnh hôm nay. Gom mọi link ảnh trong app
// thành một chỉ mục để form báo ngay lúc dán, và trang Kiểm tra liệt kê các chỗ trùng đã lưu.
// Chỉ xét LINK (dán tay); ảnh tải lên mỗi lần là một file riêng nên không trùng được.
import { lessonAttachments, lessonTitle, tradeImageShots } from "./helpers.js";

// Cùng một ảnh TradingView có hai dạng link: trang chụp (tradingview.com/x/AbC/) và file PNG
// (s3.tradingview.com/snapshots/a/AbC.png) — quy về mã ảnh. Mã có phân biệt hoa thường.
export function linkKey(link) {
  const s = String(link || "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  const tv = /tradingview\.com\/x\/([A-Za-z0-9]+)/i.exec(s) || /s3\.tradingview\.com\/snapshots\/[a-z0-9]\/([A-Za-z0-9]+)\.png/i.exec(s);
  if (tv) return `tv:${tv[1]}`;
  return s.replace(/^https?:\/\/(www\.)?/i, "").replace(/#.*$/, "").replace(/\/+$/, "");
}

const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "chưa ghi ngày");
const short = (s, n = 40) => { const t = String(s || "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

// Mỗi chỗ có link: owner = bản ghi chứa nó (form đang sửa chính bản ghi đó thì không tự báo trùng
// với mình), place / part = chữ hiện cho người đọc. `related`: bài học gắn với lệnh thường dùng lại
// đúng ảnh của lệnh đó — cố ý, không tính là trùng.
export function buildLinkIndex(data) {
  const index = new Map();
  const add = (link, entry) => {
    const key = linkKey(link);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ ...entry, link: String(link).trim() });
  };
  const d = data || {};
  (d.trades || []).forEach((t) => {
    if (!t) return;
    const place = `Lệnh ${t.symbol || "—"} · ${ddmm(t.entryDate)}`;
    tradeImageShots(t).forEach((s) => add(s.link, { owner: `trade:${t.id}`, place, part: s.label, tradeId: t.id }));
  });
  const notes = [
    ["missed", d.missedSetups, (n) => `Setup miss ${n.symbol || "—"} · ${ddmm(n.missDate)}`],
    ["skipped", d.skippedSetups, (n) => `Setup skip ${n.symbol || "—"} · ${ddmm(n.skipDate)}`],
    ["variant", d.setupVariants, (n) => `Biến thể ${n.symbol || "—"} · ${ddmm(n.variantDate)}`],
    ["lesson", d.lessons, (n) => `Bài học "${short(lessonTitle(n))}"`],
    ["problem", d.problemLogs, (n) => `Vấn đề "${short(n.problem)}"`],
    ["news", d.newsLogs, (n) => `Tin "${short(n.title)}"`],
  ];
  notes.forEach(([kind, list, placeOf]) => {
    (list || []).forEach((n) => {
      if (!n) return;
      const related = kind === "lesson" && n.tradeId ? `trade:${n.tradeId}` : "";
      lessonAttachments(n).forEach((a, i) => add(a && a.link, { owner: `${kind}:${n.id}`, place: placeOf(n), part: `Ảnh ${i + 1}`, related }));
    });
  });
  (d.setupLibrary || []).forEach((s) => {
    if (!s) return;
    add(s.link, { owner: `setuplib:${s.id}`, place: `Setup mẫu ${s.name || "—"}`, part: "Ảnh minh họa" });
    (s.variants || []).forEach((v, i) => add(v && v.link, { owner: `setuplib:${s.id}:${v.id || i}`, place: `Setup mẫu ${s.name || "—"} · ${v.name || `biến thể ${i + 1}`}`, part: "Ảnh minh họa" }));
  });
  return index;
}

// Bỏ những chỗ "trùng có chủ đích" (bài học dùng lại ảnh của chính lệnh nó gắn vào).
function dropRelated(entries, owners) {
  return entries.filter((e) => !e.related || !owners.has(e.related));
}

// Những chỗ khác đang dùng link này, trừ chính bản ghi đang sửa (`owners`: owner của form, kèm
// lệnh mà bài học đang gắn vào).
export function linkUsedElsewhere(index, key, owners) {
  if (!index || !key) return [];
  const own = new Set((owners || []).filter(Boolean));
  return (index.get(key) || []).filter((e) => !own.has(e.owner) && !(e.related && own.has(e.related)));
}

// Cho trang Kiểm tra: mọi link nằm ở từ hai chỗ trở lên. Lệnh lên đầu, nhiều chỗ trùng lên trước.
export function linkDuplicates(index) {
  const out = [];
  (index || new Map()).forEach((entries, key) => {
    const owners = new Set(entries.map((e) => e.owner));
    const list = dropRelated(entries, owners);
    if (list.length < 2) return;
    out.push({ key, link: list[0].link, entries: list });
  });
  return out.sort((a, b) => {
    const ta = a.entries.some((e) => e.tradeId) ? 0 : 1;
    const tb = b.entries.some((e) => e.tradeId) ? 0 : 1;
    return ta - tb || b.entries.length - a.entries.length;
  });
}
