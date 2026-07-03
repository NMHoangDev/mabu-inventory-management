from typing import List, Optional
from pydantic import BaseModel

# ==========================================
# SCHEMAS CHO GROUP
# ==========================================
class GroupItem(BaseModel):
    group_name: str
    link_group: str
    intent: str
    members: Optional[int] = 0
    date_crawl: Optional[str] = ""     # Thêm trường này để lưu ngày crawl thô từ Sheet
    posts_per_week: Optional[int] = 0
    health_score: Optional[int] = 0
    chay_24h: Optional[bool] = False
    industry: Optional[str] = ""
    tier: Optional[int] = 0
    team: Optional[str] = ""
    icp: Optional[str] = ""
    icp_desc: Optional[str] = ""

class BulkAddGroupPayload(BaseModel):
    groups: List[GroupItem]

class BulkDeleteGroupPayload(BaseModel):
    urls: List[str]

# ==========================================
# SCHEMAS CHO INTENT
# ==========================================
class IntentItem(BaseModel):
    name: str
    value:str

class BulkAddIntentPayload(BaseModel):
    intents: List[IntentItem]

class BulkDeleteIntentPayload(BaseModel):
    value: List[str]
class GetIntentsResponse(BaseModel):
    status: str
    message: str
    data: List[IntentItem]

class GroupItemResponse(BaseModel):
    group_name: str
    url: str
    intent: str
    members: Optional[int] = 0
    posts_per_week: Optional[int] = 0
    health_score: Optional[int] = 0
    date_crawl: Optional[str] = ""     # Thêm trường này để lưu ngày crawl thô từ Sheet
    chay_24h: Optional[bool] = False
    last_crawl: Optional[str] = ""     # Thêm trường này
    status: Optional[str] = "DEAD"
    industry: Optional[str] = ""
    tier: Optional[int] = 0
    team: Optional[str] = ""
    icp: Optional[str] = ""
    icp_desc: Optional[str] = ""

class GetGroupsResponse(BaseModel):
    status: str
    message: str
    data: List[GroupItemResponse]


class CategoryItem(BaseModel):
    value: str
    name: str

class GetCategoriesResponse(BaseModel):
    status: str
    message: str
    data: dict[str, List[dict]]

class AddCategoryPayload(BaseModel):
    category_type: str
    value: str
    name: Optional[str] = ""
    platform: Optional[str] = ""

class UpdateCategoryPayload(BaseModel):
    category_type: str
    value: str
    name: Optional[str] = ""
    platform: Optional[str] = ""

class DeleteCategoryPayload(BaseModel):
    category_type: str
    value: str
    platform: Optional[str] = ""

