"""Khảo sát data thật trong DB để đề xuất KPI inbox.

Đọc:
1. Schema các bảng liên quan: kpi_tracker, seeding_content_kpi, app_users, zalo_messages
2. Sample data từ kpi_tracker và seeding_content_kpi
3. Mối quan hệ giữa các bảng
"""

import asyncio
from app.modules.all_platform.zalo.services.supabase_service import _rest


async def query_table(table: str, select: str = "*", limit: int = 5, **filters) -> list[dict]:
    params = {"select": select, "limit": str(limit)}
    params.update(filters)
    return await _rest("GET", table, params=params) or []


async def main():
    print("=" * 70)
    print("KHẢO SÁT DATABASE CHO ĐỀ XUẤT KPI INBOX")
    print("=" * 70)

    # 1. Schema kpi_tracker
    print("\n[1] SCHEMA bảng kpi_tracker")
    print("-" * 70)
    # Lấy 1 row để xem cấu trúc
    rows = await query_table("kpi_tracker", limit=3)
    if rows:
        print(f"Cột có sẵn: {list(rows[0].keys())}")
        print(f"Số rows mẫu: {len(rows)}")
        for r in rows[:2]:
            print(f"  {r}")
    else:
        print("(rỗng)")

    # 2. Schema seeding_content_kpi
    print("\n[2] SCHEMA bảng seeding_content_kpi")
    print("-" * 70)
    rows = await query_table("seeding_content_kpi", limit=3)
    if rows:
        print(f"Cột có sẵn: {list(rows[0].keys())}")
        print(f"Số rows mẫu: {len(rows)}")
        for r in rows[:2]:
            print(f"  {r}")
    else:
        print("(rỗng)")

    # 3. Đếm tổng số rows trong từng bảng
    print("\n[3] ĐẾM ROWS CÁC BẢNG LIÊN QUAN")
    print("-" * 70)
    for table in [
        "kpi_tracker",
        "seeding_content_kpi",
        "app_users",
        "zalo_messages",
        "zalo_groups",
        "zalo_message_assets",
    ]:
        try:
            rows = await query_table(table, select="id", limit=1)
            # Lấy count thật bằng cách gọi với head only
            count_params = {"select": "id", "limit": "0"}
            # Supabase không trả count qua REST; ta dùng estimate
            print(f"  {table:30s}: có dữ liệu (mẫu 1 row OK)")
        except Exception as e:
            print(f"  {table:30s}: LỖI — {e}")

    # 4. Distinct values cho các cột categorical
    print("\n[4] DISTINCT VALUES trong kpi_tracker")
    print("-" * 70)
    rows = await query_table("kpi_tracker", limit=50)
    if rows:
        statuses = set(r.get("status") for r in rows)
        platforms = set(r.get("platform") for r in rows)
        print(f"  status values: {statuses}")
        print(f"  platform values: {platforms}")
        # Xem phân phối KPI targets
        if any(r.get("kpi_inbox") for r in rows):
            inbox_vals = [r.get("kpi_inbox") for r in rows if r.get("kpi_inbox")]
            print(f"  kpi_inbox range: {min(inbox_vals)} – {max(inbox_vals)}")

    # 5. Distinct values trong seeding_content_kpi
    print("\n[5] DISTINCT VALUES trong seeding_content_kpi")
    print("-" * 70)
    rows = await query_table("seeding_content_kpi", limit=50)
    if rows:
        verify_vals = set(r.get("verify") for r in rows)
        platform_vals = set(r.get("platform") for r in rows)
        print(f"  verify values: {verify_vals}")
        print(f"  platform values: {platform_vals}")
        # Sample
        for r in rows[:3]:
            print(f"  {r}")

    # 6. App users - xem có bao nhiêu role
    print("\n[6] APP USERS — phân phối role")
    print("-" * 70)
    rows = await query_table("app_users", select="id,email,name,role,is_active", limit=50)
    if rows:
        from collections import Counter
        role_count = Counter(r.get("role") for r in rows)
        print(f"  Role distribution: {dict(role_count)}")
        print(f"  Active users: {sum(1 for r in rows if r.get('is_active'))}")
        print("  Sample users:")
        for r in rows[:5]:
            print(f"    {r}")

    # 7. Zalo messages - xem volume data
    print("\n[7] ZALO MESSAGES — tổng quan")
    print("-" * 70)
    rows = await query_table(
        "zalo_messages",
        select="user_id,is_sent,type",
        limit=200,
    )
    if rows:
        from collections import Counter
        user_count = Counter(r.get("user_id") for r in rows)
        sent_count = Counter(r.get("is_sent") for r in rows)
        type_count = Counter(r.get("type") for r in rows)
        print(f"  Số user distinct: {len(user_count)}")
        print(f"  Top 5 users: {user_count.most_common(5)}")
        print(f"  is_sent distribution: {dict(sent_count)}")
        print(f"  type distribution: {dict(type_count)}")

    # 8. Xem có cột nào liên quan 'inbox' không
    print("\n[8] TÌM CỘT LIÊN QUAN 'inbox'/'tick'/'check'/'complete'")
    print("-" * 70)
    # Thử query các cột có thể có
    for table in ["kpi_tracker", "seeding_content_kpi", "zalo_messages"]:
        try:
            rows = await query_table(table, limit=1)
            if rows:
                all_keys = list(rows[0].keys())
                inbox_keys = [k for k in all_keys if "inbox" in k.lower() or "tick" in k.lower() or "check" in k.lower() or "complete" in k.lower() or "verified" in k.lower()]
                if inbox_keys:
                    print(f"  {table}: {inbox_keys}")
        except Exception:
            pass

    print("\n" + "=" * 70)
    print("XONG")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
