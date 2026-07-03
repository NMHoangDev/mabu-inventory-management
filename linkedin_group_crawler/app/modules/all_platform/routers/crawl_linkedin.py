"""LinkedIn crawl endpoint for all-platform module.

POST /api/all-platform/linkedin/crawl-linkedin-post
    — Logs in with stored session (by email), crawls selected groups one by one,
      saves results to Supabase (crawl_sessions + linkedin_posts).

GET  /api/all-platform/linkedin/accounts
POST /api/all-platform/linkedin/accounts
PUT  /api/all-platform/linkedin/accounts/{account_id}
DELETE /api/all-platform/linkedin/accounts/{account_id}
"""

from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.logger import get_logger
from app.modules.all_platform.services.supabase_linkedin_account_service import (
    get_linkedin_accounts,
    add_linkedin_account,
    update_linkedin_account,
    delete_linkedin_account,
    get_linkedin_account_password,
)
from app.modules.all_platform.services.supabase_linkedin_crawl_service import (
    save_crawl_batch_to_supabase,
)

logger = get_logger(__name__)

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class BaseResponse(BaseModel):
    success: bool
    message: str = ""
    data: object = None


class LinkedInAccountCreate(BaseModel):
    email_member: str
    email_linkedin: str
    password: str


class LinkedInAccountUpdate(BaseModel):
    email_member: Optional[str] = None
    email_linkedin: Optional[str] = None
    password: Optional[str] = None


class CrawlLinkedInPostRequest(BaseModel):
    """
    Crawl LinkedIn posts for selected groups and save to Supabase.

    Fields:
        email_linkedin: LinkedIn email to use for crawling (must exist in linkedin_account table).
        group_urls: List of LinkedIn group URLs to crawl.
        target_date: Optional date string YYYY-MM-DD. Defaults to today.
        max_items: Optional max posts to collect per group (default 30).
        fallback_recent_count: If no posts on target date, use N most recent (default 20).
    """
    email_linkedin: str
    group_urls: List[str]
    target_date: Optional[str] = None
    max_items: Optional[int] = 30
    fallback_recent_count: int = 20


# ── LinkedIn Account CRUD ──────────────────────────────────────────────────────

@router.get("/accounts")
def li_accounts_list() -> BaseResponse:
    """List all LinkedIn accounts."""
    try:
        data = get_linkedin_accounts()
        return BaseResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Failed to list linkedin accounts")
        return BaseResponse(success=False, message=str(e))


@router.post("/accounts")
def li_accounts_create(payload: LinkedInAccountCreate) -> BaseResponse:
    """Add a new LinkedIn account."""
    try:
        if not payload.email_linkedin.strip() or not payload.password.strip():
            return BaseResponse(success=False, message="email_linkedin và password không được để trống")
        data = add_linkedin_account(
            email_member=payload.email_member.strip(),
            email_linkedin=payload.email_linkedin.strip().lower(),
            password=payload.password,
        )
        return BaseResponse(success=True, data=data, message="Đã thêm tài khoản")
    except Exception as e:
        logger.exception("Failed to create linkedin account")
        return BaseResponse(success=False, message=str(e))


@router.put("/accounts/{account_id}")
def li_accounts_update(account_id: str, payload: LinkedInAccountUpdate) -> BaseResponse:
    """Update a LinkedIn account."""
    try:
        data = update_linkedin_account(account_id, payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, data=data, message="Đã cập nhật")
    except Exception as e:
        logger.exception("Failed to update linkedin account %s", account_id)
        return BaseResponse(success=False, message=str(e))


@router.delete("/accounts/{account_id}")
def li_accounts_delete(account_id: str) -> BaseResponse:
    """Delete a LinkedIn account."""
    try:
        data = delete_linkedin_account(account_id)
        return BaseResponse(success=True, data=data, message="Đã xóa tài khoản")
    except Exception as e:
        logger.exception("Failed to delete linkedin account %s", account_id)
        return BaseResponse(success=False, message=str(e))


# ── Crawl Endpoint ─────────────────────────────────────────────────────────────

@router.post("/crawl-linkedin-post")
def crawl_linkedin_post(payload: CrawlLinkedInPostRequest) -> BaseResponse:
    """
    Crawl LinkedIn posts using the Playwright-based crawler flow.

    Flow:
      1. Resolve password from linkedin_account table by email_linkedin.
      2. Ensure LinkedIn session exists (login if needed via auth_service).
      3. For each group_url, crawl with open_group_and_collect_posts.
      4. Filter posts for target_date (fallback to N most recent).
      5. Save all results (sessions + posts) to Supabase.
    """
    try:
        # Imports are here to avoid circular dependency at module level
        from app.modules.linkedin.services.auth_service import (
            login_and_save_session,
            build_session_state_path,
        )
        from app.modules.linkedin.services.crawler_service import open_group_and_collect_posts
        from app.modules.linkedin.services.ranking_service import (
            enrich_and_filter_posts,
            pick_top_post,
            select_most_recent_posts,
        )

        email = payload.email_linkedin.strip().lower()
        if not email:
            return BaseResponse(success=False, message="email_linkedin không được để trống")
        if not payload.group_urls:
            return BaseResponse(success=False, message="Chưa chọn nhóm nào để cào")

        # 1. Get password from Supabase
        password = get_linkedin_account_password(email)
        if not password:
            return BaseResponse(
                success=False,
                message=f"Không tìm thấy tài khoản LinkedIn với email: {email}. "
                        "Vui lòng thêm tài khoản trong trang Quản lý tài khoản.",
            )

        # 2. Ensure session (try existing, then login fresh)
        _session_id, state_path = build_session_state_path(session_id=None, email=email)
        if not state_path.exists():
            logger.info("No existing session for %s — logging in first", email)
            login_result = login_and_save_session(
                email=email,
                password=password,
                session_id=None,
                force_relogin=False,
                prime_pool=False,
            )
            if login_result.status == "need_otp":
                return BaseResponse(
                    success=False,
                    message="LinkedIn yêu cầu xác minh OTP. Vui lòng login thủ công trước.",
                    data={"need_otp": True, "checkpoint_url": login_result.checkpoint_url},
                )
            if login_result.status != "success":
                return BaseResponse(
                    success=False,
                    message="Đăng nhập LinkedIn thất bại. Kiểm tra email/mật khẩu.",
                )

        # Resolve target date
        target_date_str = (payload.target_date or "").strip()
        if not target_date_str:
            target_date_str = datetime.now().date().isoformat()

        # 3. Crawl each group
        groups_results: list[dict] = []
        for group_url in payload.group_urls:
            group_url = group_url.strip()
            if not group_url:
                continue
            logger.info("Crawling group: %s for email: %s", group_url, email)
            try:
                crawl_result = open_group_and_collect_posts(
                    session_id=None,
                    email=email,
                    group_url=group_url,
                    max_items=payload.max_items,
                )

                # 4. Filter by date
                filtered_posts, target_day = enrich_and_filter_posts(
                    posts=crawl_result["posts"],
                    target_date=target_date_str,
                    crawl_time=crawl_result["crawl_time"],
                )
                
                posts_out = filtered_posts

                groups_results.append({
                    "success": True,
                    "session_id": crawl_result["session_id"],
                    "group_url": group_url,
                    "group_name": crawl_result.get("group_name", ""),
                    "posts": posts_out,
                    "total_posts_scraped": crawl_result["total_posts_scraped"],
                })
                logger.info("Crawled %d posts from %s", len(posts_out), group_url)

            except Exception as group_err:
                logger.exception("Failed to crawl group %s", group_url)
                groups_results.append({
                    "success": False,
                    "group_url": group_url,
                    "error": str(group_err),
                })

        # 5. Save all to Supabase
        save_result = save_crawl_batch_to_supabase(
            email_crawl=email,
            target_date=target_date_str,
            groups_results=groups_results,
        )

        succeeded = [r for r in groups_results if r.get("success")]
        failed = [r for r in groups_results if not r.get("success")]

        msg = (
            f"Đã cào {save_result['total_sessions']} nhóm, "
            f"{save_result['total_posts']} bài — lưu vào Supabase thành công."
        )
        if failed:
            msg += f" ({len(failed)} nhóm lỗi)"

        return BaseResponse(
            success=True,
            message=msg,
            data={
                "total_groups_ok": len(succeeded),
                "total_groups_failed": len(failed),
                "total_sessions_saved": save_result["total_sessions"],
                "total_posts_saved": save_result["total_posts"],
                "errors": save_result["errors"],
                "groups_results": [
                    {
                        "group_url": r["group_url"],
                        "success": r["success"],
                        "posts_count": len(r.get("posts", [])),
                        "error": r.get("error"),
                    }
                    for r in groups_results
                ],
            },
        )

    except Exception as e:
        logger.exception("crawl-linkedin-post endpoint failed")
        return BaseResponse(success=False, message=str(e))


@router.delete("/crawl-sessions/{session_id}")
def delete_crawl_session(session_id: str) -> BaseResponse:
    """Delete a specific crawl session and its associated posts."""
    try:
        from app.modules.all_platform.services.supabase_linkedin_crawl_service import delete_crawl_session_by_id
        success = delete_crawl_session_by_id(session_id)
        if success:
            return BaseResponse(success=True, message="Đã xóa phiên cào và các bài viết liên quan")
        else:
            return BaseResponse(success=False, message="Không tìm thấy phiên cào hoặc đã bị xóa")
    except Exception as e:
        logger.exception("Failed to delete crawl session %s", session_id)
        return BaseResponse(success=False, message=str(e))


# Export alias for import in __init__.py / router.py
crawl_linkedin_router = router
