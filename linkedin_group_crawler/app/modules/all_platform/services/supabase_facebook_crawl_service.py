import logging
from typing import List
from datetime import datetime, timedelta, timezone
import re

from app.core.supabase_client import get_supabase_client
from app.modules.facebook.src.modules.crawl_fb.models.GroupSummary import GroupSummary

logger = logging.getLogger(__name__)

def parse_facebook_time(time_str: str) -> str | None:
    if not time_str:
        return None
        
    time_str = time_str.strip().lower()
    now = datetime.now(timezone.utc)
    
    try:
        # 1. "Vừa xong"
        if "vừa xong" in time_str:
            return now.isoformat()
            
        # 2. Phút
        match = re.search(r'(\d+)\s*phút', time_str)
        if match:
            mins = int(match.group(1))
            return (now - timedelta(minutes=mins)).isoformat()
            
        # 3. Giờ
        match = re.search(r'(\d+)\s*giờ', time_str)
        if match:
            hours = int(match.group(1))
            return (now - timedelta(hours=hours)).isoformat()
            
        # 4. Ngày
        match = re.search(r'(\d+)\s*ngày', time_str)
        if match:
            days = int(match.group(1))
            return (now - timedelta(days=days)).isoformat()
            
        # 5. Tuần
        match = re.search(r'(\d+)\s*tuần', time_str)
        if match:
            weeks = int(match.group(1))
            return (now - timedelta(weeks=weeks)).isoformat()
            
        # 6. Hôm qua
        if "hôm qua" in time_str:
            base_time = now - timedelta(days=1)
            time_match = re.search(r'lúc\s*(\d{1,2}):(\d{2})', time_str)
            if time_match:
                h, m = int(time_match.group(1)), int(time_match.group(2))
                base_time = base_time.replace(hour=h, minute=m)
            return base_time.isoformat()
            
        # 7. Ngày tháng (Ví dụ: 12 tháng 5 lúc 10:00)
        match = re.search(r'(\d{1,2})\s*tháng\s*(\d{1,2})', time_str)
        if match:
            day, month = int(match.group(1)), int(match.group(2))
            
            # Check for year
            year_match = re.search(r'năm\s*(\d{4})', time_str)
            if year_match:
                year = int(year_match.group(1))
            else:
                year = now.year
                
            base_time = now.replace(year=year, month=month, day=day)
            
            # Check for time
            time_match = re.search(r'lúc\s*(\d{1,2}):(\d{2})', time_str)
            if time_match:
                h, m = int(time_match.group(1)), int(time_match.group(2))
                base_time = base_time.replace(hour=h, minute=m)
                
            # Future date correction (if article is from previous year)
            if base_time > now:
                base_time = base_time.replace(year=year - 1)
                
            return base_time.isoformat()
            
        # 8. ISO Format / Other valid formats
        # If it doesn't match Vietnamese relative formats, we'll return it as-is 
        # and let Postgres handle it (or fail if invalid, but we catch below)
        return time_str
    except Exception as e:
        logger.warning(f"Failed to parse time string: {time_str} - {e}")
        return None

def save_facebook_crawl_to_supabase(user_id: str, summaries: List[GroupSummary]) -> dict:
    """
    Save Facebook crawl results (hot posts) to Supabase facebook_posts table.
    Inherits taxonomy (intent, industry, team, tier, icp) from facebook_groups.
    """
    if not summaries:
        return {"total_posts": 0, "errors": []}

    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Get all group URLs to fetch their taxonomy
    group_urls = [s.link_group for s in summaries if s.link_group]
    groups_db = []
    if group_urls:
        res = supabase.table("facebook_groups").select("*").in_("group_url", group_urls).execute()
        groups_db = res.data or []
        
    group_map = {g.get("group_url"): g for g in groups_db if g.get("group_url")}
    
    # 2. Get existing posts to avoid duplicates
    all_post_urls = [s.hot_post.url for s in summaries if s.hot_post and s.hot_post.url]
    existing_urls = set()
    if all_post_urls:
        res_existing = supabase.table("facebook_posts").select("post_url").in_("post_url", all_post_urls).execute()
        existing_urls = {p["post_url"] for p in (res_existing.data or []) if p.get("post_url")}
    
    posts_to_insert = []
    errors = []
    duplicates = 0
    
    for summary in summaries:
        if not summary.hot_post:
            continue
            
        group_url = summary.link_group
        db_group = group_map.get(group_url, {})
        group_id = db_group.get("id")
        
        post = summary.hot_post
        
        if post.url in existing_urls:
            duplicates += 1
            continue
        
        # Format post.date properly if needed, parsing Vietnamese relative times
        post_time = parse_facebook_time(post.date) if post.date else None
        
        post_data = {
            "group_id": group_id,
            "post_url": post.url,
            "crawl_date": now_iso,
            "post_time": post_time,
            "content": post.content,
            "score": post.score,
            "reactions": post.reactions,
            "comments": post.comments,
            "shares": post.shares,
            "media_url": None,
            "image_urls": [],
            "created_at": now_iso,
            "updated_at": now_iso,
            "id_member": summary.id_member or user_id
        }
        
        # Chỉ chèn các bài có group_id để đảm bảo Foreign Key Constraint (nếu có)
        if group_id:
            posts_to_insert.append(post_data)
        
    if posts_to_insert:
        try:
            res = supabase.table("facebook_posts").insert(posts_to_insert).execute()
            return {"total_posts": len(res.data or []), "errors": errors, "duplicates": duplicates}
        except Exception as e:
            logger.error(f"Error saving FB posts to Supabase: {e}")
            errors.append(str(e))
            
    return {"total_posts": 0, "errors": errors, "duplicates": duplicates}
