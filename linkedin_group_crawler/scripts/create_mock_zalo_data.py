import os
import sys
import httpx
import asyncio
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load env variables from backend directory
load_dotenv(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in .env")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Target app_users mapping IDs from DB
USERS = {
    "admin": "eaf645f8-6f41-48a8-ac28-c1f3d97d60a0", # Minh
    "member_huy": "edbb8757-d6b2-46db-bafd-948c14f98640", # Nguyễn Minh huy
    "leader_thuong": "dadc2f27-03c3-452e-a295-2400bfff12ec", # Nguyễn Viết Thương
    "member_test": "2e52e73d-36c4-4870-bdaf-3b4c22832d93", # Member Test
    "user_test": "c729c1bb-fd06-47cc-8d23-675d9d67369b" # User Test
}

async def make_request(method: str, table: str, payload: list) -> bool:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.request(method, url, headers=HEADERS, json=payload)
        if res.status_code >= 400:
            print(f"Failed to upsert to {table}: {res.status_code} {res.text}")
            return False
        return True

async def main():
    print("Starting mock data generation for Zalo Inbox...")
    now = datetime.now(timezone.utc).isoformat()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    # 1. Mock accounts
    accounts = [
        {
            "account_id": "zalo_mock_01",
            "owner_id": USERS["admin"],
            "id_member": USERS["admin"],
            "label": "Zalo Marketing 01",
            "phone": "0901234567",
            "status": "confirmed",
            "is_active": True,
            "last_seen_at": now,
            "updated_at": now
        },
        {
            "account_id": "zalo_mock_02",
            "owner_id": USERS["leader_thuong"],
            "id_member": USERS["member_huy"],
            "label": "CSKH Zalo 02",
            "phone": "0907654321",
            "status": "confirmed",
            "is_active": True,
            "last_seen_at": now,
            "updated_at": now
        },
        {
            "account_id": "zalo_mock_03",
            "owner_id": USERS["leader_thuong"],
            "id_member": USERS["member_test"],
            "label": "Zalo Seeding 03 (Offline)",
            "phone": "0933333333",
            "status": "expired",
            "is_active": True,
            "last_seen_at": yesterday,
            "updated_at": now
        }
    ]

    print("Upserting zalo_accounts...")
    if not await make_request("POST", "zalo_accounts?on_conflict=account_id", accounts):
        return

    # 2. Mock groups (conversations) for active accounts (zalo_mock_01 & zalo_mock_02)
    groups = []
    # Mock groups for zalo_mock_01
    groups.extend([
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "unread_count": 2,
            "last_message_at": now,
            "last_message_content": "Dạ báo giá cho em gói 3 triệu với ạ.",
            "last_sender_name": "Nguyễn Văn A",
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_102",
            "group_name": "Chị Hương Spa",
            "unread_count": 0,
            "last_message_at": yesterday,
            "last_message_content": "Bên mình có những dịch vụ nào em nhỉ?",
            "last_sender_name": "Chị Hương Spa",
            "updated_at": now
        }
    ])
    # Mock groups for zalo_mock_02
    groups.extend([
        {
            "user_id": "zalo_mock_02",
            "group_id": "g_conv_201",
            "group_name": "Anh Tiến Bất Động Sản",
            "unread_count": 1,
            "last_message_at": now,
            "last_message_content": "Cảm ơn bạn nhé, mình sẽ nghiên cứu thêm.",
            "last_sender_name": "Anh Tiến Bất Động Sản",
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_02",
            "group_id": "g_conv_202",
            "group_name": "Mỹ Phẩm Trúc Mai (Lead)",
            "unread_count": 0,
            "last_message_at": yesterday,
            "last_message_content": "Chuyển khoản qua số tài khoản nào shop?",
            "last_sender_name": "Mỹ Phẩm Trúc Mai (Lead)",
            "updated_at": now
        }
    ])

    print("Upserting zalo_groups...")
    if not await make_request("POST", "zalo_groups?on_conflict=user_id,group_id", groups):
        return

    # 3. Mock messages for conversations
    messages = []
    # Conversation g_conv_101 (Nguyễn Văn A)
    messages.extend([
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "source_message_id": "msg_101_1",
            "sender_id": "cust_101",
            "sender_name": "Nguyễn Văn A",
            "timestamp_text": yesterday,
            "time_text": "10:30",
            "type": "webchat",
            "content": "Chào admin, em muốn hỏi thông tin về dịch vụ seeding.",
            "is_sent": False,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "source_message_id": "msg_101_2",
            "sender_id": "staff_101",
            "sender_name": "Zalo Marketing 01",
            "timestamp_text": yesterday,
            "time_text": "10:32",
            "type": "webchat",
            "content": "Dạ chào anh A, dịch vụ seeding bên em hỗ trợ tăng tương tác, like share bài viết.",
            "is_sent": True,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "source_message_id": "msg_101_3",
            "sender_id": "cust_101",
            "sender_name": "Nguyễn Văn A",
            "timestamp_text": now,
            "time_text": "08:15",
            "type": "webchat",
            "content": "Gói cơ bản giá bao nhiêu và thời gian triển khai bao lâu?",
            "is_sent": False,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "source_message_id": "msg_101_4",
            "sender_id": "staff_101",
            "sender_name": "Zalo Marketing 01",
            "timestamp_text": now,
            "time_text": "08:20",
            "type": "webchat",
            "content": "Gói cơ bản bên em là 3 triệu, chạy trong vòng 30 ngày ạ. Anh có nhu cầu cụ thể không?",
            "is_sent": True,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_01",
            "group_id": "g_conv_101",
            "group_name": "Nguyễn Văn A (Khách Lead)",
            "source_message_id": "msg_101_5",
            "sender_id": "cust_101",
            "sender_name": "Nguyễn Văn A",
            "timestamp_text": now,
            "time_text": "08:25",
            "type": "webchat",
            "content": "Dạ báo giá cho em gói 3 triệu với ạ.",
            "is_sent": False,
            "is_deleted": False,
            "updated_at": now
        }
    ])

    # Conversation g_conv_201 (Anh Tiến Bất Động Sản)
    messages.extend([
        {
            "user_id": "zalo_mock_02",
            "group_id": "g_conv_201",
            "group_name": "Anh Tiến Bất Động Sản",
            "source_message_id": "msg_201_1",
            "sender_id": "cust_201",
            "sender_name": "Anh Tiến Bất Động Sản",
            "timestamp_text": yesterday,
            "time_text": "14:00",
            "type": "webchat",
            "content": "Chào em, dự án chung cư bên em có hỗ trợ chạy quảng cáo Zalo không?",
            "is_sent": False,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_02",
            "group_id": "g_conv_201",
            "group_name": "Anh Tiến Bất Động Sản",
            "source_message_id": "msg_201_2",
            "sender_id": "staff_202",
            "sender_name": "CSKH Zalo 02",
            "timestamp_text": yesterday,
            "time_text": "14:05",
            "type": "webchat",
            "content": "Dạ bên em có ạ. Hỗ trợ target khách hàng quanh khu vực dự án và độ tuổi quan tâm.",
            "is_sent": True,
            "is_deleted": False,
            "updated_at": now
        },
        {
            "user_id": "zalo_mock_02",
            "group_id": "g_conv_201",
            "group_name": "Anh Tiến Bất Động Sản",
            "source_message_id": "msg_201_3",
            "sender_id": "cust_201",
            "sender_name": "Anh Tiến Bất Động Sản",
            "timestamp_text": now,
            "time_text": "09:00",
            "type": "webchat",
            "content": "Cảm ơn bạn nhé, mình sẽ nghiên cứu thêm.",
            "is_sent": False,
            "is_deleted": False,
            "updated_at": now
        }
    ])

    print("Upserting zalo_messages...")
    if not await make_request("POST", "zalo_messages?on_conflict=user_id,group_id,source_message_id", messages):
        return

    print("Successfully created mock Zalo accounts, conversations, and messages in Supabase Database!")

if __name__ == "__main__":
    asyncio.run(main())
