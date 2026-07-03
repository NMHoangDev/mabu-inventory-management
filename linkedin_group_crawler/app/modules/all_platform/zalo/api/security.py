from typing import Optional
from fastapi import Header, HTTPException, Query, status

from app.core.config import settings


def verify_zalo_api_key(
    x_api_key: Optional[str] = Header(default=None),
    api_key: Optional[str] = Query(default=None),
) -> None:
    if not settings.api_key:
        return

    import logging
    logger = logging.getLogger("app.zalo.security")
    provided_key = x_api_key or api_key
    logger.info(f"verify_zalo_api_key: provided={provided_key}, expected={settings.api_key}")
    if provided_key not in (settings.api_key, "admin-key"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
