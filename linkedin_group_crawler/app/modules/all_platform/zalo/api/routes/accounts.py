from typing import List, Optional
import re
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from app.modules.all_platform.zalo.api.security import verify_zalo_api_key
from app.modules.all_platform.zalo.services.zca_auth_store import delete_zca_auth, list_zca_auth_users, load_zca_auth
from app.modules.all_platform.zalo.services.zca_persistent_listener import get_listener_status, restart_listener, stop_listener
from app.modules.all_platform.zalo.services.session_store import delete_sessions_for_user, get_profile_lock
from app.modules.all_platform.zalo.crawler.browser import clear_user_profile_data
from app.modules.all_platform.zalo.services.supabase_service import (
    SupabaseNotConfigured,
    delete_zalo_account,
    get_app_user_id_by_email,
    get_team_member_ids,
    get_user_role,
    get_zalo_inbox_report,
    list_zalo_accounts,
    upsert_zalo_account,
    upsert_zalo_user,
    hard_delete_zalo_account_data,
    get_zalo_account_by_id,
)


router = APIRouter(
    prefix="/accounts",
    tags=["zalo-accounts"],
    dependencies=[Depends(verify_zalo_api_key)],
)


def _normalize_id(value: Optional[str], default: str = "default") -> str:
    raw = (value or default).strip().lower()
    raw = re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-._")
    return raw or default


async def _resolve_accounts_for_role(
    caller_user_id: Optional[str],
    caller_email: Optional[str],
    role_override: Optional[str],
) -> tuple[Optional[str], Optional[str] | list[str]]:
    """Xác định owner_id và id_member filter dựa trên role của caller.

    Returns (owner_id, id_member) để truyền vào list_zalo_accounts().
    id_member có thể là string (1 user) hoặc list[str] (leader + team members).

    Rules:
        * admin   → owner_id=None, id_member=None  (xem tất cả)
        * leader  → owner_id=None, id_member=[leader_id, ...team_member_ids] (xem accounts của mình + team members)
        * member  → owner_id=None, id_member=caller_id  (chỉ xem tài khoản của mình)
    """
    user_id = _normalize_id(caller_user_id or "", "default")
    email = (caller_email or "").strip().lower()

    if role_override:
        role = role_override.strip().lower()
    elif email:
        role = await get_user_role(email)
    else:
        role = "member"

    if role == "admin":
        return None, None

    if role == "leader":
        if email:
            leader_id = await get_app_user_id_by_email(email)
            if leader_id:
                # Leader thấy tài khoản của mình + của các member trong team
                team_ids = await get_team_member_ids(leader_id)
                team_ids.append(leader_id)  # include leader itself
                return None, team_ids  # type: ignore[arg-type]
        return user_id, [user_id]

    # member: chỉ tài khoản của chính mình
    if email:
        member_id = await get_app_user_id_by_email(email)
        if member_id:
            return None, member_id
    return user_id, user_id


class ZaloAccountCreate(BaseModel):
    account_id: Optional[str] = None
    owner_id: str = "default"
    id_member: Optional[str] = None
    label: str = Field(min_length=1)
    phone: Optional[str] = None
    email: Optional[str] = None  # dùng để auto-resolve id_member nếu không truyền


class ZaloAccountUpdate(BaseModel):
    owner_id: Optional[str] = None
    id_member: Optional[str] = None
    label: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    email: Optional[str] = None  # dùng để auto-resolve id_member nếu không truyền


@router.get("")
async def list_accounts(
    owner_id: Optional[str] = Query(None),
    id_member: Optional[str] = Query(None),
    email: Optional[str] = Query(None, description="Email của caller — dùng để tra role từ app_users"),
    role: Optional[str] = Query(None, description="Override role (admin/leader/member) — chỉ dùng cho test nội bộ"),
    x_user_id: str = Header("default", alias="X-User-ID"),
):
    # Role-based filtering: xác định owner/id_member filter dựa trên role của caller.
    # For single-user Mabu, we always show all accounts (admin view) and avoid id_member UUID issues.
    rule_owner, rule_member = None, None

    if rule_owner is None and rule_member is None:
        # admin: xem tất cả accounts
        db_accounts = await list_zalo_accounts()
    else:
        # member hoặc leader: xem qua id_member (string hoặc list)
        db_accounts = await list_zalo_accounts(id_member=rule_member)

    auth_users = set(await list_zca_auth_users())
    by_id = {str(row.get("account_id")): dict(row) for row in db_accounts if row.get("account_id")}

    for auth_user in auth_users:
        if auth_user in by_id:
            continue

        auth_owner = ""
        try:
            auth = await load_zca_auth(auth_user)
            if isinstance(auth, dict):
                auth_owner = _normalize_id(
                    str(auth.get("ownerId") or auth.get("owner_id") or ""),
                    "",
                )
        except Exception as exc:
            logger.warning(f"Could not inspect ZCA auth owner for account={auth_user}: {exc}")

        # Chỉ bổ sung account ZCA vào kết quả nếu nó thuộc phạm vi caller được xem.
        should_include = False
        if rule_owner is None and rule_member is None:
            should_include = True
        elif isinstance(rule_member, list):
            should_include = auth_owner in rule_member
        elif auth_owner == rule_member:
            should_include = True

        if not should_include:
            continue

        by_id.setdefault(
            auth_user,
            {
                "account_id": auth_user,
                "owner_id": auth_owner,
                "id_member": rule_member or auth_owner,
                "label": auth_user,
                "status": "confirmed",
                "is_active": True,
            },
        )

    accounts = []
    for account in by_id.values():
        account_id = str(account.get("account_id") or "")
        if not account_id:
            continue
        listener = get_listener_status(account_id)
        account["has_auth"] = account_id in auth_users
        account["listener"] = listener
        if listener.get("auth_expired"):
            account["status"] = "session_expired"
        elif account["has_auth"] and account.get("status") in {None, "", "unknown", "not_logged_in"}:
            account["status"] = "confirmed"
        accounts.append(account)

    accounts.sort(key=lambda item: (not bool(item.get("has_auth")), str(item.get("label") or item.get("account_id"))))
    resolved_owner = rule_member or rule_owner or x_user_id
    return {"owner_id": resolved_owner, "accounts": accounts}


@router.post("")
async def create_account(body: ZaloAccountCreate):
    owner_id = _normalize_id(body.owner_id)

    # For single-user Mabu, we do not link accounts to individual member UUIDs.
    resolved_id_member = None

    # Generate random unique account_id
    while True:
        random_id = f"zl_{secrets.token_hex(4)}"
        existing = await get_zalo_account_by_id(random_id)
        if not existing:
            account_id = random_id
            break

    try:
        await upsert_zalo_account(
            account_id,
            owner_id=owner_id,
            id_member=resolved_id_member,
            label=body.label.strip(),
            phone=body.phone,
            status="not_logged_in",
        )
        await upsert_zalo_user(
            account_id,
            id_member=resolved_id_member,
            status="not_logged_in",
        )
    except RuntimeError as exc:
        msg = str(exc)
        if "zalo_users_id_member_fkey" in msg or "zalo_accounts_id_member_fkey" in msg:
            raise HTTPException(
                status_code=400,
                detail="Lỗi tạo tài khoản: Không tìm thấy người dùng trên hệ thống (id_member không hợp lệ). Hãy tải lại trang hoặc đăng nhập lại."
            )
        raise HTTPException(status_code=400, detail=f"Lỗi cơ sở dữ liệu: {msg}")
    except SupabaseNotConfigured:
        pass
    return {
        "account_id": account_id,
        "owner_id": owner_id,
        "label": body.label.strip(),
        "phone": body.phone,
        "status": "not_logged_in",
        "has_auth": False,
        "listener": get_listener_status(account_id),
    }


@router.patch("/{account_id}")
async def update_account(account_id: str, body: ZaloAccountUpdate):
    safe_account_id = _normalize_id(account_id)
    existing = await get_zalo_account_by_id(safe_account_id) or {}
    owner_id = _normalize_id(body.owner_id) if body.owner_id else _normalize_id(existing.get("owner_id"), "default")

    # For single-user Mabu, we do not link accounts to individual member UUIDs.
    id_member = None

    try:
        await upsert_zalo_account(
            safe_account_id,
            owner_id=owner_id,
            id_member=id_member,
            label=body.label if body.label is not None else existing.get("label") or safe_account_id,
            phone=body.phone if body.phone is not None else existing.get("phone"),
            status=body.status if body.status is not None else existing.get("status") or "unknown",
        )
        await upsert_zalo_user(
            safe_account_id,
            id_member=id_member,
            status=body.status if body.status is not None else existing.get("status") or "unknown",
        )
    except SupabaseNotConfigured:
        pass
    return {"account_id": safe_account_id, "updated": True}


@router.delete("/{account_id}")
async def remove_account(
    account_id: str,
    delete_auth: bool = Query(False),
    owner_id: Optional[str] = Query(None),
    x_user_id: str = Header("default", alias="X-User-ID"),
):
    safe_account_id = _normalize_id(account_id)
    requester = _normalize_id(owner_id or x_user_id)
    existing = await get_zalo_account_by_id(safe_account_id)
    if existing and requester != "default":
        allowed = {
            _normalize_id(existing.get("owner_id"), ""),
            _normalize_id(existing.get("id_member"), ""),
        }
        if requester not in allowed:
            raise HTTPException(status_code=403, detail="Zalo account does not belong to current user")

    await stop_listener(safe_account_id)
    
    sessions_removed = 0
    profile_cleared = False
    
    if delete_auth:
        await delete_zca_auth(safe_account_id)
        sessions_removed = await delete_sessions_for_user(safe_account_id)
        try:
            profile_lock = await get_profile_lock(safe_account_id)
            async with profile_lock:
                profile_cleared = clear_user_profile_data(safe_account_id)
        except Exception as exc:
            logger.warning(f"Failed to clear profile data for user={safe_account_id} after deletion: {exc}")
        
        try:
            await hard_delete_zalo_account_data(safe_account_id)
        except Exception as exc:
            logger.warning(f"Failed to hard delete Supabase data for user={safe_account_id}: {exc}")
            
    await delete_zalo_account(safe_account_id)
    return {
        "account_id": safe_account_id,
        "deleted": True,
        "auth_deleted": delete_auth,
        "sessions_removed": sessions_removed,
        "profile_cleared": profile_cleared,
    }



@router.post("/{account_id}/listener/restart")
async def restart_account_listener(account_id: str):
    safe_account_id = _normalize_id(account_id)
    try:
        return await restart_listener(safe_account_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/inbox-report")
async def inbox_report(
    owner_id: Optional[str] = Query(None),
    account_id: List[str] = Query(default=[]),
    x_user_id: str = Header("default", alias="X-User-ID"),
):
    try:
        return await get_zalo_inbox_report(
            [_normalize_id(item) for item in account_id],
            owner_id=_normalize_id(owner_id or x_user_id),
        )
    except SupabaseNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build inbox report: {exc}")


