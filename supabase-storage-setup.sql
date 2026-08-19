-- Kho ảnh cho nhật ký giao dịch.
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query → Run.
-- Chạy lại nhiều lần vẫn an toàn.

-- Bucket để public: đường dẫn ảnh nhúng thẳng vào thẻ <img> nên không dùng được link ký hạn
-- (link ký sẽ hết hạn và ảnh cũ trong nhật ký sẽ chết). Tên file là chuỗi ngẫu nhiên nên
-- không đoán được, tương đương mức riêng tư của link TradingView bạn đang dùng.
insert into storage.buckets (id, name, public)
values ('trade-images', 'trade-images', true)
on conflict (id) do update set public = true;

-- Mỗi người chỉ ghi/xóa được trong thư mục mang chính user id của mình.
drop policy if exists "Trade images: user can upload own" on storage.objects;
create policy "Trade images: user can upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trade-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Trade images: user can update own" on storage.objects;
create policy "Trade images: user can update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'trade-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Trade images: user can delete own" on storage.objects;
create policy "Trade images: user can delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trade-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Trade images: public read" on storage.objects;
create policy "Trade images: public read"
  on storage.objects for select
  using (bucket_id = 'trade-images');
