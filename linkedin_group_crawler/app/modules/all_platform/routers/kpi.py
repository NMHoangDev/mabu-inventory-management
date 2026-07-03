"""KPI endpoints — platform-agnostic."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
from supabase import Client
from loguru import logger

from app.core.supabase_client import get_supabase_client
from app.modules.all_platform.services.supabase_kpi_service import VN_TZ

from app.modules.all_platform.schemas import (
    AssignKpiRequest,
    GetKpiByEmailRequest,
    GetAllKpiRequest,
    CheckPermissionRequest,
    VerifyLeaderCodeRequest,
    UpdateRoleToMemberRequest,
    SyncProgressRequest,
    BaseResponse,
)
from app.modules.all_platform.services import (
    assign_kpi,
    get_all_kpis_for_leader,
    get_kpi_by_email,
    get_kpi_inbox_progress_by_email,
    sync_kpi_progress,
    check_permission,
    verify_leader_code,
    update_user_role_to_member,
    count_fb_inbox_kpi,
    get_fb_inbox_kpi_summary,
    get_pending_fb_inbox_kpi,
)
from app.modules.all_platform.services.supabase_kpi_service import _compute_fb_inbox_progress

router = APIRouter()


@router.post("/assign")
def kpi_assign(payload: AssignKpiRequest) -> BaseResponse:
    """Leader assigns KPI to a member."""
    try:
        data = assign_kpi(payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="KPI assigned", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/get-all")
def kpi_get_all(payload: GetAllKpiRequest) -> BaseResponse:
    """Leader gets all KPIs for their team members."""
    try:
        data = get_all_kpis_for_leader(
            leader_email=payload.email_leader, 
            id_team=payload.id_team,
            start_date=payload.start_date,
            end_date=payload.end_date
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/get-by-email")
def kpi_get_by_email(payload: GetKpiByEmailRequest) -> BaseResponse:
    """Get KPI for a specific member."""
    try:
        data = get_kpi_by_email(payload.email)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/sync-all")
def kpi_sync_all(payload: SyncProgressRequest) -> BaseResponse:
    """Sync engagement progress from posts."""
    try:
        data = sync_kpi_progress(payload.email, payload.posts)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


# ── Zalo inbox KPI ───────────────────────────────────────────────────────────


class ZaloInboxProgressRequest(BaseModel):
    email: str = Field(..., min_length=3, description="Email member (app_users.email)")
    start_date: str = Field("", description="YYYY-MM-DD, mặc định = Monday tuần hiện tại")
    end_date: str = Field("", description="YYYY-MM-DD, mặc định = Sunday tuần hiện tại")


@router.post("/zalo-inbox-progress")
def zalo_inbox_progress(payload: ZaloInboxProgressRequest) -> BaseResponse:
    """Tính số tin nhắn Zalo khách gửi tới member trong khoảng [start_date, end_date].

    Phục vụ progress bar "Tin nhắn KPI" — chỉ đếm ``is_sent=false`` trên
    tất cả Zalo accounts mà member này đang sở hữu.
    """
    try:
        start = payload.start_date.strip() or None
        end = payload.end_date.strip() or None
        data = get_kpi_inbox_progress_by_email(
            payload.email.strip().lower(),
            start,
            end,
        )
        return BaseResponse(success=True, data=data or {
            "kpi_inbox_current": 0,
            "account_ids": [],
            "range": {"start": start or "", "end": end or ""},
        })
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


class FbInboxProgressRequest(BaseModel):
    email: str = Field(..., min_length=3, description="Email member (app_users.email)")
    start_date: str = Field("", description="YYYY-MM-DD, mặc định = Monday tuần hiện tại")
    end_date: str = Field("", description="YYYY-MM-DD, mặc định = Sunday tuần hiện tại")


class SyncFbInboxRequest(BaseModel):
    """Yêu cầu đếm/tính inbox KPI cho 1 hoặc nhiều hội thoại FB.
    Sau khi leader/admin xác nhận hội thoại là lead, gọi endpoint này."""
    leader_email: str = Field(..., min_length=3)
    member_email: str = Field(..., min_length=3)
    conv_ids: List[str] = Field(..., min_length=1)
    user_id: str = Field(..., description="FB user_id (account)")
    is_lead: bool = Field(False, description="Đánh dấu là lead tiềm năng")


class GetFbInboxKpiSummaryRequest(BaseModel):
    email: str = Field(..., min_length=3)
    start_date: str = Field("", description="YYYY-MM-DD")
    end_date: str = Field("", description="YYYY-MM-DD")


class BulkVerifyInboxRequest(BaseModel):
    leader_email: str = Field(..., min_length=3)
    target_date: str = Field(..., description="YYYY-MM-DD")


@router.post("/fb-inbox-progress")
def fb_inbox_progress(payload: FbInboxProgressRequest) -> BaseResponse:
    """Tính số tin nhắn Facebook Messenger khách gửi tới member trong khoảng [start_date, end_date].

    Gọi seeder service để đếm tin nhắn ``from='them'`` trong khoảng tuần KPI.
    Seeder service lưu tin nhắn vào data/inbox_messages/{owner}/{yyyy-MM-dd}.json.
    """
    try:
        email = payload.email.strip().lower()
        start = payload.start_date.strip()
        end = payload.end_date.strip()

        if not start or not end:
            today_d = datetime.now(VN_TZ).date()
            monday = today_d - timedelta(days=today_d.weekday())
            sunday = monday + timedelta(days=6)
            start = start or monday.isoformat()
            end = end or sunday.isoformat()

        result = _compute_fb_inbox_progress([email], start, end)
        data = result.get(email, {"kpi_fb_inbox_count": 0, "range": {"start": start, "end": end}})
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/fb-inbox-sync")
def fb_inbox_sync(payload: SyncFbInboxRequest) -> BaseResponse:
    """Xác nhận/duyệt KPI inbox cho 1 hoặc nhiều hội thoại FB.

    Được gọi khi leader/admin bấm nút "Xác nhận KPI" trên hộp thoại FB.
    Update is_confirmed = TRUE cho các row đã được member đề xuất.
    Nếu is_lead=True -> đánh dấu là lead tiềm năng.
    """
    try:
        supabase: Client = get_supabase_client()
        leader_email = payload.leader_email.strip().lower()
        member_email = payload.member_email.strip().lower()
        user_id = payload.user_id.strip()

        # Get leader ID
        leader_res = supabase.table("app_users").select("id").eq("email", leader_email).limit(1).execute()
        if not leader_res.data:
            return BaseResponse(success=False, message=f"Không tìm thấy leader với email: {leader_email}")
        id_leader = leader_res.data[0]["id"]

        now = datetime.now(timezone.utc).isoformat()
        synced = 0
        lead = 0

        for conv_id in payload.conv_ids:
            # Find existing row (may be created by member's suggest)
            existing = (
                supabase.table("fb_inbox_kpi")
                .select("id, is_confirmed, is_lead, message_count")
                .eq("conv_id", conv_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )

            if existing.data:
                row = existing.data[0]
                # Update: set is_confirmed = True
                update_data = {"is_confirmed": True, "synced_at": now}
                if payload.is_lead and not row.get("is_lead"):
                    update_data["is_lead"] = True
                    lead += 1
                supabase.table("fb_inbox_kpi").update(update_data).eq("id", row["id"]).execute()
                synced += 1
            else:
                # Row chưa tồn tại - tạo mới với is_confirmed = True
                supabase.table("fb_inbox_kpi").insert({
                    "id_leader": id_leader,
                    "conv_id": conv_id,
                    "user_id": user_id,
                    "message_count": 1,
                    "is_lead": payload.is_lead,
                    "is_confirmed": True,
                    "synced_at": now,
                }).execute()
                synced += 1
                if payload.is_lead:
                    lead += 1

        return BaseResponse(success=True, data={
            "synced": synced,
            "lead": lead,
            "member_email": member_email,
            "message": f"Đã xác nhận {synced} inbox KPI" + (f", {lead} lead" if lead else ""),
        })
    except Exception as e:
        logger.error(f"fb_inbox_sync error: {e}")
        return BaseResponse(success=False, message=str(e))


@router.post("/fb-inbox-bulk-verify")
def fb_inbox_bulk_verify(payload: BulkVerifyInboxRequest) -> BaseResponse:
    """Xác nhận KPI inbox hàng loạt cho Leader trong 1 ngày cụ thể."""
    try:
        supabase: Client = get_supabase_client()
        leader_email = payload.leader_email.strip().lower()
        target_date = payload.target_date.strip()

        # Get leader ID
        leader_res = supabase.table("app_users").select("id").eq("email", leader_email).limit(1).execute()
        if not leader_res.data:
            return BaseResponse(success=False, message=f"Không tìm thấy leader với email: {leader_email}")
        id_leader = leader_res.data[0]["id"]

        now = datetime.now(timezone.utc).isoformat()
        start_ts = f"{target_date}T00:00:00"
        end_ts = f"{target_date}T23:59:59"

        # Cập nhật tất cả các record chưa được xác nhận của leader này trong ngày target_date
        update_res = (
            supabase.table("fb_inbox_kpi")
            .update({"is_confirmed": True, "synced_at": now})
            .eq("id_leader", id_leader)
            .eq("is_confirmed", False)
            .gte("synced_at", start_ts)
            .lte("synced_at", end_ts)
            .execute()
        )
        
        updated_count = len(update_res.data or [])

        return BaseResponse(success=True, data={
            "synced": updated_count,
            "message": f"Đã tính KPI hàng loạt thành công cho {updated_count} hội thoại trong ngày {target_date}"
        })
    except Exception as e:
        logger.error(f"fb_inbox_bulk_verify error: {e}")
        return BaseResponse(success=False, message=str(e))


class SuggestInboxKpiRequest(BaseModel):
    """Request model cho member tự đề xuất KPI inbox cho mình."""
    member_email: str = Field(..., min_length=3, description="Email của member tự đề xuất")
    conv_ids: List[str] = Field(..., min_length=1, description="Danh sách conv_ids cần tính KPI")
    user_id: str = Field(..., description="FB user_id (account)")


@router.post("/fb-inbox-suggest")
def suggest_inbox_kpi(payload: SuggestInboxKpiRequest) -> BaseResponse:
    """Member tự đề xuất KPI inbox cho mình.

    Flow:
    1. Tìm member thuộc team nào -> Lấy id_leader của team đó
    2. Resolve id_member từ fb_inbox_accounts hoặc app_users
    3. Insert vào fb_inbox_kpi với is_confirmed = FALSE

    Leader sẽ thấy các inbox đã được đề xuất khi filter "Chưa tính KPI".
    Mỗi conv_id = 1 inbox KPI tiềm năng (không phân biệt có rep hay không).
    """
    try:
        member_email = payload.member_email.strip().lower()
        supabase: Client = get_supabase_client()

        # 1. Get member ID from email
        member_res = supabase.table("app_users").select("id").eq("email", member_email).limit(1).execute()
        if not member_res.data:
            return BaseResponse(success=False, message=f"Không tìm thấy member với email: {member_email}")
        id_member = member_res.data[0]["id"]

        # 2. Find which team this member belongs to
        member_teams_res = (
            supabase.table("member_of_teams")
            .select("id_teams")
            .eq("id_member", id_member)
            .limit(1)
            .execute()
        )

        id_leader = id_member  # fallback: member is their own leader
        if member_teams_res.data:
            id_team = member_teams_res.data[0]["id_teams"]
            # 3. Get leader ID from team
            team_res = supabase.table("teams").select("id_leader").eq("id", id_team).limit(1).execute()
            if team_res.data:
                id_leader = team_res.data[0]["id_leader"]

        logger.info(f"suggest_inbox_kpi: member={member_email}, id_member={id_member}, id_leader={id_leader}")

        # 4. Resolve id_member từ user_id (FB account) nếu có
        from app.modules.all_platform.services.fb_inbox_account_service import resolve_id_member
        resolved_id_member = resolve_id_member(payload.user_id)
        if resolved_id_member:
            id_member = resolved_id_member

        now = datetime.now(timezone.utc).isoformat()
        synced_count = 0

        for conv_id in payload.conv_ids:
            # Check if already exists
            existing = (
                supabase.table("fb_inbox_kpi")
                .select("id, is_confirmed")
                .eq("id_member", id_member)
                .eq("conv_id", conv_id)
                .eq("user_id", payload.user_id.strip())
                .limit(1)
                .execute()
            )

            if existing.data:
                row = existing.data[0]
                if not row.get("is_confirmed"):
                    # Cập nhật synced_at nếu chưa confirm
                    supabase.table("fb_inbox_kpi").update(
                        {"synced_at": now}
                    ).eq("id", row["id"]).execute()
                    synced_count += 1
            else:
                # Insert mới với is_confirmed = FALSE
                supabase.table("fb_inbox_kpi").insert({
                    "id_member": id_member,
                    "id_leader": id_leader,
                    "conv_id": conv_id,
                    "user_id": payload.user_id.strip(),
                    "message_count": 1,
                    "is_lead": False,
                    "is_confirmed": False,
                    "synced_at": now,
                }).execute()
                synced_count += 1

        return BaseResponse(success=True, data={
            "synced": synced_count,
            "member_email": member_email,
            "id_member": id_member,
            "id_leader": id_leader,
            "conv_ids": payload.conv_ids,
            "message": f"Đã đề xuất {synced_count} inbox cho KPI (chờ leader duyệt)",
        })
    except Exception as e:
        logger.error(f"suggest_inbox_kpi error: {e}")
        return BaseResponse(success=False, message=str(e))


@router.post("/fb-inbox-summary")
def fb_inbox_summary(payload: GetFbInboxKpiSummaryRequest) -> BaseResponse:
    """Lấy tổng hợp inbox KPI ĐÃ XÁC NHẬN từ fb_inbox_kpi table (Supabase).

    Dùng để hiển thị breakdown cho leader/admin trong team management.
    """
    try:
        start = payload.start_date.strip() or ""
        end = payload.end_date.strip() or ""
        result = get_fb_inbox_kpi_summary(
            member_email=payload.email.strip().lower(),
            start_date=start or None,
            end_date=end or None,
        )
        return BaseResponse(success=True, data=result)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/fb-inbox-pending")
def fb_inbox_pending(payload: GetFbInboxKpiSummaryRequest) -> BaseResponse:
    """Lấy danh sách inbox KPI CHƯA XÁC NHẬN từ fb_inbox_kpi table (Supabase).

    Dùng cho filter "Chưa xác minh" - hiển thị inbox member đã đề xuất
    nhưng leader/admin chưa duyệt (is_confirmed=False).
    """
    try:
        start = payload.start_date.strip() or ""
        end = payload.end_date.strip() or ""
        result = get_pending_fb_inbox_kpi(
            member_email=payload.email.strip().lower(),
            start_date=start or None,
            end_date=end or None,
        )
        return BaseResponse(success=True, data=result)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/check-permission")
def auth_check_permission(payload: CheckPermissionRequest) -> BaseResponse:
    """Check if user is leader or member."""
    try:
        data = check_permission(payload.email)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/auth/verify-leader-code")
def auth_verify_leader_code(payload: VerifyLeaderCodeRequest) -> BaseResponse:
    """Verify leader authorization code."""
    try:
        data = verify_leader_code(payload.code)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/auth/update-role-to-member")
def auth_update_role(payload: UpdateRoleToMemberRequest) -> BaseResponse:
    """Update user role to member."""
    try:
        data = update_user_role_to_member(payload.email)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


# ── Verified Inbox Conv IDs ─────────────────────────────────────────────────


class GetVerifiedConvIdsRequest(BaseModel):
    leader_email: str = Field(..., min_length=3)
    id_team: Optional[str] = Field(None, description="Team ID filter")
    start_date: str = Field("", description="YYYY-MM-DD, mặc định = Monday tuần hiện tại")
    end_date: str = Field("", description="YYYY-MM-DD, mặc định = Sunday tuần hiện tại")


@router.post("/fb-inbox-verified-ids")
def get_verified_fb_inbox_ids(payload: GetVerifiedConvIdsRequest) -> BaseResponse:
    """Lấy danh sách conv_ids đã xác nhận KPI inbox trong tuần hiện tại.

    Dùng cho frontend filter "Chưa tính KPI" trong inbox page.
    Trả về tất cả conv_ids đã được xác nhận trong khoảng [start_date, end_date].
    """
    try:
        leader_email = payload.leader_email.strip().lower()
        id_team = payload.id_team.strip() if payload.id_team else None

        # Default date range: current week
        start = payload.start_date.strip()
        end = payload.end_date.strip()
        if not start or not end:
            today_d = datetime.now(VN_TZ).date()
            monday = today_d - timedelta(days=today_d.weekday())
            sunday = monday + timedelta(days=6)
            start = start or monday.isoformat()
            end = end or sunday.isoformat()

        supabase: Client = get_supabase_client()

        # Get all members under this leader
        # First get leader's user id
        leader_res = supabase.table("app_users").select("id").eq("email", leader_email).limit(1).execute()
        if not leader_res.data:
            logger.warning(f"Leader not found: {leader_email}")
            return BaseResponse(success=True, data={
                "verified_conv_ids": [],
                "range": {"start": start, "end": end},
                "member_count": 0
            })

        leader_id = leader_res.data[0]["id"]

        # Get all member IDs under this leader (via teams)
        member_ids = []
        if id_team:
            # Specific team
            members_res = (
                supabase.table("member_of_teams")
                .select("id_member")
                .eq("id_teams", id_team)
                .execute()
            )
            member_ids = [r["id_member"] for r in (members_res.data or []) if r.get("id_member")]
        else:
            # All teams of this leader
            teams_res = (
                supabase.table("teams")
                .select("id")
                .eq("id_leader", leader_id)
                .execute()
            )
            team_ids = [t["id"] for t in (teams_res.data or [])]
            if team_ids:
                members_res = (
                    supabase.table("member_of_teams")
                    .select("id_member")
                    .in_("id_teams", team_ids)
                    .execute()
                )
                member_ids = [r["id_member"] for r in (members_res.data or []) if r.get("id_member")]

        # Include the leader themselves as a member
        member_ids.append(leader_id)
        member_ids = list(set(member_ids))  # remove duplicates

        if not member_ids:
            return BaseResponse(success=True, data={
                "verified_conv_ids": [],
                "range": {"start": start, "end": end},
                "member_count": 0
            })

        # Query fb_inbox_kpi for all these members in the date range - SEPARATE confirmed and pending
        confirmed_rows = (
            supabase.table("fb_inbox_kpi")
            .select("conv_id")
            .in_("id_member", member_ids)
            .eq("is_confirmed", True)
            .gte("synced_at", start)
            .lte("synced_at", end + "T23:59:59")
            .execute()
        )
        pending_rows = (
            supabase.table("fb_inbox_kpi")
            .select("conv_id")
            .in_("id_member", member_ids)
            .eq("is_confirmed", False)
            .gte("synced_at", start)
            .lte("synced_at", end + "T23:59:59")
            .execute()
        )

        confirmed_ids = list(set(row["conv_id"] for row in (confirmed_rows.data or []) if row.get("conv_id")))
        pending_ids = list(set(row["conv_id"] for row in (pending_rows.data or []) if row.get("conv_id")))

        logger.info(f"fb-inbox-verified-ids: leader={leader_email}, members={len(member_ids)}, confirmed={len(confirmed_ids)}, pending={len(pending_ids)}")

        return BaseResponse(success=True, data={
            "confirmed_conv_ids": confirmed_ids,
            "pending_conv_ids": pending_ids,  # đã đề xuất nhưng chưa confirmed
            "range": {"start": start, "end": end},
            "member_count": len(member_ids)
        })
    except Exception as e:
        logger.error(f"fb-inbox-verified-ids error: {e}")
        return BaseResponse(success=False, message=str(e))


class TeamKpiHistoryRequest(BaseModel):
    leader_email: Optional[str] = Field(None, description="Lọc theo leader. Bỏ trống = admin (tất cả team).")
    weeks: int = Field(4, ge=1, le=12, description="Số tuần gần nhất cần lấy (mặc định 4).")


@router.post("/team-history")
def team_kpi_history(payload: TeamKpiHistoryRequest) -> BaseResponse:
    """Lịch sử KPI theo tuần cho từng team.

    Admin gọi không cần leader_email → trả tất cả team.
    Leader gọi với leader_email của mình → chỉ trả team mình phụ trách.
    Mỗi phần tử = 1 WeeklySnapshot { week_name, teams: [KpiTeamStats] }.
    """
    try:
        from app.modules.all_platform.services.supabase_kpi_service import get_team_kpi_history
        data = get_team_kpi_history(
            leader_email=payload.leader_email,
            weeks=payload.weeks,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"team-history error: {e}")
        return BaseResponse(success=False, message=str(e))
