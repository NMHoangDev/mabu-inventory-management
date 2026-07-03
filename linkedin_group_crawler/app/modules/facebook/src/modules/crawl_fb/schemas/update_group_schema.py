# src/schemas/update_group_schema.py
from pydantic import BaseModel
from typing import Optional, Any

class UpdateGroupRequest(BaseModel):
    """Schema để cập nhật thông tin Group Facebook"""
    group_name: str
    url: str
    intent: Optional[str] = None
    members: Optional[int] = None
    posts_per_week: Optional[int] = None
    health_score: Optional[float] = None
    status: Optional[str] = None  # ACTIVE, IDLE, DEAD
    industry: Optional[str] = None
    tier: Optional[int] = None
    team: Optional[str] = None
    icp: Optional[str] = None
    icp_desc: Optional[str] = None

class UpdateGroupResponse(BaseModel):
    """Response sau khi cập nhật Group"""
    success: bool
    message: str
    data: Optional[Any] = None
