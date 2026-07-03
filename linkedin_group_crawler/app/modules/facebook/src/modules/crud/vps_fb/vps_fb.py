from typing import List, Dict, Any, Optional
from app.core.supabase_client import get_supabase_client, execute_supabase_query

def get_all_vps_fb() -> List[Dict[str, Any]]:
    """
    Lấy danh sách tất cả VPS và đếm số lượng cookie thuộc mỗi VPS.
    """
    client = get_supabase_client()
    
    def fetch():
        # Fetch VPS cùng với bảng Vps_cookies để đếm
        response = client.table("Vps_fb1").select("*, Vps_cookies(id, status, email)").execute()
        return response.data

    data = execute_supabase_query(fetch)
    
    result = []
    for item in data:
        cookies = item.get("Vps_cookies", [])
        item["cookie_count"] = len(cookies) if cookies else 0
        
        # Đếm số cookie lỗi (status = 'error')
        item["error_cookie_count"] = sum(1 for c in cookies if c.get("status") == "error") if cookies else 0
        
        result.append(item)
        
    return result

def create_vps_fb(vps_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Tạo mới một VPS.
    vps_data ví dụ: {"name": "vps1", "http": "http://...", "active_session": 1, "active": True}
    """
    client = get_supabase_client()
    
    def insert():
        response = client.table("Vps_fb1").insert(vps_data).execute()
        return response.data

    return execute_supabase_query(insert)

def update_vps_fb(vps_id: int, update_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Cập nhật VPS theo ID.
    """
    client = get_supabase_client()
    
    if not update_data:
        return []
        
    def update():
        response = client.table("Vps_fb1").update(update_data).eq("id", vps_id).execute()
        return response.data

    return execute_supabase_query(update)

def delete_vps_fb(vps_id: int) -> List[Dict[str, Any]]:
    """
    Xóa VPS theo ID.
    """
    client = get_supabase_client()
    
    def delete():
        response = client.table("Vps_fb1").delete().eq("id", vps_id).execute()
        return response.data

    return execute_supabase_query(delete)
