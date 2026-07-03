import asyncio
import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta

# THAY ĐỔI: Sử dụng AsyncIOScheduler
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.executors.asyncio import AsyncIOExecutor

# Import các service
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_groups_service import GroupManagementSheetService
from app.modules.all_platform.services.supabase_facebook_crawl_service import save_facebook_crawl_to_supabase
from app.core.supabase_client import get_supabase_client
from app.modules.all_platform.websocket import manager

from app.modules.facebook.src.modules.gg_sheet.services.history_sheet_service import HistorySheetService
from app.modules.facebook.src.modules.gg_sheet.services.user_score_sheet_service import UserScoreSheetService
from app.modules.facebook.src.modules.facebook.services.facebook_scraper import FacebookScraper, GroupTarget
from app.modules.facebook.src.modules.telegram.services.telegram_service import TelegramService
from app.modules.facebook.src.core.config.env import Config
from app.modules.facebook.src.modules.crawl_fb.models.GroupSummary import GroupSummary




logger = logging.getLogger(__name__)

def execute_crawl_workflow():
    """
    Luồng công việc thực tế cào dữ liệu và báo cáo theo lịch tự động từ Supabase.
    Chạy mỗi phút để kiểm tra nhóm nào có giờ cào khớp với hiện tại.
    """
    logger.info("🚀 KIỂM TRA LỊCH CÀO DỮ LIỆU TỰ ĐỘNG...")
    telegram = TelegramService()
    supabase = get_supabase_client()
    
    try:
        now = datetime.now()
        current_time_str = now.strftime("%H:%M") # Ví dụ: "10:15"
        
        # Lấy tất cả nhóm được bật cào 24h
        res = supabase.table("facebook_groups").select("*").eq("chay_24h", True).execute()
        all_auto_groups = res.data or []
        
        target_groups: List[GroupTarget] = []
        for row in all_auto_groups:
            # Lấy các thiết lập cào
            start_time = row.get("start_time_in_day")
            end_time = row.get("end_time_in_day")
            time_crawl = row.get("time_crawl")
            end_date_str = row.get("end_date_hour")
            
            # Nếu thiếu thiết lập cần thiết thì bỏ qua
            if start_time is None or end_time is None or time_crawl is None or time_crawl <= 0:
                continue

            # Kiểm tra hạn end_date_hour
            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str[:10], "%Y-%m-%d").date()
                    if now.date() > end_date:
                        continue # Hết hạn
                except ValueError:
                    pass

            now_minutes = now.hour * 60 + now.minute
            start_minutes = start_time * 60
            end_minutes = end_time * 60

            # Điều kiện trong khung giờ VÀ đúng chu kỳ time_crawl
            if start_minutes <= now_minutes <= end_minutes:
                if (now_minutes - start_minutes) % time_crawl == 0:
                    group_url = row.get("group_url", "").strip()
                    group_name = row.get("group_name", "Unknown").strip()
                    intent_val = str(row.get("id_intent", ""))
                    if group_url:
                        target_groups.append(GroupTarget(name=group_name, url=group_url, Intent=intent_val))

        if not target_groups:
            # Không log error, chỉ kết thúc nhẹ nhàng nếu không có job vào phút này
            return

        # 3. Bắt đầu cào
        logger.info(f"Tổng cộng có {len(target_groups)} group cần cào.")
        
        # Bắn socket báo bắt đầu cào
        asyncio.create_task(manager.broadcast({
            "event": "crawl_started",
            "message": f"Bắt đầu cào 24h tự động cho {len(target_groups)} nhóm Facebook",
            "count": len(target_groups)
        }))
        
        scraper = FacebookScraper(Config)
        daily_summary_report: List[GroupSummary] = scraper.scrape_groups(target_groups)

        # 4. Gửi báo cáo và lưu Supabase
        if daily_summary_report:
            try:
                save_result = save_facebook_crawl_to_supabase("cronjob", daily_summary_report)
                total_posts = save_result.get("total_posts", 0)
                
                # Bắn socket báo xong
                asyncio.create_task(manager.broadcast({
                    "event": "crawl_success",
                    "message": f"Cào xong {len(target_groups)} nhóm, lưu được {total_posts} bài viết",
                    "total_posts": total_posts
                }))
                
                telegram.send_completion_notification()
                mes = telegram.format_daily_telegram_report(summaries=daily_summary_report)
                telegram.send_message(mes)
                logger.info("✅ HOÀN TẤT TIẾN TRÌNH LƯU SUPABASE.")
            except Exception as e:
                logger.error(f"❌ Lỗi khi lưu dữ liệu vào Supabase: {e}")
                asyncio.create_task(manager.broadcast({
                    "event": "crawl_error",
                    "message": f"Lỗi lưu dữ liệu: {e}"
                }))
        else:
            logger.warning("⚠️ Không thu được dữ liệu.")
            asyncio.create_task(manager.broadcast({
                "event": "crawl_success",
                "message": "Cào xong nhưng không có bài viết nào mới.",
                "total_posts": 0
            }))

    except Exception as e:
        logger.error(f"❌ Thất bại: {e}", exc_info=True)
        try:
            # FIX 2: Thêm 'await' khi gửi tin báo lỗi trong block except
             telegram.send_message(f"🚨 <b>LỖI HỆ THỐNG</b> 🚨\n\n<code>{str(e)}</code>")
        except: 
            pass


# ==============================================================================
# ✅ LUỒNG TÁC VỤ 3 THÊM MỚI: BACKUP VÀ RESET ĐIỂM SỐ HÀNG TUẦN (CHỦ NHẬT 2:00 AM)
# ==============================================================================
async def execute_weekly_backup_and_reset_workflow():
    """
    Tác vụ chạy ngầm hàng tuần:
    1. Đọc toàn bộ bảng User_Scores.
    2. Chuyển đổi DTO và đẩy sang bảng History.
    3. Reset toàn bộ điểm tuần về 0 cho bảng User_Scores cũ.
    """
    logger.info("📅 [WEEKLY JOB] BẮT ĐẦU QUY TRÌNH SAO LƯU VÀ RESET ĐIỂM TUẦN...")
    telegram = TelegramService()
    user_score_service = UserScoreSheetService()
    history_service = HistorySheetService()

    try:
        # 1. Đọc bảng điểm số hiện tại (Chạy trên Threadpool để tránh block Event Loop)
        user_scores: List[Dict[str, Any]] = await asyncio.to_thread(user_score_service.get_all_user_scores)
        
        if not user_scores:
            logger.warning("⚠️ Bảng điểm User_Scores trống hoặc không đọc được dữ liệu. Hủy quy trình backup.")
            return

        current_date_str = datetime.now().strftime("%Y-%m-%d")
        records_to_backup: List[Dict[str, str]] = []

        # 2. Ánh xạ (Mapping) cấu trúc header từ bảng điểm cũ sang cấu trúc lịch sử mới
        for row in user_scores:
            uid = row.get(Config.USER_COMMENT_HEADER_ID)
            name = row.get(Config.USER_COMMENT_HEADER_NAME)
            score = row.get(Config.USER_COMMENT_HEADER_SCORE_WEEK)

            if uid:
                records_to_backup.append({
                    "id": str(uid).strip(),
                    "name": str(name).strip(),
                    "score": str(score if score is not None else 0).strip(),
                    "date": current_date_str
                })

        if not records_to_backup:
            logger.warning("⚠️ Không tìm thấy bản ghi hợp lệ nào để sao lưu.")
            return

        # 3. Thực hiện Bulk Insert vào sheet History
        logger.info(f"📦 Đang sao lưu {len(records_to_backup)} bản ghi thành viên sang Sheet Lịch sử...")
        backup_success = await asyncio.to_thread(
            history_service.add_multiple_histories, 
            records_to_backup
        )

        if not backup_success:
            raise RuntimeError("Lỗi hệ thống khi đẩy dữ liệu lên Google Sheet History.")

        # 4. Sau khi backup thành công tuyệt đối -> Thực hiện reset điểm số về 0
        logger.info("🔄 Đang dọn dẹp và reset cột điểm tuần về 0...")
        reset_success = await asyncio.to_thread(user_score_service.reset_all_scores_to_zero)

        if reset_success:
            logger.info("✅ HOÀN TẤT CHU KỲ TUẦN. Đã sao lưu dữ liệu và đưa toàn bộ điểm về 0.")
            # Báo cáo trạng thái tốt qua Telegram channel
            telegram.send_message(
                f"📊 <b>BÁO CÁO CUỐI TUẦN</b> 📊\n\n"
                f"✅ Đã sao lưu thành công <code>{len(records_to_backup)}</code> tài khoản sang lịch sử.\n"
                f"🔄 Đã đưa toàn bộ điểm số tuần về 0."
            )
        else:
            logger.error("❌ Sao lưu thành công nhưng lệnh RESET điểm số về 0 thất bại.")

    except Exception as e:
        logger.error(f"❌ Thất bại trong quy trình xử lý cuối tuần: {e}", exc_info=True)
        try:
            telegram.send_message(f"🚨 <b>LỖI HỆ THỐNG CRON WEEKLY</b> 🚨\n\n<code>{str(e)}</code>")
        except Exception:
            pass
        
def setup_and_start_jobs():
    """
    Khởi tạo scheduler theo phong cách Async chuẩn Product.
    """
    # 1. Cấu hình Executor cho phép chạy Async
    executors = {
        'default': AsyncIOExecutor()
    }

    # 2. Khởi tạo AsyncIOScheduler thay vì BackgroundScheduler
    scheduler = AsyncIOScheduler(executors=executors)

    # 3. Thêm công việc vào lịch
    scheduler.add_job(
        func=execute_crawl_workflow,
        trigger='cron',
        minute='*', # Chạy mỗi phút
        id='daily_facebook_crawl',
        replace_existing=True
    )

    scheduler.add_job(
        func=execute_weekly_backup_and_reset_workflow,
        trigger='cron',
        day_of_week='sun', # Thực thi vào Chủ nhật
        hour=2,            # Lúc 2 giờ sáng
        minute=0,          # 00 phút
        id='weekly_user_score_backup_reset',
        replace_existing=True
    )

    logger.info(f"🕒 Scheduler khởi động (Chế độ: AsyncIO). Lịch: {Config.CRAWL_HOUR}:{Config.CRAWL_MINUTE:02d}")
    
    # Bắt đầu bộ đếm thời gian
    scheduler.start()