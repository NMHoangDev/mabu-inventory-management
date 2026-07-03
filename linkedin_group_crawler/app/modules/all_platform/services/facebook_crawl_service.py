"""Facebook crawl service for all-platform module.

Tái sử dụng FacebookScraper (Playwright) từ facebook module, sau đó lưu kết quả
vào Supabase qua save_facebook_crawl_to_supabase.

Luồng chuẩn:
  1. Chuyển groups[] thành GroupTarget[] (giữ nguyên Intent key).
  2. Gọi FacebookScraper.scrape_groups() trong threadpool (tránh block event loop).
  3. Gọi save_facebook_crawl_to_supabase() để lưu hot_post vào Supabase.
  4. Tổng hợp kết quả trả về, mỗi nhóm đều có trạng thái success/fail.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import List, Optional

from app.core.logger import get_logger
from app.modules.facebook.src.core.config.env import Config
from app.modules.facebook.src.modules.facebook.services.facebook_scraper import (
    FacebookScraper,
    GroupTarget,
)
from app.modules.all_platform.services.supabase_facebook_crawl_service import (
    save_facebook_crawl_to_supabase,
)

logger = get_logger(__name__)


# ── Result dataclasses ─────────────────────────────────────────────────────────

@dataclass
class CrawlGroupResult:
    """Kết quả cào cho một nhóm cụ thể."""
    group_url: str
    group_name: str
    success: bool
    posts_count: int = 0
    error: Optional[str] = None


@dataclass
class CrawlFacebookResult:
    """Kết quả tổng hợp toàn bộ session cào Facebook."""
    total_groups_ok: int
    total_groups_failed: int
    total_sessions_saved: int
    total_posts_saved: int
    total_duplicates: int = 0
    groups_results: List[CrawlGroupResult] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


# ── Core crawl function ────────────────────────────────────────────────────────

def crawl_sync(
    groups: List[dict],
    custom_email: Optional[str] = None,
    custom_pass: Optional[str] = None,
    loop: Optional[asyncio.AbstractEventLoop] = None,
    involved_users_list: Optional[List[str]] = None,
) -> List:
    targets: List[GroupTarget] = [
        GroupTarget(
            name=g.get("name", g.get("url", "")),
            url=g.get("url", ""),
            Intent=g.get("Intent", g.get("intent", "")),
            id_member=g.get("id_member", "")
        )
        for g in groups
        if g.get("url")
    ]

    if not targets:
        return []

    from app.core.supabase_client import get_supabase_client
    from app.modules.facebook.src.modules.telegram.services.telegram_service import TelegramService
    from app.modules.all_platform.websocket import manager

    def on_group_crawled(summary):
        # 1. Lưu DB ngay lập tức
        res = save_facebook_crawl_to_supabase("00000000-0000-0000-0000-000000000000", [summary])
        total_saved = res.get("total_posts", 0)
        total_duplicates = res.get("duplicates", 0)
        
        # 2. Gửi Telegram
        try:
            telegram = TelegramService()
            supabase = get_supabase_client()
            user_id = summary.id_member or "00000000-0000-0000-0000-000000000000"
            user_name = user_id
            if user_id != "00000000-0000-0000-0000-000000000000":
                user_res = supabase.table("app_users").select("name, email").eq("id", user_id).execute()
                if user_res.data:
                    user_name = user_res.data[0].get("name") or user_res.data[0].get("email") or user_id
            
            msg = f"✅ <b>[ALL-PLATFORM] BÁO CÁO CÀO 24H</b>\n"
            msg += f"• Nền tảng: Facebook\n"
            msg += f"• Nhóm: {summary.group_name}\n"
            msg += f"• Người thực thi: {user_name}\n"
            msg += f"• Số bài viết mới: {total_saved}\n"
            if total_duplicates > 0:
                msg += f"• Bỏ qua {total_duplicates} bài viết trùng lặp.\n"
            
            if summary.hot_post:
                content = summary.hot_post.content or ""
                if len(content) > 100:
                    content = content[:100] + "..."
                msg += f"\n📝 <i>{content}</i>\n"
                msg += f"👉 Tương tác: 👍 {summary.hot_post.reactions} | 💬 {summary.hot_post.comments}\n"
            
            telegram.send_message(msg)
        except Exception as e:
            logger.error(f"Lỗi gửi Tele callback: {e}")

        # 3. Gửi Socket
        if loop and not loop.is_closed():
            msg_broadcast = f"Đã cào xong {summary.group_name}: {total_saved} bài mới."
            if total_duplicates > 0:
                msg_broadcast += f" ({total_duplicates} bài trùng)"
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({
                    "event": "crawl_success",
                    "message": msg_broadcast,
                    "total_posts": total_saved,
                    "total_duplicates": total_duplicates,
                    "involved_users": involved_users_list or []
                }),
                loop
            )

    scraper = FacebookScraper(config=Config)
    return scraper.scrape_groups(
        groups=targets,
        custom_email=custom_email,
        custom_pass=custom_pass,
        client_id=None,
        on_group_crawled=on_group_crawled
    )


async def crawl_facebook_groups(
    groups: List[dict],
    user_id: str,
    custom_email: Optional[str] = None,
    custom_pass: Optional[str] = None,
    involved_users_list: Optional[List[str]] = None,
) -> CrawlFacebookResult:
    if not groups:
        return CrawlFacebookResult(
            total_groups_ok=0,
            total_groups_failed=0,
            total_sessions_saved=0,
            total_posts_saved=0,
            total_duplicates=0,
            groups_results=[],
            errors=["Không có nhóm nào hợp lệ để cào."],
        )

    loop = asyncio.get_running_loop()
    group_summaries = await asyncio.to_thread(
        crawl_sync,
        groups=groups,
        custom_email=custom_email,
        custom_pass=custom_pass,
        loop=loop,
        involved_users_list=involved_users_list
    )

    if not group_summaries:
        return CrawlFacebookResult(
            total_groups_ok=0,
            total_groups_failed=len(groups),
            total_sessions_saved=0,
            total_posts_saved=0,
            total_duplicates=0,
            groups_results=[],
            errors=["Scraper không trả về kết quả nào."],
        )

    save_errors: List[str] = []
    total_saved = 0
    total_duplicates = 0
    # Đã lưu trong callback, không gọi lại save_facebook_crawl_to_supabase ở đây nữa

    # 3. Tổng hợp kết quả từng nhóm
    groups_results: List[CrawlGroupResult] = []
    total_ok = 0
    total_failed = 0

    for summary in group_summaries:
        if summary.hot_post is not None:
            groups_results.append(CrawlGroupResult(
                group_url=summary.link_group,
                group_name=summary.group_name,
                success=True,
                posts_count=summary.total_posts_24h,
            ))
            total_ok += 1
        else:
            groups_results.append(CrawlGroupResult(
                group_url=summary.link_group,
                group_name=summary.group_name,
                success=False,
                posts_count=0,
                error="Không có bài viết nào trong 24h qua.",
            ))
            total_failed += 1

    return CrawlFacebookResult(
        total_groups_ok=total_ok,
        total_groups_failed=total_failed,
        total_sessions_saved=total_ok,
        total_posts_saved=total_saved,
        total_duplicates=total_duplicates,
        groups_results=groups_results,
        errors=save_errors,
    )
