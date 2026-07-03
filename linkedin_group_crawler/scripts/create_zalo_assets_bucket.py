"""Create the zalo-assets Supabase storage bucket (public).

Idempotent: if the bucket already exists, this exits 0.
"""
import json
import sys
import urllib.error
import urllib.request

URL = "https://rtwpogvficadngtfrcci.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0d3BvZ3ZmaWNhZG5ndGZyY2NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDY1OCwiZXhwIjoyMDk1NjQwNjU4fQ."
    "HaAidKEi4nSyeZh3rSW8wBkoUNb9aoKC9wDBWBA1XLc"
)
BUCKET = "zalo-assets"


def request(method: str, path: str, body=None) -> tuple[int, str]:
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def main() -> int:
    # 1) Check existing buckets
    code, body = request("GET", f"/storage/v1/bucket/{BUCKET}")
    if code == 200:
        print(f"Bucket '{BUCKET}' already exists. Body: {body}")
        return 0

    if "Bucket not found" not in body and code not in (404, 400):
        print(f"Unexpected status checking bucket: {code} {body}", file=sys.stderr)
        return 1

    # 2) Create the bucket
    payload = {
        "id": BUCKET,
        "name": BUCKET,
        "public": True,
        "file_size_limit": 10 * 1024 * 1024,
        "allowed_mime_types": [
            "image/*",
            "video/*",
            "audio/*",
            "application/octet-stream",
        ],
    }
    code, body = request("POST", "/storage/v1/bucket", body=payload)
    print(f"Create bucket: HTTP {code} {body}")
    if code not in (200, 201):
        return 1

    # 3) Re-fetch to confirm
    code, body = request("GET", f"/storage/v1/bucket/{BUCKET}")
    print(f"Re-check bucket: HTTP {code} {body}")
    return 0 if code == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
