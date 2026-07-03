"""Smoke test cho /zalo/inbox-share endpoints."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def main():
    from app.core.config import settings as core_settings
    api_key = core_settings.api_key or "test"

    client = TestClient(app)
    headers = {"X-API-Key": api_key}

    print("=" * 70)
    print("TEST 1: POST /zalo/inbox-share/toggle với email thiếu → 422")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/zalo/inbox-share/toggle",
        json={"account_id": "acc1", "conversation_id": "conv1"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:200]}")
    assert r.status_code in (400, 422)
    print(f"✅ PASS (status {r.status_code})")

    print()
    print("=" * 70)
    print("TEST 2: POST /zalo/inbox-share/toggle với member không tồn tại")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/zalo/inbox-share/toggle",
        json={
            "account_id": "acc1",
            "conversation_id": "conv1",
            "member_email": "ghost-xxx@nonexistent.xyz",
            "is_active": True,
        },
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    assert r.status_code == 200
    assert body.get("success") is False
    assert "không tìm thấy" in body.get("message", "").lower() or "ghost" in body.get("message", "").lower()
    print("✅ PASS")

    print()
    print("=" * 70)
    print("TEST 3: POST /zalo/inbox-share/list với email không tồn tại → items=[]")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/zalo/inbox-share/list",
        json={"member_email": "ghost-zzz@nonexistent.xyz", "is_active": True},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    assert r.status_code == 200
    assert body.get("success") is True
    assert body.get("data", {}).get("total", 0) == 0
    assert body.get("data", {}).get("items", []) == []
    print("✅ PASS")

    print()
    print("=" * 70)
    print("TEST 4: POST /zalo/inbox-share/leader-view với leader không tồn tại")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/zalo/inbox-share/leader-view",
        json={"leader_email": "ghost-leader@nonexistent.xyz"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    assert r.status_code == 200
    assert body.get("success") is True
    assert body.get("data", {}).get("total", 0) == 0
    print("✅ PASS")

    print()
    print("=" * 70)
    print("TEST 5: POST /zalo/inbox-share/bulk-sync với email không tồn tại")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/zalo/inbox-share/bulk-sync",
        json={
            "member_email": "ghost-bulk@nonexistent.xyz",
            "shares": [
                {"account_id": "a1", "conversation_id": "c1", "is_active": True},
                {"account_id": "a2", "conversation_id": "c2", "is_active": False},
            ],
        },
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    assert r.status_code == 200
    assert body.get("success") is False
    assert "không tìm thấy" in body.get("error", "").lower() or body.get("ok") is False
    print("✅ PASS")

    print()
    print("=" * 70)
    print("ALL SMOKE TESTS PASSED")
    print("=" * 70)


if __name__ == "__main__":
    main()
