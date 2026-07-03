"""
Shared Category Sheet Service
-------------------------------
Dịch vụ dùng chung cho cả Facebook và LinkedIn để quản lý danh mục.
Chỉ tương tác trực tiếp với Google Sheet:
  https://docs.google.com/spreadsheets/d/1rfep85y5_97gnm2uIarsc6yVQIkZJYK4ALuPgzM939I
Sử dụng credential: app/modules/linkedin/credential/crawllinkedinapp-a877378a363d.json
Không gọi webhook N8N.
"""

import os
import logging
import time
import gspread
from google.oauth2.service_account import Credentials
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Spreadsheet ID cố định cho quản lý danh mục
CATEGORY_SPREADSHEET_ID = (
    os.getenv("ID_SPREADSHEET_LINKEDIN")
    or "1rfep85y5_97gnm2uIarsc6yVQIkZJYK4ALuPgzM939I"
)

CREDENTIAL_PATH = "app/modules/linkedin/credential/crawllinkedinapp-a877378a363d.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Cấu trúc các tab trong sheet
TAB_HEADERS: Dict[str, List[str]] = {
    "intent":   ["code", "name", "platform"],
    "industry": ["code", "name", "desc"],
    "tier":     ["code", "name", "desc"],
    "team":     ["team_name", "leader"],
    "icp":      ["target", "geo"],
}

# Cột khoá (dùng để tìm kiếm / dedup)
KEY_COLUMN: Dict[str, str] = {
    "intent":   "code",
    "industry": "code",
    "tier":     "code",
    "team":     "team_name",
    "icp":      "target",
}

ALL_TABS = list(TAB_HEADERS.keys())

# Global cache variables to prevent quota exhaustion
_shared_client = None
_shared_spreadsheet = None
_categories_cache = None
_cache_timestamp = 0.0
CACHE_TTL = 30.0  # Cache duration in seconds


class CategorySheetService:
    """Quản lý danh mục dùng chung qua Google Sheet (LinkedIn credential)."""

    def __init__(self):
        global _shared_client, _shared_spreadsheet
        try:
            if _shared_spreadsheet is None:
                creds = Credentials.from_service_account_file(CREDENTIAL_PATH, scopes=SCOPES)
                _shared_client = gspread.authorize(creds)
                _shared_spreadsheet = _shared_client.open_by_key(CATEGORY_SPREADSHEET_ID)
                logger.info(
                    "CategorySheetService: Khởi tạo kết nối sheet '%s' thành công.",
                    CATEGORY_SPREADSHEET_ID,
                )
            self._client = _shared_client
            self._spreadsheet = _shared_spreadsheet
        except Exception as e:
            logger.error("CategorySheetService: lỗi khởi tạo — %s", e, exc_info=True)
            raise

    # ------------------------------------------------------------------ helpers

    def _worksheet(self, tab: str) -> gspread.Worksheet:
        return self._spreadsheet.worksheet(tab)

    def _ensure_headers(self, ws: gspread.Worksheet, tab: str) -> List[str]:
        """Đọc header; nếu sheet trống thì ghi header mặc định."""
        headers = ws.row_values(1)
        if not headers:
            headers = TAB_HEADERS.get(tab, ["value", "name"])
            ws.append_row(headers)
        return headers

    def _find_row(self, ws: gspread.Worksheet, tab: str, value: str) -> int | None:
        """Trả về số hàng (1-based) nếu tìm thấy value trong cột key, None nếu không."""
        headers = TAB_HEADERS.get(tab, [])
        key_col = KEY_COLUMN.get(tab, "value")
        if key_col not in headers:
            return None
        col_idx = headers.index(key_col) + 1
        cell = ws.find(value, in_column=col_idx)
        return cell.row if cell else None

    # ------------------------------------------------------------------ public API

    def get_all_categories(self) -> Dict[str, List[Dict[str, Any]]]:
        """Lấy tất cả danh mục từ các tab, sử dụng bộ nhớ đệm nếu còn hạn."""
        global _categories_cache, _cache_timestamp
        now = time.time()
        if _categories_cache is not None and (now - _cache_timestamp) < CACHE_TTL:
            logger.info("CategorySheetService: Sử dụng dữ liệu categories đã được cache.")
            return _categories_cache

        result: Dict[str, List[Dict[str, Any]]] = {}
        for tab in ALL_TABS:
            try:
                ws = self._worksheet(tab)
                records = ws.get_all_records()
                # Map record fields to standard code/value/name structure for frontend
                for record in records:
                    if tab == "team":
                        record["code"] = record.get("team_name", "")
                        record["value"] = record.get("team_name", "")
                        record["name"] = record.get("leader", "")
                    elif tab == "icp":
                        record["code"] = record.get("target", "")
                        record["value"] = record.get("target", "")
                        record["name"] = record.get("geo", "")
                    else:
                        if "code" in record and "value" not in record:
                            record["value"] = record["code"]
                result[tab] = records
            except Exception as e:
                logger.error("CategorySheetService: lỗi đọc tab '%s' — %s", tab, e)
                result[tab] = []
        
        _categories_cache = result
        _cache_timestamp = now
        return result

    def add_record(self, tab: str, value: str, name: str, platform: str = "") -> bool:
        """Thêm một dòng mới vào tab tương ứng. Trả False nếu đã tồn tại."""
        tab = tab.strip().lower()
        value = value.strip()
        name = name.strip()

        if tab not in TAB_HEADERS or not value:
            return False

        try:
            ws = self._worksheet(tab)
            headers = TAB_HEADERS[tab]

            # Kiểm tra trùng
            if self._find_row(ws, tab, value) is not None:
                logger.warning("CategorySheetService: '%s' đã tồn tại trong tab '%s'.", value, tab)
                return False

            # Xây dựng payload theo header thực tế của sheet
            payload: Dict[str, str] = {}
            if tab == "team":
                payload["team_name"] = value
                payload["leader"] = name
            elif tab == "icp":
                payload["target"] = value
                payload["geo"] = name
            else:
                payload["code"] = value
                payload["name"] = name
                payload["platform"] = platform

            row = [payload.get(h, "") for h in headers]
            ws.append_row(row, value_input_option="USER_ENTERED")
            logger.info("CategorySheetService: đã thêm '%s' vào tab '%s'.", value, tab)
            
            # Invalidate cache
            global _categories_cache
            _categories_cache = None
            
            return True
        except Exception as e:
            logger.error("CategorySheetService: lỗi add tab '%s' — %s", tab, e, exc_info=True)
            return False

    def update_record(self, tab: str, value: str, name: str, platform: str = "") -> bool:
        """Cập nhật dòng có key = value trong tab. Trả False nếu không tìm thấy."""
        tab = tab.strip().lower()
        value = value.strip()
        name = name.strip()

        if tab not in TAB_HEADERS or not value:
            return False

        try:
            ws = self._worksheet(tab)
            headers = TAB_HEADERS[tab]

            row_idx = self._find_row(ws, tab, value)
            if row_idx is None:
                return False

            if tab == "team":
                if "leader" in headers:
                    ws.update_cell(row_idx, headers.index("leader") + 1, name)
            elif tab == "icp":
                if "geo" in headers:
                    ws.update_cell(row_idx, headers.index("geo") + 1, name)
            else:
                if "name" in headers:
                    ws.update_cell(row_idx, headers.index("name") + 1, name)
                if platform and "platform" in headers:
                    ws.update_cell(row_idx, headers.index("platform") + 1, platform)

            logger.info("CategorySheetService: đã cập nhật '%s' trong tab '%s'.", value, tab)
            
            # Invalidate cache
            global _categories_cache
            _categories_cache = None
            
            return True
        except Exception as e:
            logger.error("CategorySheetService: lỗi update tab '%s' — %s", tab, e, exc_info=True)
            return False

    def delete_record(self, tab: str, value: str) -> bool:
        """Xóa dòng có key = value khỏi tab. Trả False nếu không tìm thấy."""
        tab = tab.strip().lower()
        value = value.strip()

        if tab not in TAB_HEADERS or not value:
            return False

        try:
            ws = self._worksheet(tab)
            row_idx = self._find_row(ws, tab, value)
            if row_idx is None:
                return False
            ws.delete_rows(row_idx)
            logger.info("CategorySheetService: đã xóa '%s' khỏi tab '%s'.", value, tab)
            
            # Invalidate cache
            global _categories_cache
            _categories_cache = None
            
            return True
        except Exception as e:
            logger.error("CategorySheetService: lỗi delete tab '%s' — %s", tab, e, exc_info=True)
            return False
