"""Extension crawl router — handles extension-initiated crawl requests."""

from __future__ import annotations

import logging
import re
import uuid
import asyncio
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.core.supabase_client import get_supabase_client
from app.modules.all_platform.websocket import manager
from app.modules.all_platform.services.supabase_facebook_crawl_service import parse_facebook_time

logger = logging.getLogger(__name__)

router = APIRouter()

class ExtensionPost(BaseModel):
    post_url: Optional[str] = None
    url: Optional[str] = None
    author_name: Optional[str] = ""
    author_url: Optional[str] = ""
    timestamp_raw: Optional[str] = ""
    date: Optional[str] = None
    timestamp_class: Optional[str] = "unknown"
    content: Optional[str] = ""
    reactions: Optional[int] = 0
    comments: Optional[int] = 0
    shares: Optional[int] = 0
    images: Optional[List[str]] = []
    video_url: Optional[str] = None
    media_url: Optional[str] = None
    group_url: Optional[str] = None
    crawled_at: Optional[str] = None

class ExtensionCrawlRequest(BaseModel):
    posts: List[ExtensionPost]
    group_name: Optional[str] = None
    group_url: Optional[str] = None
    group_id: Optional[str] = None
    id_member: Optional[str] = None
    extension_version: Optional[str] = None

def sync_process_and_save_posts_db(payload: ExtensionCrawlRequest, legacy: bool):
    """
    Chạy các lệnh Supabase (đồng bộ) trong một thread riêng để không block EventLoop của asyncio.
    Giúp tránh lỗi [WinError 10035] WSAEWOULDBLOCK trên Windows.
    """
    supabase = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Resolve group_id
    group_id = payload.group_id
    group_url = payload.group_url
    if not group_id and group_url:
        try:
            res = supabase.table("facebook_groups").select("id").eq("group_url", group_url).execute()
            if res.data:
                group_id = res.data[0].get("id")
        except Exception as e:
            logger.error(f"Error fetching group id for {group_url}: {e}")

    # 2. Get existing post_urls to avoid duplicate insertion
    all_post_urls = [p.post_url or p.url for p in payload.posts if (p.post_url or p.url)]
    existing_urls = set()
    if all_post_urls:
        try:
            res_existing = supabase.table("facebook_posts").select("post_url").in_("post_url", all_post_urls).execute()
            existing_urls = {item["post_url"] for item in (res_existing.data or []) if item.get("post_url")}
        except Exception as e:
            logger.warning(f"Could not check existing urls in facebook_posts: {e}")


    # 4. Lọc bài viết: chỉ giữ bài TRONG NGÀY HÔM NAY (giờ Việt Nam UTC+7)
    vietnam_tz = timezone(timedelta(hours=7))
    now_vn = datetime.now(vietnam_tz)
    today_vn_str = now_vn.strftime('%Y-%m-%d')

    today_posts = []  # List of (post, raw_time_str)
    skipped_old = 0
    skipped_no_time = 0

    for p in payload.posts:
        post_url = p.post_url or p.url
        if not post_url or post_url in existing_urls:
            continue

        raw_time = p.timestamp_raw or p.date or None
        if not raw_time:
            skipped_no_time += 1
            continue

        try:
            # Extension gửi ISO: "2026-06-29T08:50:42.000Z"
            # Supabase lưu:      "2026-06-29 08:50:42+00"
            # Chuẩn hoá để Python fromisoformat() đọc được:
            clean = raw_time.replace('Z', '+00:00')   # bỏ Z
            clean = re.sub(r'\.\d+', '', clean)        # bỏ .000 milliseconds
            clean = clean.replace(' ', 'T')            # thay space bằng T nếu cần

            dt_utc = datetime.fromisoformat(clean)
            if dt_utc.tzinfo is None:
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)

            dt_vn = dt_utc.astimezone(vietnam_tz)
            post_date_vn = dt_vn.strftime('%Y-%m-%d')

            if post_date_vn != today_vn_str:
                skipped_old += 1
                continue

            today_posts.append((p, raw_time))
        except Exception as e:
            logger.warning(f"[DATE-FILTER] Không parse được '{raw_time}': {e}")
            skipped_no_time += 1
            continue

    logger.info(
        f"[FILTER] Tổng={len(payload.posts)} | Trùng URL={len(existing_urls)} "
        f"| Bài cũ (không phải hôm nay)={skipped_old} | Không có time={skipped_no_time} "
        f"| Bài HÔM NAY={len(today_posts)} (today_vn={today_vn_str})"
    )

    # 5. Sắp xếp bài hôm nay theo Reactions + Comments (cao nhất lên đầu)
    today_posts.sort(key=lambda x: (x[0].reactions or 0, x[0].comments or 0), reverse=True)

    # 6. Chỉ lấy tối đa 3 bài xịn nhất
    top_posts = today_posts[:3]
    top_posts_objects = [p for p, raw_time in top_posts]

    # 7. Resolve authors (chỉ lấy tác giả cho những bài top 3 sẽ lưu)
    author_urls = [p.author_url for p in top_posts_objects if p.author_url and p.author_url.strip()]
    author_map = {}
    if author_urls:
        try:
            res_authors = supabase.table("author_post").select("id, url_profile").in_("url_profile", author_urls).execute()
            author_map = {item["url_profile"]: item["id"] for item in (res_authors.data or [])}
            logger.info(f"[AUTHOR] Tìm thấy {len(author_map)} tác giả đã có trong DB cho top 3")
        except Exception as e:
            logger.warning(f"Error fetching authors: {e}")

    new_authors = []
    for p in top_posts_objects:
        url = p.author_url.strip() if p.author_url else ""
        name = p.author_name.strip() if p.author_name else ""
        logger.info(f"[AUTHOR-DEBUG] author_name='{name}' | author_url='{url}'")
        
        if url and url not in author_map:
            new_id = str(uuid.uuid4())
            author_map[url] = new_id
            new_authors.append({
                "id": new_id,
                "name": name or "Ẩn danh",
                "url_profile": url,
                "create_at": now_iso
            })
        elif not url and name and name not in ("Ẩn danh", ""):
            fallback_key = f"__name__{name}"
            if fallback_key not in author_map:
                new_id = str(uuid.uuid4())
                author_map[fallback_key] = new_id
                new_authors.append({
                    "id": new_id,
                    "name": name,
                    "url_profile": fallback_key,
                    "create_at": now_iso
                })
            
    if new_authors:
        unique_new_authors = list({a["url_profile"]: a for a in new_authors}.values())
        logger.info(f"[AUTHOR] Đang insert {len(unique_new_authors)} tác giả mới cho top 3")
        inserted_author_urls = set()
        try:
            supabase.table("author_post").insert(unique_new_authors, upsert=False).execute()
            inserted_author_urls = {a["url_profile"] for a in unique_new_authors}
            logger.info(f"[AUTHOR] Insert thành công {len(inserted_author_urls)} tác giả")
        except Exception as e:
            logger.warning(f"[AUTHOR] Insert author lỗi: {e} — Đang thử insert từng người một...")
            for a in unique_new_authors:
                try:
                    supabase.table("author_post").insert(a).execute()
                    inserted_author_urls.add(a["url_profile"])
                except Exception as e2:
                    logger.warning(f"[AUTHOR] Bỏ qua '{a['url_profile']}': {e2}")
        
        for a in unique_new_authors:
            if a["url_profile"] not in inserted_author_urls:
                author_map.pop(a["url_profile"], None)
                logger.warning(f"[AUTHOR] Đã xoá UUID ảo cho '{a['url_profile']}' khỏi author_map")

    # 8. Chuẩn bị dữ liệu để insert vào Supabase
    posts_to_insert = []
    for p, raw_time in top_posts:
        post_url = p.post_url or p.url
        author_url_key = (p.author_url or "").strip()
        author_name_key = (p.author_name or "").strip()
        # Tìm id_author: ưu tiên URL, sau đó fallback theo tên
        id_author = (
            author_map.get(author_url_key) or
            (author_map.get(f"__name__{author_name_key}") if author_name_key and author_name_key not in ("Ẩn danh", "") else None)
        )
        logger.info(f"[SAVE-AUTHOR] post={post_url[:60]} | author_url='{author_url_key}' | id_author={id_author}")
        post_data = {
            "group_id": group_id,
            "post_url": post_url,
            "crawl_date": now_iso,
            "post_time": raw_time,
            "content": p.content,
            "score": 0,
            "reactions": p.reactions,
            "comments": p.comments,
            "shares": p.shares,
            "media_url": p.video_url or p.media_url,
            "image_urls": p.images or [],
            "created_at": p.crawled_at if legacy else now_iso,
            "updated_at": now_iso,
            "id_author": id_author,
            "id_member": payload.id_member or None
        }
        posts_to_insert.append(post_data)

    logger.info(f"[SAVE] Sẽ lưu {len(posts_to_insert)} bài (top 3 hôm nay) vào DB")

    inserted_count = 0
    inserted_post_urls = []
    if posts_to_insert:
        try:
            res = supabase.table("facebook_posts").insert(posts_to_insert).execute()
            inserted_count = len(res.data or [])
            if res.data:
                inserted_post_urls = [p.get("post_url") for p in res.data if p.get("post_url")]
        except Exception as e:
            logger.error(f"Error saving to facebook_posts: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return inserted_count, inserted_post_urls

async def process_and_save_posts(payload: ExtensionCrawlRequest, event_name: str, legacy: bool = False):
    # Offload sync Supabase DB calls to a separate thread to prevent blocking Uvicorn Asyncio EventLoop
    inserted_count, inserted_post_urls = await asyncio.to_thread(sync_process_and_save_posts_db, payload, legacy)

    # Realtime WebSocket Broadcast
    msg_prefix = "Legacy: " if legacy else ""
    await manager.broadcast({
        "event": event_name,
        "platform": "facebook",
        "group_url": payload.group_url,
        "group_name": payload.group_name,
        "posts_count": inserted_count,
        "post_urls": inserted_post_urls,
        "message": f"{msg_prefix}Đã lưu {inserted_count} bài viết từ {payload.group_name}"
    })

    return {"success": True, "count": inserted_count, "post_urls": inserted_post_urls}

@router.post("/save-posts")
async def save_posts(
    payload: ExtensionCrawlRequest,
    x_api_key: Optional[str] = Header(None)
):
    """Lưu bài viết vào bảng facebook_posts (schema mới)."""
    if x_api_key != "markee-extension-key-2024":
        logger.warning(f"Invalid API Key: {x_api_key}")
        raise HTTPException(status_code=403, detail="Invalid API Key")

    return await process_and_save_posts(payload, event_name="extension_crawl_saved", legacy=False)

@router.post("/crawl-result")
async def crawl_result(
    payload: ExtensionCrawlRequest,
    x_api_key: Optional[str] = Header(None)
):
    """Lưu bài viết vào bảng facebook_posts (Legacy)."""
    if x_api_key != "markee-extension-key-2024":
        logger.warning(f"Invalid API Key: {x_api_key}")
        raise HTTPException(status_code=403, detail="Invalid API Key")

    return await process_and_save_posts(payload, event_name="extension_crawl_saved_legacy", legacy=True)
