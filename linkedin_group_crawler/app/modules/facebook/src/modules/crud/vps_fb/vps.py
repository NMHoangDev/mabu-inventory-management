from typing import List, Dict, Any, Optional
from app.core.supabase_client import get_supabase_client, execute_supabase_query

def get_all_vps() -> List[Dict[str, Any]]:
    """
    Lấy danh sách tất cả VPS dùng cho VNC/Remote.
    """
    client = get_supabase_client()
    
    def fetch():
        response = client.table("vps").select("*").execute()
        return response.data

    return execute_supabase_query(fetch)

def get_vps_by_id(vps_id: str) -> Dict[str, Any]:
    """
    Lấy thông tin một VPS theo ID.
    """
    client = get_supabase_client()
    
    def fetch():
        response = client.table("vps").select("*").eq("id", vps_id).single().execute()
        return response.data

    return execute_supabase_query(fetch)

def create_vps(vps_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Tạo mới một VPS.
    """
    client = get_supabase_client()
    
    def insert():
        response = client.table("vps").insert(vps_data).execute()
        return response.data

    return execute_supabase_query(insert)

def update_vps(vps_id: str, update_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Cập nhật VPS theo ID.
    """
    client = get_supabase_client()
    
    if not update_data:
        return []
        
    def update():
        response = client.table("vps").update(update_data).eq("id", vps_id).execute()
        return response.data

    return execute_supabase_query(update)

def delete_vps(vps_id: str) -> List[Dict[str, Any]]:
    """
    Xóa VPS theo ID.
    """
    client = get_supabase_client()
    
    def delete():
        response = client.table("vps").delete().eq("id", vps_id).execute()
        return response.data

    return execute_supabase_query(delete)
