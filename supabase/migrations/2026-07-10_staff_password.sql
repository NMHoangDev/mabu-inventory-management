-- Thêm mật khẩu thật cho staff — trước đây login chỉ set cookie theo UUID
-- client tự gửi lên, không hề kiểm tra credential nào (xem
-- app/api/auth/zalo/me/route.ts trước khi sửa). Không cần backfill: staff
-- chưa có password_hash sẽ set mật khẩu ngay ở lần đăng nhập đầu tiên (xem
-- lib/auth/password.ts + app/api/auth/zalo/me/route.ts).

alter table public.staff add column if not exists password_hash text;
