-- Kích hoạt gửi nhắc dời SL qua Telegram tự động (chạy 1 lần trong Supabase Dashboard → SQL Editor)
--
-- Bước 1: Deploy function trước (chạy trên máy có Supabase CLI, trong thư mục gốc repo):
--   supabase functions deploy sl-reminder
--
-- Bước 2: Vào Database → Extensions, bật "pg_cron" và "pg_net" nếu chưa bật.
--
-- Bước 3: Chạy toàn bộ script bên dưới trong SQL Editor.
--   Project ref hiện tại: wujejocjjoqxyyjqfsgo (lấy từ VITE_SUPABASE_URL trong .env)
--   anon/publishable key hiện tại: sb_publishable_mksbXK-yUCfSu6T3gOMWow_tkV1IMi6 (lấy từ VITE_SUPABASE_ANON_KEY trong .env)
--   Nếu key đã đổi, lấy lại ở Project Settings → API.

select cron.schedule(
  'sl-reminder-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://wujejocjjoqxyyjqfsgo.supabase.co/functions/v1/sl-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_mksbXK-yUCfSu6T3gOMWow_tkV1IMi6',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Kiểm tra job đã tạo:
-- select * from cron.job;

-- Xem lịch sử chạy job (tìm lỗi nếu Telegram không nhận được tin):
-- select * from cron.job_run_details order by start_time desc limit 20;

-- Xóa job nếu cần tắt tính năng:
-- select cron.unschedule('sl-reminder-every-5-min');
