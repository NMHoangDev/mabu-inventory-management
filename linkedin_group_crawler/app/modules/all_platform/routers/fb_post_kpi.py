"""FB Post KPI router.

API endpoints để lưu và truy vấn KPI bài viết Facebook.
Extension gọi API này khi đăng bài thành công.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from loguru import logger

from app.modules.all_platform.schemas import BaseResponse
from app.modules.all_platform.schemas.fb_post_kpi import (
    FbPostKpiSaveRequest,
    FbPostKpiSummaryRequest,
    FbPostKpiListRequest,
)
from app.modules.all_platform.services.fb_post_kpi_service import (
    save_fb_post_kpi,
    get_fb_post_kpi_summary,
    get_fb_post_kpi_list,
)


router = APIRouter()


@router.post("/save")
def save_post_kpi(payload: FbPostKpiSaveRequest) -> BaseResponse:
    """Lưu KPI bài viết Facebook.

    Endpoint này được gọi bởi seeder service khi extension
    đăng bài FB thành công.

    Luồng:
    1. Nhận kết quả từ extension (job_id, user_id, post_url)
    2. Resolve id_member từ user_id -> fb_inbox_accounts
    3. Resolve id_leader từ id_member -> teams
    4. Lưu vào fb_post_kpi
    """
    try:
        result = save_fb_post_kpi(
            job_id=payload.job_id,
            user_id=payload.user_id,
            post_url=payload.post_url,
            content=payload.content,
            target_type=payload.target_type,
            target_id=payload.target_id,
            platform=payload.platform,
            posted_at=payload.posted_at,
        )
        return BaseResponse(
            success=True,
            message="Đã lưu KPI bài viết",
            data=result,
        )
    except ValueError as e:
        logger.warning(f"save_post_kpi validation error: {e}")
        return BaseResponse(success=False, message=str(e))
    except Exception as e:
        logger.error(f"save_post_kpi error: {e}")
        return BaseResponse(success=False, message=f"Lỗi khi lưu KPI: {e}")


@router.post("/summary")
def get_post_kpi_summary(payload: FbPostKpiSummaryRequest) -> BaseResponse:
    """Lấy tổng hợp KPI bài viết Facebook.

    Args:
        email: Email của member
        start_date: Ngày bắt đầu (YYYY-MM-DD)
        end_date: Ngày kết thúc (YYYY-MM-DD)

    Returns:
        Dict với tổng hợp: post_count, profile_count, group_count, page_count
    """
    try:
        start = payload.start_date.strip() if payload.start_date else ""
        end = payload.end_date.strip() if payload.end_date else ""

        result = get_fb_post_kpi_summary(
            member_email=payload.email.strip().lower(),
            start_date=start or None,
            end_date=end or None,
        )
        return BaseResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"get_post_kpi_summary error: {e}")
        return BaseResponse(success=False, message=str(e))


@router.post("/list")
def get_post_kpi_list(payload: FbPostKpiListRequest) -> BaseResponse:
    """Lấy danh sách bài viết KPI Facebook.

    Args:
        email: Email của member
        start_date: Ngày bắt đầu (YYYY-MM-DD)
        end_date: Ngày kết thúc (YYYY-MM-DD)
        target_type: Lọc theo loại ('profile', 'group', 'page')
        limit: Số lượng tối đa

    Returns:
        Danh sách bài viết với thông tin chi tiết
    """
    try:
        start = payload.start_date.strip() if payload.start_date else ""
        end = payload.end_date.strip() if payload.end_date else ""

        result = get_fb_post_kpi_list(
            member_email=payload.email.strip().lower(),
            start_date=start or None,
            end_date=end or None,
            target_type=payload.target_type,
            limit=payload.limit,
        )
        return BaseResponse(success=True, data=result)
    except Exception as e:
        logger.error(f"get_post_kpi_list error: {e}")
        return BaseResponse(success=False, message=str(e))
