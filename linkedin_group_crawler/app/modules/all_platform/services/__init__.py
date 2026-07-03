from app.modules.all_platform.services.supabase_seeding_service import (
    save_seeding_mark,
    verify_seeding_mark,
    get_all_seeding_marks,
    get_unverified_seeding_marks,
    get_member_seeding_count,
    save_seeding_kpi,
    get_all_seeding_kpi,
    get_kpi_target,
)
from app.modules.all_platform.services.supabase_kpi_service import (
    assign_kpi,
    compute_kpi_inbox_progress,
    get_all_kpis_for_leader,
    get_kpi_by_email,
    get_kpi_inbox_progress_by_email,
    count_fb_inbox_kpi,
    get_fb_inbox_kpi_summary,
    get_pending_fb_inbox_kpi,
    sync_kpi_progress,
    check_permission,
    verify_leader_code,
    update_user_role_to_member,
)
from app.modules.all_platform.services.supabase_posts_service import (
    get_all_facebook_posts,
    get_all_linkedin_posts,
    filter_facebook_posts,
    filter_linkedin_posts,
    sync_facebook_post_progress,
)
from app.modules.all_platform.services.supabase_categories_service import (
    get_all_categories,
    get_categories_by_type,
    add_category,
    update_category,
    delete_category,
)
from app.modules.all_platform.services.supabase_groups_service import (
    get_facebook_groups,
    add_facebook_group,
    update_facebook_group,
    delete_facebook_group,
    get_linkedin_groups,
    add_linkedin_group,
    update_linkedin_group,
    delete_linkedin_group,
)
from app.modules.all_platform.services.supabase_user_service import (
    get_user,
    upsert_user,
    update_user_slug,
    update_user_role,
    get_team_members,
    add_team_member,
    get_all_users,
    get_users_by_role,
    get_all_teams,
    create_team,
    update_team,
    delete_team,
)
from app.modules.all_platform.services.auth_service import (
    register_user,
    login_user,
    logout_user,
    decode_token,
    get_user_by_id,
    get_user_by_email,
    update_user_profile,
    create_access_token,
    verify_leader_code,
    promote_to_leader,
    promote_to_leader,
    get_user_sessions,
    delete_session,
    delete_all_sessions,
    change_password,
    deactivate_account,
    reset_password_without_old,
)
from app.modules.all_platform.services.social_accounts_service import (
    get_social_accounts,
    get_social_account_by_id,
    get_primary_account,
    create_social_account,
    update_social_account,
    delete_social_account,
    set_primary_account,
    get_social_account_summary,
)
from app.modules.all_platform.services.supabase_linkedin_account_service import (
    get_linkedin_accounts,
    add_linkedin_account,
    update_linkedin_account,
    delete_linkedin_account,
    get_linkedin_account_password,
)
from app.modules.all_platform.services.platforms_service import (
    get_all_platforms,
)
