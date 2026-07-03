"""Unified posts router — fetches & filters posts from all platforms in one call."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.all_platform.schemas import BaseResponse
from app.modules.all_platform.schemas.posts import (
    UnifiedPostsRequest,
    UnifiedFilterRequest,
)
from app.modules.all_platform.services.unified_posts_service import (
    get_unified_posts,
    filter_unified_posts,
    get_unified_stats,
)

router = APIRouter()


@router.post("/posts")
def unified_get_posts(payload: UnifiedPostsRequest) -> BaseResponse:
    """Get posts from all platforms (facebook + linkedin) in one call."""
    try:
        data = get_unified_posts(
            email=payload.email,
            platform=payload.platform,
            date_from=payload.date_from,
            date_to=payload.date_to,
            intent=payload.intent,
            industry=payload.industry,
            team=payload.team,
            tier=payload.tier,
            sort=payload.sort,
            page=payload.page,
            page_size=payload.page_size,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/posts/filter")
def unified_filter_posts(payload: UnifiedFilterRequest) -> BaseResponse:
    """Filter posts from all platforms with full criteria — server-side."""
    try:
        data = filter_unified_posts(
            email=payload.email,
            platform=payload.platform,
            date=payload.date,
            date_from=payload.date_from,
            date_to=payload.date_to,
            intent=payload.intent,
            industry=payload.industry,
            team=payload.team,
            tier=payload.tier,
            icp=payload.icp,
            content_type=payload.content_type,
            product_seeding=payload.product_seeding,
            search=payload.search,
            id_member=payload.id_member,
            sort=payload.sort,
            page=payload.page,
            page_size=payload.page_size,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/stats")
def unified_get_stats(payload: UnifiedPostsRequest) -> BaseResponse:
    """Get stats from all platforms — computed server-side from database."""
    try:
        data = get_unified_stats(
            email=payload.email,
            platform=payload.platform,
        )
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))
