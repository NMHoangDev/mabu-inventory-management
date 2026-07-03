from typing import List, Dict, Any, Optional
from app.core.supabase_client import get_supabase_client, execute_supabase_query

def get_all_vps_cookies() -> List[Dict[str, Any]]:
    """
    Lấy danh sách tất cả cookies.
    """
    client = get_supabase_client()
    
    def fetch():
        response = client.table("Vps_cookies").select("*").execute()
        return response.data

    return execute_supabase_query(fetch)

def get_vps_cookies_by_vps_id(vps_fb_id: int) -> List[Dict[str, Any]]:
    """
    Lấy danh sách cookies theo vps_fb_id.
    """
    client = get_supabase_client()
    
    def fetch():
        response = client.table("Vps_cookies").select("*").eq("vps_fb_id", vps_fb_id).execute()
        return response.data

    return execute_supabase_query(fetch)

def create_vps_cookie(cookie_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Tạo mới một cookie.
    Khi tạo, nếu VPS (Vps_fb1) liên kết đang có trạng thái active = false thì cập nhật thành true.
    """
    client = get_supabase_client()
    
    def insert():
        # 1. Thêm cookie mới
        response = client.table("Vps_cookies").insert(cookie_data).execute()
        inserted_data = response.data
        
        # 2. Cập nhật trạng thái VPS nếu cần
        vps_fb_id = cookie_data.get("vps_fb_id")
        if vps_fb_id:
            # Lấy thông tin vps hiện tại
            vps_res = client.table("Vps_fb1").select("active").eq("id", vps_fb_id).single().execute()
            if vps_res and vps_res.data:
                # Nếu VPS đang có active là False, tiến hành cập nhật lại thành True
                if vps_res.data.get("active") is False:
                    client.table("Vps_fb1").update({"active": True}).eq("id", vps_fb_id).execute()
                    
        return inserted_data

    return execute_supabase_query(insert)

def delete_vps_cookie(cookie_id: str) -> List[Dict[str, Any]]:
    """
    Xóa cookie theo ID (UUID).
    """
    client = get_supabase_client()
    
    def delete():
        response = client.table("Vps_cookies").delete().eq("id", cookie_id).execute()
        return response.data

    return execute_supabase_query(delete)
