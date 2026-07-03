import logging
import asyncio
from typing import List, Optional
from fastapi import HTTPException, status 
from fastapi.concurrency import run_in_threadpool
from app.modules.facebook.src.modules.crawl_fb.schemas.crawl_schema import CrawlPayload
from app.modules.facebook.src.modules.crawl_fb.models.GroupSummary import GroupSummary
from app.modules.facebook.src.modules.facebook.services.facebook_scraper import FacebookScraper
from app.modules.facebook.src.modules.telegram.services.telegram_service import TelegramService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_groups_service import GroupManagementSheetService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_posts import GoogleSheetServicePosts
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_groups_24h import TargetGroupSheet24HService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_intent_service import IntentSheetService
from app.modules.all_platform.services.supabase_facebook_crawl_service import save_facebook_crawl_to_supabase


logger = logging.getLogger(__name__)

# ĐÃ XÓA Ổ KHÓA TOÀN CỤC (crawl_lock) ĐỂ CHẠY SONG SONG KHÔNG GIỚI HẠN

class CrawlService:
    def __init__(
        self, 
        scraper: FacebookScraper, 
        telegram: TelegramService
    ):
        self.scraper = scraper
        self.telegram = telegram


    async def _execute_scraping(self, payload: CrawlPayload, client_id: Optional[str] = None) -> List[GroupSummary]:
     
        # THAY VÌ: return await self.scraper.scrape_groups(...)
        # HÃY DÙNG:
        return await run_in_threadpool(
            self.scraper.scrape_groups, 
            groups=payload.groups,
            custom_email=getattr(payload.tkFB, 'useName', None), 
            custom_pass=getattr(payload.tkFB, 'password', None),
            client_id=client_id
        )

    # DÙNG CHO CRONJOB / SCHEDULER (Chạy ngầm theo lịch)
    async def CrawlDataGroupFB(self, payload: CrawlPayload):
        try:
            # ĐÃ BỎ async with crawl_lock, CHẠY TRỰC TIẾP
            daily_summary_report = await self._execute_scraping(payload)
             
            if daily_summary_report:
                # Chỉ lưu lên Supabase, loại bỏ Google Sheets
                email_crawl = getattr(payload.tkFB, 'useName', '') if payload.tkFB else ''
                
                try:
                    await asyncio.to_thread(save_facebook_crawl_to_supabase, email_crawl, daily_summary_report)
                except Exception as db_err:
                    logger.error(f"Lỗi khi lưu Supabase trong Cronjob: {db_err}")

                self.telegram.send_completion_notification()
                mes = self.telegram.format_daily_telegram_report(summaries=daily_summary_report)
                self.telegram.send_message(mes)
                return {"status": "success", "message": "Cào dữ liệu hoàn tất."}
            else:
                self.telegram.send_message("ℹ️ *Báo cáo Crawler*\nKhông có bài viết mới.")
                return {"status": "success", "message": "Hoàn tất nhưng không có dữ liệu."}
                
        except ValueError as e:
            if str(e) == "LOGIN_FAILED":
                self.telegram.send_message("🚨 *LỖI ĐĂNG NHẬP*\nSai tài khoản hoặc Checkpoint!")
                return {"status": "error", "message": "Đăng nhập thất bại."}
            raise e 
        
        except Exception as e:
            logger.error(f"Lỗi hệ thống bất ngờ: {e}")
            self.telegram.send_message(f"❌ *Lỗi hệ thống Crawler*\n{str(e)[:100]}...")
            return {"status": "error", "message": "Lỗi hệ thống."}

    # DÙNG CHO FRONTEND GỌI API (Có trả Data về FE)
    async def FetchDataDirectly(self, payload: CrawlPayload, client_id: Optional[str] = None):
        try:
            # ĐÃ BỎ async with crawl_lock, CHẠY TRỰC TIẾP
            scraped_data = await self._execute_scraping(payload, client_id=client_id)
            
            if scraped_data:
                email_crawl = client_id or (getattr(payload.tkFB, 'useName', '') if payload.tkFB else '')
                
                try:
                    # Chuyển đổi và lưu bài viết lên Supabase facebook_posts
                    await asyncio.to_thread(save_facebook_crawl_to_supabase, email_crawl, scraped_data)
                except Exception as db_err:
                    logger.error(f"Lỗi khi lưu Supabase: {db_err}")
                    # Không văng lỗi 500 để vẫn trả về data cho FE, chỉ log lại
                    
                return {"status": "success", "message": "Cào thành công.", "data": scraped_data}
            else:
                return {"status": "success", "message": "Không có bài viết mới.", "data": []}

        except ValueError as e:
            if str(e) == "LOGIN_FAILED":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Sai tài khoản, mật khẩu hoặc dính Checkpoint."
                )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        except Exception as e:
            logger.error(f"Lỗi hệ thống: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Hệ thống Crawler gặp sự cố: {str(e)}"
            )
            

