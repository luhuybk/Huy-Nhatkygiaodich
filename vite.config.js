import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Thư viện nền (React, Supabase) tách ra file riêng: chúng gần như không đổi giữa các lần deploy,
// nên tên file (có mã băm) giữ nguyên và trình duyệt dùng lại bản đã lưu — mỗi lần deploy người
// dùng chỉ phải tải lại phần code của app, không phải cả ~350 KB thư viện.
function vendorChunk(id) {
  if (!id.includes("node_modules")) return undefined;
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
  if (/node_modules\/(@supabase|iceberg-js)\//.test(id)) return "vendor-supabase";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  // If you deploy to a subpath (e.g. GitHub Pages project site),
  // set base to "/your-repo-name/". Otherwise leave as "/".
  base: "/",
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
});
