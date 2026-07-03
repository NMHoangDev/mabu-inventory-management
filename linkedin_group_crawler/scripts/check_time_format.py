"""Check format thời gian trong DB zalo_messages."""
import asyncio
from app.modules.all_platform.zalo.services.supabase_service import _rest


async def main():
    rows = await _rest(
        "GET",
        "zalo_messages",
        params={
            "select": "id,timestamp_text,time_text,is_sent,created_at,content",
            "order": "created_at.desc",
            "limit": "10",
        },
    ) or []
    print(f"=== {len(rows)} rows mới nhất ===")
    for r in rows:
        print(f"  ts_text='{r.get('timestamp_text')}'")
        print(f"  time_text='{r.get('time_text')}'")
        print(f"  created_at='{r.get('created_at')}'")
        print(f"  is_sent={r.get('is_sent')}, content='{(r.get('content') or '')[:50]}'")
        print()


if __name__ == "__main__":
    asyncio.run(main())
