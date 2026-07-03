import asyncio
import html
import logging
import os
from typing import List, Dict, Any
from datetime import datetime, timezone, timedelta

from app.core.supabase_client import get_supabase_client
from app.modules.all_platform.websocket import manager

# Sử dụng dịch vụ cào từ all_platform
from app.modules.all_platform.services.facebook_crawl_service import crawl_facebook_groups
from app.modules.facebook.src.modules.telegram.services.telegram_service import TelegramService

logger = logging.getLogger(__name__)

# ── CỜ CHỐNG CÀO CHỒNG LUỒNG ──────────────────────────────────────────────────
# Bug: scheduler chạy mỗi phút, nếu lượt cào trước CHƯA XONG mà lượt sau đã chạy
# thì 1 token bị mở nhiều luồng cùng lúc -> Facebook khóa token (treo acc).
# Giải pháp: chỉ cho 1 lượt cào chạy tại một thời điểm. Lượt mới đến mà đang cào -> bỏ qua.
_is_crawling: bool = False

def get_vietnam_now() -> datetime:
    """Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)."""
    return datetime.now(timezone(timedelta(hours=7)))


async def run_crawl_task_background(groups: List[Dict[str, Any]], user_id: str, involved_users_list: List[str]):
    """
    Tiến trình chạy nền thực hiện việc cào dữ liệu cho một danh sách nhóm cụ thể.
    Luôn nhả cờ _is_crawling khi kết thúc (dù thành công hay lỗi) để lượt sau chạy được.
    """
    global _is_crawling
    logger.info(f"▶️ Bắt đầu tiến trình chạy nền cào {len(groups)} nhóm cho user {user_id}")
    try:
        await _do_crawl(groups, user_id, involved_users_list)
    finally:
        _is_crawling = False
        logger.info("🏁 Đã nhả cờ cào (sẵn sàng cho lượt tiếp theo).")


async def _do_crawl(groups: List[Dict[str, Any]], user_id: str, involved_users_list: List[str]):
    """Phần thực thi cào (tách ra để run_crawl_task_background bọc finally nhả cờ)."""
    
    # Bắn socket báo bắt đầu cào
    asyncio.create_task(manager.broadcast({
        "event": "crawl_started",
        "message": f"Bắt đầu cào 24h tự động cho {len(groups)} nhóm Facebook",
        "count": len(groups),
        "involved_users": involved_users_list
    }))
    
    max_retries = 2
    result = None
    for attempt in range(max_retries + 1):
        try:
            result = await crawl_facebook_groups(
                groups=groups,
                user_id=user_id,
                involved_users_list=involved_users_list
            )
            
            # Kiểm tra xem có lỗi liên quan đến mạng không
            has_network_error = False
            if result and result.errors:
                for err in result.errors:
                    err_str = str(err).lower()
                    if "getaddrinfo" in err_str or "network" in err_str or "timeout" in err_str:
                        has_network_error = True
                        break
                        
            if has_network_error and attempt < max_retries:
                logger.warning(f"⚠️ [ALL-PLATFORM] Phát hiện lỗi mạng (Attempt {attempt+1}/{max_retries}). Đợi 5s rồi thử lại...")
                await asyncio.sleep(5)
                continue
            
            break  # Thành công hoặc không có lỗi mạng thì thoát loop
            
        except Exception as e:
            err_str = str(e).lower()
            if ("getaddrinfo" in err_str or "network" in err_str or "timeout" in err_str) and attempt < max_retries:
                logger.warning(f"⚠️ [ALL-PLATFORM] Bắt được Exception mạng (Attempt {attempt+1}/{max_retries}): {e}. Đợi 5s rồi thử lại...")
                await asyncio.sleep(5)
            else:
                if attempt == max_retries:
                    # Gửi báo lỗi Telegram nếu max retries
                    try:
                        telegram = TelegramService()
                        telegram.send_message(f"🚨 <b>LỖI CÀO NỀN (FB)</b> 🚨\n\n<code>{html.escape(str(e))}</code>")
                    except Exception:
                        pass
                    return
                else:
                    try:
                        telegram = TelegramService()
                        telegram.send_message(f"🚨 <b>LỖI CÀO NỀN (FB)</b> 🚨\n\n<code>{html.escape(str(e))}</code>")
                    except Exception:
                        pass
                    return # Lỗi khác thì văng luôn không cần retry
    
    if not result:
        logger.error("❌ Không lấy được kết quả sau các lần thử.")
        return

    # Đã báo cáo từng nhóm qua callback trong facebook_crawl_service.py
    logger.info(f"✅ HOÀN TẤT TIẾN TRÌNH CÀO FB CHO {len(groups)} NHÓM.")
    
    if result.errors and len(result.errors) > 0:
        for err in result.errors:
            logger.error(f"❌ Lỗi FB Crawl: {err}")


async def execute_all_platform_crawl_workflow():
    """
    Luồng cào tự động 24h cho All-Platform.
    Chạy mỗi phút để kiểm tra nhóm nào có giờ cào khớp với hiện tại.
    """
    # logger.info("🚀 [ALL-PLATFORM] KIỂM TRA LỊCH CÀO DỮ LIỆU TỰ ĐỘNG...")

    # Chống cào chồng: nếu lượt trước CHƯA XONG thì bỏ qua lượt này (tránh 1 token mở nhiều luồng -> FB khóa).
    global _is_crawling
    if _is_crawling:
        # logger.warning("⏭️ Lượt cào trước CHƯA XONG -> bỏ qua lượt này (chống cào chồng luồng).")
        return
    supabase = get_supabase_client()
    
    try:
        now = get_vietnam_now()
        
        # 1. Lấy tất cả nhóm Facebook được bật cào 24h
        res = supabase.table("facebook_groups").select("*").eq("chay_24h", True).execute()
        all_auto_groups = res.data or []
        
        # Gom tất cả nhóm vào chung 1 luồng duy nhất
        all_target_groups: List[Dict[str, Any]] = []
        all_involved_users: set = set()
        
        for row in all_auto_groups:
            start_time = row.get("start_time_in_day")
            end_time = row.get("end_time_in_day")
            time_crawl = row.get("time_crawl")
            end_date_str = row.get("end_date_hour")
            
            if start_time is None or end_time is None or time_crawl is None or time_crawl <= 0:
                continue

            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str[:10], "%Y-%m-%d").date()
                    if now.date() > end_date:
                        continue
                except ValueError:
                    pass

            now_minutes = now.hour * 60 + now.minute
            start_minutes = start_time * 60
            end_minutes = end_time * 60

            if start_minutes <= now_minutes <= end_minutes:
                if (now_minutes - start_minutes) % time_crawl == 0:
                    group_url = row.get("group_url", "").strip()
                    group_name = row.get("group_name", "Unknown").strip()
                    intent_val = str(row.get("id_intent", ""))
                    
                    if group_url:
                        # Lấy UUID hợp lệ từ cấu hình
                        user_id = str(row.get("id_member") or row.get("assignee_id") or "00000000-0000-0000-0000-000000000000")
                        
                        all_target_groups.append({
                            "name": group_name,
                            "url": group_url,
                            "Intent": intent_val,
                            "id_member": user_id
                        })
                        
                        # Thu thập ID của những người liên quan
                        id_member = row.get("id_member")
                        assignee_id = row.get("assignee_id")
                        co_assignee_id = row.get("co_assignee_id")
                        if id_member: all_involved_users.add(str(id_member))
                        if assignee_id: all_involved_users.add(str(assignee_id))
                        if co_assignee_id: all_involved_users.add(str(co_assignee_id))

        if not all_target_groups:
            return

        # 2. Đẩy luồng cào duy nhất ra background task
        logger.info(f"Phát hiện {len(all_target_groups)} nhóm cần cào. Đang gom vào 1 luồng duy nhất.")
        involved_users_list = list(all_involved_users)
        # Bật cờ NGAY TẠI ĐÂY (trước create_task) để lượt scheduler kế tiếp thấy "đang cào" mà bỏ qua,
        # tránh race condition nếu set cờ bên trong task (task có thể chạy sau lượt scheduler tiếp theo).
        _is_crawling = True
        asyncio.create_task(run_crawl_task_background(all_target_groups, "00000000-0000-0000-0000-000000000000", involved_users_list))

    except Exception as e:
        logger.error(f"❌ Thất bại trong lúc check scheduler: {e}", exc_info=True)
        try:
            telegram = TelegramService()
            telegram.send_message(f"🚨 <b>LỖI HỆ THỐNG CRON 24H (FB)</b> 🚨\n\n<code>{html.escape(str(e))}</code>")
        except Exception:
            pass


def setup_all_platform_jobs():
    """
    Khởi tạo scheduler cho All-Platform.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.executors.asyncio import AsyncIOExecutor

    executors = {
        'default': AsyncIOExecutor()
    }

    scheduler = AsyncIOScheduler(executors=executors)

    if os.getenv("DISABLE_ALL_PLATFORM_CRAWL_24H", "").strip().lower() in {"1", "true", "yes"}:
        logger.warning("All-Platform 24h crawl job disabled by DISABLE_ALL_PLATFORM_CRAWL_24H")
    else:
        # Thêm tác vụ cào 24h
        scheduler.add_job(
            func=execute_all_platform_crawl_workflow,
            trigger='cron',
            minute='*', # Chạy mỗi phút (chỉ KIỂM TRA lịch; việc cào thật được cờ _is_crawling chống chồng)
            id='all_platform_daily_facebook_crawl',
            replace_existing=True,
            max_instances=1  # CHỈ 1 lượt cào tại một thời điểm (chống 1 token mở nhiều luồng -> FB khóa acc)
        )

    # Chuyển job weekly backup từ module cũ sang để không làm đứt gãy logic
    from app.modules.facebook.src.jobs.daily_crawl_job import execute_weekly_backup_and_reset_workflow
    scheduler.add_job(
        func=execute_weekly_backup_and_reset_workflow,
        trigger='cron',
        day_of_week='sun', # Thực thi vào Chủ nhật
        hour=2,            # Lúc 2 giờ sáng
        minute=0,          # 00 phút
        id='weekly_user_score_backup_reset',
        replace_existing=True
    )

    logger.info(f"🕒 All-Platform Scheduler khởi động (Chế độ: AsyncIO).")
    scheduler.start()
