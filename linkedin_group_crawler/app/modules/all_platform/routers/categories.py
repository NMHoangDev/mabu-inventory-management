"""Categories endpoints — platform-agnostic."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.modules.all_platform.schemas import (
    CategoryAddRequest,
    CategoryUpdateRequest,
    CategoryDeleteRequest,
    BaseResponse,
)
from app.modules.all_platform.services import (
    get_all_categories,
    get_categories_by_type,
    add_category,
    update_category,
    delete_category,
)

router = APIRouter()


@router.get("")
def categories_get_all(category_type: str | None = Query(None)) -> BaseResponse:
    """Get all categories, optionally filtered by type."""
    try:
        if category_type:
            data = get_categories_by_type(category_type)
        else:
            data = get_all_categories()
        return BaseResponse(success=True, data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/add")
def categories_add(payload: CategoryAddRequest) -> BaseResponse:
    """Add a new category."""
    try:
        data = add_category(payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="Category added", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.put("/update")
def categories_update(payload: CategoryUpdateRequest) -> BaseResponse:
    """Update an existing category."""
    try:
        data = update_category(payload.id, payload.model_dump(exclude_none=True))
        return BaseResponse(success=True, message="Category updated", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.delete("/delete")
def categories_delete(id: str = Query(...)) -> BaseResponse:
    """Delete a category."""
    try:
        data = delete_category(id)
        return BaseResponse(success=True, message="Category deleted", data=data)
    except Exception as e:
        return BaseResponse(success=False, message=str(e))
