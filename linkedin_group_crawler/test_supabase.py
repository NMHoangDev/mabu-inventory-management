import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(".env")
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

insert_data = {
    "group_url": "https://linkedin.com/groups/test",
    "group_name": "test",
    "status": "idle",
    # Using a known user id if possible, let's leave it None or get it from auth
}

try:
    res = supabase.table("linkedin_groups").insert(insert_data).execute()
    print("Insert success:", res.data)
except Exception as e:
    print("Insert error:", e)

