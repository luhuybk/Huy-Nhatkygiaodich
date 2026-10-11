// Gõ danh sách trong ô ghi chú như trong khung chat: dòng đang là "1. …" thì Enter ra "2. ",
// dòng "* …" / "- …" / "• …" thì Enter ra đúng dấu đó. Enter ở một mục còn trống là thoát danh sách
// (xoá dấu, không xuống dòng). Shift+Enter vẫn là xuống dòng thường.
//
// Gắn MỘT lần cho cả trang thay vì sửa từng ô: mọi <textarea> hiện có và sau này đều tự có. Ô nào
// không muốn thì thêm data-no-list. Ô đã tự xử lý Enter (Cmd+Enter để lưu…) gọi preventDefault
// trước — React chạy handler ở gốc ứng dụng, trước listener ở document — nên ở đây bỏ qua.

const NUMBERED = /^(\s*)(\d{1,3})([.)])(\s+)(.*)$/;
const BULLET = /^(\s*)([*\-•+])(\s+)(.*)$/;

// Mục tiếp theo cho một dòng, hoặc null nếu dòng không phải mục danh sách.
export function listContinuation(line) {
  let m = NUMBERED.exec(line);
  if (m) {
    const [, indent, num, sep, gap, rest] = m;
    return { empty: !rest.trim(), indent, next: `${indent}${Number(num) + 1}${sep}${gap.length > 1 ? gap : " "}` };
  }
  m = BULLET.exec(line);
  if (m) {
    const [, indent, mark, gap, rest] = m;
    return { empty: !rest.trim(), indent, next: `${indent}${mark}${gap.length > 1 ? gap : " "}` };
  }
  return null;
}

// Chèn chữ qua execCommand để Cmd+Z vẫn hoàn tác được và React nhận sự kiện input như gõ tay.
// Trình duyệt không hỗ trợ thì ghi thẳng giá trị rồi bắn sự kiện input cho React đọc.
function insertText(el, text, from, to) {
  el.setSelectionRange(from, to);
  // Chèn chuỗi rỗng thì trình duyệt để con trỏ lùi về cuối dòng trên — xoá thì phải dùng lệnh xoá.
  const cmd = text ? ["insertText", text] : ["delete", null];
  if (document.execCommand && document.execCommand(cmd[0], false, cmd[1])) return;
  const v = el.value;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(el, v.slice(0, from) + text + v.slice(to));
  const caret = from + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function onKeyDown(e) {
  if (e.key !== "Enter" || e.defaultPrevented) return;
  if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
  // Bộ gõ tiếng Việt đang ghép chữ thì Enter là để chốt chữ, không phải xuống dòng.
  if (e.isComposing || e.keyCode === 229) return;
  const el = e.target;
  if (!el || el.tagName !== "TEXTAREA" || el.readOnly || el.disabled || el.hasAttribute("data-no-list")) return;
  const { selectionStart: start, selectionEnd: end, value } = el;
  if (start !== end) return;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const item = listContinuation(value.slice(lineStart, start));
  if (!item) return;
  e.preventDefault();
  if (item.empty && !value.slice(start).split("\n")[0].trim()) {
    // Mục trống: thoát danh sách, giữ lại thụt lề như khung chat.
    insertText(el, item.indent, lineStart, start);
    return;
  }
  insertText(el, `\n${item.next}`, start, start);
}

let installed = false;
export function installListContinuation() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", onKeyDown);
}
