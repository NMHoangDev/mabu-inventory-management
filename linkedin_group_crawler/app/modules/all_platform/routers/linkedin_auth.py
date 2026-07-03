"""LinkedIn auth endpoints — login + OTP checkpoint verification for all-platform."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.modules.all_platform.schemas import BaseResponse
from app.modules.all_platform.services.linkedin_auth_service import (
    linkedin_login,
    linkedin_verify_otp,
)
from app.modules.linkedin.services.auth_service import PendingLoginSessionNotFoundError

router = APIRouter()


@router.post("/login")
def li_login(payload: dict) -> BaseResponse:
    """
    Initiate LinkedIn login. Returns success or need_otp with checkpoint info.

    Body: { "email": "...", "password": "...", "session_id": "..." (optional) }
    """
    email = (payload.get("email") or "").strip()
    password = (payload.get("password") or "").strip()
    session_id = payload.get("session_id")

    if not email or not password:
        return BaseResponse(success=False, message="email và password là bắt buộc")

    try:
        result = linkedin_login(email=email, password=password, session_id=session_id)
        return BaseResponse(
            success=True,
            data={
                "status": result.status,
                "session_id": result.session_id,
                "checkpoint_url": result.checkpoint_url,
                "email": result.email,
            },
        )
    except ValueError as e:
        return BaseResponse(success=False, message=str(e))
    except Exception as e:
        return BaseResponse(success=False, message=str(e))


@router.post("/verify-otp")
def li_verify_otp(payload: dict) -> BaseResponse:
    """
    Submit OTP for a pending login session.

    Body: {
        "pending_session_id": "...",
        "otp_code": "...",
        "checkpoint_url": "..." (optional)
    }
    """
    pending_session_id = (payload.get("pending_session_id") or "").strip()
    otp_code = (payload.get("otp_code") or "").strip()
    checkpoint_url = payload.get("checkpoint_url")

    if not pending_session_id or not otp_code:
        return BaseResponse(success=False, message="pending_session_id và otp_code là bắt buộc")

    try:
        result = linkedin_verify_otp(
            pending_session_id=pending_session_id,
            otp_code=otp_code,
            checkpoint_url=checkpoint_url,
        )
        return BaseResponse(
            success=True,
            message="Xác minh OTP thành công! Phiên cào đã sẵn sàng.",
            data=result,
        )
    except PendingLoginSessionNotFoundError as e:
        return BaseResponse(success=False, message=str(e))
    except ValueError as e:
        return BaseResponse(success=False, message=str(e))
    except RuntimeError as e:
        return BaseResponse(success=False, message=str(e))
    except Exception as e:
        return BaseResponse(success=False, message=str(e))
