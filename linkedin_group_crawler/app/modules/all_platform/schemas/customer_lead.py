from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CustomerLeadCreate(BaseModel):
    customer_name: str
    company_name: Optional[str] = None
    leaded_by: Optional[str] = None
    is_assigned: bool = False
    sdr_id: Optional[str] = None
    conv_id: Optional[str] = None
    status: str = "pending"
    note: Optional[str] = None
    reject_reason: Optional[str] = None

class CustomerLeadUpdate(BaseModel):
    customer_name: Optional[str] = None
    company_name: Optional[str] = None
    leaded_by: Optional[str] = None
    is_assigned: Optional[bool] = None
    sdr_id: Optional[str] = None
    conv_id: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    reject_reason: Optional[str] = None

class CustomerLeadResponse(BaseModel):
    id: str
    customer_name: str
    company_name: Optional[str]
    leaded_by: Optional[str]
    is_assigned: bool
    sdr_id: Optional[str]
    conv_id: Optional[str]
    status: str
    note: Optional[str]
    reject_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Extra joined fields
    leader_name: Optional[str] = None
    sdr_name: Optional[str] = None
