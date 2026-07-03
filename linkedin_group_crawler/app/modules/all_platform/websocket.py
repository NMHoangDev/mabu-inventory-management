import asyncio
import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.active_crawls: dict = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Bắn lại các tiến trình cào đang dở cho người dùng mới kết nối
        for crawl_msg in self.active_crawls.values():
            try:
                await websocket.send_text(json.dumps(crawl_msg))
            except Exception:
                pass

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        event = message.get("event")
        user_id = message.get("user_id", "unknown")
        
        if event == "crawl_started":
            self.active_crawls[user_id] = message
        elif event in ["crawl_success", "crawl_error"]:
            if user_id in self.active_crawls:
                del self.active_crawls[user_id]

        if not self.active_connections:
            return
        msg_str = json.dumps(message)
        for connection in self.active_connections:
            try:
                await connection.send_text(msg_str)
            except Exception:
                pass

manager = ConnectionManager()
