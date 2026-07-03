-- Migration 003: Bảng phân quyền xem conversation cho Zalo realtime.
--
-- Mỗi dòng = 1 conversation (group hoặc thread cá nhân) mà user/staff đã bật chia sẻ
-- với một role cụ thể (admin hoặc leader). Khi bật share, leader/admin trong team
-- mới có thể subscribe SSE realtime của conversation đó.
--
-- Rule tổng quát:
--   • staff/member: luôn xem được conversation của chính account Zalo mình sở hữu
--     (kể cả khi KHÔNG có dòng trong bảng này).
--   • leader: chỉ xem được conversation share=true của các account thuộc team mình
--     quản lý.
--   • admin: chỉ xem được conversation share=true (không giới hạn owner).
--
-- Lưu ý: KHÔNG xoá conversation khi tắt share — chỉ chuyển cột is_active=false.
-- Cho phép user bật lại sau mà không cần tạo dòng mới.

create table if not exists public.zalo_conversation_permissions (
    id              bigserial primary key,
    account_id      text        not null,                -- zalo account_id (owner)
    conversation_id text        not null,                -- zalo conversation_id (group/thread)
    shared_role     text        not null default 'admin',-- 'admin' | 'leader'
    is_active       boolean     not null default true,    -- false = user đã tắt share
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint zalo_conv_perm_unique
        unique (account_id, conversation_id, shared_role)
);

create index if not exists idx_zalo_conv_perm_account
    on public.zalo_conversation_permissions (account_id, is_active);

create index if not exists idx_zalo_conv_perm_conversation
    on public.zalo_conversation_permissions (conversation_id, is_active);

-- Bật RLS nhưng tạm thời allow all cho service role (backend dùng service_role key).
alter table public.zalo_conversation_permissions enable row level security;

-- Policy cho service_role (Supabase REST API dùng anon key; backend sẽ dùng service key
-- thông qua header Authorization đặc biệt hoặc qua PostgREST với role).
-- Ở mức tối thiểu, tạo policy cho phép tất cả authenticated users đọc (backend sẽ filter
-- theo account_id), deny write ở DB level — backend mới có quyền ghi.
drop policy if exists zalo_conv_perm_read_all on public.zalo_conversation_permissions;
create policy zalo_conv_perm_read_all
    on public.zalo_conversation_permissions
    for select
    to authenticated, anon
    using (true);

-- Không tạo policy insert/update/delete — backend phải dùng service_role key để ghi.
-- (PostgREST mặc định deny nếu không có policy tương ứng.)

-- Backfill: KHÔNG tạo dòng mặc định (per yêu cầu — staff phải bật share thủ công).
-- Nếu bảng đã có data cũ, đánh lại is_active=true cho các dòng cũ (idempotent).
update public.zalo_conversation_permissions
   set is_active = true,
       updated_at = now()
 where is_active is distinct from true;

-- Mở rộng (idempotent) cho luồng "Tin nhắn KPI":
--   - id_member:  UUID của app_users.id mà đã tick share
--   - id_leader:  UUID của app_users.id (leader) được share (NULL = chưa bind)
--   - note:       lý do tick (optional)
-- Cho phép các cột nullable để tương thích với rows đã tồn tại.
alter table public.zalo_conversation_permissions
    add column if not exists id_member   uuid,
    add column if not exists id_leader   uuid,
    add column if not exists note        text;

create index if not exists idx_zalo_conv_perm_member
    on public.zalo_conversation_permissions (id_member, is_active)
    where id_member is not null;

create index if not exists idx_zalo_conv_perm_leader
    on public.zalo_conversation_permissions (id_leader, is_active)
    where id_leader is not null;

comment on table public.zalo_conversation_permissions is
    'Phân quyền xem realtime Zalo conversation: staff tự bật share với admin/leader. Dùng cho luồng Tin nhắn KPI.';
