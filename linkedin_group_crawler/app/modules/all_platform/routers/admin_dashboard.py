"""Admin Dashboard router for All-Platform module."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request, HTTPException

from app.modules.all_platform.schemas import BaseResponse
from app.modules.all_platform.services import decode_token, get_user_by_id
from app.modules.all_platform.services.admin_dashboard_service import (
    get_top_stats,
    get_kpi_performance,
    get_leaderboards,
)

router = APIRouter()


def _get_admin_from_header(authorization: str | None, request: Request | None = None) -> dict:
    """Extract, validate user from Bearer token/cookie, and verify Admin role."""
    if not authorization and request:
        cookie_token = request.cookies.get("crawlpro_access_token")
        if cookie_token:
            authorization = f"Bearer {cookie_token}"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        user = get_user_by_id(user_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable") from exc
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: Admin role required")
    return user


@router.get("/summary")
def get_dashboard_summary(
    request: Request,
    authorization: str | None = Header(None),
) -> BaseResponse:
    """Get Top Stats summary for admin dashboard."""
    _get_admin_from_header(authorization, request)
    data = get_top_stats()
    return BaseResponse(success=True, message="Success", data=data)


@router.get("/kpi-performance")
def get_dashboard_kpi_performance(
    request: Request,
    authorization: str | None = Header(None),
) -> BaseResponse:
    """Get Team KPI target vs actual performance."""
    _get_admin_from_header(authorization, request)
    data = get_kpi_performance()
    return BaseResponse(success=True, message="Success", data=data)


@router.get("/leaderboards")
def get_dashboard_leaderboards(
    request: Request,
    authorization: str | None = Header(None),
) -> BaseResponse:
    """Get Top Seeders and Top Groups leaderboard."""
    _get_admin_from_header(authorization, request)
    data = get_leaderboards()
    return BaseResponse(success=True, message="Success", data=data)
