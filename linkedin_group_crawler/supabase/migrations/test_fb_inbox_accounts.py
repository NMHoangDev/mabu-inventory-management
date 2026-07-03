"""Test script để kiểm tra flow FB Inbox Account.

Chạy: python -m supabase.migrations.test_fb_inbox_accounts

Flow test:
1. Tạo FB inbox account (link user_id với id_member)
2. Resolve user_id -> id_member
3. Gọi count_fb_inbox_kpi (không cần truyền email)
"""

import sys
sys.path.insert(0, ".")

from app.modules.all_platform.services.fb_inbox_account_service import (
    link_user_account,
    resolve_id_member,
    get_accounts_by_member,
    delete_account,
)


def test_fb_inbox_accounts():
    """Test các hàm trong fb_inbox_account_service."""
    print("=" * 60)
    print("TEST: FB Inbox Account Service")
    print("=" * 60)

    # Test data - THAY BẰNG DATA THỰC TẾ
    TEST_MEMBER_ID = "test-member-uuid"  # Replace với app_users.id thực
    TEST_USER_ID = "fb_test_12345"       # Seeder service user_id
    TEST_FB_USER_ID = "123456789"        # Facebook UID

    # 1. Link account
    print("\n1. Test link_user_account()")
    try:
        result = link_user_account(
            id_member=TEST_MEMBER_ID,
            user_id=TEST_USER_ID,
            fb_user_id=TEST_FB_USER_ID,
            account_label="Test FB Account",
        )
        print(f"   ✅ Link thành công: {result}")
    except Exception as e:
        print(f"   ❌ Link thất bại: {e}")

    # 2. Resolve user_id -> id_member
    print("\n2. Test resolve_id_member()")
    resolved_id = resolve_id_member(TEST_USER_ID)
    if resolved_id == TEST_MEMBER_ID:
        print(f"   ✅ Resolve đúng: user_id={TEST_USER_ID} -> id_member={resolved_id}")
    else:
        print(f"   ❌ Resolve sai hoặc không tìm thấy: {resolved_id}")

    # 3. Resolve account không tồn tại
    print("\n3. Test resolve_id_member() với user_id không tồn tại")
    resolved_none = resolve_id_member("non_existent_user_id")
    if resolved_none is None:
        print(f"   ✅ Resolve đúng: trả về None cho user_id không tồn tại")
    else:
        print(f"   ❌ Sai: trả về {resolved_none}")

    # 4. Get accounts by member
    print("\n4. Test get_accounts_by_member()")
    accounts = get_accounts_by_member(TEST_MEMBER_ID)
    print(f"   📋 Số accounts của member: {len(accounts)}")
    for acc in accounts:
        print(f"      - {acc.get('user_id')} ({acc.get('account_label')})")

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


def test_count_fb_inbox_kpi():
    """Test hàm count_fb_inbox_kpi với bảng mới."""
    print("\n" + "=" * 60)
    print("TEST: count_fb_inbox_kpi với bảng mới fb_inbox_accounts")
    print("=" * 60)

    from app.modules.all_platform.services.supabase_kpi_service import count_fb_inbox_kpi

    # Test data - THAY BẰNG DATA THỰC TẾ
    TEST_LEADER_EMAIL = "leader@example.com"
    TEST_USER_ID = "fb_test_12345"  # Đã được link ở test trên

    print(f"\nTest với: leader_email={TEST_LEADER_EMAIL}, user_id={TEST_USER_ID}")

    try:
        result = count_fb_inbox_kpi(
            member_email=TEST_LEADER_EMAIL,  # Giả sử leader email = member email
            leader_email=TEST_LEADER_EMAIL,
            conv_ids=["conv_123", "conv_456"],
            user_id=TEST_USER_ID,
            is_lead=False,
        )
        print(f"   ✅ count_fb_inbox_kpi thành công: {result}")
    except Exception as e:
        print(f"   ❌ count_fb_inbox_kpi thất bại: {e}")

    print("\n" + "=" * 60)


def test_api_endpoints():
    """Test API endpoints bằng curl."""
    print("\n" + "=" * 60)
    print("TEST: API Endpoints")
    print("=" * 60)

    BASE_URL = "http://localhost:8000/api/all-platform"

    print(f"""
API Endpoints đã được tạo:

1. POST /inbox-accounts
   - Member thêm FB inbox account
   - Body: {{"user_id": "fb_xxx", "fb_user_id": "123456", "account_label": "FB Chính"}}
   - Header: Authorization: Bearer <JWT>

2. GET /inbox-accounts
   - Liệt kê accounts của member hiện tại

3. GET /inbox-accounts/{{user_id}}
   - Lấy thông tin 1 account theo user_id

4. GET /inbox-accounts/resolve/{{seeder_user_id}}
   - Resolve user_id -> id_member

5. PUT /inbox-accounts/{{account_id}}
   - Cập nhật account

6. DELETE /inbox-accounts/{{account_id}}
   - Xóa account

Ví dụ curl:

# 1. Link account
curl -X POST {BASE_URL}/inbox-accounts \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <JWT_TOKEN>" \\
  -d '{{"user_id": "fb_123", "fb_user_id": "123456", "account_label": "FB Chính"}}'

# 2. List accounts
curl -X GET {BASE_URL}/inbox-accounts \\
  -H "Authorization: Bearer <JWT_TOKEN>"

# 3. Resolve user_id
curl -X GET {BASE_URL}/inbox-accounts/resolve/fb_123 \\
  -H "Authorization: Bearer <JWT_TOKEN>"
""")

    print("=" * 60)


if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════════════════╗
║         FB INBOX ACCOUNTS - TEST SCRIPT                             ║
║                                                                      ║
║  Hướng dẫn:                                                         ║
║  1. Chạy migration:                                                 ║
║     psql $DATABASE_URL -f supabase/migrations/007_fb_inbox_accounts.sql
║                                                                      ║
║  2. Deploy code backend mới                                          ║
║                                                                      ║
║  3. Chạy test:                                                       ║
║     python -m supabase.migrations.test_fb_inbox_accounts            ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    """)

    # Uncomment để chạy tests
    # test_fb_inbox_accounts()
    # test_count_fb_inbox_kpi()
    test_api_endpoints()
