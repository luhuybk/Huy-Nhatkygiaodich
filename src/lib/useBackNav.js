// Nút Back / Forward (chuột, trình duyệt, vuốt trên điện thoại): mỗi lần đổi trang, mở chi tiết lệnh
// hoặc BẤM đổi tab con là một bước lịch sử. URL giữ nguyên; bước nằm trong history.state:
//   { tjView, tjTrade, tjTabs: { khoáTab: giáTrị }, tjPos }
// Tab con khai báo bằng useNavTab(khoá, mặcĐịnh) thay cho useState — hook tự đăng ký vào đây.
//
// Quy tắc:
// - Chỉ hành động của người dùng (đổi trang / mở chi tiết / bấm tab) mới THÊM bước. Trang vừa mở
//   đăng ký tab của nó thì chỉ CẬP NHẬT bước hiện tại.
// - Thay đổi đưa về đúng bước ngay trước (đóng hộp chi tiết, lưu form xong về Nhật ký, bấm lại tab
//   cũ) thì LÙI lịch sử thay vì thêm bước — để Back sau đó không mở lại thứ vừa đóng.
// - Gom các thay đổi trong cùng một nhịp (VD đổi nhóm + tab con cùng lúc) thành một bước.
import { useCallback, useEffect, useRef, useState } from "react";
import { readLocalUi, writeLocalUi } from "./helpers.js";
import { discardActiveDraft } from "./tradeDraft.js";

const tabs = new Map(); // khoá → { value, set, allowed }
const memory = new Map(); // giá trị gần nhất của tab không "sticky" — quay lại trang vẫn đúng tab
// Tab của bước đang khôi phục (Back / Forward) — trang mở sau đó lấy giá trị này, nhưng chỉ khi
// vẫn đang ở đúng trang của bước đó (bấm sang trang khác thì trang mới dùng giá trị của riêng nó).
let restoring = null; // { view, tabs }
let currentView = "";
let userTabChange = false;
let schedule = () => {};

const okValue = (v, allowed) => v !== undefined && v !== null && (!allowed || allowed.includes(v));

// Nhảy thẳng tới một tab con (ô Tìm nhanh): trang đang mở thì đổi tab ngay; chưa mở thì ghi sẵn để
// trang mở ra là đúng tab đó.
export function openNavTab(key, value) {
  const t = tabs.get(key);
  if (t) { userTabChange = true; t.set(value); return; }
  memory.set(key, value);
  writeLocalUi(key, value);
}

// Thay cho useState / useStickyTab của tab con. sticky: nhớ qua lần tải trang (localStorage, như
// useStickyTab); allowed: danh sách giá trị hợp lệ (giá trị cũ không còn hợp lệ thì về mặc định).
export function useNavTab(key, fallback, opts = {}) {
  const { sticky, allowed } = opts;
  const [value, setValue] = useState(() => {
    if (restoring && restoring.view === currentView && okValue(restoring.tabs[key], allowed)) return restoring.tabs[key];
    if (sticky) {
      const saved = readLocalUi(key, fallback);
      return okValue(saved, allowed) ? saved : fallback;
    }
    return okValue(memory.get(key), allowed) ? memory.get(key) : fallback;
  });
  useEffect(() => {
    memory.set(key, value);
    if (sticky) writeLocalUi(key, value);
    tabs.set(key, { value, set: setValue, allowed });
    schedule();
  }, [key, value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { tabs.delete(key); schedule(); }, [key]);
  const set = useCallback((v) => {
    userTabChange = true;
    setValue(v);
  }, []);
  return [value, set];
}

const tabsSnapshot = () => {
  const out = {};
  [...tabs.keys()].sort().forEach((k) => { out[k] = tabs.get(k).value; });
  return out;
};
const keyOf = (e) => (e ? `${e.view}|${e.trade || ""}|${JSON.stringify(e.tabs)}` : "");
const coreOf = (e) => (e ? `${e.view}|${e.trade || ""}` : "");

export function useBackNav({ view, setView, viewingTrade, setViewingTrade, editing, trades, onNavigate }) {
  const histRef = useRef({ stack: [], pos: -1, ignorePop: 0, timer: 0 });
  const formDirtyRef = useRef(false);
  const latest = useRef({});
  currentView = view;
  latest.current = { view, trade: viewingTrade ? viewingTrade.id : "", editing, trades, setView, setViewingTrade, onNavigate };

  const sync = useCallback(() => {
    const h = histRef.current;
    h.timer = 0;
    const cur = latest.current;
    const entry = { view: cur.view, trade: cur.trade, tabs: tabsSnapshot() };
    const key = keyOf(entry);
    const here = h.stack[h.pos];
    const byUser = userTabChange || coreOf(entry) !== coreOf(here);
    userTabChange = false;
    if (here && keyOf(here) === key) return;
    const state = (pos) => ({ tjView: entry.view, tjTrade: entry.trade, tjTabs: entry.tabs, tjPos: pos });
    if (h.pos < 0 || !byUser) {
      // Lần đầu, hoặc trang vừa mở đăng ký tab: cập nhật bước hiện tại, không thêm bước.
      if (h.pos < 0) h.pos = 0;
      h.stack[h.pos] = entry;
      window.history.replaceState(state(h.pos), "");
      return;
    }
    restoring = null;
    if (h.pos > 0 && keyOf(h.stack[h.pos - 1]) === key) {
      h.pos -= 1;
      h.ignorePop += 1;
      window.history.back();
      return;
    }
    // Đang ở bước "chi tiết lệnh" mà chuyển hẳn sang trang khác (VD bấm Sửa trong hộp chi tiết):
    // thay bước đó, khỏi để Back mở lại hộp chi tiết giữa đường.
    const replace = here && here.trade && !entry.trade && here.view !== entry.view;
    if (!replace) h.pos += 1;
    h.stack = [...h.stack.slice(0, h.pos), entry];
    if (replace) window.history.replaceState(state(h.pos), "");
    else window.history.pushState(state(h.pos), "");
  }, []);

  // Chờ hết nhịp render (trang mới mở xong, tab của nó đăng ký xong) rồi mới ghi một bước.
  const later = useCallback(() => {
    const h = histRef.current;
    if (!h.timer) h.timer = setTimeout(sync, 0);
  }, [sync]);
  schedule = later;

  useEffect(() => { later(); }, [view, viewingTrade && viewingTrade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPop = (e) => {
      const h = histRef.current;
      if (h.ignorePop > 0) { h.ignorePop -= 1; return; }
      const st = e.state;
      if (!st || typeof st.tjView !== "string") return;
      const pos = typeof st.tjPos === "number" ? st.tjPos : h.pos;
      const cur = latest.current;
      if (cur.view === "form" && st.tjView !== "form" && formDirtyRef.current
        && !window.confirm("Lệnh đang sửa chưa lưu. Rời form và bỏ các thay đổi?")) {
        // Ở lại form: đưa lịch sử về đúng bước form.
        h.ignorePop += 1;
        window.history.go(h.pos - pos);
        return;
      }
      // Đã đồng ý bỏ thay đổi thì bỏ luôn nháp tự lưu.
      if (cur.view === "form" && st.tjView !== "form" && formDirtyRef.current) discardActiveDraft();
      // Form không còn lệnh nào để sửa (đã lưu / huỷ) thì Forward vào đó là form trống — về Nhật ký.
      const nextView = st.tjView === "form" && !cur.editing ? "journal" : st.tjView;
      const trade = st.tjTrade ? (cur.trades || []).find((x) => x.id === st.tjTrade) || null : null;
      const tabValues = st.tjTabs || {};
      h.pos = pos;
      h.stack[pos] = { view: nextView, trade: trade ? trade.id : "", tabs: tabValues };
      restoring = { view: nextView, tabs: tabValues };
      formDirtyRef.current = false;
      // Tab của trang đang mở thì đặt thẳng; trang sắp mở sẽ tự lấy từ `restoring`.
      Object.keys(tabValues).forEach((k) => {
        const t = tabs.get(k);
        if (t && okValue(tabValues[k], t.allowed)) t.set(tabValues[k]);
      });
      cur.setView(nextView);
      cur.setViewingTrade(trade);
      if (cur.onNavigate) cur.onNavigate();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return formDirtyRef;
}
