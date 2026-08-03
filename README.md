# Nhật Ký Giao Dịch

Ứng dụng nhật ký & phân tích hiệu suất trading, giao diện React, dữ liệu đồng bộ qua **Supabase** (đăng nhập 1 tài khoản, dùng được trên nhiều thiết bị).

## 0. Tạo dự án Supabase (làm 1 lần, ~5 phút)

1. Vào [supabase.com](https://supabase.com) → **Start your project** → đăng nhập bằng GitHub/Google.
2. **New project**: đặt tên bất kỳ, chọn mật khẩu database (lưu lại phòng khi cần), chọn region gần bạn (Singapore hợp lý với VN).
3. Đợi ~2 phút cho project khởi tạo xong.
4. Vào **SQL Editor** (menu bên trái) → **New query** → dán toàn bộ nội dung file `supabase-setup.sql` (đi kèm trong dự án này) → **Run**. Bước này tạo bảng lưu dữ liệu + bật bảo mật (mỗi người chỉ thấy dữ liệu của mình).
5. Vào **Project Settings → API** → copy 2 giá trị:
   - **Project URL**
   - **anon public key**
6. Vào **Authentication → Providers**, đảm bảo **Email** đang bật (mặc định đã bật sẵn).
   - Nếu muốn đăng ký xong đăng nhập được ngay (không cần xác nhận email, tiện cho dùng cá nhân): vào **Authentication → Settings**, tắt **"Confirm email"**.

## 1. Cấu hình dự án

```bash
cd trading-journal-app
cp .env.example .env
```

Mở file `.env` vừa tạo, dán `Project URL` và `anon public key` lấy ở bước 0.5 vào:
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Lưu ý:** file `.env` đã được thêm vào `.gitignore` — không bao giờ commit file này lên GitHub công khai.

## 2. Chạy trên máy cục bộ

**Yêu cầu:** đã cài [Node.js](https://nodejs.org) bản 18 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:5173` → màn hình đăng nhập hiện ra → bấm **"Chưa có tài khoản? Đăng ký"** để tạo tài khoản đầu tiên (dùng email thật hoặc email bất kỳ nếu đã tắt xác nhận email ở bước 0.6).

## 3. Deploy lên Hostinger (gói hosting bạn đang có, qua FTP)

```bash
npm run build
```

Lệnh này tạo thư mục `dist/` chứa toàn bộ file tĩnh sẵn sàng deploy — **không cần dùng tính năng Node.js của Hostinger**, vì phần "backend" đã nằm ở Supabase (cloud), Hostinger chỉ cần phục vụ file tĩnh.

**Upload qua FTP** (dùng FileZilla hoặc bất kỳ FTP client nào, thông tin lấy từ trang "Chi tiết gói" của Hostinger):
- Host: `ftp://<địa chỉ IP hoặc ftp.tenmien.com>`
- Username / Password: theo tài khoản FTP Hostinger cấp
- Thư mục đích: `public_html`

Upload **toàn bộ nội dung bên trong** thư mục `dist/` (không phải cả thư mục `dist`) vào `public_html`. Xong, truy cập `https://tenmiencuaban.com` là thấy app.

Mỗi lần cập nhật code, lặp lại: sửa code → `npm run build` → upload lại nội dung `dist/` đè lên `public_html`.

## 4. Cập nhật code & đồng bộ GitHub (nếu có dùng)

```bash
git add .
git commit -m "Mô tả thay đổi"
git push
```

## 5. Cách hoạt động / lưu ý

- Dữ liệu được lưu trên Supabase (Postgres), gắn với tài khoản đăng nhập của bạn — đăng nhập cùng email trên điện thoại, máy tính, trình duyệt khác nhau đều thấy **chung một dữ liệu**, tự đồng bộ mỗi khi mở app.
- Vẫn nên sao lưu định kỳ: **Cài đặt → Xuất JSON**.
- Ai cũng có thể tự đăng ký tài khoản trên trang đăng nhập — nếu chỉ muốn riêng mình bạn dùng, có thể tắt đăng ký công khai sau trong Supabase (**Authentication → Settings**), hoặc chỉ chia sẻ link app cho người bạn tin tưởng.
- **anon key** trong file `.env` là key công khai an toàn để lộ ra frontend (đây là cách Supabase thiết kế) — bảo mật thật sự nằm ở Row Level Security (đã bật sẵn qua file `supabase-setup.sql`), không phải ở việc giấu key này.

## 6. Cấu trúc dự án

```
trading-journal-app/
├── index.html
├── package.json
├── vite.config.js
├── supabase-setup.sql      # chạy 1 lần trong Supabase SQL Editor
├── .env.example             # copy thành .env rồi điền key thật
└── src/
    ├── main.jsx              # khởi tạo React
    ├── supabaseClient.js     # kết nối tới Supabase
    └── App.jsx                # toàn bộ ứng dụng + màn hình đăng nhập
```

