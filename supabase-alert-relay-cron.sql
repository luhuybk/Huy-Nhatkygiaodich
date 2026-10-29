-- Gửi lại cảnh báo TradingView chưa bấm "✅ Đã thấy" (function alert-relay, tham số &repeat=1).
-- Chạy 1 lần trong Supabase Dashboard → SQL Editor (pg_cron + pg_net đã bật từ lúc làm sl-reminder).
-- Mỗi phút gọi alert-relay?tick=1; tick không cần khoá vì chỉ gửi những tin đã tới hạn.

select cron.schedule(
  'alert-relay-tick-every-min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://wujejocjjoqxyyjqfsgo.supabase.co/functions/v1/alert-relay?tick=1',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Kiểm tra job đã tạo:
-- select * from cron.job;

-- Xem lịch sử chạy job:
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'alert-relay-tick-every-min') order by start_time desc limit 20;

-- Xóa job nếu cần tắt nhắc lại:
-- select cron.unschedule('alert-relay-tick-every-min');
