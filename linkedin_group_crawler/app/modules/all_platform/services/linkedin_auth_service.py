"""LinkedIn auth service — wraps auth_service for all-platform checkpoint/OTP flow."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Ensure the linkedin module is on the path
_linkedin_module_root = Path(__file__).resolve().parents[2] / "linkedin"
if str(_linkedin_module_root) not in sys.path:
    sys.path.insert(0, str(_linkedin_module_root))

from app.modules.linkedin.services.auth_service import (
    LoginFlowResult,
    PendingLoginSessionNotFoundError,
    login_and_save_session,
    verify_pending_login_otp,
)


def linkedin_login(
    email: str,
    password: str,
    session_id: str | None = None,
) -> LoginFlowResult:
    """Initiate LinkedIn login — returns success or need_otp with checkpoint info."""
    return login_and_save_session(
        email=email,
        password=password,
        session_id=session_id,
        force_relogin=True,
        prime_pool=False,
    )


def linkedin_verify_otp(
    pending_session_id: str,
    otp_code: str,
    checkpoint_url: str | None = None,
) -> dict[str, Any]:
    """Submit OTP for pending login session. Returns session_id + state_path on success."""
    session_id, state_path, email, pool_prime = verify_pending_login_otp(
        pending_session_id=pending_session_id,
        otp_code=otp_code,
        checkpoint_url=checkpoint_url,
        prime_pool=True,
    )
    return {
        "session_id": session_id,
        "state_path": str(state_path),
        "email": email,
        "success": True,
    }
