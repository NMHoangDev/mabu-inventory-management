"""Quick DB inspector for Zalo group sync verification."""
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

URL = "https://rtwpogvficadngtfrcci.supabase.co"
KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0d3BvZ3ZmaWNhZG5ndGZyY2NpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDY1OCwiZXhwIjoyMDk1NjQwNjU4fQ."
    "HaAidKEi4nSyeZh3rSW8wBkoUNb9aoKC9wDBWBA1XLc"
)
HDR = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def get(path: str, params: dict, prefer: str = ""):
    from urllib.parse import urlencode
    qs = urlencode(params)
    headers = dict(HDR)
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}{path}?{qs}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.headers, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  HTTP {e.code} on {path}: {body}", file=sys.stderr)
        raise


def main():
    _, body = get(
        "/rest/v1/zalo_groups",
        {
            "select": "group_id,group_name,last_message_at",
            "user_id": "eq.ho-ng",
            "order": "last_message_at.desc.nullslast",
            "limit": "30",
        },
    )
    groups = json.loads(body)
    print(f"=== {len(groups)} groups for ho-ng ===")
    target = None
    for g in groups:
        name = g.get("group_name") or ""
        marker = "  <-- TARGET" if "Em Bé" in name else ""
        print(
            f"  {g.get('group_id')[:18]}  "
            f"{name[:40]:40}  "
            f"last={g.get('last_message_at')}{marker}"
        )
        if "Em Bé" in name:
            target = g

    if not target:
        print("\n[!] 'Em Bé Iuuu' not found in DB")
        return 1

    gid = target["group_id"]
    print(f"\n=== Latest 15 messages in 'Em Bé Iuuu' (group_id={gid}) ===")
    _, body = get(
        "/rest/v1/zalo_messages",
        {
            "select": "source_message_id,sender_name,content,timestamp_text,created_at,is_sent",
            "user_id": "eq.ho-ng",
            "group_id": f"eq.{gid}",
            "order": "created_at.desc",
            "limit": "15",
        },
    )
    msgs = json.loads(body)
    if not msgs:
        print("  (no messages in DB)")
    for m in msgs:
        ts = m.get("timestamp_text") or ""
        ca = m.get("created_at") or ""
        sender = m.get("sender_name") or ""
        content = (m.get("content") or "").replace("\n", " ")[:60]
        print(f"    [ts={ts!r}  created={ca}] {sender[:16]:16}  sent={int(m.get('is_sent') or 0)}  {content!r}")

    # Total count
    headers, _ = get(
        "/rest/v1/zalo_messages",
        {
            "select": "source_message_id",
            "user_id": "eq.ho-ng",
            "group_id": f"eq.{gid}",
            "limit": "1",
        },
        prefer="count=exact",
    )
    print(f"\n  Total messages in DB: {headers.get('content-range', '?')}")

    # Also check VN IT group
    print("\n=== Latest 8 messages in 'VN IT' (for comparison) ===")
    headers, body = get(
        "/rest/v1/zalo_groups",
        {
            "select": "group_id,group_name",
            "user_id": "eq.ho-ng",
            "group_name": "like.*VN IT*",
            "limit": "3",
        },
    )
    it_groups = json.loads(body)
    if it_groups:
        igid = it_groups[0]["group_id"]
        _, body = get(
            "/rest/v1/zalo_messages",
            {
                "select": "source_message_id,sender_name,content,timestamp_text,created_at,is_sent",
                "user_id": "eq.ho-ng",
                "group_id": f"eq.{igid}",
                "order": "created_at.desc",
                "limit": "8",
            },
        )
        msgs = json.loads(body)
        for m in msgs:
            ts = m.get("timestamp_text") or ""
            ca = m.get("created_at") or ""
            sender = m.get("sender_name") or ""
            content = (m.get("content") or "").replace("\n", " ")[:60]
            print(f"    [ts={ts!r}  created={ca}] {sender[:16]:16}  sent={int(m.get('is_sent') or 0)}  {content!r}")
        headers, _ = get(
            "/rest/v1/zalo_messages",
            {
                "select": "source_message_id",
                "user_id": "eq.ho-ng",
                "group_id": f"eq.{igid}",
                "limit": "1",
            },
            prefer="count=exact",
        )
        print(f"\n  Total messages in DB for VN IT: {headers.get('content-range', '?')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
