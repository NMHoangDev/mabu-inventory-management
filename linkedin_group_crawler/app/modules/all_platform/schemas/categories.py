"""Categories schemas for all-platform module."""

from __future__ import annotations

from pydantic import BaseModel
from typing import Optional


class CategoryAddRequest(BaseModel):
    category_type: str  # intent | industry | tier | team | icp
    code: str
    name: Optional[str] = None
    description: Optional[str] = None
    platform: str = "general"


class CategoryUpdateRequest(BaseModel):
    id: str
    category_type: Optional[str] = None
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None

class CategoryDeleteRequest(BaseModel):
    id: str
