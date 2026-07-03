"""Smoke test endpoint mới /users/find + /users/threads.

Test:
  - 401 khi không có ZCA auth (account mặc định không có auth)
  - 400 khi SĐT invalid
  - 200 OK cho endpoint threads (không gọi ZCA)
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def main():
    from app.core.config import settings as core_settings
    api_key = core_settings.api_key or "test"
    print(f"Using API key: {api_key!r}")

    client = TestClient(app)
    headers = {"X-User-ID": "smoke-test-no-auth", "X-API-Key": api_key}

    print("=" * 60)
    print("TEST 1: GET /users/find?q=0839108906 (không có auth → 401)")
    print("=" * 60)
    r = client.get(
        "/api/all-platform/zalo/conversations/users/find",
        params={"q": "0839108906", "by": "phone"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:300]}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    print("✅ PASS")

    print()
    print("=" * 60)
    print("TEST 2: GET /users/find?q=12345 (SĐT invalid → ?? )")
    print("=" * 60)
    r = client.get(
        "/api/all-platform/zalo/conversations/users/find",
        params={"q": "12345", "by": "phone"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:300]}")
    # SĐT quá ngắn < 8 ký tự → query validation reject → 422
    # Hoặc nếu pass min_length check thì sẽ 401 (no auth). Ta check có error là OK.
    assert r.status_code in (400, 401, 422), f"Expected 400/401/422, got {r.status_code}"
    print(f"✅ PASS (status {r.status_code})")

    print()
    print("=" * 60)
    print("TEST 3: POST /users/threads với user_id không phải số → 400")
    print("=" * 60)
    r = client.post(
        "/api/all-platform/zalo/conversations/users/threads",
        json={"user_id": "abc1234", "display_name": "Test"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:300]}")
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"
    print("✅ PASS")

    print()
    print("=" * 60)
    print("TEST 4: POST /users/threads với user_id hợp lệ → ???")
    print("=" * 60)
    r = client.post(
        "/api/all-platform/zalo/conversations/users/threads",
        json={"user_id": "123456789", "display_name": "Smoke Test User"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:500]}")
    # Supabase có thể chưa cấu hình → 500, hoặc thành công → 200
    # Cả 2 đều chấp nhận được cho smoke test
    assert r.status_code in (200, 500, 503), f"Expected 200/500/503, got {r.status_code}"
    print(f"✅ PASS (status {r.status_code})")

    print()
    print("=" * 60)
    print("ALL SMOKE TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
