import os
import sys
import bcrypt
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env")
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in .env")
    sys.exit(1)

supabase: Client = create_client(url, key)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def main():
    email = "admin@gmail.com"
    new_password = "admin123"
    hashed = hash_password(new_password)
    
    print(f"Resetting password for {email}...")
    try:
        res = supabase.table("app_users").update({"password": hashed}).eq("email", email).execute()
        print("Success! Response:", res.data)
    except Exception as e:
        print("Error resetting password:", e)

if __name__ == "__main__":
    main()
