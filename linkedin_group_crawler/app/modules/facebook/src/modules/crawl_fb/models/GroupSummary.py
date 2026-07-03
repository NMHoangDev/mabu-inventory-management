from dataclasses import dataclass
from app.modules.facebook.src.modules.crawl_fb.models.post import Post
@dataclass
class GroupSummary:
    """
    Entity dùng để đóng gói dữ liệu báo cáo tổng hợp cho một Group.
    """
    group_name: str                  # Tên của Group
    link_group: str
    total_posts_24h: int             # Số lượng bài viết cào được trong 24h qua
    Intent: str                      # Intent của nhóm
    id_member: str = ""              # ID User sở hữu nhóm
    hot_post: Post | None = None     # Bài viết hot nhất, None nếu không có bài nào trong 24h