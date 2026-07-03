"""FastAPI application entrypoint."""

from __future__ import annotations

import sys
import asyncio

if sys.platform == "win32":
    # Force UTF-8 on Windows console to avoid cp1252 encode errors when logging
    # Vietnamese text and emojis (e.g., 'UnicodeEncodeError: charmap codec can't
    # encode character \u1ec7'). Must run before any logging is configured.
    for _stream_name in ("stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is not None and hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except AttributeError:
        pass
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.modules.linkedin.router import linkedin_app_router, router
from app.modules.linkedin.schemas.response_models import BaseResponse
from app.core.config import settings
from app.modules.all_platform.jobs.crawl_24h_job import setup_all_platform_jobs
from app.modules.facebook.src.modules.api_router.index import api_router
from app.modules.all_platform.router import all_platform_router
from app.modules.all_platform.routers.websocket import router as websocket_router
from app.core.playwright_browser_pool import (
    shutdown_playwright_pool,
    warmup_playwright_pool,
)
from app.core.utils.file_utils import ensure_directory
from app.core.logger import get_logger, setup_logging


setup_logging()
logger = get_logger(__name__)

ensure_directory(settings.raw_data_dir)
ensure_directory(settings.output_data_dir)
ensure_directory(settings.state_path.parent)
ensure_directory(settings.session_storage_dir)


@asynccontextmanager
async def lifespan(_: FastAPI):
    warmup_task: asyncio.Task[None] | None = None
    zca_listeners_task: asyncio.Task[None] | None = None
    # An toàn khi chạy dev/local: đặt env DISABLE_SCHEDULER=1 để KHÔNG bật scheduler tự cào
    # (tránh cào bằng acc production khi dev). Production không set -> chạy như cũ.
    import os as _os
    if _os.getenv("DISABLE_SCHEDULER", "").strip() in ("1", "true", "True"):
        logger.warning("DISABLE_SCHEDULER enabled -> not starting scheduler.")
    else:
        # TODO: Re-enable when needed
        # setup_all_platform_jobs()
        logger.warning("24h crawl scheduler DISABLED - comment this block to re-enable")
    async def _warmup_background() -> None:
        try:
            await asyncio.to_thread(warmup_playwright_pool)
            logger.info("Playwright pool warmup finished")
        except Exception:
            logger.exception(
                "Playwright warmup failed — /health vẫn OK; sẽ thử lại khi có request",
            )

    if settings.playwright_warmup_on_startup:
        warmup_task = asyncio.create_task(_warmup_background())

    # ── Auto-start ZCA persistent listeners cho mọi user đã có auth trong disk ──
    # Không có hook này thì listener chỉ được start khi user mới login QR.
    # Khi BE restart hoặc restore session cũ, listener không tự chạy → không có
    # realtime push. Chạy nền (background) để không block startup.
    async def _start_zca_listeners_background() -> None:
        try:
            from app.modules.all_platform.zalo.services.zca_persistent_listener import (
                start_persisted_listeners,
            )
            await start_persisted_listeners()
            logger.info("ZCA persistent listeners auto-start finished")
        except Exception:
            logger.exception(
                "ZCA persistent listeners auto-start failed — sẽ thử lại khi user login lại",
            )


    if _os.getenv("DISABLE_ZCA_LISTENERS", "").strip().lower() in {"1", "true", "yes"}:
        logger.warning("DISABLE_ZCA_LISTENERS enabled -> not auto-starting ZCA persistent listeners.")
    else:
        zca_listeners_task = asyncio.create_task(_start_zca_listeners_background())

    try:
        yield
    finally:
        if warmup_task is not None and not warmup_task.done():
            warmup_task.cancel()
            try:
                await warmup_task
            except asyncio.CancelledError:
                pass
        if zca_listeners_task is not None and not zca_listeners_task.done():
            zca_listeners_task.cancel()
            try:
                await zca_listeners_task
            except asyncio.CancelledError:
                pass
        try:
            from app.modules.all_platform.zalo.services.zca_persistent_listener import (
                shutdown_persistent_listeners,
            )
            await shutdown_persistent_listeners()
        except Exception:
            logger.exception("ZCA persistent listeners shutdown failed")
        await asyncio.to_thread(shutdown_playwright_pool)


app = FastAPI(
    title="LinkedIn Group Crawler API",
    version="1.0.0",
    description="FastAPI service to login, crawl LinkedIn groups, and expose top daily posts for n8n.",
    lifespan=lifespan,
)

@app.middleware("http")
async def handle_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")

    # Allow Chrome extension origin and known frontend origins
    allowed_origins = {
        "chrome-extension://" + origin.replace("chrome-extension://", "").split("/")[0]
        if origin.startswith("chrome-extension://") else "",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    }
    # Thêm origin từ env CORS_ORIGINS (ngăn cách dấu phẩy) — cho phép cấu hình domain deploy
    # mà không hardcode vào code (vd seeding.zenithglobal.dev khi chạy bản demo).
    import os as _os
    for _o in (_os.getenv("CORS_ORIGINS", "") or "").split(","):
        _o = _o.strip()
        if _o:
            allowed_origins.add(_o)

    is_allowed = origin in allowed_origins or origin.startswith("chrome-extension://")

    if request.method == "OPTIONS":
        response = Response(status_code=200)
        if is_allowed and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS, PUT, DELETE, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, x-api-key, Authorization, X-User-ID, X-Session-ID, X-Zalo-Worker-ID"
        return response

    response = await call_next(request)

    # Set CORS headers for actual responses
    if origin:
        if is_allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            response.headers["Access-Control-Allow-Origin"] = origin

    return response

@app.get("/health", response_model=BaseResponse)
def root_health() -> BaseResponse:
    """Root health check for DevOps/Docker infrastructure."""
    return BaseResponse(success=True, message="Service is healthy")



@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_, exc: RequestValidationError) -> JSONResponse:
    """Return validation errors in the app's common response envelope."""

    error_messages: list[str] = []
    for item in exc.errors():
        location = " -> ".join(str(part) for part in item.get("loc", []))
        message = item.get("msg", "Invalid request")
        error_messages.append(f"{location}: {message}")

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "Invalid request body",
            "data": {"errors": error_messages},
        },
    )


app.include_router(router)
app.include_router(linkedin_app_router)
app.include_router(api_router, prefix="/facebook/api/v1")
app.include_router(all_platform_router, prefix="/api/all-platform")

# WebSocket đã được chuyển vào all_platform_router

