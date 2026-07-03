"""Google Sheets (service account) — đọc/ghi tab top_posts và danh sách URL nhóm."""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.core.config import settings
from app.core.logger import get_logger


logger = get_logger(__name__)

_SHEETS_SCOPES = ("https://www.googleapis.com/auth/spreadsheets",)

# Map header (trimmed) → giá trị ô (theo ngữ nghĩa khi append bài mới)
_TOP_POST_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "email_crawl": ("email_crawl", "email crawl"),
    "ngày": ("ngay", "ngày", "date"),
    "tên nhóm": ("ten nhom", "tên nhóm", "group_name", "group name"),
    "url_nhóm": ("url_nhom", "url_nhóm", "url nhóm", "group_url", "group url"),
    "url_bài_viết": ("url_bai_viet", "url_bài_viết", "url bài viết", "post_url", "post url"),
    "tác giả": ("tac gia", "tác giả", "author"),
    "nội dung": ("noi dung", "nội dung", "content"),
    "số like": ("so like", "số like", "likes"),
    "số comment": ("so comment", "số comment", "comments"),
    "lượng báo sao": ("luong bao sao", "lượng báo sao", "reposts", "shares"),
    "điểm": ("diem", "điểm", "score"),
    "đăng vào": ("dang vao", "đăng vào", "posted_at"),
    "tổng số bài lấy được mỗi lần sao": (
        "tong so bai lay duoc moi lan sao",
        "tổng số bài lấy được mỗi lần sao",
        "total_posts",
    ),
}


def _normalize_header_cell(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def _credential_path() -> Path:
    path = Path(settings.google_service_account_json_path)
    if path.exists():
        return path
    raise FileNotFoundError(
        f"Không thấy file service account GOOGLE_SERVICE_ACCOUNT_JSON: {path.as_posix()}",
    )


def _build_credentials():
    path = _credential_path()
    return service_account.Credentials.from_service_account_file(
        path.as_posix(),
        scopes=_SHEETS_SCOPES,
    )


def get_sheets_service():
    credentials = _build_credentials()
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


_spreadsheet_sheet_titles_cache: dict[str, list[str]] = {}


def _fetch_spreadsheet_sheet_titles(spreadsheet_id: str) -> list[str]:
    service = get_sheets_service()
    body = (
        service.spreadsheets()
        .get(spreadsheetId=spreadsheet_id, fields="sheets(properties(title))")
        .execute()
    )
    titles: list[str] = []
    for sheet in body.get("sheets", []):
        props = sheet.get("properties") or {}
        title = props.get("title")
        if isinstance(title, str) and title.strip():
            titles.append(title)
    return titles


def get_spreadsheet_sheet_titles(spreadsheet_id: str) -> list[str]:
    """Danh sách tên tab đúng như trên Google Sheets (cache theo process)."""

    sid = (spreadsheet_id or "").strip()
    if not sid:
        return []
    if sid not in _spreadsheet_sheet_titles_cache:
        _spreadsheet_sheet_titles_cache[sid] = _fetch_spreadsheet_sheet_titles(sid)
    return _spreadsheet_sheet_titles_cache[sid]


def _normalize_tab_token(name: str) -> str:
    text = (name or "").strip().lower().replace("_", " ")
    return re.sub(r"\s+", " ", text)


def _match_configured_tab_title(titles: list[str], preferred: str) -> str | None:
    pref = (preferred or "").strip()
    if not pref:
        return None
    if pref in titles:
        return pref
    lower_map = {t.lower(): t for t in titles}
    if pref.lower() in lower_map:
        return lower_map[pref.lower()]
    pn = _normalize_tab_token(pref)
    for t in titles:
        if _normalize_tab_token(t) == pn:
            return t
    return None


def resolve_top_posts_tab_title(spreadsheet_id: str) -> str:
    """Khớp tab ``top_posts`` với tên thật trên file (không phân biệt hoa thường / underscore)."""

    titles = get_spreadsheet_sheet_titles(spreadsheet_id)
    if not titles:
        raise ValueError(
            "Google Sheet không có tab nào hoặc không đọc được metadata (kiểm tra spreadsheetId và quyền service account).",
        )
    cfg = settings.google_sheet_top_posts_tab.strip()
    hit = _match_configured_tab_title(titles, cfg)
    if hit:
        return hit
    for t in titles:
        n = _normalize_tab_token(t).replace(" ", "")
        if "top" in n and "post" in n:
            logger.info("Đã map GOOGLE_SHEET_TOP_POSTS_TAB -> tab thật '%s'", t)
            return t
    logger.warning("Không khớp tên tab top_posts, dùng tab đầu tiên: %s", titles[0])
    return titles[0]


def resolve_group_urls_tab_title(spreadsheet_id: str, top_posts_tab: str) -> str | None:
    """Tab danh sách URL nhóm: ưu tiên env, sau đó heuristics (URL + nhóm) hoặc tab duy nhất còn lại."""

    titles = get_spreadsheet_sheet_titles(spreadsheet_id)
    others = [t for t in titles if t != top_posts_tab]
    cfg = settings.google_sheet_group_urls_tab.strip()
    if cfg:
        hit = _match_configured_tab_title(titles, cfg)
        if hit and hit != top_posts_tab:
            return hit
        if hit == top_posts_tab:
            logger.warning(
                "GOOGLE_SHEET_GROUP_URLS_TAB trùng tab top_posts (%s); bỏ qua và tự tìm tab URL nhóm.",
                top_posts_tab,
            )
    for t in others:
        compact = _normalize_tab_token(t).replace(" ", "")
        if "url" in compact and "nhom" in compact:
            logger.info("Đã map tab URL nhóm -> '%s'", t)
            return t
    if len(others) == 1:
        logger.info("Chỉ còn một tab ngoài top_posts — dùng '%s' cho URL nhóm", others[0])
        return others[0]
    if len(others) > 1:
        logger.warning(
            "Nhiều tab có thể là URL nhóm %s — set GOOGLE_SHEET_GROUP_URLS_TAB trong .env (tên tab chính xác).",
            others,
        )
    return None


def _a1_quote_sheet_title(title: str) -> str:
    """Quote tên tab cho A1 notation (escape dấu nháy đơn)."""

    return "'" + str(title).replace("'", "''") + "'"


def _sheet_a1(spreadsheet_id: str, tab_title: str, cell_range: str) -> str:
    return f"{_a1_quote_sheet_title(tab_title)}!{cell_range}"


def spreadsheet_configured() -> bool:
    spreadsheet_id_ok = bool((settings.google_spreadsheet_id or "").strip())
    json_path = Path(settings.google_service_account_json_path)
    return spreadsheet_id_ok and json_path.is_file()


def _read_values(*, spreadsheet_id: str, range_a1: str) -> list[list[Any]]:
    service = get_sheets_service()
    resp = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=range_a1, majorDimension="ROWS")
        .execute()
    )
    return list(resp.get("values") or [])


def _headers_to_unique_keys(headers: list[str]) -> list[str]:
    counts: dict[str, int] = {}
    keys: list[str] = []
    for index, raw in enumerate(headers):
        label = (raw or "").strip()
        if not label:
            label = f"Column_{index + 1}"
        base = label
        counts[base] = counts.get(base, 0) + 1
        if counts[base] == 1:
            keys.append(base)
        else:
            keys.append(f"{base}__{counts[base]}")
    return keys


def read_top_post_header_row() -> list[str]:
    """Chỉ đọc dòng tiêu đề tab top_posts (để map cột khi append)."""

    sid = settings.google_spreadsheet_id
    tab = resolve_top_posts_tab_title(sid)
    raw = _read_values(spreadsheet_id=sid, range_a1=_sheet_a1(sid, tab, "1:1"))
    if not raw or not raw[0]:
        raise ValueError(f"Tab '{tab}' trống hoặc thiếu dòng tiêu đề.")
    return [str(c or "") for c in raw[0]]


def read_top_posts_as_dicts() -> tuple[list[str], list[dict[str, Any]]]:
    """Đọc toàn bộ tab top_posts: trả về (header_keys, rows)."""

    sid = settings.google_spreadsheet_id
    tab = resolve_top_posts_tab_title(sid)
    raw = _read_values(spreadsheet_id=sid, range_a1=_sheet_a1(sid, tab, "A:ZZ"))
    if not raw:
        return [], []

    headers = raw[0]
    keys = _headers_to_unique_keys([str(cell) if cell is not None else "" for cell in headers])
    rows: list[dict[str, Any]] = []
    for line in raw[1:]:
        padded = list(line) + [""] * (len(keys) - len(line))
        row_obj: dict[str, Any] = {}
        for key, cell in zip(keys, padded[: len(keys)]):
            row_obj[key] = cell
        rows.append(row_obj)
    return keys, rows


def _normalize_owner_email_token(value: str) -> str:
    return (value or "").strip().lower()


def _header_key_base(header_key: str) -> str:
    """Bỏ hậu tố ``__2`` (cột trùng tên) để map semantic."""

    return re.sub(r"__\d+$", "", str(header_key).strip())


def _get_row_email_crawl_cell(row: dict[str, Any]) -> str:
    for header_key, raw in row.items():
        base = _header_key_base(header_key)
        if _header_semantic_key(base) == "email_crawl":
            return str(raw or "").strip()
    return ""


def _parse_cell_date_maybe(value: str) -> date | None:
    text = str(value or "").strip()
    if len(text) < 10:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _collect_sheet_row_ngay_dates(row: dict[str, Any]) -> list[date]:
    parsed: list[date] = []
    for header_key, raw in row.items():
        base = _header_key_base(header_key)
        if _header_semantic_key(base) != "ngày":
            continue
        dcell = _parse_cell_date_maybe(str(raw or ""))
        if dcell:
            parsed.append(dcell)
    return parsed


def filter_sheet_top_posts_for_owner(
    rows: list[dict[str, Any]],
    *,
    owner_email_token: str,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict[str, Any]]:
    """Chỉ trả các dòng có ``Email_crawl`` đúng owner; lọc theo khoảng các cột ``Ngày`` (YYYYMMDD trên ô)."""

    owner = _normalize_owner_email_token(owner_email_token)
    if not owner:
        return []

    out: list[dict[str, Any]] = []
    for row in rows:
        cell_owner = _normalize_owner_email_token(_get_row_email_crawl_cell(row))
        if cell_owner != owner:
            continue

        if date_from is None and date_to is None:
            out.append(row)
            continue

        row_dates = _collect_sheet_row_ngay_dates(row)
        if not row_dates:
            continue

        for rd in row_dates:
            ok = True
            if date_from is not None and rd < date_from:
                ok = False
            if date_to is not None and rd > date_to:
                ok = False
            if ok:
                out.append(row)
                break

    return out


def _hyperlink_formula(url: str, label: str | None = None) -> str:
    if not (url or "").strip():
        return ""
    escaped_url = url.replace('"', '""')
    lab = (label or url).replace('"', '""')
    return f'=HYPERLINK("{escaped_url}","{lab}")'


def _header_semantic_key(header: str) -> str | None:
    norm = _normalize_header_cell(header)
    for canonical, aliases in _TOP_POST_HEADER_ALIASES.items():
        if norm == _normalize_header_cell(canonical):
            return canonical
        for alias in aliases:
            if norm == _normalize_header_cell(alias):
                return canonical
    return None


def build_top_post_row_values(
    headers: list[str],
    *,
    email_crawl: str,
    crawl_date: str,
    group_name: str,
    group_url: str,
    total_posts_in_run: int,
    post: dict[str, Any],
) -> list[str]:
    """Tạo một dòng theo đúng thứ tự cột của header dòng 1 trong Sheet."""

    row: list[str] = []
    for header in headers:
        sem = _header_semantic_key(header)
        if sem == "email_crawl":
            row.append(email_crawl)
        elif sem == "ngày":
            row.append(crawl_date)
        elif sem == "tên nhóm":
            row.append(group_name)
        elif sem == "url_nhóm":
            row.append(_hyperlink_formula(group_url, group_url) if group_url else "")
        elif sem == "url_bài_viết":
            pu = str(post.get("post_url") or "")
            row.append(_hyperlink_formula(pu, pu) if pu else "")
        elif sem == "tác giả":
            row.append(str(post.get("author") or ""))
        elif sem == "nội dung":
            row.append(str(post.get("content") or ""))
        elif sem == "số like":
            row.append(str(int(post.get("likes") or 0)))
        elif sem == "số comment":
            row.append(str(int(post.get("comments") or 0)))
        elif sem == "lượng báo sao":
            row.append(str(int(post.get("reposts") or 0)))
        elif sem == "điểm":
            row.append(str(int(post.get("score") or 0)))
        elif sem == "đăng vào":
            row.append(str(post.get("posted_at") or ""))
        elif sem == "tổng số bài lấy được mỗi lần sao":
            row.append(str(int(total_posts_in_run)))
        else:
            row.append("")
    return row


def append_top_post_rows(rows_2d: list[list[Any]]) -> None:
    sid = settings.google_spreadsheet_id
    tab = resolve_top_posts_tab_title(sid)
    if not rows_2d:
        return
    service = get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=sid,
        range=_sheet_a1(sid, tab, "A:A"),
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": rows_2d},
    ).execute()


def read_group_url_rows() -> list[dict[str, Any]]:
    """Đọc tab URL nhóm: cột URL_Nhóm, email, Trạng thái."""

    sid = settings.google_spreadsheet_id
    top_tab = resolve_top_posts_tab_title(sid)
    tab = resolve_group_urls_tab_title(sid, top_tab)
    if not tab:
        logger.warning(
            "Không xác định được tab danh sách URL nhóm. Thêm GOOGLE_SHEET_GROUP_URLS_TAB=<tên tab> vào .env.",
        )
        return []
    raw = _read_values(spreadsheet_id=sid, range_a1=_sheet_a1(sid, tab, "A:Z"))
    if not raw:
        return []
    headers = [str(c or "").strip() for c in raw[0]]
    keys = _headers_to_unique_keys(headers)
    out: list[dict[str, Any]] = []
    for line in raw[1:]:
        padded = list(line) + [""] * (len(keys) - len(line))
        item: dict[str, Any] = {}
        for key, cell in zip(keys, padded[: len(keys)]):
            item[key] = cell
        out.append(item)
    return out


def _normalize_group_url(url: str) -> str:
    p = urlparse((url or "").strip())
    path = (p.path or "").rstrip("/")
    return f"{p.scheme}://{p.netloc}{path}".lower()


def update_group_status_by_url(target_url: str, status: str = "done") -> bool:
    """Tìm dòng trùng URL_Nhóm (cột A) và ghi Trạng thái (cột C nếu đúng layout)."""

    sid = settings.google_spreadsheet_id
    top_tab = resolve_top_posts_tab_title(sid)
    tab = resolve_group_urls_tab_title(sid, top_tab)
    if not tab:
        logger.warning("Không có tab URL nhóm — bỏ qua cập nhật trạng thái cho %s", target_url)
        return False
    raw = _read_values(spreadsheet_id=sid, range_a1=_sheet_a1(sid, tab, "A:Z"))
    if len(raw) < 2:
        return False

    headers = [str(c or "").strip() for c in raw[0]]
    try:
        url_col_index = next(
            i
            for i, h in enumerate(headers)
            if _normalize_header_cell(h) in {_normalize_header_cell("URL_Nhóm"), _normalize_header_cell("url_nhom")}
        )
    except StopIteration:
        url_col_index = 0

    try:
        status_col_index = next(
            i
            for i, h in enumerate(headers)
            if _normalize_header_cell(h) in {_normalize_header_cell("Trạng thái"), _normalize_header_cell("trang thai")}
        )
    except StopIteration:
        status_col_index = 2

    want = _normalize_group_url(target_url)
    row_number: int | None = None
    for offset, line in enumerate(raw[1:], start=2):
        cells = list(line) + [""] * (url_col_index + 1 - len(line))
        cell = cells[url_col_index] if url_col_index < len(cells) else ""
        if _normalize_group_url(str(cell)) == want:
            row_number = offset
            break

    if row_number is None:
        logger.warning("Không tìm thấy URL nhóm trong sheet để cập nhật trạng thái: %s", target_url)
        return False

    col_letter = chr(ord("A") + status_col_index)
    range_a1 = _sheet_a1(sid, tab, f"{col_letter}{row_number}")
    service = get_sheets_service()
    service.spreadsheets().values().update(
        spreadsheetId=sid,
        range=range_a1,
        valueInputOption="USER_ENTERED",
        body={"values": [[status]]},
    ).execute()
    return True


def safe_http_message(exc: Exception) -> str:
    if isinstance(exc, HttpError):
        try:
            return str(exc.error_details or exc.reason or exc)
        except Exception:
            return str(exc)
    return str(exc)


def get_member_name_from_users_sheet(email: str) -> str:
    """Đọc cột A và B của tab 'users' để tìm tên tương ứng với email member."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:B",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        if not raw or len(raw) < 2:
            return ""
            
        target = email.strip().lower()
        for row in raw[1:]:
            if len(row) >= 2:
                row_email = str(row[0] or "").strip().lower()
                row_name = str(row[1] or "").strip()
                if row_email == target:
                    return row_name
    except Exception as e:
        logger.error("Error reading member name from users sheet: %s", e)
    return ""


def append_seeding_kpi_row(
    *,
    email_member: str,
    name: str,
    link_comment: str,
    name_profile: str,
    platform: str,
    content: str,
    link_post: str,
    verify: str,
    profile_id: str = "",
    facebook_name: str = "",
) -> None:
    """Thêm dòng mới vào tab 'seeding_content_kpi' của Google Sheet.

    Columns (11 cột A→K):
      A=email_member, B=name, C=link_comment, D=name_profile,
      E=platform, F=content, G=link_post, H=verify,
      I=current_day, J=profile_id, K=facebook_name
    """
    sid = settings.google_spreadsheet_id
    tab = "seeding_content_kpi"

    # Lấy ngày hiện tại định dạng DD-MM-YYYY
    from datetime import datetime
    current_day = datetime.now().strftime("%d-%m-%Y")

    row_values = [
        email_member,
        name,
        link_comment,
        name_profile,
        platform,
        content,
        link_post,
        verify,
        current_day,
        profile_id,
        facebook_name,
    ]

    service = get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=sid,
        range=f"'{tab}'!A:K",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row_values]},
    ).execute()


def update_user_leader_in_users_sheet(member_email: str, leader_email: str) -> dict:
    """Tìm member_email trong tab 'users', cập nhật email_leader thành leader_email, và trả về kết quả."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        # Read A:E
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:E",
            majorDimension="ROWS"
        ).execute().get("values", [])

        if not raw:
            return {"success": False, "message": "Không thể đọc dữ liệu từ tab 'users'."}

        target_email = member_email.strip().lower()
        found_row_idx = -1
        for idx, row in enumerate(raw):
            if idx == 0:
                continue
            if len(row) >= 1:
                row_email = str(row[0] or "").strip().lower()
                if row_email == target_email:
                    found_row_idx = idx + 1 # 1-indexed for Google Sheets
                    break

        if found_row_idx == -1:
            return {"success": False, "message": f"Email thành viên '{member_email}' không tồn tại trong danh sách 'users'."}

        # Update role to 'member' (Column D) and email_leader to leader_email (Column E)
        service.spreadsheets().values().update(
            spreadsheetId=sid,
            range=f"'users'!D{found_row_idx}:E{found_row_idx}",
            valueInputOption="USER_ENTERED",
            body={"values": [["member", leader_email.strip().lower()]]}
        ).execute()

        return {"success": True, "message": f"Đã thêm thành viên '{member_email}' vào quản lý của leader '{leader_email}'."}
    except Exception as e:
        logger.error("Error updating member leader in sheet: %s", e)
        return {"success": False, "message": f"Lỗi Google Sheet: {str(e)}"}


def update_user_role_to_leader_in_sheet(email: str) -> dict:
    """Tìm email trong tab 'users', cập nhật role thành 'leader', xóa email_leader (nếu có)."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:E",
            majorDimension="ROWS"
        ).execute().get("values", [])

        target_email = email.strip().lower()
        found_row_idx = -1
        if raw:
            for idx, row in enumerate(raw):
                if idx == 0:
                    continue
                if len(row) >= 1:
                    row_email = str(row[0] or "").strip().lower()
                    if row_email == target_email:
                        found_row_idx = idx + 1
                        break

        if found_row_idx != -1:
            # Update role (Column D) to 'leader', clear email_leader (Column E)
            service.spreadsheets().values().update(
                spreadsheetId=sid,
                range=f"'users'!D{found_row_idx}:E{found_row_idx}",
                valueInputOption="USER_ENTERED",
                body={"values": [["leader", ""]]}
            ).execute()
        else:
            # Append new leader row: email, name, slug, role, email_leader
            name = email.split("@")[0]
            row_values = [target_email, name, name, "leader", ""]
            service.spreadsheets().values().append(
                spreadsheetId=sid,
                range="'users'!A:E",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row_values]}
            ).execute()

        return {"success": True, "message": f"Đã cập nhật vai trò leader cho email '{email}'."}
    except Exception as e:
        logger.error("Error setting user as leader in sheet: %s", e)
        return {"success": False, "message": str(e)}


def update_user_role_to_member_in_sheet(email: str) -> dict:
    """Tìm email trong tab 'users', cập nhật role thành 'member'."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:E",
            majorDimension="ROWS"
        ).execute().get("values", [])

        target_email = email.strip().lower()
        found_row_idx = -1
        if raw:
            for idx, row in enumerate(raw):
                if idx == 0:
                    continue
                if len(row) >= 1:
                    row_email = str(row[0] or "").strip().lower()
                    if row_email == target_email:
                        found_row_idx = idx + 1
                        break

        if found_row_idx != -1:
            # Update role (Column D) to 'member'
            service.spreadsheets().values().update(
                spreadsheetId=sid,
                range=f"'users'!D{found_row_idx}",
                valueInputOption="USER_ENTERED",
                body={"values": [["member"]]}
            ).execute()
        else:
            # Append new member row: email, name, slug, role, email_leader
            name = email.split("@")[0]
            row_values = [target_email, name, name, "member", ""]
            service.spreadsheets().values().append(
                spreadsheetId=sid,
                range="'users'!A:E",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row_values]}
            ).execute()

        return {"success": True, "message": f"Đã cập nhật vai trò member cho email '{email}'."}
    except Exception as e:
        logger.error("Error setting user as member in sheet: %s", e)
        return {"success": False, "message": str(e)}


def get_seeding_kpi_rows_for_member(
    email_member: str,
    profile_id: str = "",
    facebook_name: str = "",
) -> list[dict]:
    """Đọc tab 'seeding_content_kpi' và lọc theo email_member + profile_id + facebook_name (AND).

    Filter logic:
    - Nếu profile_id không rỗng → bắt buộc khớp cột J (profile_id)
    - Nếu facebook_name không rỗng → bắt buộc khớp cột K (facebook_name) theo lowercase
    - Nếu email_member không rỗng → bắt buộc khớp cột A (email_member)
    - Nếu tất cả rỗng → trả về tất cả rows
    """
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        # columns: A=email, B=name, C=link_comment, D=name_profile,
        #          E=platform, F=content, G=link_post, H=verify, I=day, J=profile_id, K=fb_name
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'seeding_content_kpi'!A:K",
            majorDimension="ROWS"
        ).execute().get("values", [])

        if not raw or len(raw) < 2:
            return []

        headers = [str(h).strip() for h in raw[0]]
        rows = raw[1:]

        target_email = email_member.strip().lower() if email_member else ""
        target_pid = profile_id.strip() if profile_id else ""
        target_fb_name = (facebook_name or "").strip().lower()

        # Nếu tất cả filter rỗng → trả mọi thứ
        no_filter = not target_email and not target_pid and not target_fb_name

        out = []
        for r in rows:
            if len(r) < 1:
                continue
            r_email = str(r[0] or "").strip().lower()
            r_pid = str(r[9] if len(r) > 9 else "").strip()
            r_fb_name = str(r[10] if len(r) > 10 else "").strip().lower()

            if not no_filter:
                # email filter
                if target_email and r_email != target_email:
                    continue
                # profile_id filter (exact match, không phân biệt case)
                if target_pid and r_pid.lower() != target_pid.lower():
                    continue
                # facebook_name filter (lowercase)
                if target_fb_name and r_fb_name != target_fb_name:
                    continue

            # Pad row values to match headers length
            padded = r + [""] * (len(headers) - len(r))
            row_dict = dict(zip(headers, padded))
            out.append(row_dict)

        return out
    except Exception as e:
        logger.error("Error reading seeding kpi rows: %s", e)
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# SEEDING MARK (Step 1: đánh dấu seeding - lưu trước verify)
# ═══════════════════════════════════════════════════════════════════════════════

def append_seeding_mark(
    *,
    email_member: str,
    link_post: str,
) -> None:
    """Lưu dấu đã seeding (Step 1): chỉ lưu email + link_post vào tab 'seeding_content_kpi'.

    Columns (2 cột đầu tiên):
      A=email_member, G=link_post
    verify sẽ được fill sau ở Step 2 (verify).
    """
    sid = settings.google_spreadsheet_id
    tab = "seeding_content_kpi"

    row_values = [
        email_member.strip().lower(),
        "",        # B=name
        "",        # C=link_comment
        "",        # D=name_profile
        "",        # E=platform
        "",        # F=content
        link_post.strip(),
        "pending", # H=verify (Step 2 sẽ fill thành "yes")
        "",        # I=day
        "",        # J=profile_id
        "",        # K=facebook_name
    ]

    service = get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=sid,
        range=f"'{tab}'!A:K",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row_values]},
    ).execute()


def update_seeding_mark_to_verified(
    *,
    email_member: str,
    link_post: str,
    name: str,
    link_comment: str,
    name_profile: str,
    platform: str,
    content: str,
    profile_id: str = "",
    facebook_name: str = "",
    verify: str = "yes",
) -> bool:
    """Update dòng đã mark thành verified (Step 2): fill đầy đủ columns.

    Tìm dòng có email + link_post khớp, verify='pending', và update.
    """
    sid = settings.google_spreadsheet_id
    tab = "seeding_content_kpi"

    try:
        service = get_sheets_service()
        # Đọc tất cả rows
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range=f"'{tab}'!A:K",
            majorDimension="ROWS"
        ).execute().get("values", [])

        if not raw or len(raw) < 2:
            return False

        from datetime import datetime as dt
        current_day = dt.now().strftime("%d-%m-%Y")
        target_email = email_member.strip().lower()
        target_link = link_post.strip().lower()

        # Tìm row index (1-indexed, dòng 1 = header)
        row_idx = None
        for i, r in enumerate(raw[1:], start=2):
            r_email = str(r[0] or "").strip().lower()
            r_link = str(r[6] if len(r) > 6 else "").strip().lower()
            r_verify = str(r[7] if len(r) > 7 else "").strip().lower()

            if r_email == target_email and r_link == target_link and r_verify == "pending":
                row_idx = i
                break

        if row_idx is None:
            logger.warning("Không tìm thấy dòng pending để verify: email=%s, link=%s", target_email, target_link)
            return False

        # Update row
        update_values = [
            target_email,       # A=email
            name,              # B=name
            link_comment,      # C=link_comment
            name_profile,      # D=name_profile
            platform,          # E=platform
            content,           # F=content
            link_post.strip(), # G=link_post
            verify,            # H=verify
            current_day,       # I=day
            profile_id,        # J=profile_id
            facebook_name,     # K=facebook_name
        ]

        service.spreadsheets().values().update(
            spreadsheetId=sid,
            range=f"'{tab}'!A{row_idx}:K{row_idx}",
            valueInputOption="USER_ENTERED",
            body={"values": [update_values]},
        ).execute()

        return True
    except Exception as e:
        logger.error("Error updating seeding mark to verified: %s", e)
        return False


def get_seeding_mark_rows(email_member: str, verified: bool = False) -> list[dict]:
    """Lấy danh sách seeding marks của 1 member.

    Args:
        email_member: email cần lọc
        verified: True = đã verify (verify='yes'), False = chưa verify (verify='pending')
    """
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'seeding_content_kpi'!A:K",
            majorDimension="ROWS"
        ).execute().get("values", [])

        if not raw or len(raw) < 2:
            return []

        headers = [str(h).strip() for h in raw[0]]
        rows = raw[1:]
        target_email = email_member.strip().lower()
        verify_filter = "yes" if verified else "pending"

        out = []
        for r in rows:
            if len(r) < 1:
                continue
            r_email = str(r[0] or "").strip().lower()
            r_verify = str(r[7] if len(r) > 7 else "").strip().lower()
            r_link = str(r[6] if len(r) > 6 else "").strip().lower()

            # Filter email + verify status
            if r_email != target_email:
                continue
            if r_verify != verify_filter:
                continue
            if not r_link:
                continue

            padded = r + [""] * (len(headers) - len(r))
            row_dict = dict(zip(headers, padded))
            out.append(row_dict)

        return out
    except Exception as e:
        logger.error("Error reading seeding mark rows: %s", e)
        return []


def get_all_seeding_marks(email_member: str) -> list[dict]:
    """Lấy TẤT CẢ seeding marks của 1 member (cả verified và chưa verified).

    Args:
        email_member: email cần lọc

    Returns:
        List of dict với fields: link_post, verify (yes/pending)
    """
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'seeding_content_kpi'!A:K",
            majorDimension="ROWS"
        ).execute().get("values", [])

        if not raw or len(raw) < 2:
            return []

        target_email = email_member.strip().lower()

        out = []
        for r in raw[1:]:  # Skip header row
            if len(r) < 7:
                continue
            r_email = str(r[0] or "").strip().lower()
            r_verify = str(r[7] if len(r) > 7 else "").strip().lower()
            r_link = str(r[6] if len(r) > 6 else "").strip().lower()

            if r_email != target_email:
                continue
            if not r_link:
                continue

            out.append({
                "link_post": r_link,
                "verify": r_verify,  # "yes" = đã verify, "pending" = chưa verify
            })

        return out
    except Exception as e:
        logger.error("Error reading all seeding marks: %s", e)
        return []


def get_member_info_from_users_sheet(email: str) -> dict:
    """Đọc tab 'users' và tìm name, url_profile của member."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:E",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        if not raw or len(raw) < 2:
            return {}
            
        target = email.strip().lower()
        for row in raw[1:]:
            if len(row) >= 1:
                row_email = str(row[0] or "").strip().lower()
                if row_email == target:
                    name = str(row[1] or "").strip() if len(row) > 1 else ""
                    slug = str(row[2] or "").strip() if len(row) > 2 else ""
                    
                    # Build profile URL
                    url = ""
                    if slug:
                        if slug.startswith("http"):
                            url = slug
                        elif "facebook.com" in slug or "fb.com" in slug:
                            url = slug
                        else:
                            url = f"https://www.linkedin.com/in/{slug}"
                    return {"name": name, "url_profile": url}
    except Exception as e:
        logger.error("Error reading member info from users sheet: %s", e)
    return {}


def assign_kpi_to_sheet_tracker(
    email_member: str,
    email_leader: str,
    platform: str,
    kpi_sedding_per_week: int,
    start: str,
    end: str
) -> dict:
    """Ghi đè hoặc thêm mới KPI vào tab 'kpi_tracker'."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        
        # 1. Lấy thông tin name, url_profile từ users sheet
        info = get_member_info_from_users_sheet(email_member)
        name = info.get("name") or email_member.split("@")[0]
        url_profile = info.get("url_profile") or ""
        
        # 2. Đọc toàn bộ kpi_tracker để tìm dòng trùng
        # columns: email_member, name, url_profile, email_leader, platfom, kpi_sedding_per_week, start, end, status
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'kpi_tracker'!A:I",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        target_email = email_member.strip().lower()
        target_platform = platform.strip()
        target_start = start.strip()
        target_end = end.strip()
        
        found_row_idx = -1
        if raw and len(raw) > 1:
            for idx, r in enumerate(raw[1:], start=2):
                if len(r) >= 8:
                    r_email = str(r[0] or "").strip().lower()
                    r_plat = str(r[4] or "").strip().lower()
                    r_start = str(r[6] or "").strip()
                    r_end = str(r[7] or "").strip()
                    
                    if (r_email == target_email and 
                        r_plat.replace(" ", "") == target_platform.lower().replace(" ", "") and 
                        r_start == target_start and 
                        r_end == target_end):
                        found_row_idx = idx
                        break
                        
        row_values = [
            target_email,
            name,
            url_profile,
            email_leader.strip().lower(),
            target_platform,
            str(kpi_sedding_per_week),
            target_start,
            target_end,
            "Proccess" # Trạng thái ban đầu
        ]
        
        if found_row_idx != -1:
            # Ghi đè dòng cũ
            service.spreadsheets().values().update(
                spreadsheetId=sid,
                range=f"'kpi_tracker'!A{found_row_idx}:I{found_row_idx}",
                valueInputOption="USER_ENTERED",
                body={"values": [row_values]}
            ).execute()
            msg = f"Đã cập nhật KPI cho {email_member} (tuần {start} -> {end})."
        else:
            # Thêm dòng mới
            service.spreadsheets().values().append(
                spreadsheetId=sid,
                range="'kpi_tracker'!A:I",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row_values]}
            ).execute()
            msg = f"Đã thêm mới KPI cho {email_member} (tuần {start} -> {end})."
            
        return {"success": True, "message": msg}
    except Exception as e:
        logger.error("Error assigning KPI in sheet: %s", e)
        return {"success": False, "message": f"Lỗi Google Sheet: {str(e)}"}


def sync_and_get_kpis_for_members(member_emails: list[str]) -> list[dict]:
    """
    Lấy toàn bộ KPI của các member và tiến hành tính toán tiến độ seeding thực tế.
    Nếu seeding đạt mục tiêu thì tự động cập nhật status = "Done".
    Nếu quá hạn và chưa đạt thì cập nhật status = "Trễ deadline".
    Ngược lại status = "Proccess".
    """
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        
        # 1. Đọc toàn bộ kpi_tracker
        # email_member, name, url_profile, email_leader, platfom, kpi_sedding_per_week, start, end, status
        raw_kpi = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'kpi_tracker'!A:I",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        if not raw_kpi or len(raw_kpi) < 1:
            return []
            
        kpi_headers = [str(h).strip() for h in raw_kpi[0]]
        # Chuẩn hóa để tránh 'platfom' vs 'platform'
        normalized_headers = []
        for h in kpi_headers:
            if h.lower() == "platfom":
                normalized_headers.append("platform")
            else:
                normalized_headers.append(h)
                
        kpi_rows = raw_kpi[1:]
        
        # 2. Đọc toàn bộ seeding_content_kpi
        # email_member, name, url_profile, platform, content, link_post, verify, day
        raw_seeding = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'seeding_content_kpi'!A:I",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        seeding_rows = []
        if raw_seeding and len(raw_seeding) > 1:
            seed_headers = [str(h).strip() for h in raw_seeding[0]]
            for r in raw_seeding[1:]:
                padded = r + [""] * (len(seed_headers) - len(r))
                seeding_rows.append(dict(zip(seed_headers, padded)))
                
        # 3. Lọc danh sách email cần tính toán
        target_emails = {email.strip().lower() for email in member_emails if email.strip()}
        
        today = datetime.now().date()
        results = []
        
        # Helper to parse dates safely
        def _parse_d(date_str):
            if not date_str:
                return None
            date_str = date_str.strip()
            for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return datetime.strptime(date_str, fmt).date()
                except ValueError:
                    continue
            return None
            
        # Duyệt qua các dòng KPI
        for idx, r in enumerate(kpi_rows, start=2):
            if not r or len(r) < 1:
                continue
                
            padded = r + [""] * (len(normalized_headers) - len(r))
            kpi_dict = dict(zip(normalized_headers, padded))
            
            kpi_member_email = kpi_dict.get("email_member", "").strip().lower()
            if target_emails and kpi_member_email not in target_emails:
                continue
                
            # Lấy thông tin KPI
            platform = kpi_dict.get("platform") or ""
            target_count_str = kpi_dict.get("kpi_sedding_per_week") or "0"
            try:
                target_count = int(target_count_str)
            except ValueError:
                target_count = 0
                
            start_str = kpi_dict.get("start", "")
            end_str = kpi_dict.get("end", "")
            current_status = kpi_dict.get("status", "").strip()
            
            start_date = _parse_d(start_str)
            end_date = _parse_d(end_str)
            
            # Tính toán số lượng seeding thực tế
            # Đếm khi: verify='yes' HOẶC 'đã seeding' VÀ có content (comment)
            actual_count = 0
            matching_seeding_posts = []
            for s in seeding_rows:
                s_email = s.get("email_member", "").strip().lower()
                s_plat = s.get("platform", "").strip().lower()
                s_verify = s.get("verify", "").strip().lower()
                s_content = s.get("content", "").strip()
                s_day_str = s.get("day", "")
                
                # Check email and platform
                if s_email == kpi_member_email and s_plat == platform.strip().lower():
                    # Thống nhất: verify='yes' || 'đã seeding' || 'xác minh' + có content
                    is_verified = s_verify == "yes" or "đã seeding" in s_verify or "da seeding" in s_verify or "xác minh" in s_verify
                    if is_verified and s_content:
                        s_date = _parse_d(s_day_str)
                        # Check date range
                        if s_date and start_date and end_date:
                            if start_date <= s_date <= end_date:
                                actual_count += 1
                                matching_seeding_posts.append({
                                    "day": s_day_str,
                                    "link_post": s.get("link_post", ""),
                                    "link_comment": s.get("link_comment", ""),
                                    "content": s_content,
                                    "verify": s.get("verify", "")
                                })
                                
            # Đánh giá trạng thái KPI mới
            new_status = "Proccess"
            if actual_count >= target_count:
                new_status = "Done"
            elif end_date and today > end_date:
                new_status = "Trễ deadline"
                
            # Nếu trạng thái thay đổi, cập nhật lên Google Sheets
            if new_status != current_status:
                try:
                    service.spreadsheets().values().update(
                        spreadsheetId=sid,
                        range=f"'kpi_tracker'!I{idx}",
                        valueInputOption="USER_ENTERED",
                        body={"values": [[new_status]]}
                    ).execute()
                    kpi_dict["status"] = new_status
                except Exception as e:
                    logger.error(f"Error updating KPI status for row {idx}: {e}")
                    
            # Thêm các trường tiến độ thực tế vào kết quả trả về
            kpi_dict["actual_seeding"] = actual_count
            kpi_dict["matching_posts"] = matching_seeding_posts
            results.append(kpi_dict)
            
        return results
    except Exception as e:
        logger.error("Error syncing and getting member KPIs: %s", e)
        return []


def to_ymd(d: str) -> str:
    """Convert DD-MM-YYYY or YYYY-MM-DD to YYYY-MM-DD for comparison."""
    if not d:
        return ""
    d = d.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", d):
        return d
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$", d)
    if m:
        dd, mm, yyyy = m.groups()
        return f"{yyyy}-{dd.zfill(2)}-{mm.zfill(2)}"
    return d


def get_members_for_leader(leader_email: str) -> list[dict]:
    """Lấy danh sách các member thuộc quản lý của leader từ tab 'users'."""
    try:
        service = get_sheets_service()
        sid = settings.google_spreadsheet_id
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'users'!A:E",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        if not raw or len(raw) < 2:
            return []
            
        headers = [str(h).strip().lower() for h in raw[0]]
        rows = raw[1:]
        
        leader_norm = leader_email.strip().lower()
        out = []
        for r in rows:
            if not r:
                continue
            padded = r + [""] * (len(headers) - len(r))
            row_dict = dict(zip(headers, padded))
            
            r_leader = row_dict.get("email_leader", "").strip().lower()
            r_role = row_dict.get("role", "").strip().lower()
            
            if r_leader == leader_norm and r_role == "member":
                out.append({
                    "email": row_dict.get("email", "").strip().lower(),
                    "name": row_dict.get("name", "").strip(),
                    "profile_slug": row_dict.get("profile_slug", "").strip(),
                    "role": "member",
                    "email_leader": leader_norm
                })
        return out
    except Exception as e:
        logger.error("Error getting members for leader: %s", e)
        return []



