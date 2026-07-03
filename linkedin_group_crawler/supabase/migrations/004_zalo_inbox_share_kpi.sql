-- Migration 004: Hỗ trợ luồng "Tin nhắn KPI" — member tick cho phép leader
-- xem một số conversation nhất định để verify KPI inbox.
--
-- Bảng zalo_conversation_permissions đã có sẵn (migration 003) nhưng thiếu
-- liên kết tới app_users (member/leader) và thiếu FK constraint tới
-- zalo_accounts (cần thiết để PostgREST cho phép embed join).
--
-- Migration này bổ sung:
--   1. Các cột nullable: id_member, id_leader, note (idempotent với data cũ)
--   2. FK constraint: zalo_conversation_permissions.account_id → zalo_accounts.account_id
--      (idempotent — dùng DO block để check trước khi add)
--   3. Indexes cho truy vấn theo id_member / id_leader
--
-- Lưu ý:
--   - shared_role = 'leader'  → dùng cho luồng KPI verification
--   - shared_role = 'admin'   → dùng cho admin realtime (giữ nguyên)
--
-- Lưu ý về BACKFILL id_member:
--   Cột id_member (uuid) KHÔNG thể backfill từ zalo_accounts.owner_id (text)
--   vì owner_id chỉ chứa giá trị "default" / tên text, không phải UUID app_users.
--   Thay vào đó, mỗi lần toggle_inbox_share() được gọi, backend sẽ tự lookup
--   app_users.id qua email của member (xem _resolve_user_id trong
--   supabase_inbox_share_service.py). Row cũ sẽ tự được fill id_member
--   khi user toggle lại lần đầu tiên.

-- ============================================================================
-- 1. Thêm cột nếu chưa có (idempotent)
-- ============================================================================
alter table public.zalo_conversation_permissions
    add column if not exists id_member   uuid,
    add column if not exists id_leader   uuid,
    add column if not exists note        text,
    add column if not exists verified_at timestamptz,
    add column if not exists verified_by uuid references public.app_users(id) on delete set null;

create index if not exists idx_zalo_conv_perm_verified_at
    on public.zalo_conversation_permissions (verified_at)
    where verified_at is not null;

-- ============================================================================
-- 2. Thêm FK constraint tới zalo_accounts (idempotent bằng DO block)
--    Cần thiết để PostgREST cho phép embed join:
--      supabase.table("zalo_conversation_permissions")
--        .select("..., zalo_accounts!left(label, phone)")
--    → Nếu thiếu FK, PostgREST trả về PGRST200.
-- ============================================================================
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'fk_zalo_conv_perm_account'
          and conrelid = 'public.zalo_conversation_permissions'::regclass
    ) then
        alter table public.zalo_conversation_permissions
            add constraint fk_zalo_conv_perm_account
            foreign key (account_id)
            references public.zalo_accounts (account_id)
            on update cascade
            on delete cascade;
    end if;
end
$$;

-- ============================================================================
-- 3. Index cho truy vấn "lấy tất cả conversation mà member X đã share"
-- ============================================================================
create index if not exists idx_zalo_conv_perm_member_active
    on public.zalo_conversation_permissions (id_member, is_active)
    where id_member is not null;

-- ============================================================================
-- 4. Index cho truy vấn "lấy tất cả conversation mà leader Y có quyền xem"
-- ============================================================================
create index if not exists idx_zalo_conv_perm_leader_active
    on public.zalo_conversation_permissions (id_leader, is_active)
    where id_leader is not null;

-- ============================================================================
-- 5. Comment cập nhật
-- ============================================================================
comment on column public.zalo_conversation_permissions.id_member is
    'UUID app_users.id của member (staff) đã tick share conversation này. Backend tự resolve từ member_email qua bảng app_users (không backfill từ zalo_accounts.owner_id vì owner_id là text).';
comment on column public.zalo_conversation_permissions.id_leader is
    'UUID app_users.id của leader được share. NULL = chưa bind (chỉ share cho admin).';
comment on column public.zalo_conversation_permissions.note is
    'Ghi chú tuỳ chọn của member khi tick (vd: "khách hỏi giá sản phẩm X").';
comment on column public.zalo_conversation_permissions.verified_at is
    'Thời điểm leader xác minh share. NULL = chưa verify. Chỉ row có verified_at NOT NULL mới được tính vào kpi_inbox_current.';
comment on column public.zalo_conversation_permissions.verified_by is
    'UUID app_users.id của leader đã xác minh. NULL = chưa verify. ON DELETE SET NULL để khi leader bị xoá thì vẫn giữ dấu vết verify.';
