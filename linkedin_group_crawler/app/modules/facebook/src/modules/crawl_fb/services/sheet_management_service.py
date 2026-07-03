import asyncio
import json
from pathlib import Path

from typing import List, Dict, Tuple
from datetime import datetime

from fastapi.concurrency import run_in_threadpool
# Giả định import theo cấu trúc project của bạn
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_groups_service import GroupManagementSheetService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_groups_24h import TargetGroupSheet24HService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_intent_service import IntentSheetService
from app.modules.facebook.src.modules.gg_sheet.services.user_score_sheet_service import UserScoreSheetService
from app.modules.facebook.src.modules.gg_sheet.services.history_sheet_service import HistorySheetService
from app.modules.facebook.src.modules.gg_sheet.services.comment_sheet_service import CommentSheetService
from app.modules.facebook.src.modules.crawl_fb.services.facebook_category_sheet_service import FacebookCategorySheetService
from app.modules.facebook.src.modules.gg_sheet.services.google_sheets_posts import GoogleSheetServicePosts

def format_time_and_status(last_crawl_str: str) -> Tuple[str, str]:
    """
    Tính toán khoảng cách thời gian từ lúc cào đến hiện tại.
    Trả về: (Relative_Time_String, Status)
    """
    if not last_crawl_str or last_crawl_str.strip() == "":
        return "Chưa cào", "DEAD"

    try:
        # Giả định dữ liệu trên Sheet lưu theo định dạng: YYYY-MM-DD HH:MM:SS
        crawl_time = datetime.strptime(last_crawl_str, "%Y-%m-%d %H:%M:%S")
        now = datetime.now()
        diff = now - crawl_time
        
        total_seconds = diff.total_seconds()

        # 1. Logic phân loại Status
        if total_seconds < 24 * 3600:
            status = "ACTIVE"
        elif total_seconds <= 3 * 24 * 3600:
            status = "IDLE"
        else:
            status = "DEAD"

        # 2. Logic chuyển đổi thời gian sang dạng chuỗi tương đối
        if total_seconds < 60:
            relative_time = "Vừa xong"
        elif total_seconds < 3600:
            minutes = int(total_seconds // 60)
            relative_time = f"{minutes} phút trước"
        elif total_seconds < 24 * 3600:
            hours = int(total_seconds // 3600)
            relative_time = f"{hours} giờ trước"
        else:
            days = int(diff.days)
            relative_time = f"{days} ngày trước"

        return relative_time, status

    except ValueError:
        # Xử lý ngoại lệ nếu format ngày tháng trên Sheet bị sai
        return last_crawl_str, "DEAD"


CATEGORIES_FILE = Path("storage/categories.json")

def ensure_categories_file():
    if not CATEGORIES_FILE.exists():
        # Initialize with defaults in the new structure
        defaults = {
            "type": [
                {
                    "name": "KOL/Influencer",
                    "desc": "Cá nhân có sức ảnh hưởng lớn",
                    "platform": "Linkedin"
                },
                {
                    "name": "Community",
                    "desc": "Các hội nhóm, cộng đồng ngành",
                    "platform": "Linkedin"
                }
            ],
            "industry": [
                {
                    "industry_name": "Information Technology",
                    "status": "active"
                },
                {
                    "industry_name": "Marketing & Advertising",
                    "status": "active"
                }
            ],
            "tier": [
                {
                    "tier_level": "Tier 1",
                    "budget": "High"
                },
                {
                    "tier_level": "Tier 2",
                    "budget": "Medium"
                }
            ],
            "team": [
                {
                    "team_name": "Growth Team",
                    "leader": "Minh Hoang"
                }
            ],
            "icp": [
                {
                    "target": "Founder / CEO",
                    "geo": "US/UK"
                }
            ]
        }
        CATEGORIES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CATEGORIES_FILE, "w", encoding="utf-8") as f:
            json.dump(defaults, f, ensure_ascii=False, indent=2)


def get_category_keys(category_type: str) -> tuple[str, str]:
    c = category_type.strip().lower()
    if c == "type":
        return "name", "desc"
    elif c == "industry":
        return "industry_name", "status"
    elif c == "tier":
        return "tier_level", "budget"
    elif c == "team":
        return "team_name", "leader"
    elif c == "icp":
        return "target", "geo"
    return "value", "name"


class SheetManagementService:
    def __init__(self):
        self.group_sheet = GroupManagementSheetService()
        self.group_24h_sheet = TargetGroupSheet24HService()
        self.intent_sheet = IntentSheetService()
        self.user_score_sheet = UserScoreSheetService()
        self.history_sheet = HistorySheetService()
        self.comment_sheet = CommentSheetService()
        self.category_sheet = FacebookCategorySheetService()
        self.post_sheet = GoogleSheetServicePosts()
    # ==========================================
    # LOGIC XỬ LÝ GROUP (TỔNG & 24H)
    # ==========================================
    async def get_all_groups(self) -> List[dict]:
        """Lấy toàn bộ dữ liệu Group từ Google Sheet và bóc tách Status/Thời gian."""
        raw_groups = await asyncio.to_thread(self.group_sheet.get_all_groups)
       
        # Duyệt qua từng group để update lại last_crawl và status
        for group in raw_groups:
            last_crawl_raw = group.get("last_crawl", "")
            relative_time, status = format_time_and_status(last_crawl_raw)
            group["last_crawl"] = relative_time
            group["status"] = status
            group["date_crawl"]=last_crawl_raw
       
        return raw_groups
    
    async def bulk_add_groups(self, groups: List) -> bool:
        """Thêm danh sách Group mới vào Google Sheet (chạy bất đồng bộ)."""
        # Chuyển đổi danh sách GroupItem thành list[dict]
        groups_dict = [group.model_dump() if hasattr(group, 'model_dump') else group for group in groups]
        return await asyncio.to_thread(self.group_sheet.add_multiple_groups, groups_dict)
    
    async def bulk_delete_groups(self, urls: List[str]) -> bool:
        """Xóa danh sách Group khỏi Google Sheet dựa trên link_group (chạy bất đồng bộ)."""
        return await asyncio.to_thread(self.group_sheet.delete_multiple_groups, urls)
    
    async def update_group(self, group) -> bool:
        """Cập nhật thông tin Group trong Google Sheet (chạy bất đồng bộ)."""
        data = group.model_dump() if hasattr(group, 'model_dump') else group
        return await asyncio.to_thread(self.group_sheet.update_group, data)
    
    async def get_all_groups_24h(self) -> List[dict]:
        """Lấy toàn bộ dữ liệu Group 24h từ Google Sheet (chạy bất đồng bộ)."""
        return await asyncio.to_thread(self.group_24h_sheet.get_all_groups)
    
    async def add_group_24h(self, group_name: str, url: str) -> bool:
        """Thêm một Group mới vào danh sách 24h (chạy bất đồng bộ)."""
        return await asyncio.to_thread(self.group_24h_sheet.add_group, group_name, url)
        
    async def delete_group_24h(self, url: str) -> bool:
        """Xóa một Group khỏi danh sách 24h (chạy bất đồng bộ)."""
        return await asyncio.to_thread(self.group_24h_sheet.delete_group, url)

    # ==========================================
    # LOGIC XỬ LÝ INTENTS & CATEGORIES (DANH MỤC)
    # ==========================================
    async def bulk_add_intents(self, intents: List) -> bool:
        """Thêm hàng loạt Intent mới vào Google Sheet (chạy bất đồng bộ)."""
        intents_dict = [intent.model_dump() if hasattr(intent, 'model_dump') else intent for intent in intents]
        return await asyncio.to_thread(self.intent_sheet.add_multiple_intents, intents_dict)

    async def bulk_delete_intents(self, intents: List[str]):
        """Xóa hàng loạt Intent khỏi Sheet."""
        return await asyncio.to_thread(self.intent_sheet.delete_multiple_intents, intents)
    
    async def get_all_intents(self) -> List[dict]:
        """Lấy toàn bộ dữ liệu Intents từ Google Sheet."""
        return await asyncio.to_thread(self.intent_sheet.get_all_intents)

    async def get_all_categories(self) -> Dict[str, List[Dict[str, str]]]:
        """Lấy toàn bộ danh mục từ Google Sheet cho type, industry, tier, team, icp."""
        try:
            return await asyncio.to_thread(self.category_sheet.get_all_categories)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Lỗi khi lấy danh sách danh mục từ Google Sheet: {e}", exc_info=True)
            return {
                "type": [],
                "industry": [],
                "tier": [],
                "team": [],
                "icp": []
            }

    async def add_category(self, category_type: str, value: str, name: str, platform: str = "") -> bool:
        """Thêm danh mục mới vào Google Sheet."""
        category_type = category_type.strip().lower()
        value = value.strip()
        name = name.strip()
        
        if not value or not name:
            return False
            
        try:
            return await asyncio.to_thread(
                self.category_sheet.add_record,
                category_type,
                value,
                name,
                platform or "Facebook"
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Lỗi khi thêm danh mục vào Google Sheet: {e}", exc_info=True)
            return False

    async def update_category(self, category_type: str, value: str, name: str, platform: str = "") -> bool:
        """Cập nhật danh mục trong Google Sheet."""
        category_type = category_type.strip().lower()
        value = value.strip()
        name = name.strip()
        
        if not value or not name:
            return False
            
        try:
            return await asyncio.to_thread(
                self.category_sheet.update_record,
                category_type,
                value,
                name,
                platform or "Facebook"
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Lỗi khi cập nhật danh mục trong Google Sheet: {e}", exc_info=True)
            return False

    async def delete_category(self, category_type: str, value: str, platform: str = "") -> bool:
        """Xóa danh mục khỏi Google Sheet."""
        category_type = category_type.strip().lower()
        value = value.strip()
        
        if not value:
            return False
            
        try:
            return await asyncio.to_thread(
                self.category_sheet.delete_record,
                category_type,
                value
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Lỗi khi xóa danh mục khỏi Google Sheet: {e}", exc_info=True)
            return False

    async def delete_groups_and_posts_by_category(self, category_type: str, value: str) -> None:
        """Cascade delete related groups and posts when a category is deleted."""
        try:
            # Determine which group field maps to this category type
            c = category_type.strip().lower()
            val = value.strip()
            field_map = {
                "type": "intent",
                "industry": "industry",
                "tier": "tier",
                "team": "team",
                "icp": "icp"
            }
            if c not in field_map:
                return
            
            target_field = field_map[c]

            # 1. Lấy tất cả groups
            all_groups = await self.get_all_groups()
            
            # Lọc ra các group có giá trị field = value của danh mục bị xóa
            groups_to_delete = []
            urls_to_delete = []
            
            for g in all_groups:
                g_val = str(g.get(target_field, "")).strip()
                # Đối với tier, có thể là number hoặc text
                if g_val.lower() == val.lower() or str(g_val) == str(val):
                    urls_to_delete.append(g.get("url"))
                    groups_to_delete.append(g)
            
            if not urls_to_delete:
                return
            
            # 2. Xóa các groups đó
            await self.bulk_delete_groups(urls_to_delete)
            
            # 3. Lấy các bài post của các group bị xóa
            all_posts = await asyncio.to_thread(self.post_sheet.get_all_posts)
            post_urls_to_delete = []
            
            # Tìm các post có group trùng khớp
            for p in all_posts:
                if str(p.get("link_group", "")).strip() in urls_to_delete:
                    post_url = str(p.get("url", "")).strip()
                    if post_url:
                        post_urls_to_delete.append(post_url)
            
            # 4. Xóa các posts
            if post_urls_to_delete:
                await asyncio.to_thread(self.post_sheet.delete_multiple_posts_by_urls, post_urls_to_delete)
                
            import logging
            logging.getLogger(__name__).info(f"Đã cascade delete {len(urls_to_delete)} groups và {len(post_urls_to_delete)} posts cho category {category_type}={value}")

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Lỗi cascade delete groups/posts: {e}", exc_info=True)
    async def get_all_user_scores(self) -> List[dict]:
        """Lấy toàn bộ dữ liệu User Scores từ Google Sheet."""
        # Gọi hàm đồng bộ get_all_user_scores trong luồng background
        return await asyncio.to_thread(self.user_score_sheet.get_all_user_scores)
    async def check_comment_within_24h(self, url_post: str, comment_id: str) -> bool:
        """
        Kiểm tra xem comment (dựa theo url_post và id) đã tồn tại trong vòng 24h qua hay chưa.
        Hàm này chạy bất đồng bộ (async) để không block luồng chính.
        
        - Trả về True: Nếu CHƯA tồn tại, hoặc đã tồn tại nhưng CŨ HƠN 24h.
        - Trả về False: Nếu ĐÃ tồn tại TRONG VÒNG 24h qua.
        """
        return await asyncio.to_thread(
            self.comment_sheet.check_comment_new_within_24h, 
            url_post, 
            comment_id
        )
    async def bulk_add_comments(self, comments_data: List[Dict]) -> bool:
        """
        Thêm hàng loạt Comments vào Google Sheet (chạy bất đồng bộ).
        
        Args:
            comments_data (List[Dict]): Danh sách các từ điển chứa thông tin bình luận/tương tác.
                Cấu trúc dự kiến của mỗi từ điển (Dict) bao gồm:
                [
                    {
                        "id": "123456789",          # (Bắt buộc) ID duy nhất của comment/tương tác để chống trùng lặp
                        "url_post": "https/...",    # (Bắt buộc) Đường dẫn URL của bài viết
                        "name": "Nguyễn Văn A",     # (Bắt buộc) Tên người dùng tương tác/bình luận
                        "like": "LIKE",               # (Tùy chọn) loại cảm xúc (VD: "LIKE", "HAHA", "LOVE", "WOW", "SAD", "ANGRY")
                        "comment": "Nội dung..."    # (Tùy chọn) Nội dung bình luận hoặc loại cảm xúc (VD: "LIKE", "HAHA")
                    },
                    ...
                ]
                * Lưu ý: Không cần truyền key thời gian, hệ thống sẽ tự động lấy thời gian lúc ghi vào Sheet.

        Returns:
            bool: True nếu thêm thành công (có dòng mới được chèn), False nếu trống hoặc lỗi.
        """
        if not comments_data:
            return False
            
        return await asyncio.to_thread(
            self.comment_sheet.add_multiple_comments, 
            comments_data
        )
    async def bulk_process_comments_and_scores(self, comments_data: List[Dict]) -> tuple[bool, bool]:
        """
        Thực thi SONG SONG 2 tác vụ từ một nguồn dữ liệu duy nhất: 
        1. Ghi danh sách Comments vào Sheet Comments.
        2. Lấy trực tiếp 'id' và 'name' từ comments để cộng điểm vào Sheet User_Scores.
        
        Args:
            comments_data (List[Dict]): Danh sách dữ liệu tương tác lấy về từ crawler.
                Cấu trúc chi tiết của mỗi object:
                [
                    {
                        "id": "1000123456789",      # (Bắt buộc) Dùng làm ID check trùng lặp (Sheet Comments) VÀ định danh User (Sheet Scores)
                        "name": "Nguyễn Văn A",     # (Bắt buộc) Tên hiển thị dùng chung cho cả 2 Sheet
                        "url_post": "https/...",    # (Dành cho Sheet Comments) Link bài viết
                        "like": "5",                # (Dành cho Sheet Comments) Số lượng tương tác của comment
                        "comment": "Tuyệt vời",     # (Dành cho Sheet Comments) Nội dung bình luận
                        
                    },
                    ...
                ]
                
        Returns:
            tuple[bool, bool]: Kết quả của (Comments_Success, Scores_Success)
        """
        if not comments_data:
            return False, False

        # 1. Bóc tách dữ liệu User_Scores từ Comments_Data (Dùng chung luôn 'id' và 'name')
        users_data = []
        for cmt in comments_data:
            uid = str(cmt.get("id", "")).strip()
            name = str(cmt.get("name", "")).strip()
            
            # Chỉ đưa vào danh sách cộng điểm nếu có tồn tại ID
            if uid:
                users_data.append({
                    "id": uid,
                    "name": name,
                    "score_to_add": int(cmt.get("score_to_add", 1)) # Mặc định cộng 1 điểm nếu không truyền
                })

        # 2. Khởi tạo danh sách các Task cần chạy đồng thời
        tasks = [
            run_in_threadpool(self.comment_sheet.add_multiple_comments, comments_data)
        ]
        
        # Task 2: Cập nhật điểm
        if users_data:
            tasks.append(
                run_in_threadpool(self.user_score_sheet.bulk_update_scores, users_data)
            )
        else:
            # Task ảo nếu mảng users_data trống (chỉ xảy ra khi toàn bộ comments gửi lên đều không có 'id')
            async def empty_task(): return False
            tasks.append(empty_task())

        # 3. Thực thi song song
        results = await asyncio.gather(*tasks)
        
        return results[0], results[1]