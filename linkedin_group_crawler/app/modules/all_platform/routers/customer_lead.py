from fastapi import APIRouter, HTTPException, Depends, Request, Header
from typing import List, Any
from app.modules.linkedin.schemas.response_models import BaseResponse
from app.modules.all_platform.schemas.customer_lead import CustomerLeadCreate, CustomerLeadUpdate, CustomerLeadResponse
from app.modules.all_platform.services import customer_lead_service, decode_token, get_user_by_id

def get_current_user(request: Request, authorization: str | None = Header(None)) -> dict[str, Any]:
    if not authorization:
        cookie_token = request.cookies.get("crawlpro_access_token")
        if cookie_token:
            authorization = f"Bearer {cookie_token}"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    payload = decode_token(authorization[7:])
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        user = get_user_by_id(str(payload["sub"]))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable") from exc
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

router = APIRouter(prefix="/customer-leads", tags=["Customer Leads"])

@router.get("", response_model=BaseResponse)
def get_customer_leads(current_user: Any = Depends(get_current_user)):
    try:
        data = customer_lead_service.get_all_customer_leads(current_user)
        return BaseResponse(success=True, data=data, message="Success")
    except Exception as e:
        return BaseResponse(success=False, message=str(e))

@router.get("/sdrs", response_model=BaseResponse)
def get_sdrs(_: Any = Depends(get_current_user)):
    try:
        data = customer_lead_service.get_all_sdrs()
        return BaseResponse(success=True, data=data, message="Success")
    except Exception as e:
        return BaseResponse(success=False, message=str(e))

@router.post("", response_model=BaseResponse)
def create_customer_lead(payload: CustomerLeadCreate, current_user: Any = Depends(get_current_user)):
    try:
        data_dict = payload.model_dump(exclude_unset=True)
        if not data_dict.get("leaded_by") and isinstance(current_user, dict) and current_user.get("id"):
            data_dict["leaded_by"] = current_user.get("id")
        new_lead = customer_lead_service.create_customer_lead(data_dict)
        return BaseResponse(success=True, data=new_lead, message="Success")
    except Exception as e:
        return BaseResponse(success=False, message=str(e))

@router.put("/{lead_id}", response_model=BaseResponse)
def update_customer_lead(lead_id: str, payload: CustomerLeadUpdate, _: Any = Depends(get_current_user)):
    try:
        updated = customer_lead_service.update_customer_lead(lead_id, payload.model_dump(exclude_unset=True))
        if not updated:
            return BaseResponse(success=False, message="Not found or update failed")
        return BaseResponse(success=True, data=updated, message="Success")
    except Exception as e:
        return BaseResponse(success=False, message=str(e))

@router.delete("/{lead_id}", response_model=BaseResponse)
def delete_customer_lead(lead_id: str, _: Any = Depends(get_current_user)):
    try:
        success = customer_lead_service.delete_customer_lead(lead_id)
        if success:
            return BaseResponse(success=True, message="Deleted successfully")
        return BaseResponse(success=False, message="Delete failed")
    except Exception as e:
        return BaseResponse(success=False, message=str(e))
