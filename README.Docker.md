# InvoiceFlow Manager — Docker deploy guide

Stack gồm 3 service chạy cùng Docker Compose:

| Service        | Port (container) | Lệnh                       | Vai trò                           |
|----------------|-------------------|----------------------------|-----------------------------------|
| `frontend`     | 4000              | `next start`               | Next.js App Router UI + API       |
| `zalo-bridge`  | 3001              | `node src/index.js`        | Express forward Zalo message + SSE |
| `router`       | 8080              | `nginx`                    | Reverse proxy + SSE no-buffering  |

> Trên máy ảo mặc định `http://<IP_VM>:8080` (đổi `ROUTER_HTTP_PORT` nếu muốn host khác).
> Khi đã trỏ domain về VM, đổi port sang `80:8080` hoặc đặt Caddy đứng trước cấp SSL.

---

## 1. Chuẩn bị

```bash
# 1.1. Copy file env mẫu
cp .env.example .env

# 1.2. Sửa các biến sau trong .env (KHÔNG commit file này)
#   GEMINI_API_KEY=...
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   DATABASE_URL=postgresql://user:pwd@host:5432/postgres
#   BRIDGE_API_KEY=chọn-một-chuỗi-bất-kỳ
#   ZALO_BRIDGE_PUBLIC_URL=http://YOUR_DOMAIN/zalo-bridge
#   ALLOWED_ORIGINS=http://YOUR_DOMAIN,http://localhost:8080
```

> `ZALO_BRIDGE_PUBLIC_URL` là URL public mà browser thấy khi gọi extension / config.
> Sau khi host, đổi `localhost:8080` thành `https://your-domain` cho khớp.

---

## 2. Build & run

```bash
# Build image lần đầu (mất vài phút vì npm ci + next build)
docker compose build

# Khởi động ở chế độ background
docker compose up -d

# Kiểm tra trạng thái
docker compose ps
docker compose logs -f frontend
docker compose logs -f zalo-bridge
docker compose logs -f router
```

Healthcheck:
- `curl http://localhost:8080/`                 → render UI Next.js
- `curl http://localhost:8080/api/state`        → JSON state của app
- `curl http://localhost:8080/zalo-bridge/health` → `{"status":"ok",...}`

---

## 3. Cập nhật sau khi sửa code

```bash
git pull
docker compose build frontend            # chỉ rebuild service đã đổi
docker compose up -d --no-deps frontend
```

Chỉ rebuild 1 service khác:
```bash
docker compose build zalo-bridge
docker compose up -d --no-deps zalo-bridge
```

---

## 4. Volumes (dữ liệu persist)

| Volume                | Mount trong container  | Nội dung                       |
|-----------------------|------------------------|--------------------------------|
| `frontend-data`       | `/app/data`            | scan uploads, exported files   |
| `frontend-db`         | `/app/db`              | JSON store backup              |
| `frontend-extensions` | `/app/extensions`      | artwork upload, static assets  |
| `zalo-sessions`       | `/app/data` (bridge)   | zca-js session cache           |
| `zalo-storage`        | `/app/storage` (bridge)| zca-js working files           |

Backup định kỳ:
```bash
docker run --rm -v invoiceflow-frontend-data:/data -v $(pwd):/backup \
    alpine tar czf /backup/frontend-data-$(date +%F).tar.gz /data
```

---

## 5. Mapping URL với domain thật

Mặc định nginx nghe port 8080. Khi đã có domain:

```yaml
# docker-compose.yml
ports:
  - "80:8080"     # chỉ HTTP, nên dùng Caddy/cloudflare đứng trước cho TLS
```

Nếu muốn chạy nginx với cert Let's Encrypt ngay trong compose, dùng `nginxproxy/nginx-proxy` + `acme-companion` (xem tài liệu docker nginx-proxy). Nếu chỉ test, bỏ qua và để port 8080.

---

## 6. Biến môi trường quan trọng

| Biến                          | Mặc định                          | Mô tả                                   |
|-------------------------------|-----------------------------------|-----------------------------------------|
| `GEMINI_API_KEY`              | (bắt buộc)                        | OCR scan hóa đơn                       |
| `NEXT_PUBLIC_SUPABASE_URL`    | (bắt buộc)                        | supabase JS client                     |
| `SUPABASE_SERVICE_ROLE_KEY`   | (bắt buộc)                        | server-side writes                      |
| `DATABASE_URL`                | postgres URL                      | pg pool trong InvoiceFlow backend      |
| `BRIDGE_API_KEY`              | `change_me`                        | API key cho bridge (đặt đủ mạnh)       |
| `ZALO_BRIDGE_URL`             | `http://zalo-bridge:3001`         | URL giữa frontend ↔ bridge nội bộ     |
| `ZALO_BRIDGE_PUBLIC_URL`      | `http://localhost:8080/zalo-bridge` | URL bridge browser thấy được          |
| `ALLOWED_ORIGINS`             | `http://localhost:3000,...`       | CORS bridge (nhớ thêm domain public)   |
| `ROUTER_HTTP_PORT`            | `8080`                             | Port máy ảo mở ra ngoài                |

---

## 7. Xử lý lỗi thường gặp

**`docker compose build` fail với "Could not resolve package zca-js"**
→ Đảm bảo `services/zalo-bridge/zca-js/` tồn tại và có `dist/` (đã commit). Khi đổi tên repo, đảm bảo vẫn ở cùng vị trí tương đối.

**`curl http://localhost:8080/` trả 502**
→ Frontend chưa sẵn sàng. Đợi `frontend` healthcheck pass (`docker compose ps`), hoặc xem `docker compose logs frontend` để biết lý do.

**SSE không nhận event**
→ Đã cấu hình `proxy_buffering off` ở 3 nhánh SSE (frontend + zalo-bridge + upstream SSE). Nếu sau này thêm Cloudflare, bật "Origin HTTP/2" + tắt auto-minify cho route SSE.

**Volume permission**
→ user non-root (`nextjs:1001`, `bridge:1001`) đã được chown. Nếu host mount volume từ NFS/CIFS có UID khác, đổi `USER` trong Dockerfile hoặc `chown -R 1001:1001` trên host.

---

## 8. Local dev (không dùng Docker)

```bash
# Terminal 1 — bridge
cd services/zalo-bridge
npm install
npm run dev      # port 3001

# Terminal 2 — frontend (đứng ở root)
npm install
npm run dev      # port 4000

# Frontend dev mặc định gọi http://localhost:3001 — xem `.env.local`.
```
