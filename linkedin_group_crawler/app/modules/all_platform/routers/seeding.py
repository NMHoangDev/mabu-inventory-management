"""Seeding endpoints — shared router for Facebook + LinkedIn seeding marks."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.all_platform.schemas import (
    SeedingMarkSaveRequest,
    SeedingMarkVerifyRequest,
    SeedingMarkGetAllRequest,
    SeedingCountRequest,
    KpiTargetRequest,
    BaseResponse,
)
from app.modules.all_platform.services import (
    save_seeding_mark,
    verify_seeding_mark,
    get_all_seeding_marks,
    get_unverified_seeding_marks,
    get_member_seeding_count,
    save_seeding_kpi,
    get_all_seeding_kpi,
    get_kpi_target,
)

router = APIRouter()


@router.post("/seeding-mark/save")
def mark_seeding(payload: SeedingMarkSaveRequest) -> BaseResponse:
    """Step 1: Mark a post for seeding (verify='pending')."""
    try:
        data = save_seeding_mark(payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="Seeding marked", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-mark/verify")
def verify_mark(payload: SeedingMarkVerifyRequest) -> BaseResponse:
    """Step 2: Verify a seeding mark (verify='yes')."""
    try:
        data = verify_seeding_mark(payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="Seeding verified", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-mark/get-all")
def get_all_marks(payload: SeedingMarkGetAllRequest) -> BaseResponse:
    """Get all seeding marks (verified + pending) for a member."""
    try:
        data = get_all_seeding_marks(payload.email_member)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-mark/get-unverified")
def get_unverified_marks(payload: SeedingMarkGetAllRequest) -> BaseResponse:
    """Get unverified seeding marks for a member."""
    try:
        data = get_unverified_seeding_marks(payload.email_member)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-mark/get-actual-count")
def get_actual_count(payload: SeedingCountRequest) -> BaseResponse:
    """Get actual seeding count (verified + total) for KPI tracking."""
    try:
        data = get_member_seeding_count(
            email_member=payload.email_member,
            date_from=payload.date_from,
            date_to=payload.date_to,
            profile_id=payload.profile_id,
            facebook_name=payload.facebook_name,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-kpi/save")
def save_kpi(payload: SeedingMarkSaveRequest) -> BaseResponse:
    """Save a seeding KPI row (Chrome extension / seeding tool)."""
    try:
        data = save_seeding_kpi(payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="Seeding KPI saved", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-kpi/get-all")
def get_all_kpi(payload: SeedingMarkGetAllRequest) -> BaseResponse:
    """Get all seeding KPI rows for a member."""
    try:
        data = get_all_seeding_kpi(payload.email_member)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/seeding-mark/get-kpi-target")
def get_target(payload: KpiTargetRequest) -> BaseResponse:
    """Get KPI target for a member from kpi_tracker."""
    try:
        data = get_kpi_target(
            email_member=payload.email_member,
            date_from=payload.date_from,
            date_to=payload.date_to,
            id_team=payload.id_team,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))
