# Nhật Ký Giao Dịch

Ứng dụng nhật ký & phân tích hiệu suất trading, chạy hoàn toàn phía trình duyệt (không cần server/database).

## 1. Chạy trên máy cục bộ (local)

**Yêu cầu:** đã cài [Node.js](https://nodejs.org) bản 18 trở lên (kiểm tra bằng `node -v`).

```bash
# Vào thư mục dự án
cd trading-journal-app

# Cài thư viện (chỉ cần làm 1 lần)
npm install

# Chạy dev server
npm run dev
```

Terminal sẽ hiện link dạng `http://localhost:5173` — mở link đó lên trình duyệt là dùng được. Mỗi lần sửa code, trang tự tải lại (hot reload).

Dừng server: bấm `Ctrl + C` trong terminal.

## 2. Đóng gói để deploy lên web

```bash
npm run build
```

Lệnh này tạo ra thư mục `dist/` chứa toàn bộ file tĩnh (HTML/CSS/JS) sẵn sàng deploy lên bất kỳ dịch vụ hosting tĩnh nào.

Xem thử bản build trước khi deploy:
```bash
npm run preview
```

### Cách A — Vercel (khuyên dùng, miễn phí, nhanh nhất)
1. Tạo tài khoản tại [vercel.com](https://vercel.com) (đăng nhập bằng GitHub cho tiện).
2. Đẩy thư mục `trading-journal-app` này lên một repo GitHub.
3. Vào Vercel → **Add New Project** → chọn repo vừa tạo.
4. Vercel tự nhận diện đây là dự án Vite, không cần chỉnh gì thêm → bấm **Deploy**.
5. Xong, có link dạng `ten-du-an.vercel.app` dùng được ngay, mỗi lần bạn push code mới lên GitHub thì Vercel tự deploy lại.

### Cách B — Netlify (tương tự Vercel)
1. Tạo tài khoản tại [netlify.com](https://netlify.com).
2. **Add new site → Import an existing project**, kết nối GitHub repo.
3. Build command: `npm run build`, Publish directory: `dist`.
4. Deploy.

### Cách C — Kéo-thả thủ công, không cần Git (nhanh nhất để thử)
1. Chạy `npm run build` ở máy để có thư mục `dist/`.
2. Vào [app.netlify.com/drop](https://app.netlify.com/drop), kéo thả thư mục `dist` vào — có link dùng ngay trong vài giây.

### Cách D — GitHub Pages
1. Trong `vite.config.js`, đổi `base: "/"` thành `base: "/ten-repo-cua-ban/"`.
2. `npm run build`, rồi deploy thư mục `dist` lên nhánh `gh-pages` (có thể dùng gói `gh-pages`: `npm i -D gh-pages`, thêm script `"deploy": "gh-pages -d dist"` vào `package.json`, rồi `npm run deploy`).

## 3. Lưu ý quan trọng về dữ liệu

- App lưu toàn bộ dữ liệu (giao dịch, tài khoản, ghi chú...) vào **localStorage của trình duyệt** — nghĩa là:
  - Dữ liệu **chỉ nằm trên máy/trình duyệt bạn đang dùng**, không đồng bộ qua thiết bị khác.
  - Xóa cache/dữ liệu trình duyệt (hoặc dùng chế độ ẩn danh) sẽ **mất hết dữ liệu**.
  - Mỗi domain/URL khác nhau (VD: `localhost:5173` lúc dev vs `ten-du-an.vercel.app` lúc deploy) có vùng lưu trữ **riêng biệt** — dữ liệu bạn nhập lúc chạy local sẽ **không tự xuất hiện** trên bản deploy, và ngược lại.
- **Sao lưu định kỳ**: vào tab **Cài đặt → Xuất JSON** để tải file backup toàn bộ dữ liệu. Muốn chuyển dữ liệu qua máy khác / domain khác, dùng file JSON này ở tab **Cài đặt → Nhập JSON** bên máy đích.
- Nếu sau này muốn nhiều người dùng chung / đồng bộ nhiều thiết bị, sẽ cần thêm một backend thật (database) — kiến trúc hiện tại chưa hỗ trợ việc đó.

## 4. Cấu trúc dự án

```
trading-journal-app/
├── index.html          # entry HTML
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx         # khởi tạo React
    └── App.jsx          # toàn bộ ứng dụng (component chính)
```

Muốn sửa giao diện/tính năng, chỉnh trực tiếp trong `src/App.jsx`.
