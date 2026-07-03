import asyncio
import logging
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
import asyncssh

from app.modules.facebook.src.modules.crud.vps_fb.vps import (
    get_all_vps,
    get_vps_by_id,
    create_vps,
    update_vps,
    delete_vps,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/vnc-vps",
    tags=["vnc-vps"],
)

class VpsCreate(BaseModel):
    display_name: str
    ip: str
    port: Optional[int] = None
    password: Optional[str] = None
    vps_protocol_enum: Optional[str] = None
    id_member: Optional[str] = None
    Username: Optional[str] = None

class VpsUpdate(BaseModel):
    display_name: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    password: Optional[str] = None
    vps_protocol_enum: Optional[str] = None
    id_member: Optional[str] = None
    Username: Optional[str] = None

@router.get("")
def read_vps_list():
    try:
        data = get_all_vps()
        return {"data": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("")
def add_vps(vps: VpsCreate):
    try:
        data_to_insert = vps.model_dump()
        data = create_vps(data_to_insert)
        return {"data": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.put("/{vps_id}")
def edit_vps(vps_id: str, vps: VpsUpdate):
    update_data = vps.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        data = update_vps(vps_id, update_data)
        return {"data": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.delete("/{vps_id}")
def remove_vps(vps_id: str):
    try:
        data = delete_vps(vps_id)
        return {"data": data, "message": "Deleted successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ==========================================
# WEBSOCKET VNC PROXY (Websockify Alternative)
# ==========================================

@router.websocket("/vnc/{vps_id}")
async def vnc_proxy(websocket: WebSocket, vps_id: str):
    """
    WebSocket proxy cho noVNC. Kết nối Backend với VPS qua TCP port chỉ định hoặc fallback 5900/5901.
    """
    await websocket.accept()
    
    try:
        vps_info = get_vps_by_id(vps_id)
        if not vps_info:
            await websocket.close(code=1008, reason="VPS not found in DB")
            return
            
        vps_ip = vps_info.get("ip")
        if not vps_ip:
            await websocket.close(code=1008, reason="VPS IP is empty")
            return

        # Lấy port từ CSDL, nếu không có thì thử 5900 và 5901
        vps_port = vps_info.get("port")
        target_ports = [vps_port] if vps_port else [5900, 5901]
        
        logger.info(f"[VNC] Connecting to VPS {vps_id} at {vps_ip}:{target_ports}")
        
        reader, writer = None, None
        connected = False

        for port in target_ports:
            try:
                logger.info(f"[VNC] Trying port {port}...")
                
                # Sử dụng create_connection với retry cho Windows
                for attempt in range(3):
                    try:
                        reader, writer = await asyncio.wait_for(
                            asyncio.open_connection(vps_ip, port),
                            timeout=5.0
                        )
                        connected = True
                        logger.info(f"[VNC] Connected successfully on port {port}")
                        break
                    except OSError as e:
                        if e.winerror == 10035 and attempt < 2:  # Retry on Windows non-blocking error
                            logger.warning(f"[VNC] Windows non-blocking error, retrying ({attempt + 1}/3)...")
                            await asyncio.sleep(1)
                            continue
                        raise
                
                if connected:
                    break
            except asyncio.TimeoutError:
                logger.warning(f"[VNC] Timeout connecting to port {port} at {vps_ip}")
            except Exception as e:
                logger.warning(f"[VNC] Failed port {port}: {type(e).__name__}: {e}")
                
        if not connected or not reader or not writer:
            logger.error(f"Không thể kết nối TCP tới VNC server tại {vps_ip} (các cổng: {target_ports})")
            await websocket.close(code=1011, reason="Could not connect to VNC server on VPS")
            return

        async def forward_ws_to_tcp():
            """Nhận dữ liệu từ Trình duyệt (noVNC) gửi thẳng vào TCP VPS"""
            try:
                while True:
                    data = await websocket.receive_bytes()
                    writer.write(data)
                    await writer.drain()
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"Lỗi luồng forward WS -> TCP: {e}")
            finally:
                writer.close()

        async def forward_tcp_to_ws():
            """Nhận hình ảnh frame từ VPS TCP trả về Trình duyệt qua WebSocket"""
            try:
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"Lỗi luồng forward TCP -> WS: {e}")
            finally:
                try:
                    await websocket.close()
                except Exception:
                    pass

        # Chạy song song 2 chiều (Full Duplex)
        task1 = asyncio.create_task(forward_ws_to_tcp())
        task2 = asyncio.create_task(forward_tcp_to_ws())

        await asyncio.gather(task1, task2, return_exceptions=True)

    except Exception as e:
        logger.error(f"Lỗi tổng tại VNC proxy: {e}")
        try:
            await websocket.close(code=1011, reason="Internal proxy error")
        except Exception:
            pass


# ==========================================
# WEBSOCKET SSH PROXY (Web SSH)
# ==========================================

@router.websocket("/ssh/{vps_id}")
async def ssh_proxy(websocket: WebSocket, vps_id: str):
    """
    WebSocket proxy cho SSH Terminal (xterm.js).
    """
    await websocket.accept()
    
    try:
        vps_info = get_vps_by_id(vps_id)
        if not vps_info:
            await websocket.send_text("VPS not found in DB\r\n")
            await websocket.close(code=1008)
            return
            
        vps_ip = vps_info.get("ip")
        vps_password = vps_info.get("password")
        vps_port = vps_info.get("port") or 22
        
        # Thử lấy username từ DB (hỗ trợ cả chữ hoa và thường), xoá khoảng trắng thừa, mặc định 'root'
        raw_username = vps_info.get("username") or vps_info.get("Username")
        username = raw_username.strip() if raw_username else "root"

        if not vps_ip:
            await websocket.send_text("VPS IP is empty\r\n")
            await websocket.close(code=1008)
            return

        await websocket.send_text(f"\x1b[36mConnecting to SSH {username}@{vps_ip}:{vps_port}...\x1b[0m\r\n")

        try:
            # Bỏ qua xác thực host_keys
            conn = await asyncssh.connect(
                vps_ip,
                port=vps_port,
                username=username,
                password=vps_password,
                known_hosts=None
            )
        except Exception as e:
            await websocket.send_text(f"\x1b[31mFailed to connect SSH: {e}\x1b[0m\r\n")
            await websocket.close(code=1011)
            return

        await websocket.send_text("\x1b[32mConnected successfully! Launching shell...\x1b[0m\r\n")

        async with conn:
            # Yêu cầu shell với pty bằng create_process
            process = await conn.create_process(term_type="xterm-256color")
            
            # Cấu hình wrapper để read/write cho mượt
            async def forward_ws_to_ssh():
                import json
                try:
                    while True:
                        raw_data = await websocket.receive_text()
                        try:
                            msg = json.loads(raw_data)
                            msg_type = msg.get("type")
                            if msg_type == "input":
                                process.stdin.write(msg.get("data", ""))
                            elif msg_type == "resize":
                                cols = msg.get("cols", 80)
                                rows = msg.get("rows", 24)
                                process.change_terminal_size(cols, rows)
                        except json.JSONDecodeError:
                            # Fallback nếu client gửi text thuần thay vì JSON
                            process.stdin.write(raw_data)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.error(f"Lỗi luồng forward WS -> SSH: {e}")
                finally:
                    process.stdin.write_eof()

            async def forward_ssh_to_ws():
                try:
                    while True:
                        data = await process.stdout.read(4096)
                        if not data:
                            break
                        await websocket.send_text(data)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.error(f"Lỗi luồng forward SSH -> WS: {e}")
                finally:
                    try:
                        await websocket.close()
                    except Exception:
                        pass

            task1 = asyncio.create_task(forward_ws_to_ssh())
            task2 = asyncio.create_task(forward_ssh_to_ws())

            await asyncio.gather(task1, task2, return_exceptions=True)

    except Exception as e:
        logger.error(f"Lỗi tổng tại SSH proxy: {e}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
