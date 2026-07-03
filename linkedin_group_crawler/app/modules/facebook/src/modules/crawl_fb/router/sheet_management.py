from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

# Import schemas và service vừa tạo ở trên
from app.modules.facebook.src.core.config.env import Config
from app.modules.facebook.src.modules.crawl_fb.schemas.sheet_schema import (
    BulkAddGroupPayload, BulkDeleteGroupPayload,
    BulkAddIntentPayload, BulkDeleteIntentPayload, GetIntentsResponse,
    GetGroupsResponse, GetCategoriesResponse, AddCategoryPayload,
    UpdateCategoryPayload, DeleteCategoryPayload
)
from app.modules.facebook.src.modules.crawl_fb.services.sheet_management_service import SheetManagementService
from app.core.config import settings
from app.shared.services.n8n_webhook_service import post_json_to_n8n_webhook

sheet_management_router = APIRouter( tags=["Sheet Management API"])

def get_sheet_management_service():
    """Dependency injection cho Sheet Management"""
    return SheetManagementService()

# ==========================================
# 1. API QUẢN LÝ GROUP
# ==========================================
@sheet_management_router.get("/groups", response_model=GetGroupsResponse, status_code=status.HTTP_200_OK)
async def api_get_all_groups(service: SheetManagementService = Depends(get_sheet_management_service)):
    """Lấy danh sách toàn bộ Groups từ Sheet Tổng"""
    try:
        groups_data = await service.get_all_groups()
       
        return {
            "status": "success",
            "message": "Lấy danh sách Groups thành công.",
            "data": groups_data
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Lỗi khi lấy danh sách Groups: {str(e)}",
            "data": []
        }
@sheet_management_router.post("/groups/bulk-add", status_code=status.HTTP_200_OK)
async def api_bulk_add_groups(
    payload: BulkAddGroupPayload, 
    service: SheetManagementService = Depends(get_sheet_management_service)
):
    # Ép kiểu pydantic models sang mảng dictionary
    groups_data = [g.dict() for g in payload.groups]
    
    try:
        # Gọi Service xử lý
        total_added, h24_added, total_skipped = await service.bulk_add_groups(groups_data)
        
        if total_added == 0 and total_skipped > 0:
            return {
                "success": "error",
                "message": f"Toàn bộ {total_skipped} Group gửi lên đều đã tồn tại trên hệ thống!"
            }

        # Trả về thành công nếu không có Exception nào văng ra
        msg = f"Đã thêm {total_added} groups vào Sheet Tổng và {h24_added} groups vào Sheet 24h."
        if total_skipped > 0:
            msg += f" (Bỏ qua {total_skipped} group bị trùng)."

        return {
            "success": "success", 
            "message": msg,
            "data": {
                "total_sheet_added": total_added,
                "h24_sheet_added": h24_added,
                "total_skipped": total_skipped
            }
        }
    except Exception as e:
        # Bắt toàn bộ lỗi từ Service/Google Sheet ném lên
        # Trả về mã 500 Internal Server Error cho Frontend
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    

@sheet_management_router.delete("/groups/bulk-delete", status_code=status.HTTP_200_OK)
async def api_bulk_delete_groups(
    payload: BulkDeleteGroupPayload, 
    service: SheetManagementService = Depends(get_sheet_management_service)
):
    await service.bulk_delete_groups(payload.urls)
    
    return {
        "status": "success", 
        "message": f"Đã thực thi lệnh xóa cho {len(payload.urls)} URL."
    }

# ==========================================
# 2. API QUẢN LÝ INTENT
# ==========================================

@sheet_management_router.get("/intents", response_model=GetIntentsResponse, status_code=status.HTTP_200_OK)
async def api_get_all_intents(service: SheetManagementService = Depends(get_sheet_management_service)):
    """Lấy danh sách toàn bộ Intents từ Google Sheet"""
    try:
        intents_data = await service.get_all_intents()
        return {
            "status": "success",
            "message": "Lấy danh sách Intents thành công.",
            "data": intents_data
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Lỗi khi lấy danh sách Intents: {str(e)}",
            "data": []
        }
@sheet_management_router.post("/intents/bulk-add", status_code=status.HTTP_200_OK)
async def api_bulk_add_intents(
    payload: BulkAddIntentPayload, 
    service: SheetManagementService = Depends(get_sheet_management_service)
):
    intents_data = [item.dict() for item in payload.intents]
    
    success = await service.bulk_add_intents(intents_data)
    if success:
        return {"status": "success", "message": f"Đã thêm {len(intents_data)} Intents.", "data": intents_data}
    return {"status": "error", "message": "Thêm Intent thất bại."}

@sheet_management_router.delete("/intents/bulk-delete", status_code=status.HTTP_200_OK)
async def api_bulk_delete_intents(
    payload: BulkDeleteIntentPayload, 
    service: SheetManagementService = Depends(get_sheet_management_service)
):
    success = await service.bulk_delete_intents(payload.intents)
    if success:
        return {"status": "success", "message": f"Đã xóa {len(payload.intents)} Intents."}
    return {"status": "error", "message": "Xóa Intent thất bại."}


# ==========================================
# 3. API QUẢN LÝ DANH MỤC (CATEGORIES)
#    Dùng chung sheet LinkedIn cho cả FB & LI
# ==========================================
from app.shared.services.category_sheet_service import CategorySheetService
import asyncio as _asyncio

def _get_category_service() -> CategorySheetService:
    return CategorySheetService()

@sheet_management_router.get("/categories", response_model=GetCategoriesResponse, status_code=status.HTTP_200_OK)
async def api_get_all_categories():
    """Lấy danh sách tất cả danh mục từ Google Sheet (shared LinkedIn sheet)."""
    try:
        svc = _get_category_service()
        data = await _asyncio.to_thread(svc.get_all_categories)
        return {"status": "success", "message": "Lấy danh sách danh mục thành công.", "data": data}
    except Exception as e:
        return {"status": "error", "message": f"Lỗi khi lấy danh mục: {str(e)}", "data": {}}

@sheet_management_router.post("/categories/add", status_code=status.HTTP_200_OK)
async def api_add_category(payload: AddCategoryPayload):
    """Thêm một danh mục mới vào Google Sheet."""
    svc = _get_category_service()
    success = await _asyncio.to_thread(
        svc.add_record,
        payload.category_type,
        payload.value,
        payload.name,
        payload.platform or "",
    )
    if success:
        return {
            "status": "success",
            "message": f"Đã thêm danh mục '{payload.value}' thành công.",
            "data": {"category_type": payload.category_type, "value": payload.value, "name": payload.name},
        }
    return {"status": "error", "message": "Thêm danh mục thất bại (có thể đã tồn tại hoặc lỗi hệ thống)."}

@sheet_management_router.put("/categories/update", status_code=status.HTTP_200_OK)
async def api_update_category(payload: UpdateCategoryPayload):
    """Cập nhật một danh mục trong Google Sheet."""
    svc = _get_category_service()
    success = await _asyncio.to_thread(
        svc.update_record,
        payload.category_type,
        payload.value,
        payload.name,
        payload.platform or "",
    )
    if success:
        return {
            "status": "success",
            "message": f"Đã cập nhật danh mục '{payload.value}' thành công.",
            "data": {"category_type": payload.category_type, "value": payload.value, "name": payload.name},
        }
    return {"status": "error", "message": "Cập nhật danh mục thất bại."}

@sheet_management_router.delete("/categories/delete", status_code=status.HTTP_200_OK)
async def api_delete_category(
    payload: DeleteCategoryPayload,
    service: SheetManagementService = Depends(get_sheet_management_service)
):
    """Xóa một danh mục khỏi Google Sheet."""
    svc = _get_category_service()
    success = await _asyncio.to_thread(
        svc.delete_record,
        payload.category_type,
        payload.value,
    )
    if success:
        # Cascade delete groups and posts
        await service.delete_groups_and_posts_by_category(payload.category_type, payload.value)
        return {"status": "success", "message": f"Đã xóa danh mục '{payload.value}' thành công và các groups/posts liên quan."}
    return {"status": "error", "message": "Xóa danh mục thất bại."}


from app.modules.facebook.src.modules.facebook.services.FacebookInteractor import FacebookInteractor, InteractionResult,InteractionTarget
@sheet_management_router.post("/posts/interact", status_code=status.HTTP_200_OK)
async def auto_interact(req_data: dict,service: SheetManagementService = Depends(get_sheet_management_service)):
    """
    Payload gửi lên mẫu:
    {
        "id": "USER_001_TASK_99",
        "url": "https://www.facebook.com/groups/.../posts/...",
        "reaction": "LOVE",
        "comment": "Tuyệt vời quá!",
        "email": "user@example.com",
        "password": "password123",
        "two_fa": "123456",
        "name": "Tên người dùng (dùng để lưu vào lịch sử tương tác)"
    }
    """
   
    check= await service.check_comment_within_24h(req_data.get("url", ""), req_data.get("id", ""))
    if check==False:
            return {
                "success": "error",
                "message": "Comment đã tồn tại trong vòng 24h qua, không thực hiện tương tác.",
            }
    # 1. Bọc dữ liệu từ Request vào Dataclass
    target = InteractionTarget(
        id=str(req_data.get("id", "UNKNOWN_ID")),
        url=req_data.get("url", ""),
        reaction_type=req_data.get("reaction", "LIKE"),
        comment_content=req_data.get("comment", "")
    )
    
    email = req_data.get("email", "") or ""
    password = req_data.get("password", "") or ""
    two_fa = req_data.get("two_fa", "") or ""

    # 2. Chạy luồng tương tác
    interactor = FacebookInteractor(config=Config)
    result =await run_in_threadpool( interactor.interact_with_post,
        target=target,
        custom_email=email,
        custom_pass=password,
        custom_2fa=two_fa
    )
    
    # 3. CHỖ NÀY BẠN XỬ LÝ LƯU LÊN GOOGLE SHEETS
    # Dùng result.id để biết đang cập nhật cho ai
    # Ví dụ: google_sheets_service.update_row(id=result.id, status=result.status_code, message=result.message)
    print(f"Cần update Google Sheet: ID={result.id} | Trạng thái={result.success} | Lỗi={result.status_code}")

    # 4. Trả về Response cho phía gọi API
    if result.success:

        #  cập nhật vào sheet lịch sử tương tác (History Sheet) và kiểm tra xem có cần cộng điểm vào User Score Sheet hay không
        await service.bulk_process_comments_and_scores([
            {
                "id":str(req_data.get("id", "")),
                "url_post": req_data.get("url", ""),
                "comment": req_data.get("comment", ""),
                "reaction": req_data.get("reaction", "LIKE"),
                "name": req_data.get("name", "")
            }
        ])
        return {
            
            "success": "success",
            "message": result.message, 
           
        }
    else:
        return {
           
            "success": "error",
            "message": result.message, 
           
        }
    


@sheet_management_router.get("/user-scores", status_code=status.HTTP_200_OK)
async def api_get_all_user_scores(service: SheetManagementService = Depends(get_sheet_management_service)):
    """
    Lấy danh sách điểm số của User từ Sheet User_Scores hiện tại.
    Trả về mảng dictionary gồm: id, name, score/week.
    """
    try:
        user_scores_data = await service.get_all_user_scores()
        print(f"DEBUG: Dữ liệu user_scores_data: {user_scores_data}")
        return {
            "status": "success",
            "message": "Lấy danh sách User Scores thành công.",
            "data": user_scores_data
        }
        
    except Exception as e:
        # Ghi log lỗi nếu cần thiết
        print(f"ERROR: Lỗi khi lấy danh sách User Scores: {str(e)}")
        return {
            "status": "error",
            "message": f"Lỗi khi lấy danh sách User Scores: {str(e)}",
            "data": []
        }