import os
import requests
from dotenv import load_dotenv

load_dotenv()
url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

res = requests.get(f"{url}/rest/v1/?apikey={key}")
spec = res.json()
props = spec["definitions"]["seeding_content_kpi"]["properties"]
print(list(props.keys()))
