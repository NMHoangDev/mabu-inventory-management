import asyncio
import json
import os
from pathlib import Path

# Fix relative imports
import sys
sys.path.insert(0, str(Path.cwd()))

from loguru import logger
logger.remove()
logger.add(sys.stdout)

from app.modules.all_platform.zalo.services.zca_auth_store import load_zca_auth
from app.modules.all_platform.zalo.services.zca_api_bridge import get_zca_group_history

async def main():
    auth = await load_zca_auth('ho-ng')
    msgs = await get_zca_group_history(auth, '412492193183', count=10)
    print("Messages count:", len(msgs))
    if msgs:
        print("First message ID:", msgs[0].message_id)

asyncio.run(main())
