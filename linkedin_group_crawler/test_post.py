import requests
import json

payload = {
    "group_url": "https://linkedin.com/groups/test2",
    "group_name": "test"
}

try:
    res = requests.post("http://127.0.0.1:8000/api/all-platform/linkedin/groups/add", json=payload, headers={"Authorization": "Bearer dummy"})
    print("Status:", res.status_code)
    print("Response:", res.json())
except Exception as e:
    print("Error:", e)
