import logging
from typing import List, Dict, Any, Optional
from app.core.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

def get_all_customer_leads(current_user: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        query = supabase.table("customer_leads").select(
            "*, leader:leaded_by(name), sdr:sdr_id(name)"
        ).order("created_at", desc=True)
        
        if current_user and current_user.get("role") not in ["admin", "leader"]:
            user_id = current_user.get("id")
            if user_id:
                query = query.or_(f"leaded_by.eq.{user_id},sdr_id.eq.{user_id}")
                
        res = query.execute()
        
        data = res.data or []
        for row in data:
            if row.get("leader"):
                row["leader_name"] = row["leader"].get("name")
            if row.get("sdr"):
                row["sdr_name"] = row["sdr"].get("name")
        return data
    except Exception as e:
        logger.error(f"Error getting customer leads: {e}")
        return []

def get_customer_lead_by_id(lead_id: str) -> Optional[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        res = supabase.table("customer_leads").select(
            "*, leader:leaded_by(name), sdr:sdr_id(name)"
        ).eq("id", lead_id).execute()
        
        if res.data and len(res.data) > 0:
            row = res.data[0]
            if row.get("leader"):
                row["leader_name"] = row["leader"].get("name")
            if row.get("sdr"):
                row["sdr_name"] = row["sdr"].get("name")
            return row
        return None
    except Exception as e:
        logger.error(f"Error getting customer lead {lead_id}: {e}")
        return None

def create_customer_lead(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        res = supabase.table("customer_leads").insert(data).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception as e:
        logger.error(f"Error creating customer lead: {e}")
        raise e

def update_customer_lead(lead_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        # Remove any None values to avoid overwriting with null unless explicitly passed
        clean_data = {k: v for k, v in data.items() if v is not None}
        res = supabase.table("customer_leads").update(clean_data).eq("id", lead_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception as e:
        logger.error(f"Error updating customer lead {lead_id}: {e}")
        raise e

def delete_customer_lead(lead_id: str) -> bool:
    try:
        supabase = get_supabase_client()
        res = supabase.table("customer_leads").delete().eq("id", lead_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting customer lead {lead_id}: {e}")
        return False

def get_all_sdrs() -> List[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        res = supabase.table("app_users").select("id, name, role").in_("role", ["admin", "leader"]).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error getting SDRs: {e}")
        return []
