"""Migration: xóa duplicate rows do format source_message_id cũ.

CHẠY 1 LẦN sau khi deploy code fix format msgId thuần.

LÝ DO:
- Code cũ dùng format `sent-{conv}-{msgId}` khi gửi từ tool.
- Listener echo về dùng format `{msgId}` thuần.
- DB lưu cả 2 → hiển thị duplicate trên UI.

HÀNH ĐỘNG:
- Bước 1: Tìm tất cả row có source_message_id bắt đầu bằng 'sent-' hoặc 'local-'.
- Bước 2: Với mỗi row đó, kiểm tra xem có row 'thật' (msgId thuần) đã được
  listener echo về chưa.
  - Nếu CÓ row thật → xóa row 'sent-...'.
  - Nếu CHƯA CÓ row thật → giữ lại row 'sent-...' (để không mất dữ liệu).
- Bước 3: Báo cáo số row đã xóa / giữ lại.

AN TOÀN:
- Chỉ chạm vào row có prefix 'sent-' hoặc 'local-' → không ảnh hưởng row thật.
- Soft-confirm: in ra số liệu trước, dùng flag --apply để thực sự xóa.
"""

import argparse
import asyncio
import re
from collections import defaultdict

from app.modules.all_platform.zalo.services.supabase_service import _rest


async def collect_dup_rows(user_id: str | None) -> dict:
    """Quét toàn bộ DB, tìm các row có format cũ cần xóa/giữ."""
    params: dict = {
        "select": "id,user_id,group_id,source_message_id,is_sent,created_at",
        "order": "created_at.desc",
        "limit": "5000",
    }
    if user_id:
        params["user_id"] = f"eq.{user_id}"

    rows = await _rest("GET", "zalo_messages", params=params) or []
    print(f"Tổng rows quét được: {len(rows)}")

    # Group theo (user_id, group_id) để tra cứu nhanh
    by_thread: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        key = (r.get("user_id", ""), r.get("group_id", ""))
        by_thread[key].append(r)

    candidates_to_delete: list[dict] = []
    candidates_to_keep: list[dict] = []

    pattern = re.compile(r"^(sent-|local-)")

    for key, thread_rows in by_thread.items():
        # Tập hợp các source_message_id thuần (msgId) đã có
        pure_ids: set[str] = set()
        for r in thread_rows:
            smid = r.get("source_message_id", "") or ""
            if smid and not pattern.match(smid):
                # msgId thuần (chuỗi số)
                pure_ids.add(smid)

        # Tập hợp các source_message_id cũ (sent-... / local-...)
        old_format_rows = [r for r in thread_rows if pattern.match(r.get("source_message_id", "") or "")]

        for r in old_format_rows:
            smid = r["source_message_id"]
            # Thử trích msgId từ format cũ
            # Format: "sent-{conv}-{msgId}" hoặc "local-{conv}-{uuid}"
            m = re.match(r"^(?:sent|local)-[^-]+-(\S+)$", smid)
            extracted_msg_id = m.group(1) if m else None

            if extracted_msg_id and extracted_msg_id in pure_ids:
                # Có row thật với cùng msgId → xóa row cũ
                candidates_to_delete.append(r)
            else:
                # Chưa có echo hoặc là local-UUID → giữ lại
                candidates_to_keep.append(r)

    return {
        "total_scanned": len(rows),
        "to_delete": candidates_to_delete,
        "to_keep": candidates_to_keep,
    }


async def apply_deletion(rows: list[dict]) -> int:
    """Xóa các row được chỉ định. Batch theo user_id để giảm request."""
    if not rows:
        return 0
    by_user: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        by_user[r["user_id"]].append(r["id"])

    deleted = 0
    for uid, ids in by_user.items():
        # Xóa theo batch 100 IDs một lần
        for i in range(0, len(ids), 100):
            batch = ids[i : i + 100]
            ids_csv = ",".join(batch)
            try:
                await _rest(
                    "DELETE",
                    "zalo_messages",
                    params={"id": f"in.({ids_csv})"},
                )
                deleted += len(batch)
                print(f"  Đã xóa {len(batch)} rows cho user={uid}")
            except Exception as exc:
                print(f"  LỖI xóa batch user={uid}: {exc}")
    return deleted


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", default=None, help="Chỉ quét 1 user (vd: ho-ng)")
    parser.add_argument("--apply", action="store_true", help="Thực sự xóa (mặc định dry-run)")
    args = parser.parse_args()

    print("=" * 60)
    print("Migration: xóa duplicate rows từ format source_message_id cũ")
    print("=" * 60)
    print(f"User filter: {args.user_id or 'TẤT CẢ'}")
    print(f"Mode: {'APPLY (XÓA THẬT)' if args.apply else 'DRY-RUN (chỉ báo cáo)'}")
    print()

    result = await collect_dup_rows(args.user_id)

    to_delete = result["to_delete"]
    to_keep = result["to_keep"]

    print(f"Tổng rows:        {result['total_scanned']}")
    print(f"Có thể xóa:       {len(to_delete)}  (có row thật cùng msgId)")
    print(f"Giữ lại:          {len(to_keep)}    (chưa có echo hoặc local-UUID)")
    print()

    if to_delete:
        print("Mẫu 5 rows sẽ xóa:")
        for r in to_delete[:5]:
            print(
                f"  - id={r['id'][:8]}... user={r['user_id']} group={r['group_id'][:12]}... "
                f"smid={r['source_message_id'][:40]}... is_sent={r['is_sent']}"
            )
    if to_keep:
        print("Mẫu 5 rows giữ lại:")
        for r in to_keep[:5]:
            print(
                f"  - id={r['id'][:8]}... user={r['user_id']} group={r['group_id'][:12]}... "
                f"smid={r['source_message_id'][:40]}... is_sent={r['is_sent']}"
            )

    print()
    if not args.apply:
        print("⚠️  DRY-RUN — không có gì bị xóa. Chạy lại với --apply để xóa thật.")
        return

    print("Đang xóa...")
    deleted = await apply_deletion(to_delete)
    print(f"✅ Đã xóa {deleted}/{len(to_delete)} rows.")


if __name__ == "__main__":
    asyncio.run(main())
