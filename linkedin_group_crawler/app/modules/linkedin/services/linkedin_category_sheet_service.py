import os
import logging
import gspread
from google.oauth2.service_account import Credentials
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class LinkedinCategorySheetService:
    DEFAULT_SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]

    def __init__(self):
        self.credentials_path = "app/modules/linkedin/credential/crawllinkedinapp-a877378a363d.json"
        self.spreadsheet_id = os.getenv("ID_SPREADSHEET_LINKEDIN") or os.getenv("URL_SPREADSHEET") or os.getenv("ID_SPREADSHEET") or os.getenv("SPREADSHEET_ID") or "1rfep85y5_97gnm2uIarsc6yVQIkZJYK4ALuPgzM939I"
        
        try:
            self.creds = Credentials.from_service_account_file(
                self.credentials_path,
                scopes=self.DEFAULT_SCOPES
            )
            self.client = gspread.authorize(self.creds)
            logger.info("LinkedinCategorySheetService initialized successfully.")
        except Exception as e:
            logger.error(f"Error initializing LinkedinCategorySheetService: {e}", exc_info=True)
            raise

    def _get_worksheet(self, tab_name: str) -> gspread.Worksheet:
        sheet = self.client.open_by_key(self.spreadsheet_id)
        return sheet.worksheet(tab_name)

    def _get_key_column(self, tab_name: str) -> str:
        t = tab_name.strip().lower()
        if t == "type":
            return "name"
        elif t == "industry":
            return "name"
        elif t == "tier":
            return "name"
        elif t == "team":
            return "team_name"
        elif t == "icp":
            return "target"
        return "value"

    def _get_default_headers(self, tab_name: str) -> List[str]:
        t = tab_name.strip().lower()
        if t == "type":
            return ["name", "desc", "platform"]
        elif t == "industry":
            return ["name", "code"]
        elif t == "tier":
            return ["name", "budget"]
        elif t == "team":
            return ["team_name", "leader"]
        elif t == "icp":
            return ["target", "geo"]
        return ["value", "name"]

    def get_all_records(self, tab_name: str) -> List[Dict[str, Any]]:
        try:
            worksheet = self._get_worksheet(tab_name)
            return worksheet.get_all_records()
        except Exception as e:
            logger.error(f"Error reading tab {tab_name} from Google Sheet: {e}")
            return []

    def get_all_categories(self) -> Dict[str, List[Dict[str, Any]]]:
        res = {}
        for tab in ["type", "industry", "tier", "team", "icp"]:
            res[tab] = self.get_all_records(tab)
        return res

    def add_record(self, tab_name: str, value: str, name: str, platform: str = "Linkedin") -> bool:
        try:
            worksheet = self._get_worksheet(tab_name)
            headers = worksheet.row_values(1)
            if not headers:
                headers = self._get_default_headers(tab_name)
                worksheet.append_row(headers)
            
            key_col = self._get_key_column(tab_name)
            
            # Map payload values to headers
            payload = {}
            t = tab_name.strip().lower()
            if t == "type":
                payload["name"] = value
                payload["desc"] = name
                payload["platform"] = platform
            elif t == "industry":
                payload["name"] = value
                payload["code"] = name
            elif t == "tier":
                payload["name"] = value
                payload["budget"] = name
            elif t == "team":
                payload["team_name"] = value
                payload["leader"] = name
            elif t == "icp":
                payload["target"] = value
                payload["geo"] = name

            # Check duplication
            if key_col in headers:
                key_col_idx = headers.index(key_col) + 1
                try:
                    cell = worksheet.find(value, in_column=key_col_idx)
                    if cell:
                        logger.warning(f"Category {value} already exists in tab {tab_name}.")
                        return False
                except gspread.exceptions.CellNotFound:
                    pass

            row_to_insert = [payload.get(h, "") for h in headers]
            worksheet.append_row(row_to_insert, value_input_option='USER_ENTERED')
            return True
        except Exception as e:
            logger.error(f"Error adding category to tab {tab_name}: {e}", exc_info=True)
            return False

    def update_record(self, tab_name: str, value: str, name: str, platform: str = "Linkedin") -> bool:
        try:
            worksheet = self._get_worksheet(tab_name)
            headers = worksheet.row_values(1)
            key_col = self._get_key_column(tab_name)
            if key_col not in headers:
                return False
            
            key_col_idx = headers.index(key_col) + 1
            try:
                cell = worksheet.find(value, in_column=key_col_idx)
            except gspread.exceptions.CellNotFound:
                return False
            
            row_idx = cell.row
            
            # Update matching fields
            t = tab_name.strip().lower()
            if t == "type":
                desc_idx = headers.index("desc") + 1
                worksheet.update_cell(row_idx, desc_idx, name)
                if "platform" in headers:
                    plat_idx = headers.index("platform") + 1
                    worksheet.update_cell(row_idx, plat_idx, platform)
            elif t == "industry":
                code_idx = headers.index("code") + 1
                worksheet.update_cell(row_idx, code_idx, name)
            elif t == "tier":
                budget_idx = headers.index("budget") + 1
                worksheet.update_cell(row_idx, budget_idx, name)
            elif t == "team":
                leader_idx = headers.index("leader") + 1
                worksheet.update_cell(row_idx, leader_idx, name)
            elif t == "icp":
                geo_idx = headers.index("geo") + 1
                worksheet.update_cell(row_idx, geo_idx, name)

            return True
        except Exception as e:
            logger.error(f"Error updating category in tab {tab_name}: {e}", exc_info=True)
            return False

    def delete_record(self, tab_name: str, value: str) -> bool:
        try:
            worksheet = self._get_worksheet(tab_name)
            headers = worksheet.row_values(1)
            key_col = self._get_key_column(tab_name)
            if key_col not in headers:
                return False
            
            key_col_idx = headers.index(key_col) + 1
            try:
                cell = worksheet.find(value, in_column=key_col_idx)
            except gspread.exceptions.CellNotFound:
                return False
            
            worksheet.delete_rows(cell.row)
            return True
        except Exception as e:
            logger.error(f"Error deleting category from tab {tab_name}: {e}", exc_info=True)
            return False
