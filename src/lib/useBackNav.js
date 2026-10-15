// Nút Back / Forward (chuột, trình duyệt, vuốt trên điện thoại): mỗi lần đổi trang hoặc mở chi tiết
// lệnh là một bước lịch sử. URL giữ nguyên, bước nằm trong history.state ({ tjKey: "trang|idLệnh" }).
// Đổi trang về đúng bước ngay trước (đóng hộp chi tiết, lưu form xong về Nhật ký) thì LÙI lịch sử
// thay vì thêm bước — để Back sau đó không mở lại thứ vừa đóng.
// Trả về ref "form đang có thay đổi chưa lưu": Back rời form khi ref = true thì hỏi lại trước.
import { useEffect, useRef } from "react";

export function useBackNav({ view, setView, viewingTrade, setViewingTrade, editing, trades, onNavigate }) {
  const histRef = useRef({ stack: [], pos: -1, ignorePop: 0 });
  const formDirtyRef = useRef(false);
  const latest = useRef({});
  latest.current = { view, editing, trades, setView, setViewingTrade, onNavigate };
  const navKey = view + "|" + (viewingTrade ? viewingTrade.id : "");

  useEffect(() => {
    const h = histRef.current;
    if (h.pos >= 0 && h.stack[h.pos] === navKey) return;
    if (h.pos < 0) {
      h.stack = [navKey];
      h.pos = 0;
      window.history.replaceState({ tjKey: navKey, tjPos: 0 }, "");
      return;
    }
    if (h.pos > 0 && h.stack[h.pos - 1] === navKey) {
      h.pos -= 1;
      h.ignorePop += 1;
      window.history.back();
      return;
    }
    // Đang ở bước "chi tiết lệnh" mà chuyển hẳn sang trang khác (VD bấm Sửa trong hộp chi tiết):
    // thay bước đó, khỏi để Back mở lại hộp chi tiết giữa đường.
    const replace = /\|.+$/.test(h.stack[h.pos] || "") && navKey.endsWith("|");
    if (!replace) h.pos += 1;
    h.stack = [...h.stack.slice(0, h.pos), navKey];
    const st = { tjKey: navKey, tjPos: h.pos };
    if (replace) window.history.replaceState(st, "");
    else window.history.pushState(st, "");
  }, [navKey]);

  useEffect(() => {
    const onPop = (e) => {
      const h = histRef.current;
      if (h.ignorePop > 0) { h.ignorePop -= 1; return; }
      const st = e.state;
      if (!st || typeof st.tjKey !== "string") return;
      const pos = typeof st.tjPos === "number" ? st.tjPos : h.pos;
      const [v, id] = st.tjKey.split("|");
      const cur = latest.current;
      if (cur.view === "form" && v !== "form" && formDirtyRef.current
        && !window.confirm("Lệnh đang sửa chưa lưu. Rời form và bỏ các thay đổi?")) {
        // Ở lại form: đưa lịch sử về đúng bước form.
        h.ignorePop += 1;
        window.history.go(h.pos - pos);
        return;
      }
      // Form không còn lệnh nào để sửa (đã lưu / huỷ) thì Forward vào đó là form trống — về Nhật ký.
      const nextView = v === "form" && !cur.editing ? "journal" : v;
      const trade = id ? (cur.trades || []).find((x) => x.id === id) || null : null;
      h.pos = pos;
      h.stack[pos] = nextView + "|" + (trade ? trade.id : "");
      formDirtyRef.current = false;
      cur.setView(nextView);
      cur.setViewingTrade(trade);
      if (cur.onNavigate) cur.onNavigate();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return formDirtyRef;
}
