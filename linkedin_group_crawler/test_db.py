import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from app.modules.all_platform.zalo.services.supabase_service import _rest

async def main():
    rows = await _rest('GET', 'zalo_messages', params={'select': 'group_id,group_name', 'user_id': 'eq.ho-ng', 'limit': '100', 'order': 'created_at.desc'})
    if not rows:
        print('No rows found')
        return
    seen = set()
    for r in rows:
        k = (r.get('group_id'), r.get('group_name'))
        if k not in seen:
            seen.add(k)
            print(k)

asyncio.run(main())
