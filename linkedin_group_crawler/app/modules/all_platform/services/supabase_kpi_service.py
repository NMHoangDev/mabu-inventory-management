"""Supabase-based KPI service for all-platform module."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from loguru import logger
from supabase import Client

from app.core.supabase_client import get_supabase_client

# Vietnam timezone (+07:00) — used consistently in all date comparisons
vn_tz = VN_TZ = timezone(timedelta(hours=7))


def assign_kpi(payload: dict) -> dict:
    """Assign KPI to a member — upsert into kpi_tracker.

    Upsert rules:
    - Unique key: (id_member, id_team, start_date, end_date) with status='active'.
    - If start_date or end_date is missing, use current VN week boundaries.
    - If a record already exists for that exact week+team, UPDATE it.
    - Otherwise INSERT a new record.
    """
    from app.modules.all_platform.schemas.kpi import AssignKpiRequest

    # Use Pydantic to normalise the payload and extract validated fields
    validated: AssignKpiRequest = AssignKpiRequest.model_validate(payload)

    supabase: Client = get_supabase_client()

    # ── Resolve emails ────────────────────────────────────────────────────────
    member_res = supabase.table("app_users").select("id").eq("email", validated.email.lower().strip()).execute()
    if not member_res.data:
        raise ValueError(f"Không tìm thấy user với email: {validated.email}")
    id_member: str = member_res.data[0]["id"]

    leader_res = supabase.table("app_users").select("id").eq("email", validated.email_leader.lower().strip()).execute()
    if not leader_res.data:
        raise ValueError(f"Không tìm thấy leader với email: {validated.email_leader}")
    id_leader: str = leader_res.data[0]["id"]

    id_team = validated.id_team
    if id_team == "":
        id_team = None

    # ── Determine week boundaries ─────────────────────────────────────────────
    # Always use the latest KPI item in the payload
    kpi_items = validated.kpi
    if not kpi_items:
        raise ValueError("KPI payload phải có ít nhất 1 mục trong mảng 'kpi'")

    latest = kpi_items[-1]

    # Normalise start/end dates: if missing, default to current VN week Mon–Sun
    if latest.start_day and latest.end_day:
        start_date = str(latest.start_day).strip()[:10]
        end_date = str(latest.end_day).strip()[:10]
    else:
        today_vn = date.today()
        monday = today_vn - timedelta(days=today_vn.weekday())
        sunday = monday + timedelta(days=6)
        start_date = monday.isoformat()
        end_date = sunday.isoformat()

    upsert_data = {
        "id_member": id_member,
        "id_leader": id_leader,
        "id_platform": 1,  # all-platform
        "id_team": id_team,
        "kpi_comment": latest.kpi_comment,
        "kpi_post": latest.kpi_post,
        "kpi_lead": latest.kpi_lead,
        "kpi_inbox": latest.kpi_inbox,
        "start_date": start_date,
        "end_date": end_date,
        "status": "active",
    }

    # ── Check for existing record (unique key: member + team + week) ───────────
    query = (
        supabase.table("kpi_tracker")
        .select("id")
        .eq("id_member", id_member)
        .eq("status", "active")
        .eq("start_date", start_date)
        .eq("end_date", end_date)
    )
    if id_team:
        query = query.eq("id_team", id_team)
    else:
        query = query.is_("id_team", "null")

    existing = query.execute()

    if existing.data:
        # UPDATE existing record
        kpi_id = existing.data[0]["id"]
        result = (
            supabase.table("kpi_tracker")
            .update(upsert_data)
            .eq("id", kpi_id)
            .execute()
        )
        logger.info(f"assign_kpi: updated kpi_id={kpi_id} for member={id_member}, week={start_date}..{end_date}")
    else:
        # INSERT new record
        result = (
            supabase.table("kpi_tracker")
            .insert(upsert_data)
            .execute()
        )
        logger.info(f"assign_kpi: inserted new KPI for member={id_member}, week={start_date}..{end_date}")

    if not result.data:
        raise RuntimeError("Không thể lưu KPI vào database")

    return result.data[0]


def get_all_kpis_for_leader(
    leader_email: str,
    id_team: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """Get all KPIs for a leader's team with weekly actual counts."""
    supabase: Client = get_supabase_client()

    # Get leader ID
    leader_res = supabase.table("app_users").select("id").eq("email", leader_email).execute()
    if not leader_res.data:
        return {"total": 0, "members": []}
    leader_id = leader_res.data[0]["id"]

    # Get all members of this leader from member_of_teams
    if id_team:
        members_result = (
            supabase.table("member_of_teams")
            .select("id_member")
            .eq("id_teams", id_team)
            .execute()
        )
    else:
        # Fallback: get all member IDs of all teams led by this leader
        teams_result = (
            supabase.table("teams")
            .select("id")
            .eq("id_leader", leader_id)
            .execute()
        )
        team_ids = [t["id"] for t in (teams_result.data or [])]
        if not team_ids:
            return {"total": 0, "members": []}
        members_result = (
            supabase.table("member_of_teams")
            .select("id_member")
            .in_("id_teams", team_ids)
            .execute()
        )
        
    member_ids = [r["id_member"] for r in (members_result.data or []) if r.get("id_member")]

    if not member_ids:
        return {"total": 0, "members": []}

    # Get user info
    user_result = (
        supabase.table("app_users")
        .select("*")
        .in_("id", member_ids)
        .execute()
    )
    user_map = {str(u["id"]): u for u in (user_result.data or [])}

    # Calculate default weekly range (current week: Monday to Sunday) in VN timezone
    from datetime import datetime, timedelta
    today = datetime.now(VN_TZ).date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    default_start = start_date or monday.isoformat()
    default_end = end_date or sunday.isoformat()

    # Get KPI for each member
    kpi_query = (
        supabase.table("kpi_tracker")
        .select("*")
        .in_("id_member", member_ids)
        .eq("status", "active")
    )
    if id_team:
        kpi_query = kpi_query.eq("id_team", id_team)
    if start_date and end_date:
        # Match exact week if both are provided
        kpi_query = kpi_query.eq("start_date", start_date).eq("end_date", end_date)
        
    kpi_query = kpi_query.order("start_date", desc=False)
    kpi_result = kpi_query.execute()
    kpi_map = {}
    for k in (kpi_result.data or []):
        # We might have multiple active ones if start/end date were not provided, 
        # so keeping the latest one is a reasonable fallback. But we prefer exact match.
        kpi_map[str(k["id_member"])] = k

    # Find minimum start date to fetch records efficiently
    min_start_date = default_start
    for k in kpi_map.values():
        eff_start = start_date or k.get("start_date") or default_start
        if eff_start and eff_start < min_start_date:
            min_start_date = eff_start

    # Get seeding content for members (Comments) with server-side date filtering.
    # We query from the earliest KPI start date to the latest end date needed,
    # then filter per-member in Python for precision. This avoids loading
    # the entire seeding_history table while ensuring date correctness.
    seeding_result = (
        supabase.table("seeding_content_kpi")
        .select("id_member, verify, current_day, content, link_comment, id_social_account, social_accounts(account_name)")
        .in_("id_member", member_ids)
        .gte("current_day", min_start_date)
        .lte("current_day", default_end)
        .execute()
    )
    seeding_list = seeding_result.data or []

    verified_keywords = ("yes", "đã seeding", "xác minh", "verified")

    members_data = []
    for mid in set(str(m) for m in member_ids):
        user = user_map.get(mid)
        if not user:
            continue

        active_kpi = kpi_map.get(mid, {})
        eff_start_date = start_date or active_kpi.get("start_date") or default_start
        eff_end_date = end_date or active_kpi.get("end_date") or default_end
        member_email = user.get("email", "").lower()

        # Calculate actual Comments within active week (using member's KPI date range)
        member_comments = [
            s for s in seeding_list
            if str(s.get("id_member")) == mid
            and s.get("current_day")
            and eff_start_date <= s["current_day"] <= eff_end_date
        ]
        comment_current = len(member_comments)

        # Set Posts to 0 as requested
        post_current = 0

        # Zalo inbox: số tin nhắn khách gửi tới trong tuần KPI.
        try:
            inbox_progress = compute_kpi_inbox_progress([mid], eff_start_date, eff_end_date)
            inbox_current = int(inbox_progress.get(mid, {}).get("kpi_inbox_current", 0))
            lead_current = int(inbox_progress.get(mid, {}).get("kpi_lead_current", 0))
        except Exception as exc:
            logger.warning(f"compute_kpi_inbox_progress failed for member={mid}: {exc}")
            inbox_current = 0
            lead_current = 0

        # Facebook Messenger inbox: dùng date range của member (KHÔNG phải default)
        fb_inbox_from_seeder = 0
        fb_inbox_from_kpi = 0
        fb_lead_from_kpi = 0
        if member_email:
            try:
                fb_progress = _compute_fb_inbox_progress([member_email], eff_start_date, eff_end_date)
                fb_inbox_from_seeder = int(fb_progress.get(member_email, {}).get("kpi_fb_inbox_count", 0))
            except Exception as exc:
                logger.warning(f"_compute_fb_inbox_progress failed for member={mid}: {exc}")

            try:
                fb_kpi_summary = get_fb_inbox_kpi_summary(member_email, eff_start_date, eff_end_date)
                fb_inbox_from_kpi = int(fb_kpi_summary.get("inbox_count", 0))
                fb_lead_from_kpi = int(fb_kpi_summary.get("lead_count", 0))
            except Exception as exc:
                logger.warning(f"get_fb_inbox_kpi_summary failed for member={mid}: {exc}")

        # Facebook Post KPI: đếm số bài viết đã đăng từ fb_post_kpi
        fb_post_count = 0
        try:
            from app.modules.all_platform.services.fb_post_kpi_service import get_fb_post_kpi_summary
            fb_post_summary = get_fb_post_kpi_summary(member_email, eff_start_date, eff_end_date)
            fb_post_count = int(fb_post_summary.get("post_count", 0))
        except Exception as exc:
            logger.warning(f"get_fb_post_kpi_summary failed for member={mid}: {exc}")

        # Tổng inbox = Zalo inbox + FB seeder messages + FB counted via "Tính Inbox"
        total_inbox_current = inbox_current + fb_inbox_from_seeder + fb_inbox_from_kpi

        members_data.append({
            "id": mid,
            "email": member_email,
            "name": user.get("name"),
            "role": user.get("role", "member"),
            "profile_slug": user.get("slug"),
            "email_leader": leader_email,
            "kpi": [active_kpi] if active_kpi else [],
            "seeding_stats": {
                "verified_count": comment_current,
                "kpi_target": active_kpi.get("kpi_comment", 0),
                "kpi_post": active_kpi.get("kpi_post", 0),
                "kpi_post_current": fb_post_count,  # FB Post KPI từ fb_post_kpi
                "kpi_lead": active_kpi.get("kpi_lead", 0),
                "kpi_lead_current": lead_current + fb_lead_from_kpi,
                "kpi_inbox": active_kpi.get("kpi_inbox", 0),
                "kpi_inbox_current": total_inbox_current,
                "kpi_inbox_zalo": inbox_current,
                "kpi_inbox_fb_seeder": fb_inbox_from_seeder,
                "kpi_inbox_fb_kpi": fb_inbox_from_kpi,
                "kpi_inbox_range": {
                    "start": eff_start_date,
                    "end": eff_end_date,
                },
            },
            "seeding_items": member_comments,
            "profile_id": user.get("profile_id"),
            "facebook_name": user.get("facebook_name"),
        })

    return {"total": len(members_data), "members": members_data}


def get_kpi_by_email(email: str) -> dict:
    """Get KPI for a specific member."""
    supabase: Client = get_supabase_client()

    # Get user info
    user_result = (
        supabase.table("app_users")
        .select("*")
        .eq("email", email)
        .execute()
    )
    if not user_result.data:
        return {}
    user = user_result.data[0]
    user_id = user["id"]

    # Determine current week in VN timezone
    from datetime import datetime, timedelta
    today = datetime.now(VN_TZ).date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    current_monday = monday.isoformat()
    current_sunday = sunday.isoformat()

    result = (
        supabase.table("kpi_tracker")
        .select("*")
        .eq("id_member", user_id)
        .eq("status", "active")
        .eq("start_date", current_monday)
        .eq("end_date", current_sunday)
        .order("start_date", desc=True)
        .execute()
    )
    
    # Fallback to latest KPI if no exact match for current week
    if not result.data:
        result = (
            supabase.table("kpi_tracker")
            .select("*")
            .eq("id_member", user_id)
            .eq("status", "active")
            .order("start_date", desc=True)
            .limit(1)
            .execute()
        )
        # Virtual carry-over: keep targets from old KPI, but update dates to current week
        # so the progress is correctly calculated for the new week (reset to 0).
        if result.data:
            result.data[0]["start_date"] = current_monday
            result.data[0]["end_date"] = current_sunday

    if result.data:
        kpi = result.data[0]
        # Fetch leader email for compatibility
        leader_res = supabase.table("app_users").select("email").eq("id", kpi.get("id_leader")).execute()
        leader_email = leader_res.data[0]["email"] if leader_res.data else None

        # Tính kpi_inbox_current trong khoảng KPI hiện tại
        kpi_inbox_target = int(kpi.get("kpi_inbox") or 0)
        kpi_inbox_current = 0
        kpi_inbox_zalo = 0
        kpi_inbox_fb = 0
        if kpi_inbox_target > 0:
            try:
                progress = compute_kpi_inbox_progress(
                    [str(user_id)],
                    kpi.get("start_date"),
                    kpi.get("end_date"),
                )
                kpi_inbox_zalo = int(progress.get(str(user_id), {}).get("kpi_inbox_current", 0))
            except Exception as exc:
                logger.warning(f"compute_kpi_inbox_progress failed for email={email}: {exc}")

        # FB Messenger inbox từ seeder service
        member_email_lower = email.strip().lower()
        kpi_inbox_fb_seeder = 0
        kpi_inbox_fb_kpi = 0
        try:
            fb_progress = _compute_fb_inbox_progress(
                [member_email_lower],
                kpi.get("start_date"),
                kpi.get("end_date"),
            )
            kpi_inbox_fb_seeder = int(fb_progress.get(member_email_lower, {}).get("kpi_fb_inbox_count", 0))
        except Exception as exc:
            logger.warning(f"_compute_fb_inbox_progress failed for email={email}: {exc}")

        # FB inbox KPI từ Supabase fb_inbox_kpi table (manually counted via "Tính Inbox")
        try:
            fb_kpi_summary = get_fb_inbox_kpi_summary(
                member_email_lower,
                kpi.get("start_date"),
                kpi.get("end_date"),
            )
            kpi_inbox_fb_kpi = int(fb_kpi_summary.get("inbox_count", 0))
        except Exception as exc:
            logger.warning(f"get_fb_inbox_kpi_summary failed for email={email}: {exc}")

        kpi_inbox_current = kpi_inbox_zalo + kpi_inbox_fb_seeder + kpi_inbox_fb_kpi

        return {
            "email": email,
            "name": user.get("name"),
            "role": user.get("role", "member"),
            "profile_slug": user.get("slug"),
            "email_leader": leader_email,
            "kpi": [kpi],
            "kpi_inbox_current": kpi_inbox_current,
            "kpi_inbox_zalo": kpi_inbox_zalo,
            "kpi_inbox_fb_seeder": kpi_inbox_fb_seeder,
            "kpi_inbox_fb_kpi": kpi_inbox_fb_kpi,
            "kpi_inbox_target": kpi_inbox_target,
            "profile_id": user.get("profile_id"),
            "facebook_name": user.get("facebook_name"),
        }
    return {}


def sync_kpi_progress(email: str, posts: list[dict]) -> dict:
    """Sync engagement progress from posts into linkedin_posts table."""
    supabase: Client = get_supabase_client()

    updated = 0
    for post in posts:
        post_url = post.get("post_url")
        if not post_url:
            continue
        update_data = {}
        if "reactions" in post:
            update_data["likes"] = post["reactions"]
        elif "likes" in post:
            update_data["likes"] = post["likes"]
        if "comments" in post:
            update_data["comments"] = post["comments"]
        if "shares" in post:
            update_data["shares"] = post["shares"]

        if update_data:
            user_res = supabase.table("app_users").select("id").eq("email", email.strip().lower()).limit(1).execute()
            user_id = user_res.data[0]["id"] if user_res.data else None
            
            if user_id:
                result = (
                    supabase.table("linkedin_posts")
                    .update(update_data)
                    .eq("post_url", post_url)
                    .eq("id_member", user_id)
                    .execute()
                )
                updated += len(result.data) if result.data else 0

    return {"updated": updated}


def check_permission(email: str) -> dict:
    """Check if user is leader or member."""
    supabase: Client = get_supabase_client()

    result = (
        supabase.table("app_users")
        .select("role, email_leader, name")
        .eq("email", email)
        .execute()
    )

    if result.data:
        user = result.data[0]
        return {
            "role": user.get("role", "member"),
            "email_leader": user.get("email_leader"),
            "name": user.get("name"),
        }

    return {"role": "member", "email_leader": None, "name": None}


def verify_leader_code(code: str) -> dict:
    """Verify leader authorization code."""
    from app.core.config import settings

    if code == settings.leader_code:
        return {"valid": True}
    return {"valid": False}


def update_user_role_to_member(email: str) -> dict:
    """Update user role to member."""
    supabase: Client = get_supabase_client()

    result = (
        supabase.table("app_users")
        .update({"role": "member", "updated_at": "now()"})
        .eq("email", email)
        .execute()
    )
    return result.data[0] if result.data else {}


# ─────────────────────────────────────────────────────────────────────────────
# Zalo inbox KPI
# ─────────────────────────────────────────────────────────────────────────────
#
# "Tin nhắn KPI" = số tin nhắn KHÁCH gửi tới (is_sent = false) trong khoảng
# start_date -> end_date trên tất cả Zalo account thuộc sở hữu của member.
#
# Quy ước schema:
#   - zalo_accounts.owner_id      -> app_users.id (member)
#   - zalo_messages.user_id       -> zalo_accounts.account_id
#   - zalo_messages.is_sent=false -> tin nhắn nhận từ khách
#
# Hàm này trả về số liệu actual để hiển thị progress bar; nó KHÔNG ghi vào
# kpi_tracker (giữ bảng này immutable cho target do leader giao).
# ─────────────────────────────────────────────────────────────────────────────


def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    """Parse YYYY-MM-DD[ T...] -> date. Trả None nếu không phân tích được."""
    if not value:
        return None
    raw = str(value).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[: len(fmt) + 30] if "%z" in fmt else raw, fmt).date()
        except ValueError:
            continue
    # Fallback: lấy 10 ký tự đầu
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Facebook Inbox from seeder service
# ─────────────────────────────────────────────────────────────────────────────
#
# Seeder service lưu tin nhắn khách (from='them') vào data/inbox_messages/{owner}/{yyyy-MM-dd}.json.
# Hàm này gọi GET /inbox/messages/count của seeder để đếm tin theo owner + khoảng ngày KPI.
# ─────────────────────────────────────────────────────────────────────────────

def _compute_fb_inbox_progress(
    member_emails: Iterable[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Gọi seeder service để đếm tin nhắn khách (FB Messenger) của từng member trong tuần KPI.

    Args:
        member_emails: danh sách email của các member cần đếm.
        start_date: ISO date (YYYY-MM-DD). Mặc định = Monday tuần hiện tại.
        end_date: ISO date. Mặc định = Sunday tuần hiện tại.

    Returns:
        Dict map ``email -> {kpi_fb_inbox_count, range: {start, end}}``.
    """
    from app.core.config import settings

    if start_date is None or end_date is None:
        today_d = datetime.now(VN_TZ).date()
        monday = today_d - timedelta(days=today_d.weekday())
        sunday = monday + timedelta(days=6)
        start_date = start_date or monday.isoformat()
        end_date = end_date or sunday.isoformat()

    out: Dict[str, Dict[str, Any]] = {}
    base_url = settings.seeder_service_url.rstrip("/")
    api_key = settings.seeder_service_api_key

    for email in member_emails:
        out[email] = {
            "kpi_fb_inbox_count": 0,
            "range": {"start": start_date, "end": end_date},
        }
        if not base_url:
            continue
        try:
            import httpx

            headers = {}
            if api_key:
                headers["X-API-Key"] = api_key

            url = (
                f"{base_url}/inbox/messages/count"
                f"?owner={email}&start={start_date}&end={end_date}"
            )
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                out[email] = {
                    "kpi_fb_inbox_count": int(data.get("count", 0)),
                    "range": data.get("range", {"start": start_date, "end": end_date}),
                }
            else:
                logger.warning(
                    f"Seeder service /inbox/messages/count returned {resp.status_code} "
                    f"for {email}: {resp.text[:200]}"
                )
        except Exception as exc:
            logger.warning(f"Failed to fetch FB inbox from seeder for {email}: {exc}")

    return out


def _member_zalo_account_ids(supabase: Client, member_user_id: str) -> List[str]:
    """Lấy danh sách zalo_accounts.account_id thuộc sở hữu của 1 member.

    Trả [] nếu member chưa từng claim Zalo account nào.
    """
    if not member_user_id:
        return []
    res = (
        supabase.table("zalo_accounts")
        .select("account_id")
        .eq("owner_id", member_user_id)
        .execute()
    )
    return [str(row["account_id"]) for row in (res.data or []) if row.get("account_id")]


def compute_kpi_inbox_progress(
    member_user_ids: Iterable[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Tính kpi_inbox_current cho từng member.

    Đếm số conversation mà member đã tick share VÀ leader đã verify, có
    ``updated_at`` nằm trong khoảng [start_date, end_date] (theo kpi_tracker).

    Chỉ các row thoả mãn **đồng thời** mới được tính:
        - id_member = member_id
        - shared_role = 'leader'
        - is_active = true
        - verified_at IS NOT NULL (leader đã xác minh)
        - updated_at trong [start_dt, end_dt]

    Args:
        member_user_ids: danh sách app_users.id cần tính.
        start_date: ISO date (YYYY-MM-DD). Mặc định = Monday tuần hiện tại.
        end_date:   ISO date. Mặc định = Sunday tuần hiện tại.

    Returns:
        Dict map ``member_user_id -> {kpi_inbox_current, account_ids, range: {start, end}}``.
        Member nào không có share verified trong khoảng → current = 0.
    """
    supabase: Client = get_supabase_client()

    # Chuẩn hoá khoảng thời gian
    if start_date is None or end_date is None:
        today = datetime.now(VN_TZ).date()
        monday = today - timedelta(days=today.weekday())
        sunday = monday + timedelta(days=6)
        start_date = start_date or monday.isoformat()
        end_date = end_date or sunday.isoformat()

    start_iso = _parse_iso_date(start_date) or date.today()
    end_iso = _parse_iso_date(end_date) or date.today()

    # Tạo timezone Vietnam (+07:00) để đảm bảo so sánh thời gian trùng khớp với mốc ngày của user
    vn_tz = VN_TZ

    # Mở rộng end_date lên cuối ngày (VN) cho so sánh updated_at/created_at, sau đó chuyển sang UTC để so sánh chuỗi ISO
    end_dt = datetime.combine(end_iso, datetime.max.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()
    start_dt = datetime.combine(start_iso, datetime.min.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()

    out: Dict[str, Dict[str, Any]] = {}
    for mid in member_user_ids:
        # Đếm số conversation đã verify của member này trong khoảng
        # (không phụ thuộc vào zalo_accounts.account_id; chỉ cần member có share là đủ)
        try:
            res = (
                supabase.table("zalo_conversation_permissions")
                .select("id, created_at, updated_at, verified_at, is_lead")
                .eq("id_member", mid)
                .eq("shared_role", "leader")
                .eq("is_active", True)
                .eq("is_verify", True)
                .not_.is_("verified_at", "null")
                .execute()
            )
            current = 0
            lead_current = 0
            for r in res.data or []:
                c_at = r.get("created_at") or ""
                u_at = r.get("updated_at") or ""
                v_at = r.get("verified_at") or ""
                if (
                    (c_at >= start_dt and c_at <= end_dt) or 
                    (u_at >= start_dt and u_at <= end_dt) or
                    (v_at >= start_dt and v_at <= end_dt)
                ):
                    current += 1
                    if r.get("is_lead"):
                        lead_current += 1
        except Exception as exc:
            logger.warning(f"compute_kpi_inbox_progress failed for member={mid}: {exc}")
            current = 0
            lead_current = 0

        account_ids = _member_zalo_account_ids(supabase, mid)
        out[mid] = {
            "kpi_inbox_current": current,
            "kpi_lead_current": lead_current,
            "account_ids": account_ids,
            "range": {"start": start_date, "end": end_date},
        }

    return out


def get_kpi_inbox_progress_by_email(
    email: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """API thuận tiện: truyền email -> trả về kpi_inbox_current cho 1 member.

    Trả về dict rỗng nếu email không tồn tại.
    """
    supabase: Client = get_supabase_client()
    res = supabase.table("app_users").select("id").eq("email", email).limit(1).execute()
    if not res.data:
        return {}
    member_id = str(res.data[0]["id"])
    progress = compute_kpi_inbox_progress([member_id], start_date, end_date)
    return progress.get(member_id, {"kpi_inbox_current": 0, "account_ids": [], "range": {}})


# ─────────────────────────────────────────────────────────────────────────────
# Facebook Inbox KPI (local Supabase — FB inbox từ seeder service)
# ─────────────────────────────────────────────────────────────────────────────
#
# Sau khi leader/admin bấm "Tính Inbox" trên hộp thoại FB:
#   1. FE gọi POST /kpi/fb-inbox-sync với {user_id, conv_ids}
#   2. Backend upsert vào bảng fb_inbox_kpi (supabase)
#   3. Backend proxy request sang seeder service để lưu tin nhắn
#   4. KPI inbox được tính tổng hợp: Zalo (zalo_conversation_permissions) + FB (fb_inbox_kpi)
#
# Bảng fb_inbox_kpi schema:
#   id (uuid), id_member (uuid FK app_users), id_leader (uuid FK app_users),
#   conv_id (text), user_id (text — FB user_id), message_count (int),
#   is_lead (bool), synced_at (timestamptz), created_at (timestamptz)
# ─────────────────────────────────────────────────────────────────────────────


def count_fb_inbox_kpi(
    member_email: str,
    leader_email: str,
    conv_ids: List[str],
    user_id: str,
    is_lead: bool = False,
) -> dict:
    """Upsert inbox KPI count cho 1 hoặc nhiều hội thoại FB.

    Mỗi hội thoại = 1 inbox KPI count.
    Nếu is_lead=True -> đánh dấu là lead tiềm năng.

    Trả: {"synced": n, "lead": m} với số lượng upsert thành công.

    LUỒNG MỚI:
    1. Gọi resolve_id_member() từ fb_inbox_account_service - dùng bảng fb_inbox_accounts
    2. Nếu không tìm thấy -> thử các fallback cũ (social_accounts, profile_id, Markee)
    3. Lưu vào fb_inbox_kpi với id_member đã resolve
    """
    supabase: Client = get_supabase_client()

    # Resolve leader email -> user id (always via email)
    leader_res = supabase.table("app_users").select("id").eq("email", leader_email).limit(1).execute()
    if not leader_res.data:
        raise ValueError(f"Không tìm thấy leader với email: {leader_email}")
    id_leader = leader_res.data[0]["id"]

    # === PRIMARY: Resolve id_member từ bảng fb_inbox_accounts ===
    from app.modules.all_platform.services.fb_inbox_account_service import resolve_id_member
    id_member: Optional[str] = resolve_id_member(user_id)

    # === FALLBACK: Các cách resolve cũ nếu bảng mới không có ===
    if not id_member:
        # Trường hợp 1 — member_email != leader_email (member tự bấm trên acc của mình):
        if member_email.lower() != leader_email.lower():
            member_res = supabase.table("app_users").select("id").eq("email", member_email).limit(1).execute()
            if member_res.data:
                id_member = member_res.data[0]["id"]
        # Trường hợp 2 — member_email == leader_email (admin/leader bấm trên session của member khác)
        else:
            # A) Qua social_accounts
            platforms_res = supabase.table("platforms").select("id").ilike("name", "facebook").limit(1).execute()
            fb_platform_id = platforms_res.data[0]["id"] if platforms_res.data else None

            if fb_platform_id:
                fb_acc_res = (
                    supabase.table("social_accounts")
                    .select("app_user_id")
                    .eq("id_platform", fb_platform_id)
                    .eq("account_profile_id", user_id)
                    .limit(1)
                    .execute()
                )
                if fb_acc_res.data:
                    id_member = str(fb_acc_res.data[0]["app_user_id"])

            # B) Fallback: thử qua app_users.profile_id
            if not id_member:
                try:
                    member_by_profile = (
                        supabase.table("app_users")
                        .select("id")
                        .eq("profile_id", user_id)
                        .limit(1)
                        .execute()
                    )
                    if member_by_profile.data:
                        id_member = str(member_by_profile.data[0]["id"])
                except Exception:
                    pass  # column profile_id may not exist

            # C) Fallback: gọi Markee service
            if not id_member:
                try:
                    import httpx as _hx
                    import os as _os
                    _markee_url = (_os.getenv("MARKEE_FB_BASE_URL") or "https://auto-fb.zenithglobal.dev").rstrip("/")
                    _markee_key = _os.getenv("MARKEE_FB_API_KEY", "").strip()
                    _h = {"X-API-Key": _markee_key} if _markee_key else {}
                    with _hx.Client(timeout=10.0) as _c:
                        _r = _c.get(f"{_markee_url}/session/owner/{user_id}", headers=_h)
                    if _r.status_code == 200:
                        _payload = _r.json()
                        _owner = _payload.get("owner")
                        if _owner and isinstance(_owner, str) and len(_owner) == 36:
                            id_member = _owner
                except Exception:
                    pass

    if not id_member:
        raise ValueError(
            f"Không tìm thấy member sở hữu FB account [{user_id}]. "
            f"Vui lòng đảm bảo FB account đã được thêm vào hệ thống "
            f"(vào app -> Quản lý tài khoản -> Thêm FB Inbox Account)."
        )

    now = datetime.now(timezone.utc).isoformat()
    synced = 0
    lead = 0

    for conv_id in conv_ids:
        existing = (
            supabase.table("fb_inbox_kpi")
            .select("id, is_lead")
            .eq("id_member", id_member)
            .eq("conv_id", conv_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if existing.data:
            existing_row = existing.data[0]
            # Update only if is_lead changed from False to True
            if is_lead and not existing_row.get("is_lead"):
                supabase.table("fb_inbox_kpi").update(
                    {"is_lead": True, "synced_at": now}
                ).eq("id", existing_row["id"]).execute()
                lead += 1
            else:
                supabase.table("fb_inbox_kpi").update(
                    {"message_count": existing_row.get("message_count", 0) + 1, "synced_at": now}
                ).eq("id", existing_row["id"]).execute()
            synced += 1
        else:
            supabase.table("fb_inbox_kpi").insert({
                "id_member": id_member,
                "id_leader": id_leader,
                "conv_id": conv_id,
                "user_id": user_id,
                "message_count": 1,
                "is_lead": is_lead,
                "synced_at": now,
            }).execute()
            synced += 1
            if is_lead:
                lead += 1

    return {"synced": synced, "lead": lead, "member_email": member_email}


def get_fb_inbox_kpi_summary(
    member_email: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Lấy tổng hợp KPI inbox FB ĐÃ XÁC NHẬN cho 1 member trong khoảng ngày.

    CHỈ đếm inbox đã được leader/admin xác nhận (is_confirmed=True).
    Dùng cho hiển thị KPI đã hoàn thành.

    Returns: {inbox_count, lead_count, conv_ids, range}.
    """
    supabase: Client = get_supabase_client()

    res = supabase.table("app_users").select("id").eq("email", member_email).limit(1).execute()
    if not res.data:
        return {"inbox_count": 0, "lead_count": 0, "conv_ids": [], "range": {}}

    member_id = res.data[0]["id"]

    # Convert YYYY-MM-DD -> VN timezone datetime range, then compare as UTC strings.
    # This matches the same logic used in compute_kpi_inbox_progress for consistency.
    if start_date and end_date:
        vn_tz = VN_TZ
        start_iso = _parse_iso_date(start_date) or date.today()
        end_iso = _parse_iso_date(end_date) or date.today()
        start_dt = datetime.combine(start_iso, datetime.min.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()
        end_dt = datetime.combine(end_iso, datetime.max.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()
        query = (
            supabase.table("fb_inbox_kpi")
            .select("id, conv_id, message_count, is_lead, synced_at")
            .eq("id_member", member_id)
            .eq("is_confirmed", True)  # CHỈ đếm inbox ĐÃ XÁC NHẬN
            .gte("synced_at", start_dt)
            .lte("synced_at", end_dt)
        )
    else:
        query = (
            supabase.table("fb_inbox_kpi")
            .select("id, conv_id, message_count, is_lead, synced_at")
            .eq("id_member", member_id)
            .eq("is_confirmed", True)  # CHỈ đếm inbox ĐÃ XÁC NHẬN
        )

    rows = query.execute().data or []
    inbox_count = len(rows)
    lead_count = sum(1 for r in rows if r.get("is_lead"))
    conv_ids = [r["conv_id"] for r in rows if r.get("conv_id")]

    return {
        "inbox_count": inbox_count,
        "lead_count": lead_count,
        "conv_ids": conv_ids,
        "range": {"start": start_date or "", "end": end_date or ""},
    }


def get_pending_fb_inbox_kpi(
    member_email: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Lấy danh sách KPI inbox FB CHƯA XÁC NHẬN cho 1 member.

    Dùng cho filter "Chưa xác minh" - hiển thị inbox member đã đề xuất
    nhưng leader/admin chưa duyệt (is_confirmed=False).

    Returns: {pending_count, pending_conv_ids, range}.
    """
    supabase: Client = get_supabase_client()

    res = supabase.table("app_users").select("id").eq("email", member_email).limit(1).execute()
    if not res.data:
        return {"pending_count": 0, "pending_conv_ids": [], "range": {}}

    member_id = res.data[0]["id"]

    if start_date and end_date:
        vn_tz = VN_TZ
        start_iso = _parse_iso_date(start_date) or date.today()
        end_iso = _parse_iso_date(end_date) or date.today()
        start_dt = datetime.combine(start_iso, datetime.min.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()
        end_dt = datetime.combine(end_iso, datetime.max.time(), tzinfo=vn_tz).astimezone(timezone.utc).isoformat()
        query = (
            supabase.table("fb_inbox_kpi")
            .select("id, conv_id, message_count, is_lead, synced_at")
            .eq("id_member", member_id)
            .eq("is_confirmed", False)  # CHỈ lấy inbox CHƯA XÁC NHẬN
            .gte("synced_at", start_dt)
            .lte("synced_at", end_dt)
        )
    else:
        query = (
            supabase.table("fb_inbox_kpi")
            .select("id, conv_id, message_count, is_lead, synced_at")
            .eq("id_member", member_id)
            .eq("is_confirmed", False)  # CHỈ lấy inbox CHƯA XÁC NHẬN
        )

    rows = query.execute().data or []
    pending_count = len(rows)
    pending_conv_ids = [r["conv_id"] for r in rows if r.get("conv_id")]

    return {
        "pending_count": pending_count,
        "pending_conv_ids": pending_conv_ids,
        "range": {"start": start_date or "", "end": end_date or ""},
    }


def _vn_date(ts: str) -> Optional[date]:
    """Convert an ISO timestamp to a VN (Asia/Ho_Chi_Minh) date.

    Handles timestamps stored as UTC strings and converts them to VN local date,
    ensuring consistent date-boundary filtering across all KPI functions.
    Falls back to naive date.fromisoformat if the timestamp can't be parsed.
    """
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(VN_TZ).date()
    except ValueError:
        try:
            return date.fromisoformat(ts[:10])
        except ValueError:
            return None


def get_team_kpi_history(
    leader_email: Optional[str] = None,
    weeks: int = 4,
) -> List[Dict[str, Any]]:
    """Trả về lịch sử KPI theo tuần cho từng team.

    Admin: trả tất cả team.
    Leader: chỉ trả team mình phụ trách (leader_email bắt buộc).
    Mỗi tuần = 1 WeeklySnapshot { week_name, teams: [KpiTeamStats] }.
    Actuals: inbox + lead lấy từ fb_inbox_kpi, post từ fb_post_kpi.
    Comment actuals = 0 (chưa có bảng riêng).
    """
    supabase: Client = get_supabase_client()

    # 1. Lấy danh sách team
    if leader_email:
        leader_res = (
            supabase.table("app_users")
            .select("id")
            .eq("email", leader_email.strip().lower())
            .limit(1)
            .execute()
        )
        if not leader_res.data:
            return []
        leader_id = leader_res.data[0]["id"]
        teams_res = (
            supabase.table("teams")
            .select("id, name_team, id_leader")
            .eq("id_leader", leader_id)
            .execute()
        )
    else:
        teams_res = supabase.table("teams").select("id, name_team, id_leader").execute()

    teams = teams_res.data or []
    if not teams:
        return []

    team_ids = [str(t["id"]) for t in teams]

    # 2. Member ↔ team mapping
    members_res = (
        supabase.table("member_of_teams")
        .select("id_teams, id_member")
        .in_("id_teams", team_ids)
        .execute()
    )
    team_members: Dict[str, List[str]] = {}
    for row in (members_res.data or []):
        tid = str(row["id_teams"])
        mid = str(row["id_member"])
        team_members.setdefault(tid, []).append(mid)

    all_member_ids = list({m for mids in team_members.values() for m in mids})
    if not all_member_ids:
        return []

    # 3. Tuần cần hiển thị (mới nhất trước)
    today = date.today()
    monday_this = today - timedelta(days=today.weekday())
    week_ranges: List[Tuple[str, date, date]] = []
    for i in range(weeks):
        w_start = monday_this - timedelta(weeks=i)
        w_end = w_start + timedelta(days=6)
        year, wnum, _ = w_start.isocalendar()
        week_ranges.append((f"{year}-W{wnum:02d}", w_start, w_end))

    earliest_start = week_ranges[-1][1].isoformat()
    earliest_start_date = week_ranges[-1][1]
    # Convert earliest_start to VN timezone for DB query (match other functions)
    earliest_start_dt = datetime.combine(earliest_start_date, datetime.min.time(), tzinfo=VN_TZ).astimezone(timezone.utc).isoformat()

    # 4. KPI targets từ kpi_tracker
    kpi_res = (
        supabase.table("kpi_tracker")
        .select("id_member, kpi_inbox, kpi_lead, kpi_post, kpi_comment, start_date, end_date")
        .in_("id_member", all_member_ids)
        .eq("status", "active")
        .execute()
    )
    kpi_rows = kpi_res.data or []

    # 5. Actuals cho toàn bộ khoảng
    inbox_res = (
        supabase.table("fb_inbox_kpi")
        .select("id_member, is_lead, is_confirmed, synced_at")
        .in_("id_member", all_member_ids)
        .gte("synced_at", earliest_start_dt)
        .execute()
    )
    post_res = (
        supabase.table("fb_post_kpi")
        .select("id_member, posted_at")
        .in_("id_member", all_member_ids)
        .gte("posted_at", earliest_start_dt)
        .execute()
    )
    inbox_rows = inbox_res.data or []
    post_rows = post_res.data or []

    # 6. Build snapshots
    result: List[Dict[str, Any]] = []
    for week_name, w_start, w_end in week_ranges:
        week_teams = []
        for team in teams:
            tid = str(team["id"])
            mids = set(team_members.get(tid, []))
            if not mids:
                continue

            # --- Targets: sum KPI tracker entries overlapping this week ---
            inbox_target = lead_target = post_target = comment_target = 0
            for kt in kpi_rows:
                if str(kt["id_member"]) not in mids:
                    continue
                kt_start = date.fromisoformat(kt["start_date"]) if kt.get("start_date") else None
                kt_end = date.fromisoformat(kt["end_date"]) if kt.get("end_date") else None
                if kt_start and kt_end:
                    if not (kt_end < w_start or kt_start > w_end):
                        inbox_target += kt.get("kpi_inbox") or 0
                        lead_target += kt.get("kpi_lead") or 0
                        post_target += kt.get("kpi_post") or 0
                        comment_target += kt.get("kpi_comment") or 0
                else:
                    inbox_target += kt.get("kpi_inbox") or 0
                    lead_target += kt.get("kpi_lead") or 0
                    post_target += kt.get("kpi_post") or 0
                    comment_target += kt.get("kpi_comment") or 0

            # --- Actuals ---
            inbox_actual = lead_actual = post_actual = 0
            for row in inbox_rows:
                if str(row["id_member"]) not in mids:
                    continue
                d = _vn_date(row.get("synced_at") or "")
                if d is None:
                    continue
                if w_start <= d <= w_end:
                    if row.get("is_confirmed"):
                        inbox_actual += 1
                    if row.get("is_lead"):
                        lead_actual += 1

            for row in post_rows:
                if str(row["id_member"]) not in mids:
                    continue
                d = _vn_date(row.get("posted_at") or "")
                if d is None:
                    continue
                if w_start <= d <= w_end:
                    post_actual += 1

            week_teams.append({
                "team_id": tid,
                "team_name": team.get("name_team") or "",
                "lead_actual": lead_actual,
                "lead_target": lead_target,
                "inbox_actual": inbox_actual,
                "inbox_target": inbox_target,
                "post_actual": post_actual,
                "post_target": post_target,
                "comment_actual": 0,
                "comment_target": comment_target,
            })

        result.append({"week_name": week_name, "teams": week_teams})

    return result
