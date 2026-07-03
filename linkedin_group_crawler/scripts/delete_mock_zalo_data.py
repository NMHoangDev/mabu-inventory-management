"""
Delete all mock Zalo data created by create_mock_zalo_data.py
Removes: mock accounts, groups, messages, and the "Mock Team Test" team.
"""
import os
import sys
import httpx
import asyncio
from dotenv import load_dotenv

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
}

MOCK_ACCOUNT_IDS = ["zalo_mock_01", "zalo_mock_02", "zalo_mock_03"]
MOCK_GROUP_IDS = ["g_conv_101", "g_conv_102", "g_conv_201", "g_conv_202"]

async def delete_from_table(table: str, column: str, values: list[str]):
    """Delete rows from a Supabase table where column is in values."""
    filter_str = ",".join(values)
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?{column}=in.({filter_str})"
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.delete(url, headers=HEADERS)
        if res.status_code >= 400:
            print(f"  [WARN] Failed to delete from {table}: {res.status_code} {res.text}")
            return False
        print(f"  [OK] Deleted from {table} where {column} in ({filter_str})")
        return True

async def delete_mock_team():
    """Delete the 'Mock Team Test' team from teams."""
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/teams?team_name=eq.Mock%20Team%20Test"
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.delete(url, headers=HEADERS)
        if res.status_code >= 400:
            print(f"  [WARN] Failed to delete Mock Team Test from app_teams: {res.status_code} {res.text}")
            return False
        print(f"  [OK] Deleted 'Mock Team Test' from app_teams")
        return True

async def main():
    print("Deleting all mock Zalo data...\n")

    # 1. Delete mock messages (by user_id = mock account IDs)
    print("[1/4] Deleting mock messages...")
    await delete_from_table("zalo_messages", "user_id", MOCK_ACCOUNT_IDS)

    # 2. Delete mock groups (by user_id = mock account IDs)
    print("[2/4] Deleting mock groups...")
    await delete_from_table("zalo_groups", "user_id", MOCK_ACCOUNT_IDS)

    # 3. Delete mock accounts
    print("[3/4] Deleting mock accounts...")
    await delete_from_table("zalo_accounts", "account_id", MOCK_ACCOUNT_IDS)

    # 4. Delete "Mock Team Test" team
    print("[4/4] Deleting 'Mock Team Test' team...")
    await delete_mock_team()

    print("\n[DONE] All mock Zalo data has been deleted!")

if __name__ == "__main__":
    asyncio.run(main())
