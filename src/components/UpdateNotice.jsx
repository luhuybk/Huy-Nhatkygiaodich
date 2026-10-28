import { useEffect, useState } from "react";

// Upload dist/ mới trong lúc app đang mở thì tab cũ vẫn chạy mã cũ tới khi tải lại — form mới
// không hiện, dữ liệu ghi theo kiểu cũ. Thỉnh thoảng (và mỗi lần quay lại tab) đọc index.html
// trên máy chủ, thấy file JS chính đổi tên (bản build mới) thì báo để bấm tải lại.
const CHECK_MS = 10 * 60 * 1000;
const mainScript = (html) => (String(html).match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/) || [])[1] || "";

export function UpdateNotice() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const el = document.querySelector('script[type="module"][src*="/assets/index-"]');
    const current = el ? new URL(el.getAttribute("src"), location.href).pathname : "";
    if (!current) return undefined;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
        const latest = res.ok ? mainScript(await res.text()) : "";
        if (latest && new URL(latest, location.href).pathname !== current) setStale(true);
      } catch { /* mất mạng thì để lần sau */ } finally { busy = false; }
    };
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, []);
  if (!stale) return null;
  return (
    <div className="update-notice" role="status">
      <span>Có bản cập nhật mới của app — tải lại để dùng tính năng mới.</span>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Tải lại</button>
      <button type="button" className="btn btn-ghost" onClick={() => setStale(false)}>Để sau</button>
    </div>
  );
}
