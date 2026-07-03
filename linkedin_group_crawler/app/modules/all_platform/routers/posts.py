"""Posts endpoints — platform-specific Facebook."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.all_platform.schemas import (
    GetAllPostsRequest,
    FilterPostsRequest,
    SyncProgressRequest,
    BaseResponse,
)
from app.modules.all_platform.services import (
    get_all_facebook_posts,
    filter_facebook_posts,
    sync_facebook_post_progress,
)

router = APIRouter()


@router.post("/posts/get-all")
def fb_posts_get_all(payload: GetAllPostsRequest) -> BaseResponse:
    """Get all Facebook posts."""
    try:
        data = get_all_facebook_posts(
            email=payload.email,
            date_from=payload.date_from,
            date_to=payload.date_to,
            intent=payload.intent,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/posts/filter")
def fb_posts_filter(payload: FilterPostsRequest) -> BaseResponse:
    """Filter Facebook posts with multiple criteria."""
    try:
        data = filter_facebook_posts(
            email=payload.email,
            date=payload.date,
            date_from=payload.date_from,
            date_to=payload.date_to,
            intent=payload.intent,
            industry=payload.industry,
            team=payload.team,
            tier=payload.tier,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/posts/sync-progress")
def fb_posts_sync_progress(payload: SyncProgressRequest) -> BaseResponse:
    """Sync engagement progress for Facebook posts."""
    try:
        data = sync_facebook_post_progress(payload.email, payload.posts)
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


# Alias for import
facebook_posts_router = router
