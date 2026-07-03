from typing import Any, Dict, List, Optional
import asyncio
import base64
import re
import uuid
from datetime import datetime
import time

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse, JSONResponse
from loguru import logger
from playwright.async_api import Error as PlaywrightError

from app.modules.all_platform.zalo.crawler.browser import clear_user_profile_data, create_browser
from app.modules.all_platform.zalo.config import settings
from app.modules.all_platform.zalo.crawler.qr_login import (
    check_login_status,
    ZaloAlreadyLoggedInError,
    navigate_and_get_qr,
    qr_signature,
    qr_element_screenshot_bytes,
    refresh_qr_with_previous,
)
from app.modules.all_platform.zalo.schemas.session import SessionData
from app.modules.all_platform.zalo.services.session_store import (
    delete_session,
    delete_sessions_for_user,
    get_latest_session_for_user,
    get_latest_waiting_session,
    get_profile_lock,
    get_session,
    save_session,
)
from app.modules.all_platform.zalo.services.supabase_service import (
    get_zalo_account_by_id,
    save_listener_messages,
    upsert_groups,
    upsert_zalo_account,
    upsert_zalo_user,
)
from app.modules.all_platform.zalo.schemas.message import Message
from app.modules.all_platform.zalo.services.zca_auth_store import (
    delete_zca_auth,
    ensure_session_zca_auth,
    load_zca_auth,
    save_zca_auth,
)
from app.modules.all_platform.zalo.services.zca_persistent_listener import (
    get_listener_status,
    start_listener,
    stop_listener,
    reset_listener_auth_expired,
)
from app.modules.all_platform.zalo.services.zca_qr_bridge import (
    import_zca_auth_to_context,
    read_zca_event,
    start_zca_qr_process,
)
from app.modules.all_platform.zalo.api.security import verify_zalo_api_key

router = APIRouter(
    prefix="/auth",
    tags=["zalo-auth"],
    dependencies=[Depends(verify_zalo_api_key)],
)

_QR_REFRESH_TASKS: Dict[str, asyncio.Task] = {}
_QR_AUTO_REFRESH_SECONDS = 110
_PROFILE_RESUME_MISS_AT: Dict[str, float] = {}
_PROFILE_RESUME_MISS_COOLDOWN_SECONDS = 30
_QR_INIT_TIMEOUT_SECONDS = 300


def _cancel_qr_refresh_task(session_id: str) -> None:
    task = _QR_REFRESH_TASKS.pop(session_id, None)
    if task and not task.done():
        task.cancel()


def _track_qr_refresh_task(session_id: str, task: asyncio.Task) -> None:
    _QR_REFRESH_TASKS[session_id] = task

    def _cleanup(done_task: asyncio.Task) -> None:
        current = _QR_REFRESH_TASKS.get(session_id)
        if current is done_task:
            _QR_REFRESH_TASKS.pop(session_id, None)

    task.add_done_callback(_cleanup)


def _ensure_qr_refresh_task(session_id: str) -> None:
    existing = _QR_REFRESH_TASKS.get(session_id)
    if existing and not existing.done():
        return
    task = asyncio.create_task(_auto_refresh_qr_loop(session_id))
    _track_qr_refresh_task(session_id, task)


async def _auto_refresh_qr_loop(session_id: str) -> None:
    while True:
        await asyncio.sleep(_QR_AUTO_REFRESH_SECONDS)

        session = await get_session(session_id)
        if not session:
            _cancel_qr_refresh_task(session_id)
            return

        if not session.page:
            if session.status in {"confirmed", "qr_expired"}:
                _cancel_qr_refresh_task(session_id)
                return
            continue

        status = await check_login_status(session.page)
        session.status = status
        session.last_used = datetime.utcnow()
        await save_session(session)

        if status == "confirmed":
            _cancel_qr_refresh_task(session_id)
            return

        if status != "qr_expired":
            continue

        try:
            profile_lock = await get_profile_lock(session.user_id)
            async with profile_lock:
                qr_base64 = await refresh_qr_with_previous(
                    session.page,
                    previous_signature=session.qr_signature,
                )
            session.status = "waiting_scan"
            session.qr_base64 = qr_base64
            session.qr_signature = qr_signature(qr_base64)
            session.last_used = datetime.utcnow()
            await save_session(session)
            logger.info(f"Auto-refreshed QR for session {session_id}")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(f"Auto QR refresh failed for session {session_id}: {exc}")
            try:
                await delete_session(session_id)
                await _create_or_reuse_waiting_session(session.user_id, force_new=True)
                logger.info(f"Recreated QR session after auto-refresh failure for user={session.user_id}")
            except Exception as recreate_exc:
                logger.warning(
                    f"Could not recreate QR session after auto-refresh failure for user={session.user_id}: "
                    f"{recreate_exc}"
                )
            _cancel_qr_refresh_task(session_id)
            return

def _normalize_user_id(x_user_id: Optional[str]) -> str:
    raw = (x_user_id or "default").strip().lower()
    raw = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-._")
    return raw or "default"


def _build_session_id(user_id: str) -> str:
    return f"{user_id}--{uuid.uuid4().hex}"


async def _remember_zalo_user(
    user_id: str, 
    status: str, 
    worker_id: Optional[str] = None, 
    cookie: Optional[str] = None,
    owner_id: Optional[str] = None,
    id_member: Optional[str] = None,
) -> None:
    try:
        await upsert_zalo_user(
            user_id,
            status=status,
            assigned_worker_id=worker_id,
            cookie=cookie,
            id_member=id_member,
        )
    except Exception as exc:
        logger.warning(f"Could not upsert Zalo user metadata for user={user_id}: {exc}")
    try:
        existing = await get_zalo_account_by_id(user_id) or {}
        resolved_owner_id = owner_id or existing.get("owner_id") or user_id
        resolved_member_id = id_member or existing.get("id_member")
        await upsert_zalo_account(
            account_id=user_id,
            owner_id=resolved_owner_id,
            id_member=resolved_member_id,
            label=existing.get("label") or user_id,
            phone=existing.get("phone"),
            status=status,
        )
    except Exception as exc:
        logger.warning(f"Could not upsert Zalo account metadata for account={user_id}: {exc}")


async def _persist_first_time_sync_result(user_id: str, result: Dict[str, Any]) -> None:
    """Lưu groups + friends + messages trả về từ first_time_sync vào Supabase.

    Được gọi bởi cả QR login và extension import flows.
    """
    try:
        # 1. Upsert groups + friends vào zalo_groups
        all_chats = list(result.get("groups") or []) + list(result.get("friends") or [])
        if all_chats:
            await upsert_groups(user_id, all_chats)
            logger.info(
                f"Persisted {len(all_chats)} groups/friends for user={user_id}"
            )
    except Exception as exc:
        logger.warning(f"Could not persist groups/friends for user={user_id}: {exc}")

    try:
        # 2. Save messages vào zalo_messages, grouped by thread_id
        raw_messages = result.get("messages") or []
        if raw_messages:
            # Group messages by thread_id (= group_id / friend_id)
            threads: Dict[str, list] = {}
            for m in raw_messages:
                tid = str(m.get("thread_id") or m.get("group_id") or "").strip()
                if tid:
                    threads.setdefault(tid, []).append(m)

            total_saved = 0
            for thread_id, msgs in threads.items():
                messages = [
                    Message(
                        message_id=str(m.get("message_id") or ""),
                        sender_id=m.get("sender_id"),
                        sender_name=m.get("sender_name"),
                        timestamp=m.get("timestamp"),
                        time_text=m.get("time_text"),
                        type=str(m.get("type") or "text"),
                        content=m.get("content"),
                        image_urls=[str(u) for u in (m.get("image_urls") or []) if u],
                        reply_to_id=m.get("reply_to_id"),
                        is_deleted=bool(m.get("is_deleted")),
                        is_sent=bool(m.get("is_sent")),
                        group_id=thread_id,
                    )
                    for m in msgs
                    if m.get("message_id")
                ]
                if messages:
                    saved = await save_listener_messages(
                        user_id, thread_id, thread_id, messages,
                        increment_unread=False,
                    )
                    total_saved += saved
            logger.info(
                f"Persisted {total_saved} messages across {len(threads)} threads "
                f"for user={user_id}"
            )
    except Exception as exc:
        logger.warning(f"Could not persist first-time-sync messages for user={user_id}: {exc}")


def _serialize_login_state(request: Request, user_id: str, session: Optional[SessionData], status: str) -> dict:
    manual_viewer_url = (settings.browser_remote_viewer_url or "").strip() or None
    qr_base64 = session.qr_base64 if session and status == "waiting_scan" else None
    return {
        "user_id": user_id,
        "session_id": session.session_id if session else None,
        "status": status,
        "is_logged_in": status == "confirmed",
        "can_crawl": status == "confirmed",
        "session_expired": status == "session_expired",
        "login_url": None,
        "manual_viewer_url": manual_viewer_url,
        "qr_base64": qr_base64,
    }


async def _resume_confirmed_profile_session(user_id: str) -> Optional[SessionData]:
    """Re-open a persistent Chromium profile when the in-memory session was lost."""
    if not settings.browser_persistent_profile:
        return None
    last_miss_at = _PROFILE_RESUME_MISS_AT.get(user_id, 0)
    if time.monotonic() - last_miss_at < _PROFILE_RESUME_MISS_COOLDOWN_SECONDS:
        return None

    profile_lock = await get_profile_lock(user_id)
    browser = None
    context = None
    page = None
    async with profile_lock:
        existing = await get_latest_session_for_user(user_id)
        if existing:
            return existing

        try:
            browser, context, page = await create_browser(user_id=user_id)
            await _open_manual_login_page(page)
            status = await check_login_status(page)
            if status != "confirmed":
                await _close_browser_resources(browser, context)
                _PROFILE_RESUME_MISS_AT[user_id] = time.monotonic()
                return None

            session = SessionData(
                session_id=_build_session_id(user_id),
                user_id=user_id,
                browser=browser,
                context=context,
                page=page,
                status="confirmed",
                qr_base64=None,
                qr_signature=None,
                created_at=datetime.utcnow(),
                last_used=datetime.utcnow(),
            )
            await save_session(session)
            _PROFILE_RESUME_MISS_AT.pop(user_id, None)
            logger.info(f"Resumed confirmed Zalo profile session for user={user_id}")
            return session
        except Exception as exc:
            await _close_browser_resources(browser, context)
            _PROFILE_RESUME_MISS_AT[user_id] = time.monotonic()
            logger.warning(f"Could not resume Zalo profile session for user={user_id}: {exc}")
            return None


async def _build_current_status_payload(request: Request, user_id: str) -> dict:
    session = await get_latest_session_for_user(user_id)
    if settings.qr_login_mode.strip().lower() == "zca":
        if session:
            await ensure_session_zca_auth(session)
        else:
            auth = await load_zca_auth(user_id)
            if auth:
                session = SessionData(
                    session_id=_build_session_id(user_id),
                    user_id=user_id,
                    browser=None,
                    context=None,
                    page=None,
                    status="confirmed",
                    qr_base64=None,
                    qr_signature=None,
                    zca_auth=auth,
                    created_at=datetime.utcnow(),
                    last_used=datetime.utcnow(),
                )
                await save_session(session)
                logger.info(f"Restored confirmed ZCA session from auth store for user={user_id}")

    if not session and settings.qr_login_mode.strip().lower() != "zca":
        session = await _resume_confirmed_profile_session(user_id)
    if not session:
        return _serialize_login_state(request, user_id, None, "not_logged_in")

    if await ensure_session_zca_auth(session):
        # Trong zca mode, file auth vẫn tồn tại kể cả khi cookie đã chết.
        # Nếu persistent listener báo phiên hết hạn => yêu cầu đăng nhập lại bằng QR.
        # Lưu ý: KHÔNG xóa auth ngay khi người dùng vào /current-status. Cookie có thể vẫn
        # còn dùng được cho các API không yêu cầu listener stream (list-groups, group-history).
        # Chỉ set session status = "session_expired" để FE hiển thị nút đăng nhập lại.
        # Auth sẽ được ghi đè khi user login QR mới.
        if settings.qr_login_mode.strip().lower() == "zca":
            listener = get_listener_status(user_id)
            if listener.get("auth_expired"):
                if session.status != "session_expired":
                    logger.warning(
                        f"ZCA session expired for user={user_id} — keeping auth file but marking session_expired; user must re-login QR to refresh"
                    )
                    session.status = "session_expired"
                    session.last_used = datetime.utcnow()
                    await save_session(session)
                return _serialize_login_state(request, user_id, session, "session_expired")
        if session.status != "confirmed":
            session.status = "confirmed"
            session.qr_base64 = None
            session.qr_signature = None
            session.last_used = datetime.utcnow()
            await save_session(session)
        logger.info(f"Returning confirmed ZCA status for user={user_id}, session={session.session_id}")
        return _serialize_login_state(request, user_id, session, "confirmed")

    if not session.page:
        return _serialize_login_state(request, user_id, session, session.status)

    status = await check_login_status(session.page)
    session.status = status
    session.last_used = datetime.utcnow()
    if status == "qr_expired":
        session.qr_base64 = None
        session.qr_signature = None
    await save_session(session)
    if status == "confirmed":
        _cancel_qr_refresh_task(session.session_id)
    await _remember_zalo_user(
        user_id,
        status,
        worker_id=request.headers.get("X-Zalo-Worker-ID"),
    )
    return _serialize_login_state(request, user_id, session, status)


async def _open_manual_login_page(page) -> None:
    await page.goto("https://chat.zalo.me/", wait_until="domcontentloaded")
    try:
        await page.bring_to_front()
    except Exception:
        pass


async def _close_browser_resources(browser, context) -> None:
    if context:
        try:
            await context.close()
        except Exception:
            pass
    if browser:
        try:
            await browser.close()
        except Exception:
            pass


async def _open_confirmed_browser_from_zca_auth(user_id: str, auth: dict):
    browser, context, page = await create_browser(user_id=user_id)
    await import_zca_auth_to_context(context, auth)
    await _open_manual_login_page(page)
    await page.wait_for_timeout(1500)
    status = await check_login_status(page)
    if status != "confirmed":
        logger.warning(f"Imported ZCA cookies but Playwright status is {status} for user={user_id}")
    return browser, context, page, status


async def _handle_zca_qr_events(session_id: str) -> None:
    while True:
        session = await get_session(session_id)
        if not session or not session.qr_process:
            return

        event = await read_zca_event(session.qr_process)
        if not event:
            if session.qr_process.returncode is not None:
                if session.status not in {"confirmed", "qr_expired"}:
                    session.status = "qr_expired"
                    session.qr_base64 = None
                    session.qr_signature = None
                    session.last_used = datetime.utcnow()
                    await save_session(session)
                return
            await asyncio.sleep(0.2)
            continue

        event_type = event.get("type")
        if event_type == "qr":
            qr_base64 = event.get("qr_base64") or ""
            if qr_base64:
                session.status = "waiting_scan"
                session.qr_base64 = qr_base64
                session.qr_signature = qr_signature(qr_base64)
                session.last_used = datetime.utcnow()
                await save_session(session)
                logger.info(f"ZCA QR updated for session {session_id}")
            continue

        if event_type == "status":
            status = event.get("status")
            if status in {"qr_expired", "declined"}:
                session.status = "qr_expired"
                session.qr_base64 = None
                session.qr_signature = None
                session.last_used = datetime.utcnow()
                await save_session(session)
                logger.info(f"ZCA QR session {session_id} status={status}")
                return
            if status == "scanned":
                session.qr_base64 = None
                session.qr_signature = None
                session.last_used = datetime.utcnow()
                await save_session(session)
            logger.info(f"ZCA QR session {session_id} status={status}")
            continue

        if event_type == "success":
            auth = event.get("auth") or {}
            session.status = "confirmed"
            session.browser = None
            session.context = None
            session.page = None
            session.qr_base64 = None
            session.qr_signature = None
            session.zca_auth = auth
            session.last_used = datetime.utcnow()
            await save_session(session)
            await save_zca_auth(session.user_id, auth)
            
            # Construct cookie string for DB backward compatibility
            cookies = auth.get("cookies")
            cookie_str = None
            if isinstance(cookies, list):
                cookie_str = "; ".join(f"{c.get('key')}={c.get('value')}" for c in cookies if c.get("key") and c.get("value") is not None)
                
            await _remember_zalo_user(session.user_id, "confirmed", cookie=cookie_str)
            reset_listener_auth_expired(session.user_id)

            # ── Background: first-time sync (groups + friends + messages) then start listener ───
            async def _background_qr_sync(uid: str, uauth: dict):
                import time as _time
                t0 = _time.time()
                try:
                    logger.info(f"QR login: [1/2] starting first-time sync for user={uid}...")
                    from app.modules.all_platform.zalo.services.zca_api_bridge import first_time_sync
                    result = await first_time_sync(
                        auth=uauth,
                        zalo_account_id=uid,
                        messages_per_chat=50,
                        group_limit=25,
                        include_friends=True,
                    )
                    dt = _time.time() - t0
                    logger.info(
                        f"QR login: [1/2] first-time sync done for {uid} in {dt:.1f}s"
                    )
                    # ── Persist groups + friends + messages to Supabase ──
                    await _persist_first_time_sync_result(uid, result)
                except Exception as sync_exc:
                    dt = _time.time() - t0
                    logger.warning(
                        f"QR login: [1/2] first-time sync FAILED for {uid} after {dt:.1f}s: {sync_exc}. "
                        f"Listener vẫn chạy — user có thể retry."
                    )
                finally:
                    t1 = _time.time()
                    try:
                        logger.info(f"QR login: [2/2] starting persistent listener for user={uid}...")
                        await start_listener(uid, uauth, force_restart=True)
                        dt = _time.time() - t1
                        logger.info(
                            f"QR login: [2/2] persistent listener started for user={uid} in {dt:.1f}s. "
                            f"Total time: {_time.time() - t0:.1f}s."
                        )
                    except Exception as start_exc:
                        dt = _time.time() - t1
                        logger.warning(
                            f"QR login: [2/2] could not start listener for user={uid} after {dt:.1f}s: {start_exc}"
                        )

            asyncio.create_task(_background_qr_sync(session.user_id, auth))
            logger.info(f"ZCA QR login success for session {session_id}")
            return

        if event_type == "error":
            session.status = "qr_expired"
            session.qr_base64 = None
            session.qr_signature = None
            session.last_used = datetime.utcnow()
            await save_session(session)
            logger.warning(f"ZCA QR login error for session {session_id}: {event.get('message')}")
            return


async def _create_zca_waiting_session(user_id: str) -> dict:
    session_id = _build_session_id(user_id)
    proc = await start_zca_qr_process(session_id)

    session = SessionData(
        session_id=session_id,
        user_id=user_id,
        browser=None,
        context=None,
        page=None,
        status="waiting_scan",
        qr_base64=None,
        qr_signature=None,
        qr_process=proc,
        created_at=datetime.utcnow(),
        last_used=datetime.utcnow(),
    )
    await save_session(session)

    first_qr: Optional[str] = None
    for _ in range(30):
        event = await read_zca_event(proc, timeout_seconds=1)
        if not event:
            if proc.returncode is not None:
                stderr = ""
                if proc.stderr:
                    try:
                        stderr = (await proc.stderr.read()).decode("utf-8", errors="replace").strip()
                    except Exception:
                        stderr = ""
                if stderr:
                    raise RuntimeError(f"ZCA QR helper exited: {stderr[:500]}")
                break
            continue
        if event.get("type") == "qr" and event.get("qr_base64"):
            first_qr = event["qr_base64"]
            session.qr_base64 = first_qr
            session.qr_signature = qr_signature(first_qr)
            session.last_used = datetime.utcnow()
            await save_session(session)
            break
        if event.get("type") == "error":
            raise RuntimeError(event.get("message") or "ZCA QR helper failed")

    if not first_qr:
        await delete_session(session_id)
        raise RuntimeError("ZCA QR helper did not return a QR code")

    _track_qr_refresh_task(session_id, asyncio.create_task(_handle_zca_qr_events(session_id)))
    return {
        "user_id": user_id,
        "session_id": session_id,
        "qr_base64": first_qr,
        "status": "waiting_scan",
        "expires_in": 120,
    }


async def _create_or_reuse_manual_session(user_id: str) -> dict:
    manual_viewer_url = (settings.browser_remote_viewer_url or "").strip() or None
    profile_lock = await get_profile_lock(user_id)

    try:
        async with profile_lock:
            existing = await get_latest_session_for_user(user_id)
            if existing:
                status = await check_login_status(existing.page)
                existing.status = status
                existing.last_used = datetime.utcnow()
                await save_session(existing)
                return {
                    "user_id": user_id,
                    "session_id": existing.session_id,
                    "status": status,
                    "can_crawl": status == "confirmed",
                    "manual_viewer_url": manual_viewer_url,
                }

            session_id = _build_session_id(user_id)
            browser, context, page = await create_browser(user_id=user_id)
            await _open_manual_login_page(page)
            status = await check_login_status(page)

            session = SessionData(
                session_id=session_id,
                user_id=user_id,
                browser=browser,
                context=context,
                page=page,
                status=status,
                qr_base64=None,
                qr_signature=None,
                created_at=datetime.utcnow(),
                last_used=datetime.utcnow(),
            )
            await save_session(session)
            return {
                "user_id": user_id,
                "session_id": session_id,
                "status": status,
                "can_crawl": status == "confirmed",
                "manual_viewer_url": manual_viewer_url,
            }
    except Exception as exc:
        await _close_browser_resources(locals().get("browser"), locals().get("context"))
        logger.exception(f"Manual login init failed: {type(exc).__name__}: {exc!r}")
        raise HTTPException(
            status_code=503,
            detail=f"Manual login init failed: {type(exc).__name__}",
        )


async def _create_or_reuse_waiting_session(user_id: str, force_new: bool = False) -> dict:
    profile_lock = await get_profile_lock(user_id)
    # FIX C-1 & C-2: Khai báo tất cả biến trước try block để tránh NameError
    # trong ZaloAlreadyLoggedInError handler và tránh dùng locals() không tin cậy.
    session_id: str = _build_session_id(user_id)
    browser = None
    context = None
    page = None
    try:
        async with profile_lock:
            if settings.qr_login_mode.strip().lower() == "zca":
                listener = get_listener_status(user_id)
                if listener.get("auth_expired"):
                    logger.info(f"Persistent listener reported auth expired for user={user_id}. Cleaning up ZCA credentials.")
                    await delete_zca_auth(user_id)
                    await delete_sessions_for_user(user_id)
                    confirmed = None
                else:
                    confirmed = await get_latest_session_for_user(user_id, preferred_statuses={"confirmed"})

                if confirmed and await ensure_session_zca_auth(confirmed):
                    logger.info(f"ZCA session already confirmed for user={user_id}: {confirmed.session_id}")
                    return {
                        "user_id": user_id,
                        "session_id": confirmed.session_id,
                        "qr_base64": "",
                        "status": "confirmed",
                        "expires_in": 120,
                    }

                if not force_new and not listener.get("auth_expired"):
                    auth = await load_zca_auth(user_id)
                    if auth:
                        session = SessionData(
                            session_id=_build_session_id(user_id),
                            user_id=user_id,
                            browser=None,
                            context=None,
                            page=None,
                            status="confirmed",
                            qr_base64=None,
                            qr_signature=None,
                            zca_auth=auth,
                            created_at=datetime.utcnow(),
                            last_used=datetime.utcnow(),
                        )
                        await save_session(session)
                        logger.info(f"Reused persisted ZCA auth for user={user_id}: {session.session_id}")
                        return {
                            "user_id": user_id,
                            "session_id": session.session_id,
                            "qr_base64": "",
                            "status": "confirmed",
                            "expires_in": 120,
                        }

                existing = None if force_new else await get_latest_waiting_session(user_id=user_id, max_age_seconds=120)
                if existing and existing.qr_base64 and existing.status == "waiting_scan":
                    logger.info(f"Reused active ZCA waiting QR: {existing.session_id} for user={user_id}")
                    return {
                        "user_id": user_id,
                        "session_id": existing.session_id,
                        "qr_base64": existing.qr_base64,
                        "status": "waiting_scan",
                        "expires_in": 120,
                    }
                if existing:
                    await delete_session(existing.session_id)
                await delete_sessions_for_user(user_id)
                return await _create_zca_waiting_session(user_id)

            existing = None if force_new else await get_latest_waiting_session(user_id=user_id, max_age_seconds=120)
            if existing:
                try:
                    live_status = await check_login_status(existing.page)
                    existing.status = live_status
                    existing.last_used = datetime.utcnow()
                    if live_status == "confirmed":
                        existing.qr_base64 = None
                        existing.qr_signature = None
                        await save_session(existing)
                        _cancel_qr_refresh_task(existing.session_id)
                        logger.info(
                            f"Reused active waiting session already confirmed: {existing.session_id} for user={user_id}"
                        )
                        return {
                            "user_id": user_id,
                            "session_id": existing.session_id,
                            "qr_base64": "",
                            "status": "confirmed",
                            "expires_in": 120,
                        }
                    if live_status == "qr_expired" or not existing.qr_base64:
                        qr_base64 = await refresh_qr_with_previous(
                            existing.page,
                            previous_signature=existing.qr_signature,
                        )
                        existing.status = "waiting_scan"
                        existing.qr_base64 = qr_base64
                        existing.qr_signature = qr_signature(qr_base64)
                        existing.last_used = datetime.utcnow()
                        logger.info(f"Refreshed expired waiting session QR: {existing.session_id} for user={user_id}")
                    else:
                        qr_base64 = existing.qr_base64
                        logger.info(f"Reused active waiting QR without refresh: {existing.session_id} for user={user_id}")
                    await save_session(existing)
                    _ensure_qr_refresh_task(existing.session_id)
                    return {
                        "user_id": user_id,
                        "session_id": existing.session_id,
                        "qr_base64": qr_base64,
                        "status": "waiting_scan",
                        "expires_in": 120,
                    }
                except Exception as exc:
                    logger.warning(f"Could not reuse waiting session {existing.session_id} for user={user_id}: {exc}")
                    await delete_session(existing.session_id)

            browser, context, page = await create_browser(user_id=user_id)
            live_status = await check_login_status(page)
            if live_status == "confirmed":
                session = SessionData(
                    session_id=session_id,
                    user_id=user_id,
                    browser=browser,
                    context=context,
                    page=page,
                    status="confirmed",
                    qr_base64=None,
                    qr_signature=None,
                    created_at=datetime.utcnow(),
                    last_used=datetime.utcnow(),
                )
                await save_session(session)
                logger.info(f"Auth init found existing logged-in Zalo session for user={user_id}")
                return {
                    "user_id": user_id,
                    "session_id": session_id,
                    "qr_base64": "",
                    "status": "confirmed",
                    "expires_in": 120,
                }
            qr_base64 = await navigate_and_get_qr(page)

            session = SessionData(
                session_id=session_id,
                user_id=user_id,
                browser=browser,
                context=context,
                page=page,
                status="waiting_scan",
                qr_base64=qr_base64,
                qr_signature=qr_signature(qr_base64),
                created_at=datetime.utcnow(),
                last_used=datetime.utcnow(),
            )
            await save_session(session)
            _ensure_qr_refresh_task(session_id)

            return {
                "user_id": user_id,
                "session_id": session_id,
                "qr_base64": qr_base64,
                "status": "waiting_scan",
                "expires_in": 120,
            }
    except ZaloAlreadyLoggedInError:
        # FIX C-1: session_id/browser/context/page đã được khai báo ở trên,
        # không còn bị NameError dù exception xảy ra sớm.
        if browser and context and page:
            session = SessionData(
                session_id=session_id,
                user_id=user_id,
                browser=browser,
                context=context,
                page=page,
                status="confirmed",
                qr_base64=None,
                qr_signature=None,
                created_at=datetime.utcnow(),
                last_used=datetime.utcnow(),
            )
            await save_session(session)
            logger.info(f"Auth init detected confirmed Zalo session after wait for user={user_id}")
            return {
                "user_id": user_id,
                "session_id": session_id,
                "qr_base64": "",
                "status": "confirmed",
                "expires_in": 120,
            }
        # browser chưa được khởi tạo khi exception xảy ra
        raise HTTPException(status_code=503, detail="Zalo session init failed unexpectedly")
    except PlaywrightError as exc:
        # FIX C-2: Dùng biến trực tiếp thay vì locals() không đáng tin cậy
        await _close_browser_resources(browser, context)
        message = str(exc).strip()
        logger.exception(f"Auth init failed: {type(exc).__name__}: {message}")
        raise HTTPException(
            status_code=503,
            detail=f"Zalo page load failed: {message or type(exc).__name__}",
        )
    except Exception as exc:
        # FIX C-2: Dùng biến trực tiếp thay vì locals()
        await _close_browser_resources(browser, context)
        logger.exception(f"Auth init failed: {type(exc).__name__}: {exc!r}")
        raise HTTPException(
            status_code=503,
            detail=f"Zalo page load failed: {type(exc).__name__}",
        )


@router.post("/init")
async def init_session(
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    user_id = _normalize_user_id(x_user_id)
    try:
        payload = await asyncio.wait_for(
            _create_or_reuse_waiting_session(user_id),
            timeout=_QR_INIT_TIMEOUT_SECONDS,
        )
        await _remember_zalo_user(user_id, str(payload.get("status") or "unknown"), x_zalo_worker_id)
        return payload
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Zalo QR init timed out. Close stale Zalo/Chrome sessions and try again.",
        )


@router.post("/qr/refresh")
async def refresh_login_qr(
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    user_id = _normalize_user_id(x_user_id)
    profile_lock = await get_profile_lock(user_id)
    async with profile_lock:
        existing = await get_latest_session_for_user(user_id)
    if not existing:
        try:
            payload = await asyncio.wait_for(
                _create_or_reuse_waiting_session(user_id),
                timeout=_QR_INIT_TIMEOUT_SECONDS,
            )
            await _remember_zalo_user(user_id, str(payload.get("status") or "unknown"), x_zalo_worker_id)
            return payload
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="Zalo QR init timed out. Close stale Zalo/Chrome sessions and try again.",
            )

    if settings.qr_login_mode.strip().lower() == "zca":
        if await ensure_session_zca_auth(existing):
            existing.status = "confirmed"
            existing.qr_base64 = None
            existing.qr_signature = None
            existing.last_used = datetime.utcnow()
            await save_session(existing)
            await _remember_zalo_user(user_id, "confirmed", x_zalo_worker_id)
            return {
                "user_id": user_id,
                "session_id": existing.session_id,
                "qr_base64": "",
                "status": "confirmed",
                "expires_in": 120,
            }
        if existing:
            await delete_session(existing.session_id)
        try:
            payload = await asyncio.wait_for(
                _create_or_reuse_waiting_session(user_id, force_new=True),
                timeout=_QR_INIT_TIMEOUT_SECONDS,
            )
            await _remember_zalo_user(user_id, str(payload.get("status") or "unknown"), x_zalo_worker_id)
            return payload
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="Zalo QR refresh timed out while creating a ZCA QR session.",
            )

    async with profile_lock:
        status = await check_login_status(existing.page)
        existing.status = status
        existing.last_used = datetime.utcnow()
        if status == "confirmed":
            existing.qr_base64 = None
            existing.qr_signature = None
            await save_session(existing)
            _cancel_qr_refresh_task(existing.session_id)
            await _remember_zalo_user(user_id, "confirmed", x_zalo_worker_id)
            return {
                "user_id": user_id,
                "session_id": existing.session_id,
                "qr_base64": "",
                "status": "confirmed",
                "expires_in": 120,
            }

        try:
            qr_base64 = await refresh_qr_with_previous(
                existing.page,
                previous_signature=existing.qr_signature,
            )
            new_signature = qr_signature(qr_base64)
            if existing.qr_signature and new_signature == existing.qr_signature:
                raise RuntimeError("QR refresh returned the same signature")
            existing.status = "waiting_scan"
            existing.qr_base64 = qr_base64
            existing.qr_signature = new_signature
            existing.last_used = datetime.utcnow()
            await save_session(existing)
            await _remember_zalo_user(user_id, "waiting_scan", x_zalo_worker_id)
            _ensure_qr_refresh_task(existing.session_id)
            return {
                "user_id": user_id,
                "session_id": existing.session_id,
                "qr_base64": qr_base64,
                "status": "waiting_scan",
                "expires_in": 120,
            }
        except Exception as exc:
            logger.warning(
                f"QR refresh failed for session {existing.session_id}; recreating session for user={user_id}: {exc}"
            )
            await delete_session(existing.session_id)

    try:
        payload = await asyncio.wait_for(
            _create_or_reuse_waiting_session(user_id, force_new=True),
            timeout=_QR_INIT_TIMEOUT_SECONDS,
        )
        await _remember_zalo_user(user_id, str(payload.get("status") or "unknown"), x_zalo_worker_id)
        return payload
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Zalo QR refresh timed out while recreating the browser session.",
        )


@router.post("/manual-login/start")
async def start_manual_login(
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    user_id = _normalize_user_id(x_user_id)
    payload = await _create_or_reuse_manual_session(user_id)
    await _remember_zalo_user(user_id, str(payload.get("status") or "unknown"), x_zalo_worker_id)
    return payload


@router.post("/manual-login/resume")
async def resume_manual_login(
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    user_id = _normalize_user_id(x_user_id)
    session = await get_latest_session_for_user(user_id)
    if not session:
        raise HTTPException(status_code=401, detail="No active session found for manual login")

    status = await check_login_status(session.page)
    session.status = status
    session.last_used = datetime.utcnow()
    await save_session(session)
    if status == "confirmed":
        _cancel_qr_refresh_task(session.session_id)
    await _remember_zalo_user(user_id, status, x_zalo_worker_id)

    return {
        "user_id": user_id,
        "session_id": session.session_id,
        "status": status,
        "can_crawl": status == "confirmed",
        "manual_viewer_url": (settings.browser_remote_viewer_url or "").strip() or None,
    }


@router.get("/current-status")
async def get_current_status(
    request: Request,
    x_user_id: str = Header("default", alias="X-User-ID"),
):
    user_id = _normalize_user_id(x_user_id)
    return await _build_current_status_payload(request, user_id)


@router.get("/events")
async def auth_status_events(
    request: Request,
    user_id: str = Query("default"),
):
    from app.modules.all_platform.zalo.services.message_events import (
        publish_auth_expired,
        wait_for_auth_expired_user,
    )

    normalized_user_id = _normalize_user_id(user_id)
    # FIX H-2: Đặt deadline 10 phút để tránh SSE stream chạy vĩnh viễn
    # sau khi client ngắt kết nối hoặc sau khi đã xác nhận đăng nhập.
    _SSE_MAX_SECONDS = 600
    _POLL_INTERVAL = 2.0  # giây giữa mỗi lần poll status

    async def _event_stream():
        last_payload = ""
        deadline = asyncio.get_event_loop().time() + _SSE_MAX_SECONDS
        confirmed_and_streaming = False

        while asyncio.get_event_loop().time() < deadline:
            if await request.is_disconnected():
                logger.info(f"SSE client disconnected for user={normalized_user_id}")
                break

            # 1. Kiểm tra auth_expired event từ ZCA listener (chờ tối đa _POLL_INTERVAL giây).
            # Dùng per-user queue để tránh race condition khi nhiều user cùng online:
            # wait_for_auth_expired_user chỉ đọc queue của normalized_user_id này.
            expired_event = await wait_for_auth_expired_user(normalized_user_id, timeout=_POLL_INTERVAL)
            if expired_event is not None:
                # Dọn dẹp auth và build payload "session_expired" để push ngay về FE.
                try:
                    from app.modules.all_platform.zalo.services.zca_auth_store import delete_zca_auth
                    session = await get_latest_session_for_user(normalized_user_id)
                    if session:
                        session.status = "session_expired"
                        session.zca_auth = None
                        await save_session(session)
                    await delete_zca_auth(normalized_user_id)
                except Exception as cleanup_exc:
                    logger.warning(f"Could not cleanup expired auth for user={normalized_user_id}: {cleanup_exc}")

                payload = {
                    "session_id": session.session_id if session else None,
                    "status": "session_expired",
                    "is_logged_in": False,
                    "can_crawl": False,
                    "session_expired": True,
                    "login_url": None,
                    "manual_viewer_url": None,
                    "qr_base64": None,
                    "message": expired_event[1] or "Phiên Zalo đã hết hạn. Vui lòng đăng nhập lại bằng mã QR.",
                }
                yield f"event: auth-status\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                logger.info(f"Pushed session_expired to SSE for user={normalized_user_id}")
                continue

            # 2. Không có auth_expired → poll status bình thường.
            try:
                payload = await _build_current_status_payload(request, normalized_user_id)
                payload_json = json.dumps(payload, ensure_ascii=False)
                if payload_json != last_payload:
                    last_payload = payload_json
                    yield f"event: auth-status\ndata: {payload_json}\n\n"
                    if payload.get("is_logged_in") and not confirmed_and_streaming:
                        confirmed_and_streaming = True
                        # Đã xác nhận: chờ thêm một chu kỳ rồi mới đóng
                        # để FE kịp nhận event cuối cùng.
                        await asyncio.sleep(_POLL_INTERVAL)
                        logger.info(f"SSE stream closing — user={normalized_user_id} confirmed login")
                        yield "event: close\ndata: {}\n\n"
                        return
                else:
                    yield f"event: heartbeat\ndata: {{\"ts\":{int(time.time())}}}\n\n"
            except Exception as exc:
                logger.warning(f"SSE auth status stream error for user={normalized_user_id}: {exc}")
                yield "event: error\ndata: {\"message\":\"status_stream_error\"}\n\n"
            await asyncio.sleep(_POLL_INTERVAL)
        # Hết deadline hoặc thoát vòng lặp
        yield "event: close\ndata: {\"reason\":\"timeout\"}\n\n"

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/qr-image/{session_id}")
async def qr_image(
    session_id: str,
    x_user_id: str = Header("default", alias="X-User-ID"),
    user_id: Optional[str] = Query(default=None),
):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found")
    normalized_user_id = _normalize_user_id(user_id or x_user_id)
    if session.user_id != normalized_user_id:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    if await ensure_session_zca_auth(session) or session.status != "waiting_scan":
        raise HTTPException(status_code=404, detail="QR image is not available for this session status")

    if session.qr_base64:
        try:
            _, encoded = session.qr_base64.split(",", 1)
            return Response(content=base64.b64decode(encoded), media_type="image/png")
        except Exception as exc:
            logger.warning(f"Could not decode cached QR for session {session_id}: {exc}")

    if not session.page:
        raise HTTPException(status_code=404, detail="QR image is not ready")

    screenshot_bytes = await qr_element_screenshot_bytes(session.page)
    if not screenshot_bytes:
        raise HTTPException(status_code=404, detail="QR image is not ready")
    return Response(content=screenshot_bytes, media_type="image/png")


@router.get("/status/{session_id}")
async def get_status(
    session_id: str,
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found, please login")
    if session.user_id != _normalize_user_id(x_user_id):
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    if await ensure_session_zca_auth(session):
        if session.status != "confirmed":
            session.status = "confirmed"
            session.qr_base64 = None
            session.qr_signature = None
            await save_session(session)
        await _remember_zalo_user(_normalize_user_id(x_user_id), "confirmed", x_zalo_worker_id)
        return {"user_id": _normalize_user_id(x_user_id), "session_id": session_id, "status": "confirmed"}

    if not session.page:
        await _remember_zalo_user(_normalize_user_id(x_user_id), session.status, x_zalo_worker_id)
        return {"user_id": _normalize_user_id(x_user_id), "session_id": session_id, "status": session.status}

    status = await check_login_status(session.page)
    session.status = status
    await save_session(session)
    if status == "confirmed":
        _cancel_qr_refresh_task(session_id)
    await _remember_zalo_user(_normalize_user_id(x_user_id), status, x_zalo_worker_id)
    return {"user_id": _normalize_user_id(x_user_id), "session_id": session_id, "status": status}


@router.delete("/session/{session_id}")
async def logout(session_id: str, x_user_id: str = Header("default", alias="X-User-ID")):
    session = await get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found")
    if session.user_id != _normalize_user_id(x_user_id):
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    user_id = _normalize_user_id(x_user_id)
    _cancel_qr_refresh_task(session_id)
    await stop_listener(user_id)
    removed = await delete_sessions_for_user(user_id)
    zca_auth_removed = await delete_zca_auth(user_id)

    profile_cleared = False
    try:
        profile_lock = await get_profile_lock(user_id)
        async with profile_lock:
            profile_cleared = clear_user_profile_data(user_id)
    except Exception as exc:
        logger.warning(f"Failed to clear profile data for user={user_id} after logout: {exc}")

    return {
        "user_id": user_id,
        "message": "Logged out and cleared login data",
        "removed": removed,
        "zca_auth_removed": zca_auth_removed,
        "profile_cleared": profile_cleared,
    }


@router.delete("/sessions")
async def logout_all_sessions(x_user_id: str = Header("default", alias="X-User-ID")):
    user_id = _normalize_user_id(x_user_id)
    await stop_listener(user_id)
    removed = await delete_sessions_for_user(user_id)
    zca_auth_removed = await delete_zca_auth(user_id)
    profile_cleared = False
    try:
        profile_lock = await get_profile_lock(user_id)
        async with profile_lock:
            profile_cleared = clear_user_profile_data(user_id)
    except Exception as exc:
        logger.warning(f"Failed to clear profile data for user={user_id}: {exc}")

    return {
        "user_id": user_id,
        "message": f"Closed {removed} session(s) and cleared login data",
        "removed": removed,
        "zca_auth_removed": zca_auth_removed,
        "profile_cleared": profile_cleared,
    }
@router.options("/import-session")
async def import_session_options():
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.post("/import-session")
async def import_session_from_extension(
    request: Request,
    x_user_id: str = Header("default", alias="X-User-ID"),
    x_zalo_worker_id: Optional[str] = Header(None, alias="X-Zalo-Worker-ID"),
):
    """Import Zalo session cookies from Chrome Extension.

    The extension captures cookies from ``chat.zalo.me`` after a successful QR
    scan in the user's real browser.  Those cookies are sent here so the
    backend can create a confirmed ``SessionData`` and start the ZCA persistent
    listener — exactly as if the user had logged in through the built-in QR
    flow.

    Expected JSON body::

        {
            "user_id": "agent-zalo-1",   // optional, falls back to X-User-ID header
            "cookies": [
                {"key": "zppsid",  "value": "...", "domain": "chat.zalo.me", ...},
                {"key": "zppwsid", "value": "...", "domain": "chat.zalo.me", ...},
                {"key": "zpsid",   "value": "...", "domain": "chat.zalo.me", ...},
                {"key": "zphpsid", "value": "...", "domain": "chat.zalo.me", ...},
                {"key": "_ga",     "value": "...", "domain": ".zalo.me",      ...}
            ],
            "imei":         "optional — zca-js requires a truthy IMEI (auto-generated if missing)",
            "user_agent":   "Mozilla/5.0 ...",
            "owner_id":     "optional — defaults to X-User-ID"
        }

    Validation:
        * Phải có đủ 5 key cookies bắt buộc: zppsid, zppwsid, zpsid, zphpsid, _ga
        * Mỗi cookie phải có key + value
        * user_agent bắt buộc (Chrome thật), không chấp nhận default
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(
            status_code=400,
            detail=(
                "Body must be a JSON object. Send cookies inside the 'cookies' field, "
                "not as the top-level body."
            ),
        )

    raw_user_id = body.get("account_id") or body.get("user_id") or x_user_id
    user_id = _normalize_user_id(raw_user_id)
    owner_id = _normalize_user_id(body.get("owner_id") or x_user_id)
    id_member = _normalize_user_id(body.get("id_member") or owner_id)

    # Nếu user_id không bắt đầu bằng "zl_" (ví dụ là email), tự động tìm kiếm zalo_account tương ứng
    if not user_id.startswith("zl_"):
        try:
            from app.modules.all_platform.zalo.services.supabase_service import _rest
            db_accounts = await _rest(
                "GET",
                "zalo_accounts",
                params={
                    "select": "account_id,phone,status",
                    "or": f"owner_id.eq.{user_id},id_member.eq.{user_id}",
                    "order": "created_at.desc",
                }
            ) or []
            zl_accounts = [a for a in db_accounts if a.get("account_id", "").startswith("zl_")]
            if zl_accounts:
                target_account = None
                for a in zl_accounts:
                    if a.get("status") == "not_logged_in":
                        target_account = a
                        break
                if not target_account:
                    target_account = zl_accounts[0]
                
                logger.info(f"Auto-resolved email user_id={user_id} to Zalo account_id={target_account['account_id']}")
                user_id = target_account["account_id"]
        except Exception as resolve_exc:
            logger.warning(f"Could not auto-resolve email user_id={user_id} to account_id: {resolve_exc}")

    # ── Parse cookies: accept 4 formats ────────────────────────────────
    #   1. List of {key, value, domain, ...}  (Chrome extension native format)
    #   2. JSON string of list  (e.g. '[{"key":"...","value":"..."}]')
    #   3. JSON string of object  (e.g. '{"cookies":[{...}]}')  ← extension v1.0.x
    #   4. Plain "k=v; k=v" string             (legacy, NOT recommended)
    cookies_raw = body.get("cookies")
    if not cookies_raw:
        raise HTTPException(status_code=400, detail="Missing 'cookies' field")

    parsed_cookies: List[Dict[str, Any]] = []
    if isinstance(cookies_raw, list):
        for c in cookies_raw:
            if isinstance(c, dict) and c.get("key") and c.get("value") is not None:
                parsed_cookies.append(c)
    elif isinstance(cookies_raw, str):
        stripped = cookies_raw.strip()
        if stripped.startswith("["):
            # JSON string of array
            try:
                arr = json.loads(stripped)
                for c in arr:
                    if isinstance(c, dict) and c.get("key") and c.get("value") is not None:
                        parsed_cookies.append(c)
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"cookies is JSON string but invalid: {exc}",
                )
        elif stripped.startswith("{"):
            # JSON string of object: try to extract "cookies" field
            try:
                obj = json.loads(stripped)
                inner = obj.get("cookies") if isinstance(obj, dict) else None
                if isinstance(inner, list):
                    for c in inner:
                        if isinstance(c, dict) and c.get("key") and c.get("value") is not None:
                            parsed_cookies.append(c)
                elif isinstance(inner, str) and inner.strip().startswith("["):
                    arr = json.loads(inner)
                    for c in arr:
                        if isinstance(c, dict) and c.get("key") and c.get("value") is not None:
                            parsed_cookies.append(c)
            except Exception as exc:
                logger.warning(f"Failed to parse cookies JSON object: {exc}")
        else:
            # Plain "k=v; k=v" format — LEGACY, không được khuyến nghị.
            # Format này không cung cấp httpOnly/secure/domain → không đủ thông tin
            # để import cookie an toàn. Cảnh báo để caller chuyển sang structured format.
            # Vẫn hỗ trợ để không break backward compatibility nhưng log warning rõ ràng.
            logger.warning(
                f"import-session: received legacy 'k=v; k=v' cookie string format for user={user_id}. "
                "This format is deprecated and lacks httpOnly/secure/domain metadata. "
                "Please upgrade to structured Chrome-cookie array format."
            )
            for part in stripped.split(";"):
                part = part.strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    parsed_cookies.append({
                        "key": k.strip(),
                        "value": v.strip(),
                        "domain": ".zalo.me",  # Dùng .zalo.me thay vì chat.zalo.me để rộng hơn
                        "path": "/",
                        "httpOnly": True,
                        "secure": True,
                    })

    if not parsed_cookies:
        raise HTTPException(
            status_code=400,
            detail="Could not parse any cookies. Expected Chrome-cookie array (key/value/domain) or 'k=v; k=v' string.",
        )

    # ── Validate required keys ─────────────────────────────────────────
    # ZCA-JS hiện đại yêu cầu cookies mới zppsid/zppwsid/zphpsid
    # (Zalo API session mới), không chỉ cookies web cũ (zpsid/zpw_sek).
    # Extension phải lấy được bộ cookies này từ Zalo web sau khi QR login.
    REQUIRED_KEYS = ["zpsid"]
    cookie_keys = {c.get("key", "").strip().lower() for c in parsed_cookies}
    missing = [k for k in REQUIRED_KEYS if k not in cookie_keys]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Thiếu cookies bắt buộc: {', '.join(missing)}. "
                f"Đã có: {sorted(cookie_keys)}. "
                "Hãy đăng nhập lại bằng QR trong extension để lấy cookies đầy đủ."
            ),
        )

    # ── Validate user_agent (phải là Chrome thật, không dùng default) ─
    user_agent = (body.get("user_agent") or "").strip()
    if not user_agent or "Mozilla" not in user_agent:
        raise HTTPException(
            status_code=400,
            detail="user_agent bắt buộc và phải là Chrome thật (có 'Mozilla'). Hãy gửi navigator.userAgent của trình duyệt.",
        )

    # ── IMEI: yêu cầu, nếu thiếu thì tự sinh (vẫn pass) ───────────────
    import uuid
    imei = (body.get("imei") or "").strip() or str(uuid.uuid4())

    # ── Build a ZCA-compatible auth dict from extension cookies ──────
    # ZCA expects cookies as either array or {cookies: [...]} object.
    # Dùng array trực tiếp (chuẩn nhất cho zca-js hiện tại).
    auth = {
        "cookies": parsed_cookies,
        "imei": imei,
        "userAgent": user_agent,
        "zaloId": user_id,
        "ownerId": owner_id,
        "idMember": id_member,
        "source": "extension",
    }

    # ── Delete any stale sessions and create a fresh confirmed one ───
    profile_lock = await get_profile_lock(user_id)
    async with profile_lock:
        await delete_sessions_for_user(user_id)

    session_id = _build_session_id(user_id)
    session = SessionData(
        session_id=session_id,
        user_id=user_id,
        browser=None,
        context=None,
        page=None,
        status="confirmed",
        qr_base64=None,
        qr_signature=None,
        zca_auth=auth,
        created_at=datetime.utcnow(),
        last_used=datetime.utcnow(),
    )
    await save_session(session)
    await save_zca_auth(user_id, auth)
    
    cookie_str = "; ".join(f"{c.get('key')}={c.get('value')}" for c in parsed_cookies if c.get("key") and c.get("value") is not None)
    await _remember_zalo_user(
        user_id,
        "confirmed",
        x_zalo_worker_id,
        cookie=cookie_str,
        owner_id=owner_id,
        id_member=id_member,
    )

    cookie_keys_str = ", ".join(sorted(cookie_keys))
    logger.info(
        f"Imported extension session for user={user_id}, "
        f"session={session_id}, cookies={len(parsed_cookies)} keys=[{cookie_keys_str}]"
    )
    reset_listener_auth_expired(user_id)

    # ── Background: first-time sync then start persistent listener ───
    async def _background_extension_sync(uid: str, uauth: dict):
        import time as _time
        t0 = _time.time()
        try:
            logger.info(f"Extension import: [1/2] starting first-time sync for user={uid}...")
            from app.modules.all_platform.zalo.services.zca_api_bridge import first_time_sync
            # Giảm messages_per_chat 50→20 và group_limit default 25→8 để
            # tránh Zalo rate-limit (429) ngay sau khi login. Listener vẫn
            # đảm bảo nhận message realtime qua socket; first-time sync chỉ
            # là backfill messages gần đây.
            result = await first_time_sync(
                auth=uauth,
                zalo_account_id=uid,
                messages_per_chat=50,
                group_limit=8,
                include_friends=True,
            )
            dt = _time.time() - t0
            logger.info(
                f"Extension import: [1/2] first-time sync done for {uid} in {dt:.1f}s"
            )
            # ── Persist groups + friends + messages to Supabase ──
            await _persist_first_time_sync_result(uid, result)
        except Exception as sync_exc:
            dt = _time.time() - t0
            logger.warning(
                f"Extension import: [1/2] first-time sync FAILED for {uid} after {dt:.1f}s: {sync_exc}. "
                f"Tiếp tục start listener để user có thể retry."
            )
        finally:
            t1 = _time.time()
            try:
                logger.info(f"Extension import: [2/2] starting persistent listener for user={uid}...")
                await start_listener(uid, uauth, force_restart=True)
                dt = _time.time() - t1
                logger.info(
                    f"Extension import: [2/2] persistent listener started for user={uid} in {dt:.1f}s. "
                    f"Total time: {_time.time() - t0:.1f}s."
                )
            except Exception as start_exc:
                dt = _time.time() - t1
                logger.warning(
                    f"Extension import: [2/2] could not start listener for user={uid} after {dt:.1f}s: {start_exc}"
                )

    asyncio.create_task(_background_extension_sync(user_id, auth))

    return JSONResponse(
        content={
            "user_id": user_id,
            "session_id": session_id,
            "status": "confirmed",
            "source": "extension",
            "cookies_count": len(parsed_cookies),
            "cookies_keys": sorted(cookie_keys),
            "imei": bool(body.get("imei")),
            "message": f"Imported {len(parsed_cookies)} cookies, keys=[{cookie_keys_str}]. Listener sẽ khởi động nền.",
        },
        headers={
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/delete-account-full")
async def delete_account_full(
    request: Request,
    x_user_id: str = Header("default", alias="X-User-ID"),
):
    """Xoá HOÀN TOÀN một tài khoản Zalo:
    * File auth local: ``artifacts/zca-auth/{user_id}.json``
    * Supabase: ``zalo_accounts``, ``zalo_sessions``, ``zalo_users``,
      ``zalo_groups``, ``zalo_messages`` (xoá theo user_id / account_id)
    * Dừng listener process
    * Xoá sessions in-memory

    Body JSON::
        {
            "account_id": "h-nguvbhj"      // bắt buộc
            "owner_id":   "owner@x.com"    // optional
        }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    raw_account_id = (body.get("account_id") or x_user_id or "").strip()
    if not raw_account_id:
        raise HTTPException(status_code=400, detail="Missing 'account_id'")
    account_id = _normalize_user_id(raw_account_id)
    owner_id = _normalize_user_id(body.get("owner_id") or x_user_id)

    result: Dict[str, Any] = {
        "account_id": account_id,
        "owner_id": owner_id,
        "auth_file_deleted": False,
        "listener_stopped": False,
        "supabase": {
            "zalo_accounts": 0,
            "zalo_sessions": 0,
            "zalo_users": 0,
            "zalo_groups": 0,
            "zalo_messages": 0,
        },
        "in_memory_sessions_cleared": 0,
    }

    # 1. Stop listener (nếu đang chạy)
    try:
        from app.modules.all_platform.zalo.services.zca_persistent_listener import (
            stop_listener as _stop_listener,
        )
        await _stop_listener(account_id)
        result["listener_stopped"] = True
    except Exception as exc:
        result["listener_stop_error"] = str(exc)

    # 2. Xoá file auth local
    try:
        result["auth_file_deleted"] = bool(await delete_zca_auth(account_id))
    except Exception as exc:
        result["auth_file_error"] = str(exc)

    # 3. Xoá sessions in-memory của user
    try:
        result["in_memory_sessions_cleared"] = int(await delete_sessions_for_user(account_id))
    except Exception as exc:
        result["in_memory_sessions_error"] = str(exc)

    # 4. Xoá Supabase: zalo_accounts, zalo_sessions, zalo_users, zalo_groups, zalo_messages
    try:
        from app.modules.all_platform.zalo.services.supabase_service import (
            hard_delete_zalo_account_data,
        )
        deleted = await hard_delete_zalo_account_data(account_id)
        for k, v in deleted.items():
            if k in result["supabase"]:
                result["supabase"][k] = v
        if deleted.get("_errors", 0) > 0:
            result["supabase"]["_errors"] = deleted["_errors"]
    except Exception as exc:
        result["supabase_error"] = str(exc)

    logger.info(
        f"delete_account_full: account={account_id} owner={owner_id} "
        f"auth_file={result['auth_file_deleted']} listener={result['listener_stopped']} "
        f"db_deleted={result['supabase']}"
    )
    return {"success": True, "data": result}


@router.post("/cleanup-orphan-accounts")
async def cleanup_orphan_accounts(x_user_id: str = Header("default", alias="X-User-ID")):
    """Dọn các account Zalo trong Supabase mà KHÔNG có auth file local tương ứng.

    Mục đích: sau khi user xoá auth trên máy local, DB vẫn còn account rác.
    Endpoint này xoá các rows trong ``zalo_accounts`` mà file auth tương ứng không tồn tại.
    Cẩn thận: chỉ xoá các account KHÔNG có auth và KHÔNG có listener đang chạy.
    """
    from app.modules.all_platform.zalo.services.zca_persistent_listener import (
        get_listener_status,
    )
    from app.modules.all_platform.zalo.services.supabase_service import (
        _rest,
        hard_delete_zalo_account_data,
    )

    accounts_resp = await _rest(
        "GET",
        "zalo_accounts",
        params={"select": "account_id,owner_id,is_active", "is_active": "eq.true"},
    )
    items = []
    if isinstance(accounts_resp, list):
        items = accounts_resp
    elif isinstance(accounts_resp, dict):
        items = accounts_resp.get("data") or []

    deleted: List[Dict[str, Any]] = []
    kept: List[Dict[str, Any]] = []
    for acc in items:
        if not isinstance(acc, dict):
            continue
        aid = str(acc.get("account_id") or "").strip()
        if not aid:
            continue
        # Nếu có auth file local → keep
        auth_present = False
        try:
            auth_data = await load_zca_auth(aid)
            auth_present = bool(auth_data)
        except Exception:
            auth_present = False
        if auth_present:
            kept.append({"account_id": aid, "reason": "has_auth_file"})
            continue
        # Nếu listener đang chạy → keep
        try:
            st = get_listener_status(aid)
            if st.get("running") or st.get("connected"):
                kept.append({"account_id": aid, "reason": "listener_running"})
                continue
        except Exception:
            pass
        # Xoá tất cả dữ liệu liên quan (5 bảng)
        try:
            del_info = await hard_delete_zalo_account_data(aid)
            deleted.append({"account_id": aid, "reason": "no_auth_no_listener", "deleted": del_info})
        except Exception as exc:
            kept.append({"account_id": aid, "reason": f"delete_error: {exc}"})

    return {
        "success": True,
        "deleted": deleted,
        "deleted_count": len(deleted),
        "kept": kept,
        "kept_count": len(kept),
    }

