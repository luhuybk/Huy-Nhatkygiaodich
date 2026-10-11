// Gõ danh sách trong ô ghi chú như trong khung chat:
//   "1." / "*" / "-" + dấu cách ở đầu dòng → lùi vào thành "  1. " / "  • " / "  - "
//   Enter → mục tiếp theo cùng cấp ("2. ", "• "); Enter ở mục trống → lùi ra một cấp, hết cấp thì thoát
//   Tab / Shift+Tab ở một mục → thụt vào / đưa ra một cấp (mục con đánh số lại từ 1)
//   Shift+Enter trong mục → xuống dòng, chữ canh thẳng dưới chữ của mục
//   "[]" / "[ ]" / "[x]" + dấu cách → ô tích "☐" / "☑" (lúc xem lại bấm vào để tích)
//   "---" + dấu cách → đường kẻ chia đoạn
// Số thứ tự trong cụm danh sách đang sửa luôn được đánh lại cho liền mạch.
//
// Gắn MỘT lần cho cả trang thay vì sửa từng ô: mọi <textarea> hiện có và sau này đều tự có. Ô nào
// không muốn thì thêm data-no-list. Ô đã tự xử lý phím (Cmd+Enter để lưu…) gọi preventDefault
// trước — React chạy handler ở gốc ứng dụng, trước listener ở document — nên ở đây bỏ qua.

export const LIST_INDENT = "  "; // mục cấp ngoài cùng lùi vào 2 dấu cách
const ITEM = /^(\s*)(?:(\d{1,3})([.)])|([•\-+*☐☑]))(\s+)(.*)$/;
export const HR_LINE = "────────────────────────";
// Dòng chỉ có "---" (hoặc đường kẻ đã đổi) là đường chia đoạn.
export const isRuleLine = (line) => /^\s*(-{3,}|─{3,})\s*$/.test(line);
const CHECK_OF = { "[]": "☐", "[ ]": "☐", "[x]": "☑", "[X]": "☑" };
// Mục kế tiếp của "☑ đã xong" là ô trống, của "*" cũ là "•".
const nextMark = (mark) => (mark === "*" ? "•" : mark === "☑" ? "☐" : mark);

// Một dòng là mục danh sách? Trả về các phần của nó, hoặc null.
export function parseItem(line) {
  const m = ITEM.exec(line);
  if (!m) return null;
  const [, indent, num, sep, mark, gap, text] = m;
  const marker = num ? `${num}${sep}` : mark;
  return {
    indent, num: num ? Number(num) : null, sep: sep || "", mark: mark || "", gap, text,
    textCol: indent.length + marker.length + gap.length,
  };
}

const itemLine = (indent, it, num) => `${indent}${it.num !== null ? `${num ?? it.num}${it.sep}` : it.mark}${it.gap}${it.text}`;

// Cụm danh sách chứa dòng i: các dòng liền nhau là mục, hoặc là dòng thụt lề nối tiếp một mục.
function blockRange(lines, i) {
  const inBlock = (k) => lines[k].trim() !== "" && (parseItem(lines[k]) || /^\s/.test(lines[k]));
  let a = i;
  while (a > 0 && inBlock(a - 1)) a -= 1;
  // Dòng thụt lề đứng đầu cụm mà không có mục nào phía trên thì không thuộc danh sách.
  while (a < i && !parseItem(lines[a])) a += 1;
  let b = i;
  while (b < lines.length - 1 && inBlock(b + 1)) b += 1;
  return [a, b];
}

// Đánh lại số trong cụm: mỗi cấp (theo thụt lề) đếm liền mạch từ số của mục đầu tiên ở cấp đó.
function renumber(lines, a, b) {
  const stack = []; // { indent, next }
  for (let k = a; k <= b; k += 1) {
    const it = parseItem(lines[k]);
    if (!it) continue;
    const d = it.indent.length;
    while (stack.length && stack[stack.length - 1].indent > d) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.indent < d) { top = { indent: d, next: null }; stack.push(top); }
    if (it.num === null) { top.next = null; continue; }
    const n = top.next ?? it.num;
    if (n !== it.num) lines[k] = itemLine(it.indent, it, n);
    top.next = n + 1;
  }
}

// Mục gần nhất phía trên (trong cụm) có thụt lề thoả điều kiện.
function findAbove(lines, i, a, test) {
  for (let k = i - 1; k >= a; k -= 1) {
    const it = parseItem(lines[k]);
    if (it && test(it.indent.length)) return it;
  }
  return null;
}

// Đặt lại thụt lề cho mục ở dòng i. Mục số thì lấy số tiếp theo của mục cùng cấp ngay trên, không có thì 1.
function reindent(lines, i, a, it, indent) {
  const sib = findAbove(lines, i, a, (d) => d <= indent.length);
  const num = it.num === null ? null : sib && sib.indent.length === indent.length && sib.num !== null ? sib.num + 1 : 1;
  lines[i] = itemLine(indent, it, num);
}

// Xử lý một phím. Trả về { value, caret } mới, hoặc null nếu phím này không liên quan tới danh sách.
// key: "space" | "enter" | "tab"; shift: có giữ Shift không.
export function applyListKey(value, caret, key, shift) {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const lines = value.split("\n");
  const i = value.slice(0, lineStart).split("\n").length - 1;
  const col = caret - lineStart;
  const done = (caretLine, caretCol) => {
    const out = lines.join("\n");
    const pos = lines.slice(0, caretLine).reduce((n, l) => n + l.length + 1, 0) + caretCol;
    return out === value && pos === caret ? null : { value: out, caret: pos };
  };
  const finish = (caretLine, colOf) => {
    const [a, b] = blockRange(lines, caretLine);
    renumber(lines, a, b);
    return done(caretLine, colOf());
  };

  if (key === "space") {
    if (shift) return null;
    const head = lines[i].slice(0, col);
    if (/^\s*-{3,}$/.test(head) && !lines[i].slice(col).trim()) {
      // "---" → đường kẻ, con trỏ xuống dòng dưới để gõ đoạn mới.
      lines.splice(i, 1, HR_LINE, "");
      return done(i + 1, 0);
    }
    const m = /^(\s*)(\d{1,3}[.)]|\*|-|\[ ?\]|\[[xX]\])$/.exec(head);
    if (!m) return null;
    const marker = m[2] === "*" ? "•" : CHECK_OF[m[2]] || m[2];
    // Đã tự thụt lề rồi thì chỉ đổi dấu ("*" → "•", "[]" → "☐"); còn lại để dấu cách gõ như thường.
    if (m[1] && marker === m[2]) return null;
    const indent = m[1] || LIST_INDENT;
    lines[i] = `${indent}${marker} ${lines[i].slice(col)}`;
    return finish(i, () => indent.length + marker.length + 1);
  }

  const it = parseItem(lines[i]);

  if (key === "enter" && shift) {
    // Xuống dòng trong một mục: canh thẳng dưới chữ. Dòng nối tiếp thì giữ đúng thụt lề của nó.
    let pad;
    if (it) pad = " ".repeat(it.textCol);
    else {
      const [a] = blockRange(lines, i);
      if (!/^\s+\S/.test(lines[i]) || !parseItem(lines[a])) return null;
      pad = lines[i].match(/^\s*/)[0];
    }
    if (col < pad.length && it) return null; // con trỏ còn nằm trong dấu
    lines.splice(i, 1, lines[i].slice(0, col), pad + lines[i].slice(col).replace(/^\s+/, ""));
    return done(i + 1, pad.length);
  }

  if (!it) {
    // Enter ở dòng nối tiếp (tạo bằng Shift+Enter) → mục kế tiếp của mục chứa nó.
    if (key !== "enter" || !/^\s+\S/.test(lines[i])) return null;
    const [a] = blockRange(lines, i);
    const owner = findAbove(lines, i + 1, a, () => true);
    if (!owner || lines[i].match(/^\s*/)[0].length < owner.textCol) return null;
    const head = lines[i].slice(0, col);
    const tail = lines[i].slice(col).replace(/^\s+/, "");
    const next = itemLine(owner.indent, { ...owner, mark: nextMark(owner.mark), gap: " ", text: tail },
      owner.num === null ? null : owner.num + 1);
    lines.splice(i, 1, head, next);
    return finish(i + 1, () => parseItem(lines[i + 1]).textCol);
  }
  const [a] = blockRange(lines, i);

  if (key === "tab") {
    // Ở trong một mục thì Tab luôn là thụt lề — kể cả khi không thụt được, đừng để nó nhảy sang ô khác.
    const stay = { value, caret };
    const d = it.indent.length;
    let indent;
    if (shift) {
      const parent = findAbove(lines, i, a, (x) => x < d);
      if (!parent) return stay;
      indent = parent.indent;
    } else {
      // Thụt vào dưới mục ngay trên: cùng cấp thì thành con của nó, nó đang sâu hơn thì về cùng cấp với nó.
      const prev = findAbove(lines, i, a, () => true);
      if (!prev) return stay;
      if (prev.indent.length > d) indent = prev.indent;
      else if (prev.indent.length === d) indent = " ".repeat(prev.textCol);
      else return stay;
    }
    reindent(lines, i, a, it, indent);
    return finish(i, () => parseItem(lines[i]).textCol + Math.max(0, col - it.textCol));
  }

  if (key === "enter") {
    if (col < it.textCol) return null; // con trỏ còn nằm trong dấu: Enter thường
    if (!it.text.trim()) {
      // Mục trống: cấp con thì lùi ra một cấp, cấp ngoài cùng thì thoát danh sách (về sát lề).
      const parent = findAbove(lines, i, a, (x) => x < it.indent.length);
      if (parent) {
        reindent(lines, i, a, it, parent.indent);
        return finish(i, () => parseItem(lines[i]).textCol);
      }
      lines[i] = "";
      return finish(i, () => 0);
    }
    const head = lines[i].slice(0, col);
    const tail = lines[i].slice(col).replace(/^\s+/, "");
    const next = itemLine(it.indent, { ...it, mark: nextMark(it.mark), gap: it.gap.length > 1 ? it.gap : " ", text: tail },
      it.num === null ? null : it.num + 1);
    lines.splice(i, 1, head, next);
    return finish(i + 1, () => parseItem(lines[i + 1]).textCol);
  }
  return null;
}

// Đổi danh sách trong ghi chú CŨ sang kiểu mới: "*" → "•", cụm danh sách đang sát lề lùi vào 2 dấu cách
// (cả cụm cùng lùi, để mục con vẫn là con). Trả về chữ mới và số dòng đã đổi.
export function normalizeListText(text) {
  const lines = String(text).split("\n");
  let changed = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!parseItem(lines[i])) continue;
    const [a, b] = blockRange(lines, i);
    const items = [];
    for (let k = a; k <= b; k += 1) { const it = parseItem(lines[k]); if (it) items.push(it); }
    const flush = Math.min(...items.map((it) => it.indent.length)) === 0;
    for (let k = a; k <= b; k += 1) {
      const it = parseItem(lines[k]);
      let line = it && it.mark === "*" ? itemLine(it.indent, { ...it, mark: "•" }) : lines[k];
      if (flush && line.trim()) line = LIST_INDENT + line;
      if (line !== lines[k]) { lines[k] = line; changed += 1; }
    }
    i = b;
  }
  return { text: lines.join("\n"), changed };
}

// Chạy normalizeListText qua cả một kho dữ liệu (mảng lệnh, bài học…). Chỉ đụng chữ NHIỀU dòng —
// tên mã, tiêu đề một dòng, đường dẫn ảnh không bao giờ bị đổi. Kèm vài ví dụ trước/sau để xem trước.
export function normalizeListsDeep(value, acc = { lines: 0, fields: 0, samples: [] }) {
  if (typeof value === "string") {
    if (!value.includes("\n")) return value;
    const r = normalizeListText(value);
    if (!r.changed) return value;
    acc.lines += r.changed;
    acc.fields += 1;
    if (acc.samples.length < 3) acc.samples.push({ before: value, after: r.text });
    return r.text;
  }
  if (Array.isArray(value)) {
    let diff = false;
    const out = value.map((x) => { const y = normalizeListsDeep(x, acc); if (y !== x) diff = true; return y; });
    return diff ? out : value;
  }
  if (value && typeof value === "object") {
    let diff = false;
    const out = {};
    Object.keys(value).forEach((k) => { const y = normalizeListsDeep(value[k], acc); if (y !== value[k]) diff = true; out[k] = y; });
    return diff ? out : value;
  }
  return value;
}

// Chèn chữ qua execCommand để Cmd+Z vẫn hoàn tác được và React nhận sự kiện input như gõ tay.
// Chỉ thay đúng đoạn khác nhau giữa giá trị cũ và mới, để bước hoàn tác gọn.
function applyEdit(el, next) {
  const old = el.value;
  if (old === next.value && el.selectionStart === next.caret) return;
  let p = 0;
  while (p < old.length && p < next.value.length && old[p] === next.value[p]) p += 1;
  let s = 0;
  while (s < old.length - p && s < next.value.length - p && old[old.length - 1 - s] === next.value[next.value.length - 1 - s]) s += 1;
  const text = next.value.slice(p, next.value.length - s);
  el.setSelectionRange(p, old.length - s);
  // Chèn chuỗi rỗng thì trình duyệt để con trỏ lùi về cuối dòng trên — xoá thì phải dùng lệnh xoá.
  const ok = document.execCommand && (text ? document.execCommand("insertText", false, text) : document.execCommand("delete"));
  if (!ok) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, next.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(next.caret, next.caret);
}

function onKeyDown(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  // Bộ gõ tiếng Việt đang ghép chữ thì phím là để chốt chữ, không phải để sửa danh sách.
  if (e.isComposing || e.keyCode === 229) return;
  const key = e.key === " " ? "space" : e.key === "Enter" ? "enter" : e.key === "Tab" ? "tab" : null;
  if (!key) return;
  const el = e.target;
  if (!el || el.tagName !== "TEXTAREA" || el.readOnly || el.disabled || el.hasAttribute("data-no-list")) return;
  if (el.selectionStart !== el.selectionEnd) return;
  const next = applyListKey(el.value, el.selectionStart, key, e.shiftKey);
  // Tab ngoài danh sách vẫn để chuyển sang ô kế tiếp như bình thường.
  if (!next) return;
  e.preventDefault();
  applyEdit(el, next);
}

let installed = false;
export function installListContinuation() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", onKeyDown);
}
