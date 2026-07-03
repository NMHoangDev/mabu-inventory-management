"""Facebook crawl endpoint for all-platform module.

POST /api/all-platform/facebook/crawl
    — Crawl selected Facebook groups using Playwright, save hot posts to Supabase.

Flow:
  1. Validate payload (groups + optional FB account credentials).
  2. Delegate to facebook_crawl_service.crawl_facebook_groups().
  3. Return structured result matching CrawlFacebookPopup's CrawlResult interface.
"""

from __future__ import annotations

import logging
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from app.core.logger import get_logger
from app.modules.all_platform.services.auth_service import decode_token, get_user_by_id
from app.modules.all_platform.services.facebook_crawl_service import (
    crawl_facebook_groups,
    CrawlFacebookResult,
    CrawlGroupResult,
)

logger = get_logger(__name__)

def _get_user_from_header(authorization: str | None, request: Request | None = None) -> dict:
    """Extract and validate user from Bearer token or HttpOnly cookie."""
    if not authorization:
        if request:
            cookie_token = request.cookies.get("crawlpro_access_token")
            if cookie_token:
                authorization = f"Bearer {cookie_token}"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user = get_user_by_id(user_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable") from exc
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class TkFB(BaseModel):
    useName: Optional[str] = None
    password: Optional[str] = None


class CrawlTriggerRequest(BaseModel):
    name: str
    url: str
    intent: Optional[str] = None


class CrawlFacebookRequest(BaseModel):
    groups: List[CrawlTriggerRequest]
    tkFB: Optional[TkFB] = None


class GroupResultResponse(BaseModel):
    group_url: str
    success: bool
    posts_count: int = 0
    error: Optional[str] = None


class CrawlFacebookResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[dict] = None


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/crawl", response_model=CrawlFacebookResponse)
async def crawl_facebook(
    payload: CrawlFacebookRequest,
    request: Request,
    authorization: str | None = Header(None),
) -> CrawlFacebookResponse:
    """
    Cào dữ liệu bài viết từ các nhóm Facebook đã chọn.

    Payload:
        groups: Danh sách nhóm [{name, url, intent?}].
        tkFB:   Thông tin tài khoản FB tuỳ chọn (nếu không truyền → dùng cookie mặc định).

    Response:
        success: True/False.
        message: Thông báo kết quả.
        data:
            total_groups_ok    — số nhóm cào thành công
            total_groups_failed — số nhóm thất bại
            total_sessions_saved — số session đã lưu
            total_posts_saved    — tổng bài viết hot đã lưu vào Supabase
            groups_results       — chi tiết từng nhóm
            errors               — danh sách lỗi (nếu có)
    """
    try:
        if not payload.groups:
            return CrawlFacebookResponse(
                success=False,
                message="Chưa chọn nhóm nào để cào.",
            )

        # Build group list
        group_list = [
            {
                "name": g.name,
                "url": g.url,
                "intent": g.intent,
            }
            for g in payload.groups
        ]

        # Lấy user từ auth token để ghi nhận ai thực hiện crawl
        current_user = _get_user_from_header(authorization, request)
        user_id = current_user.get("id")

        custom_email: str | None = None
        custom_pass: str | None = None

        if payload.tkFB and payload.tkFB.useName:
            custom_email = payload.tkFB.useName
            custom_pass = payload.tkFB.password

        # Thực hiện crawl
        result = await crawl_facebook_groups(
            groups=group_list,
            user_id=user_id,
            custom_email=custom_email,
            custom_pass=custom_pass,
        )

        # Xây dựng message
        if result.total_groups_ok == 0 and result.total_groups_failed > 0:
            msg = f"Tất cả nhóm đều thất bại. Chi tiết: {result.errors[0] if result.errors else 'Không rõ lỗi'}"
        elif result.total_groups_failed > 0:
            msg = (
                f"Cào {result.total_groups_ok} nhóm thành công, "
                f"{result.total_groups_failed} nhóm thất bại. "
                f"{result.total_posts_saved} bài viết hot đã lưu."
            )
        else:
            msg = (
                f"Cào {result.total_groups_ok} nhóm thành công. "
                f"{result.total_posts_saved} bài viết hot đã lưu vào Supabase."
            )

        return CrawlFacebookResponse(
            success=True,
            message=msg,
            data={
                "total_groups_ok": result.total_groups_ok,
                "total_groups_failed": result.total_groups_failed,
                "total_sessions_saved": result.total_sessions_saved,
                "total_posts_saved": result.total_posts_saved,
                "groups_results": [
                    {
                        "group_url": r.group_url,
                        "success": r.success,
                        "posts_count": r.posts_count,
                        "error": r.error,
                    }
                    for r in result.groups_results
                ],
                "errors": result.errors,
            },
        )

    except Exception as e:
        logger.exception("crawl-facebook endpoint failed")
        return CrawlFacebookResponse(
            success=False,
            message=f"Lỗi hệ thống: {str(e)}",
        )


# Export alias
crawl_facebook_router = router
