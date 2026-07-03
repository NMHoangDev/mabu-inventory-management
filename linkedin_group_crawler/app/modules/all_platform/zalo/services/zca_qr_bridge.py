from typing import Any, Dict, List, Optional, Tuple
import asyncio
import json
import os
from pathlib import Path

from loguru import logger
from playwright.async_api import BrowserContext


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[5]


def zca_script_path() -> Path:
    return _backend_root() / "scripts" / "zca_qr_login.js"


import sys
import subprocess

class _AsyncReaderWrapper:
    def __init__(self, stream):
        self._stream = stream
        
    async def readline(self) -> bytes:
        if not self._stream:
            return b""
        try:
            return await asyncio.to_thread(self._stream.readline)
        except Exception:
            return b""


class WindowsSubprocessWrapper:
    def __init__(
        self,
        cmd: List[str],
        cwd: str,
        env: Dict[str, str],
        stdin_input: Optional[bytes] = None,
    ):
        self._proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdin=subprocess.PIPE if stdin_input is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        self._stdout_override = self
        self._stderr_override = _AsyncReaderWrapper(self._proc.stderr)
        
        if stdin_input is not None and self._proc.stdin is not None:
            try:
                self._proc.stdin.write(stdin_input)
                self._proc.stdin.flush()
            except Exception:
                pass
            finally:
                try:
                    self._proc.stdin.close()
                except Exception:
                    pass

    @property
    def returncode(self) -> Optional[int]:
        self._proc.poll()
        return self._proc.returncode

    @property
    def stderr(self) -> Any:
        return self._stderr_override

    @stderr.setter
    def stderr(self, value: Any) -> None:
        self._stderr_override = value

    @property
    def stdout(self) -> Any:
        return self._stdout_override

    @stdout.setter
    def stdout(self, value: Any) -> None:
        self._stdout_override = value

    async def readline(self) -> bytes:
        return await asyncio.to_thread(self._proc.stdout.readline)

    async def wait(self) -> int:
        return await asyncio.to_thread(self._proc.wait)

    def terminate(self):
        try:
            self._proc.terminate()
        except Exception:
            pass

    def kill(self):
        try:
            self._proc.kill()
        except Exception:
            pass


async def start_zca_qr_process(session_id: str) -> Any:
    script = zca_script_path()
    if not script.exists():
        raise RuntimeError(f"ZCA QR helper not found: {script}")

    if sys.platform == "win32":
        return WindowsSubprocessWrapper(
            ["node", str(script), session_id],
            cwd=str(_backend_root()),
            env={**os.environ},
        )

    return await asyncio.create_subprocess_exec(
        "node",
        str(script),
        session_id,
        cwd=str(_backend_root()),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ},
    )


async def read_zca_event(
    proc: Any,
    timeout_seconds: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    if not getattr(proc, "stdout", None):
        return None

    try:
        raw = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return None

    if not raw:
        return None

    line = raw.decode("utf-8", errors="replace").strip()
    if not line:
        return None

    try:
        return json.loads(line)
    except json.JSONDecodeError:
        logger.warning(f"Ignoring non-JSON ZCA QR output: {line[:300]}")
        return None


def _cookie_expiry(cookie: Dict[str, Any]) -> Optional[float]:
    expires = cookie.get("expires")
    if not expires or expires == "Infinity":
        return None
    if isinstance(expires, (int, float)):
        return float(expires)
    try:
        from datetime import datetime

        return datetime.fromisoformat(str(expires).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _same_site(value: Any) -> Optional[str]:
    if not value:
        return None
    normalized = str(value).strip().lower()
    if normalized == "strict":
        return "Strict"
    if normalized == "lax":
        return "Lax"
    if normalized == "none":
        return "None"
    return None


def zca_auth_to_playwright_cookies(auth: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = auth.get("cookies") or ""
    if not raw:
        return []

    parsed = json.loads(raw) if isinstance(raw, str) else raw
    source_cookies = parsed.get("cookies") if isinstance(parsed, dict) else parsed
    if not isinstance(source_cookies, list):
        return []

    cookies: List[Dict[str, Any]] = []
    for cookie in source_cookies:
        if not isinstance(cookie, dict):
            continue
        name = cookie.get("key") or cookie.get("name")
        value = cookie.get("value")
        domain = cookie.get("domain") or ".zalo.me"
        if not name or value is None:
            continue

        item: Dict[str, Any] = {
            "name": str(name),
            "value": str(value),
            "domain": str(domain),
            "path": str(cookie.get("path") or "/"),
            "httpOnly": bool(cookie.get("httpOnly", False)),
            "secure": bool(cookie.get("secure", True)),
        }
        expires = _cookie_expiry(cookie)
        if expires:
            item["expires"] = expires
        same_site = _same_site(cookie.get("sameSite"))
        if same_site:
            item["sameSite"] = same_site
        cookies.append(item)

    return cookies


async def import_zca_auth_to_context(context: BrowserContext, auth: Dict[str, Any]) -> None:
    cookies = zca_auth_to_playwright_cookies(auth)
    if not cookies:
        raise RuntimeError("ZCA auth did not contain importable cookies")
    await context.add_cookies(cookies)
    logger.info(f"Imported {len(cookies)} ZCA cookies into Playwright context")

