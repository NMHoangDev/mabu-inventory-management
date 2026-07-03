"""Smoke test cho /kpi/zalo-inbox-progress + getAllKpis có seeding_stats.kpi_inbox_current."""
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
    print("TEST 1: POST /kpi/zalo-inbox-progress với email không tồn tại")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/kpi/zalo-inbox-progress",
        json={"email": "ghost@nonexistent.xyz"},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    # Service trả dict rỗng -> BaseResponse.data = {kpi_inbox_current: 0, ...}
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert body.get("success") is True
    assert body.get("data", {}).get("kpi_inbox_current") == 0
    print("✅ PASS")

    print()
    print("=" * 70)
    print("TEST 2: POST /kpi/zalo-inbox-progress với email thiếu")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/kpi/zalo-inbox-progress",
        json={},
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    print(f"Body:   {r.text[:300]}")
    assert r.status_code in (400, 422), f"Expected 400/422, got {r.status_code}"
    print(f"✅ PASS (status {r.status_code})")

    print()
    print("=" * 70)
    print("TEST 3: POST /kpi/zalo-inbox-progress với start_date/end_date custom")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/kpi/zalo-inbox-progress",
        json={
            "email": "smoke@kpi.test",
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
        },
        headers=headers,
    )
    print(f"Status: {r.status_code}")
    body = r.json()
    print(f"Body:   {str(body)[:300]}")
    assert r.status_code == 200
    assert body.get("success") is True
    data = body.get("data", {})
    assert data.get("range", {}).get("start") == "2025-01-01"
    assert data.get("range", {}).get("end") == "2025-12-31"
    print("✅ PASS")

    print()
    print("=" * 70)
    print("TEST 4: GET /kpi/get-all (không có leader_email → trả members rỗng)")
    print("=" * 70)
    r = client.post(
        "/api/all-platform/kpi/get-all",
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
    print("ALL SMOKE TESTS PASSED")
    print("=" * 70)


if __name__ == "__main__":
    main()
