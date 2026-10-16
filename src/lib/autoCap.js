// Tự viết hoa chữ cái đầu câu trong ô ghi chú, ngay lúc gõ: đầu ô, đầu dòng, sau mục danh sách
// ("• ", "- ", "1. "…) và sau dấu kết câu . ! ? có dấu cách. Không đụng "..." (câu bỏ lửng), số
// thập phân, đường dẫn (không có dấu cách sau dấu chấm).
//
// Gắn MỘT lần cho cả trang như listContinue.js: mọi <textarea> đều có; ô nào không muốn thì thêm
// data-no-autocap. Chỉ sửa khi con trỏ đứng ở CUỐI chữ đầu câu (đang gõ tới) — sửa giữa chữ cũ thì
// để yên, nên muốn viết thường ("iPhone") thì sửa lại chữ cái đó là xong. Sửa qua execCommand để
// React nhận như gõ tay.
//
// Bộ gõ tiếng Việt: bộ gõ macOS ghép chữ (composition) thì sửa lúc chốt chữ (compositionend);
// EVKey / Unikey xoá rồi gõ lại cả chữ bằng chữ thường thì lần gõ lại đó cũng được viết hoa lại.
import { parseItem } from "./listContinue.js";

const LETTER = /\p{L}/u;

// Vị trí chữ cái cần viết hoa (chữ đầu câu, đang thường, con trỏ ở cuối chữ đó), hoặc -1.
export function autoCapIndex(value, caret) {
  let w = caret;
  while (w > 0 && LETTER.test(value[w - 1])) w -= 1;
  if (w === caret) return -1;
  if (LETTER.test(value[caret] || "")) return -1;
  const ch = value[w];
  if (ch === ch.toUpperCase() || ch !== ch.toLowerCase()) return -1;
  const lineStart = value.lastIndexOf("\n", w - 1) + 1;
  const head = value.slice(lineStart, w);
  if (/^\s*$/.test(head)) return w;
  const it = parseItem(`${head}x`);
  if (it && it.textCol === head.length) return w;
  // Dấu kết câu (không phải "..."), có thể kèm ngoặc / nháy đóng, rồi ít nhất một dấu cách.
  if (/(^|[^.])[.!?]["'”’)\]]*[ \t]+$/.test(value.slice(lineStart, w))) return w;
  return -1;
}

let busy = false;
function fix(el) {
  if (busy || !el || el.tagName !== "TEXTAREA" || el.readOnly || el.disabled || el.hasAttribute("data-no-autocap")) return;
  if (el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const i = autoCapIndex(el.value, caret);
  if (i < 0) return;
  const upper = el.value[i].toUpperCase();
  busy = true;
  try {
    el.setSelectionRange(i, i + 1);
    const ok = document.execCommand && document.execCommand("insertText", false, upper);
    if (!ok) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, el.value.slice(0, i) + upper + el.value.slice(i + 1));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.setSelectionRange(caret, caret);
  } finally {
    busy = false;
  }
}

function onInput(e) {
  if (e.isComposing) return;
  if (e.inputType && !/^insert(Text|ReplacementText|FromPaste)?$/.test(e.inputType)) return;
  if (e.inputType === "insertFromPaste") return;
  fix(e.target);
}

let installed = false;
export function installAutoCap() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("input", onInput);
  document.addEventListener("compositionend", (e) => setTimeout(() => fix(e.target), 0));
}
