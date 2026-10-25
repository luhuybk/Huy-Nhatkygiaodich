// Ô ghi chú tự cao theo nội dung: gõ dài thì ô dài ra, xoá bớt thì co lại — khỏi phải kéo góc ô
// hay cuộn bên trong một ô bé tí để đọc lại cái mình vừa viết. Cao tới ~70% màn hình thì dừng và
// cuộn bên trong, để một ghi chú rất dài không đẩy cả form trôi đi.
//
// Gắn MỘT lần cho cả trang như listContinue.js / autoCap.js: mọi <textarea> đều có; ô nào không
// muốn thì thêm data-no-autogrow. Bắt cả ba đường chữ đổi: gõ tay (input), React đổi giá trị bằng
// code (khôi phục nháp, mở bản ghi khác — vá setter `value`), và ô mới xuất hiện (mở form).

const MAX_SHARE = 0.7;

function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement;
}

export function fitTextarea(el) {
  if (!el || el.tagName !== "TEXTAREA" || !el.isConnected || el.hasAttribute("data-no-autogrow")) return;
  if (el.offsetParent === null) return; // đang ẩn — lúc hiện ra (focus / gõ) sẽ đo lại
  const sp = scrollParent(el);
  const keep = sp ? sp.scrollTop : 0;
  const cs = getComputedStyle(el);
  const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  el.style.height = "auto";
  const need = el.scrollHeight + border;
  const max = Math.round(window.innerHeight * MAX_SHARE);
  el.style.height = `${Math.min(need, max)}px`;
  el.style.overflowY = need > max ? "auto" : "hidden";
  // Đặt height "auto" một nhịp làm trang co lại rồi giãn ra — giữ nguyên chỗ đang cuộn.
  if (sp && sp.scrollTop !== keep) sp.scrollTop = keep;
}

const pending = new Set();
let frame = 0;
function schedule(el) {
  pending.add(el);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const list = [...pending];
    pending.clear();
    list.forEach(fitTextarea);
  });
}

let installed = false;
export function installAutoGrow() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // React đổi giá trị ô bằng `node.value = ...` (setter của prototype) — vá để đo lại sau mỗi lần.
  // Phải chạy trước khi React gắn vào trang (gọi trong main.jsx trước render).
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (desc && desc.set && desc.configurable) {
    Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
      ...desc,
      set(v) { desc.set.call(this, v); schedule(this); },
    });
  }

  document.addEventListener("input", (e) => { if (e.target && e.target.tagName === "TEXTAREA") fitTextarea(e.target); }, true);
  document.addEventListener("focusin", (e) => { if (e.target && e.target.tagName === "TEXTAREA") schedule(e.target); }, true);

  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.tagName === "TEXTAREA") schedule(n);
      else if (n.getElementsByTagName) [...n.getElementsByTagName("textarea")].forEach(schedule);
    }));
  }).observe(document.body, { childList: true, subtree: true });

  // Đổi bề rộng cửa sổ thì số dòng đổi theo — đo lại mọi ô.
  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => [...document.getElementsByTagName("textarea")].forEach(schedule), 150);
  });
}
