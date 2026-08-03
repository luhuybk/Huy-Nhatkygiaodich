-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query → Run

-- Bảng lưu dữ liệu app dạng key-value theo từng user (mỗi user chỉ thấy dữ liệu của mình)
create table if not exists app_data (
  user_id uuid references auth.users on delete cascade not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Bật Row Level Security — bắt buộc để user A không đọc/ghi được dữ liệu của user B
alter table app_data enable row level security;

create policy "Users can view own data"
  on app_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on app_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on app_data for update
  using (auth.uid() = user_id);

create policy "Users can delete own data"
  on app_data for delete
  using (auth.uid() = user_id);
