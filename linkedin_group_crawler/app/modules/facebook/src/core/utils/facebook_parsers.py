from datetime import datetime, timedelta
import re
from app.modules.facebook.src.modules.facebook.constants.facebook_regex import (
    RE_JUST_NOW, RE_SECONDS, RE_MINUTES, RE_HOURS,
    RE_TODAY, RE_YESTERDAY, RE_DAYS_AGO, RE_WEEKS_AGO,
    RE_MONTHS, RE_YEAR_4D,
)


def extract_ts_hint(raw: str) -> str:
    """
    Trích xuất cụm từ chỉ thời gian từ raw text bất kỳ.
    Ưu tiên lấy cụm ngắn gọn nhất, đủ để classify_timestamp nhận ra.
    
    VD input:  "14 giờ · 🌐"  /  "Nguyễn Hoàng · 1 giờ"  /  "Hôm qua lúc 10:30"
    VD output: "14 giờ"        /  "1 giờ"                  /  "Hôm qua lúc 10:30"
    """
    if not raw:
        return ""

    # Thứ tự ưu tiên: từ mới nhất → cũ nhất
    ordered_patterns = [
        RE_JUST_NOW,   # vừa xong
        RE_SECONDS,    # N giây
        RE_MINUTES,    # N phút
        RE_HOURS,      # N giờ  ← "14 giờ" bắt ở đây
        RE_TODAY,      # hôm nay
        RE_YESTERDAY,  # hôm qua
        RE_DAYS_AGO,   # N ngày
        RE_WEEKS_AGO,  # N tuần
        RE_MONTHS,     # tháng / January...
        RE_YEAR_4D,    # 2024, 2025
    ]

    for pattern in ordered_patterns:
        m = pattern.search(raw)
        if m:
            return m.group(0).strip()  # Trả về đúng cụm khớp, không lấy cả raw

    return ""


def classify_timestamp(ts: str) -> str:
    """
    Phân loại timestamp thành: 'recent' | 'old' | 'unknown'
    
    - recent : trong vòng 24 giờ → lấy bài
    - old    : quá 24 giờ        → bỏ qua
    - unknown: không đọc được    → mặc định coi là recent (thà lấy dư hơn bỏ sót)
    """
    if not ts:
        return 'unknown'

    t = ts.lower().strip()
    now = datetime.now()

    try:
        post_time = now

        # 1. "Vừa xong"
        if "vừa xong" in t:
            post_time = now
            
        # 2. Phút
        elif "phút" in t:
            match = re.search(r'(\d+)\s*phút', t)
            if match:
                post_time = now - timedelta(minutes=int(match.group(1)))
                
        # 3. Giờ
        elif "giờ" in t:
            match = re.search(r'(\d+)\s*giờ', t)
            if match:
                post_time = now - timedelta(hours=int(match.group(1)))
                
        # 4. Hôm qua
        elif "hôm qua" in t:
            base_time = now - timedelta(days=1)
            time_match = re.search(r'lúc\s*(\d{1,2}):(\d{2})', t)
            if time_match:
                h, m = int(time_match.group(1)), int(time_match.group(2))
                base_time = base_time.replace(hour=h, minute=m, second=0, microsecond=0)
            post_time = base_time
            
        # 5. Ngày/Tuần
        elif "ngày" in t and "hôm nay" not in t:
            match = re.search(r'(\d+)\s*ngày', t)
            if match:
                post_time = now - timedelta(days=int(match.group(1)))
        elif "tuần" in t:
            match = re.search(r'(\d+)\s*tuần', t)
            if match:
                post_time = now - timedelta(weeks=int(match.group(1)))
                
        # 6. Ngày tháng (Ví dụ: 12 tháng 5 lúc 10:00)
        elif "tháng" in t:
            match = re.search(r'(\d{1,2})\s*tháng\s*(\d{1,2})', t)
            if match:
                day, month = int(match.group(1)), int(match.group(2))
                
                year_match = re.search(r'năm\s*(\d{4})', t)
                year = int(year_match.group(1)) if year_match else now.year
                    
                base_time = now.replace(year=year, month=month, day=day)
                
                time_match = re.search(r'lúc\s*(\d{1,2}):(\d{2})', t)
                if time_match:
                    h, m = int(time_match.group(1)), int(time_match.group(2))
                    base_time = base_time.replace(hour=h, minute=m, second=0, microsecond=0)
                    
                if base_time > now:
                    base_time = base_time.replace(year=year - 1)
                    
                post_time = base_time
                
        # 7. Năm
        elif "năm" in t:
            match = re.search(r'(\d{4})', t)
            if match:
                year = int(match.group(1))
                if year < now.year:
                    return 'old'

        # Kiểm tra khoảng cách thời gian
        delta = now - post_time
        if delta.total_seconds() <= 24 * 3600:
            return 'recent'
        else:
            return 'old'

    except Exception:
        return 'unknown'


def clean_post_url(href: str) -> str:
    """Làm sạch URL: bỏ query params rác, chỉ giữ đường dẫn gốc."""
    if not href:
        return ""
    #  nếu link bắt đc mà không có https://www.facebook.com thì thêm vào vd /reel/1377
    if href.startswith('/'):
        href = f"https://www.facebook.com{href}"
    elif not href.startswith('http'):
        href = f"https://www.facebook.com/{href}"
    try:
        from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
        parsed = urlparse(href)

        # 🚀 CẬP NHẬT: Thêm fbid và set để không làm hỏng link ảnh
        KEEP_PARAMS = {'story_fbid', 'id', 'v', 'video_id', 'fbid', 'set'}
        qs = parse_qs(parsed.query, keep_blank_values=False)
        filtered = {k: v for k, v in qs.items() if k in KEEP_PARAMS}

        clean = parsed._replace(
            query=urlencode(filtered, doseq=True),
            fragment=''
        )
        return urlunparse(clean)
    except Exception:
        return href