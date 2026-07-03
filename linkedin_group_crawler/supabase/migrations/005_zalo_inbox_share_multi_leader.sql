-- Migration 005: Multi-leader inbox share.
--
-- Sau khi refactor toggle_inbox_share, mỗi member có thể thuộc nhiều leader
-- (qua member_of_teams → teams.id_leader). Khi member tick share 1 conversation:
--   - Nếu member thuộc 2 leader → tạo 2 row riêng (id_leader=L1, id_leader=L2)
--   - Khi member bị xoá khỏi team 1 leader → row share cũ với leader đó
--     phải tự động tắt (is_active=false) để tránh "share ma".
--
-- Migration này bổ sung:
--   0. Đổi unique constraint từ (account_id, conversation_id, shared_role) →
--      (account_id, conversation_id, shared_role, id_leader). CẦN THIẾT cho
--      multi-leader: mỗi leader là 1 row riêng, cùng conversation nhưng khác
--      id_leader. Nếu giữ unique cũ, batch upsert sẽ fail với 21000
--      "cannot affect row a second time" khi member thuộc 2+ leader.
--   1. RPC fn_deactivate_orphan_inbox_shares() — tắt row share của các
--      id_leader không còn trong member_of_teams của member.
--   2. RPC fn_reactivate_inbox_shares_for_member() — bật lại row share
--      khi member được add vào team (idempotent).
--   3. Backfill: nếu data cũ đang có row shared_role='leader' với
--      id_leader=NULL (do code cũ không bind) → chia lại cho tất cả
--      leader hiện tại của member.
--   4. Index bổ sung để query theo (id_leader, is_active) nhanh hơn
--      (list cho leader).

-- ============================================================================
-- 0. Đổi unique constraint: bỏ key cũ, thêm key mới có id_leader
--    Phải chạy TRƯỚC các RPC khác vì RPC fn_reactivate dùng on_conflict mới.
-- ============================================================================
do $$
begin
    -- Xoá constraint cũ nếu tồn tại
    if exists (
        select 1
          from pg_constraint
         where conname = 'zalo_conv_perm_unique'
           and conrelid = 'public.zalo_conversation_permissions'::regclass
    ) then
        alter table public.zalo_conversation_permissions
            drop constraint zalo_conv_perm_unique;
    end if;

    -- Thêm constraint mới (idempotent) với id_leader
    -- Dùng DO bên ngoài để tránh lỗi "constraint already exists"
    if not exists (
        select 1
          from pg_constraint
         where conname = 'zalo_conv_perm_unique_v2'
           and conrelid = 'public.zalo_conversation_permissions'::regclass
    ) then
        alter table public.zalo_conversation_permissions
            add constraint zalo_conv_perm_unique_v2
            unique (account_id, conversation_id, shared_role, id_leader);
    end if;
end
$$;

-- Sau khi thêm constraint mới, nếu có data cũ TRÙNG key mới (cùng acc/conv/role
-- nhưng id_leader giống nhau) thì add constraint sẽ fail. Xử lý: xoá các row
-- trùng (giữ row id lớn nhất — tức row mới nhất).
do $$
begin
    if exists (
        select 1
          from pg_constraint
         where conname = 'zalo_conv_perm_unique_v2'
           and conrelid = 'public.zalo_conversation_permissions'::regclass
    ) then
        -- Constraint đã tồn tại, không cần làm gì
        null;
    else
        -- Constraint chưa tồn tại (vì có duplicate) → xoá duplicate rồi add lại
        delete from public.zalo_conversation_permissions a
         using public.zalo_conversation_permissions b
         where a.id < b.id
           and a.account_id = b.account_id
           and a.conversation_id = b.conversation_id
           and a.shared_role = b.shared_role
           and a.id_leader is not distinct from b.id_leader;

        alter table public.zalo_conversation_permissions
            add constraint zalo_conv_perm_unique_v2
            unique (account_id, conversation_id, shared_role, id_leader);
    end if;
end
$$;

-- ============================================================================
-- 1. RPC: tắt các row share có id_leader không còn thuộc team của member
-- ============================================================================
create or replace function public.fn_deactivate_orphan_inbox_shares(
    p_account_id      text,
    p_conversation_id text,
    p_member_id       uuid,
    p_active_leader_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    -- Tắt tất cả row share đang active có id_leader không nằm trong
    -- p_active_leader_ids. Dùng dạng đơn giản để planner dùng index
    -- (id_member, is_active) thay vì seq scan.
    update public.zalo_conversation_permissions
       set is_active = false,
           updated_at = now()
     where account_id      = p_account_id
       and conversation_id = p_conversation_id
       and shared_role     = 'leader'
       and id_member       = p_member_id
       and is_active       = true
       and id_leader is not null
       and (id_leader <> all (p_active_leader_ids));

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

comment on function public.fn_deactivate_orphan_inbox_shares(
    text, text, uuid, uuid[]
) is
    'Tắt các row share có id_leader không còn thuộc team của member. Trả về số row đã tắt. Được gọi từ toggle_inbox_share sau khi tick share.';

-- ============================================================================
-- 2. RPC: bật lại row share (id_leader=NULL) cho các leader hiện tại của member
-- ============================================================================
create or replace function public.fn_reactivate_inbox_shares_for_member(
    p_member_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int := 0;
    v_leader_id uuid;
    v_active record;
begin
    -- Với mỗi (account_id, conversation_id) mà member đã share (is_active=true
    -- hoặc false nhưng id_leader is null), tìm tất cả leader hiện tại của
    -- member và tạo/cập nhật row tương ứng.
    for v_active in
        select distinct account_id, conversation_id
          from public.zalo_conversation_permissions
         where id_member = p_member_id
           and shared_role = 'leader'
    loop
        for v_leader_id in
            -- Tìm tất cả leader_id của member thông qua JOIN
            -- member_of_teams (id_member, id_teams) → teams (id, id_leader)
            select t.id_leader
              from public.member_of_teams mot
              join public.teams t on t.id = mot.id_teams
             where mot.id_member = p_member_id
               and t.id_leader is not null
        loop
            -- Insert nếu chưa có (id_leader=v_leader_id, member_id, account, conv)
            -- On conflict dùng key mới: (account_id, conversation_id, shared_role, id_leader)
            insert into public.zalo_conversation_permissions
                (account_id, conversation_id, shared_role, is_active,
                 id_member, id_leader, created_at, updated_at)
            values
                (v_active.account_id, v_active.conversation_id, 'leader', true,
                 p_member_id, v_leader_id, now(), now())
            on conflict (account_id, conversation_id, shared_role, id_leader)
            do update
                set is_active  = excluded.is_active,
                    id_member  = excluded.id_member,
                    id_leader  = excluded.id_leader,
                    updated_at = now()
            where public.zalo_conversation_permissions.id_leader is distinct from excluded.id_leader
               or public.zalo_conversation_permissions.id_member is distinct from excluded.id_member;
            v_count := v_count + 1;
        end loop;
    end loop;

    return v_count;
end;
$$;

comment on function public.fn_reactivate_inbox_shares_for_member(uuid) is
    'Bật lại row share cho member này với tất cả leader hiện tại. Hữu ích khi thêm member vào team mới — không cần member phải toggle lại.';

-- ============================================================================
-- 2b. RPC: list nhanh tất cả leader_id của 1 member
--     (thay thế 2 round-trip PostgREST member_of_teams → teams bằng 1 query)
-- ============================================================================
create or replace function public.fn_list_leader_ids_for_member(
    p_member_id uuid
)
returns table(id_leader uuid)
language sql
stable
security definer
set search_path = public
as $$
    select distinct t.id_leader
      from public.member_of_teams mot
      join public.teams t on t.id = mot.id_teams
     where mot.id_member = p_member_id
       and t.id_leader is not null;
$$;

comment on function public.fn_list_leader_ids_for_member(uuid) is
    'Trả về danh sách id_leader (uuid) của tất cả leader mà member này thuộc về (qua member_of_teams → teams). Distinct, loại bỏ NULL. Dùng để thay thế 2 round-trip PostgREST trong toggle_inbox_share.';

-- ============================================================================
-- 3. Backfill data cũ: row shared_role='leader' với id_leader=NULL
--    → tạo row mới cho từng leader hiện tại của member
-- ============================================================================
do $$
declare
    v_member_id uuid;
    v_count int := 0;
begin
    for v_member_id in
        select distinct id_member
          from public.zalo_conversation_permissions
         where id_member is not null
           and shared_role = 'leader'
    loop
        v_count := v_count + public.fn_reactivate_inbox_shares_for_member(v_member_id);
    end loop;
    raise notice 'Backfill: tạo/cập nhật % row share cho các member có data cũ', v_count;
end;
$$;

-- ============================================================================
-- 4. Index bổ sung: query nhanh theo (id_leader, is_active) cho leader view
-- ============================================================================
create index if not exists idx_zalo_conv_perm_leader_role_active
    on public.zalo_conversation_permissions (id_leader, shared_role, is_active)
    where id_leader is not null;

-- Index phụ cho RPC fn_list_leader_ids_for_member (member → teams) và
-- fn_reactivate_inbox_shares_for_member (JOIN member_of_teams → teams).
-- Nếu 2 cột này đã có PK/index unique, dòng dưới không tốn thêm gì.
create index if not exists idx_member_of_teams_member
    on public.member_of_teams (id_member);
create index if not exists idx_teams_id
    on public.teams (id);

-- Comment cập nhật cho cột id_leader
comment on column public.zalo_conversation_permissions.id_leader is
    'UUID app_users.id của leader được share. NULL = share cho admin (chỉ khi shared_role=admin). Khi shared_role=leader: id_leader LUÔN được bind tới 1 leader cụ thể (1 row cho mỗi leader mà member thuộc về qua member_of_teams → teams.id_leader).';
