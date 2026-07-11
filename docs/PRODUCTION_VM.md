# Ghi chú máy chủ production (cập nhật 2026-07-11)

Tài liệu bổ sung cho mục "Production deploy" trong `CLAUDE.md` (không lặp lại phần đã có ở đó) — ghi lại những gì quan sát được trực tiếp khi SSH vào và deploy thủ công lần này.

## Truy cập

- `ssh vanthuong@10.30.195.41` (hostname `testseeding2`, Ubuntu 20.04).
- Auth bằng password, **không lưu password ở đây hay bất kỳ file nào commit vào git** — hỏi lại user mỗi lần cần SSH.
- Bắt buộc user bật VPN trước khi SSH được (IP nội bộ `10.30.195.41`, timeout nếu VPN tắt).
- Code: `~/opt/apps/mabuu/mabu-inventory-management`. Docker: chỉ có `docker-compose` (gạch nối), không có `docker compose` plugin.

## Cấu hình phần cứng thật — QUAN TRỌNG khi ước lượng thời gian deploy

Đã đo trực tiếp khi build lại `frontend` (Next.js) sau khi đổi code:

- RAM chỉ **~1.9GB**, gần như dùng hết bởi các service đang chạy 24/7 (`next-server`, `zalo-bridge`, self-hosted GitHub Actions runner, dockerd...) → build Docker mới phải **swap** (đã thấy dùng tới ~1.2GB swap, free RAM chỉ còn ~70-90MB).
- Hệ quả: bước `RUN chown -R nextjs:nodejs /app` trong `frontend.Dockerfile` (chown lại toàn bộ `node_modules` sau khi copy) — bình thường chỉ mất vài giây trên máy thường — **mất tới ~160 giây** ở đây do disk I/O bị nghẽn vì swap thrashing (process ở trạng thái `D` - uninterruptible sleep chờ disk).
- Tổng thời gian `docker-compose build frontend zalo-bridge` (kể cả `npm ci`, `next build`, TypeScript check, static generation, export layer) rơi vào khoảng **20-25 phút** cho riêng bước build (zalo-bridge thường cache gần hết, chỉ frontend build lại từ đầu khi code Next.js đổi).
- **Khi deploy lần sau**: đừng hoảng nếu `docker-compose build` "đứng im" nhiều phút ở bước `chown -R` hay `Running TypeScript...` — dùng `ps aux | grep chown` / `top` để xác nhận process vẫn ở trạng thái chạy (R/D), không phải hang thật. Cân nhắc theo dõi qua `ps`/`free -h` thay vì chỉ nhìn log build.

## Disk

- Trước deploy: `df -h /` báo 91% đầy (~1.6GB trống) — build image mới cần thêm không gian, nên **luôn `docker image prune -f` + `docker builder prune -f` trước khi build** nếu dung lượng trống dưới ~2-3GB (chỉ xoá dangling image/build cache, an toàn, không đụng container đang chạy).
- Lần này `docker builder prune -f` giải phóng ~1.17GB (build cache); `docker image prune -f` không giải phóng gì thêm (không có dangling image thật sự, tất cả image đang được dùng).

## Quy trình đã chạy thành công (thủ công qua SSH, không qua GitHub Actions)

```bash
cd ~/opt/apps/mabuu/mabu-inventory-management
git pull                                          # fast-forward, không conflict
docker image prune -f && docker builder prune -f  # giải phóng chỗ trước khi build
docker-compose build frontend zalo-bridge          # ~20-25 phút trên VM này
docker-compose up -d frontend zalo-bridge
docker-compose restart router
docker image prune -f
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/state   # kỳ vọng 200
curl -s http://localhost:8080/zalo-bridge/health                           # kỳ vọng {"status":"ok",...}
```

Lưu ý: quy trình chính thức nên dùng workflow `deploy-app.yml` (GitHub Actions, self-hosted runner sẵn có trên chính VM này) thay vì SSH tay — cách trên chỉ dùng khi cần deploy gấp và không tiện trigger Action.

## Nội dung đã deploy trong lần này (commit 83e6e1f)

- `fix(zalo): stop guessed thread_type from downgrading known groups` — sửa bug tên nhóm Zalo bị lưu đè thành "Group/Zalo <id>" khi mở conversation lúc local state chưa kịp load (guess sai `thread_type`).
- `fix(ocr): strengthen prompt so full product names are never truncated` — prompt Gemini OCR hóa đơn giờ giữ nguyên toàn bộ tên hàng kể cả NSX/MH/Model/KT, kèm ví dụ cụ thể để model không tự tóm tắt/cắt bớt.
