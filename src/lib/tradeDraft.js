// Nháp form nhập lệnh: đang ghi dở mà lỡ thoát (bấm sang trang khác, đóng tab, trình duyệt
// tắt) thì lần mở lại form của đúng lệnh đó — hoặc bấm "Thêm giao dịch" với lệnh mới — app hỏi
// có khôi phục không. Lưu ở localStorage của trình duyệt này, không đồng bộ sang máy khác.
// Lệnh mới dùng chung một ô "new" (mỗi lần mở form lệnh mới là một id mới, khoá theo id thì
// không bao giờ tìm lại được); lệnh đã có thì khoá theo id.
const PREFIX = "tj-trade-draft:";
const MAX_AGE_DAYS = 30;

export const draftKey = (id, isNew) => `${PREFIX}${isNew ? "new" : id}`;

export function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.trade && typeof d.trade === "object" ? d : null;
  } catch {
    return null;
  }
}

// Trả false khi không ghi được (hết chỗ, trình duyệt chặn) — form báo cho người dùng biết.
// `base` = lệnh lúc mở form: khôi phục chỉ đè những trường đã sửa so với nó (xem mergeDraft).
export function writeDraft(key, trade, base) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), trade, base: base || null }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch { /* bỏ qua */ }
}

// Nháp quá cũ thì bỏ — không ai muốn được hỏi khôi phục một lệnh ghi dở từ hai tháng trước.
export function pruneDrafts() {
  try {
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const d = readDraft(k);
      if (!d || !(d.savedAt > cutoff)) localStorage.removeItem(k);
    }
  } catch { /* bỏ qua */ }
}

// So hai bản lệnh bỏ qua id / createdAt: nháp lệnh mới mang id của lần mở trước.
export function sameTradeContent(a, b) {
  const strip = (x) => { const { id: _i, createdAt: _c, ...rest } = x || {}; return rest; };
  try { return JSON.stringify(strip(a)) === JSON.stringify(strip(b)); } catch { return false; }
}

const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

// Khôi phục nháp lên lệnh hiện tại: chỉ lấy những trường NHÁP ĐÃ SỬA so với lúc mở form.
// Trường nháp không đụng tới thì giữ bản đang lưu — lỡ sau đó lệnh được sửa ở nơi khác (bot
// Telegram, tick ô trong chi tiết lệnh, máy khác) thì không bị nháp cũ đè mất. Nháp đời đầu
// chưa có `base` thì đành thay cả lệnh.
export function mergeDraft(current, draft) {
  if (!draft || !draft.trade) return current;
  if (!draft.base) return { ...draft.trade, id: current.id };
  const out = { ...current };
  Object.keys({ ...draft.trade, ...draft.base }).forEach((k) => {
    if (k === "id") return;
    if (!same(draft.trade[k], draft.base[k])) out[k] = draft.trade[k];
  });
  return out;
}

// Form đang mở đăng ký ở đây, để chỗ khác (⌘E mở lệnh mới, nút Back) báo "người dùng đã đồng ý
// bỏ thay đổi" — khi đó xoá luôn nháp, khỏi lần sau hỏi khôi phục thứ vừa cố ý bỏ.
let active = null;
export function setActiveDraft(ref) { active = ref; }
export function releaseActiveDraft(ref) { if (active === ref) active = null; }
export function discardActiveDraft() {
  if (!active) return;
  active.done = true;
  clearDraft(active.key);
}
