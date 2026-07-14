# Quy trình Deploy — InvoiceFlow Manager

Tài liệu hướng dẫn deploy app lên server production (máy ảo Ubuntu). Ghi lại **chính xác** các bước đã dùng, kèm chi tiết Docker để bất kỳ ai cũng deploy lại được.

> Cập nhật lần cuối: 2026-07-14. Domain thật: **https://timetech.markeeai.com**

---

## 1. Tổng quan hạ tầng

| Thành phần | Giá trị |
|---|---|
| Host | `10.30.195.41` (hostname `testseeding2`), Ubuntu, **CẦN VPN** để truy cập |
| User SSH | `vanthuong` (mật khẩu — auth bằng password, **không** phải key) |
| Thư mục code | `/home/vanthuong/opt/apps/mabuu/mabu-inventory-management` (tức `~/opt/apps/mabuu/mabu-inventory-management`) |
| Branch deploy | `main` (server pull thẳng từ `origin/main`) |
| Docker Compose | **`docker-compose` v2.27.0** (binary standalone, có dấu gạch nối). Lệnh `docker compose` (không gạch nối) **cũng có** trên máy này nhưng theo chuẩn repo hãy dùng `docker-compose`. |
| Quyền docker | user `vanthuong` đã ở group `docker` → **không cần `sudo`** cho lệnh docker |

> ⚠️ **Đây là VM DÙNG CHUNG** với một project khác (`crawl_fb_backend_ssh1`). Cẩn thận khi dọn disk / prune Docker — chỉ prune dangling image/build cache, **không** đụng image đang chạy của project kia.

---

## 2. Kiến trúc container (docker-compose.yml)

3 service, cùng 1 network `invoiceflow-net`:

| Service | Container | Image | Cổng | Vai trò |
|---|---|---|---|---|
| `frontend` | `invoiceflow-frontend` | `invoiceflow-frontend:latest` | `4000` (nội bộ) | Next.js app (dashboard + storefront + API routes). Tự chạy migration khi khởi động. |
| `zalo-bridge` | `invoiceflow-zalo-bridge` | `invoiceflow-zalo-bridge:latest` | `3001` (nội bộ) | Service Node độc lập, login Zalo cá nhân thật, REST + SSE. |
| `router` | `invoiceflow-router` | `nginx:1.27-alpine` | **`8080` (public)** | Nginx: `/zalo-bridge/*` → bridge:3001, còn lại → frontend:4000. |

- **Biến môi trường**: cả 2 service app đọc từ file `.env` ở thư mục repo (`env_file:` trong compose). File này **đã tồn tại sẵn trên server** — deploy **KHÔNG** tạo/ghi đè nó.
- **Volume dữ liệu** (giữ nguyên qua các lần deploy): `frontend-data`, `frontend-db`, `frontend-extensions`, `zalo-sessions`, `zalo-storage`. Session Zalo thật nằm ở `zalo-sessions` → **không mất** khi rebuild.
- **Healthcheck** (định nghĩa trong Dockerfile / compose): frontend & bridge đều có healthcheck; endpoint chung để kiểm tra là `GET /api/state` (frontend + DB) và `GET /zalo-bridge/health` (bridge).

---

## 3. Chỉ rebuild service nào đã đổi

**Nguyên tắc**: chỉ rebuild service có code thay đổi.

- Sửa code Next.js (`app/`, `lib/`, `components/`, `services/`, `next.config.mjs`...) → chỉ rebuild **`frontend`**.
- Sửa code trong `services/zalo-bridge/` → rebuild **`zalo-bridge`**.
- Sửa `nginx/nginx.conf` → chỉ cần **`restart router`** (image nginx không đổi).

> ⚠️ **Restart `zalo-bridge` làm rớt WS session Zalo thật ~10-30s** (tự reconnect). Đây là side-effect bình thường — nhưng nếu không đổi code bridge thì **đừng rebuild/restart nó** để tránh gián đoạn Zalo.

---

## 4. Quy trình deploy thủ công qua SSH (đã dùng thực tế)

### Bước 0 — Trên máy dev: commit + push lên `main`
Server pull từ `origin/main`, nên phải push trước.
```bash
git add <các file thay đổi>
git commit -m "..."
git push origin main
```

### Bước 1 — SSH vào server
Máy Windows dev **không có `sshpass`/`plink`**, `ssh` thường không nhận password qua tham số. Dùng 1 script Node với thư viện `ssh2` để chạy lệnh từ xa (password auth). Ví dụ `ssh-run.js`:
```js
const { Client } = require("ssh2");
const conn = new Client();
conn.on("ready", () => {
  conn.exec(process.argv[2], (err, stream) => {
    if (err) { console.error(err); process.exit(1); }
    stream.on("close", (code) => { conn.end(); process.exit(code || 0); })
          .on("data", d => process.stdout.write(d))
          .stderr.on("data", d => process.stderr.write(d));
  });
}).connect({ host: "10.30.195.41", port: 22, username: "vanthuong", password: "<pass>" });
```
```bash
npm install ssh2      # 1 lần
node ssh-run.js '<lệnh chạy trên server>'
```
> Máy Linux/Mac có `sshpass` thì đơn giản hơn: `sshpass -p '<pass>' ssh vanthuong@10.30.195.41 '<lệnh>'`. Hoặc `ssh vanthuong@10.30.195.41` rồi nhập tay.

### Bước 2 — Cập nhật code trên server
```bash
cd ~/opt/apps/mabuu/mabu-inventory-management
git fetch origin
git checkout main
git pull origin main
git log --oneline -1        # xác nhận đúng commit vừa push
```

### Bước 3 — Kiểm tra disk (QUAN TRỌNG, xem mục 6) + dọn rác an toàn
```bash
df -h /                     # xem còn bao nhiêu trống
docker system df            # xem image/cache chiếm bao nhiêu
docker image prune -f       # xoá image dangling (an toàn)
docker builder prune -f     # xoá build cache (an toàn)
```

### Bước 4 — Rebuild image (chỉ frontend nếu chỉ đổi Next.js)
```bash
docker-compose build frontend
# nếu có đổi bridge:  docker-compose build zalo-bridge
```

### Bước 5 — Khởi động lại container với image mới
```bash
docker-compose up -d frontend          # recreate frontend, KHÔNG đụng bridge
# docker-compose up -d zalo-bridge     # chỉ khi rebuild bridge
# docker-compose restart router        # chỉ khi đổi nginx.conf
docker-compose ps                      # kiểm tra trạng thái
```

### Bước 6 — Healthcheck
```bash
# đợi frontend "healthy"
docker inspect --format '{{.State.Health.Status}}' invoiceflow-frontend

# qua router (cổng public 8080)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/state          # mong đợi 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/zalo-bridge/health # mong đợi 200

# domain public
curl -s -o /dev/null -w '%{http_code}\n' https://timetech.markeeai.com/api/state   # mong đợi 200
```

### Bước 7 — Dọn image cũ (đã thành dangling sau khi retag)
```bash
docker image prune -f
df -h /
```

---

## 5. Về database migration

- Schema core (products, orders, inventory, suppliers, finance...) **tự migrate khi frontend khởi động** (`lib/db/migration.ts`, biến `SCHEMA_VERSION`).
- Chỉ khi **đổi schema core** mới cần bump `SCHEMA_VERSION`. Deploy chỉ sửa query (không đổi schema) → **không cần** thao tác DB thủ công.
- Các bảng liên quan Zalo/staff nằm ở `supabase/migrations/*.sql` và **KHÔNG tự apply** — phải chạy tay bằng SQL editor / `psql $DATABASE_URL -f ...` (chỉ khi có thay đổi các bảng đó).

---

## 6. Quản lý disk (VM hay đầy — cần chú ý)

Disk `/` chỉ ~17GB, thường xuyên >90% đầy do image/build-cache Docker.

```bash
df -h /                 # dung lượng đĩa
docker system df        # image / container / volume / build cache
docker image prune -f   # xoá image không còn tag (an toàn)
docker builder prune -f # xoá build cache (an toàn)
```

> ⚠️ Vì là VM **dùng chung**, TUYỆT ĐỐI không `docker system prune -a` (sẽ xoá image của project kia). Chỉ prune dangling.
> Sau deploy 2026-07-14 disk còn ~**1.2GB** (93%). Nếu build lần sau báo hết chỗ: prune dangling + build cache trước; nếu vẫn thiếu, kiểm tra `docker system df` và xoá image cũ không dùng của **đúng project này**.

---

## 7. Rollback (quay lại bản trước)

```bash
cd ~/opt/apps/mabuu/mabu-inventory-management
git log --oneline -5                 # tìm commit tốt trước đó
git checkout <commit_hash>           # hoặc: git reset --hard <commit_hash>
docker-compose build frontend
docker-compose up -d frontend
# healthcheck lại như Bước 6
```
Nếu chỉ container lỗi (không phải code): `docker-compose restart frontend`.

---

## 8. Cách khác: CI/CD qua GitHub Actions (đã cấu hình)

- **`deploy-app.yml`**: deploy thật, **chỉ chạy khi bấm "Run workflow" thủ công** trong tab Actions (input `ref`, mặc định `main`). Chạy trên self-hosted runner label `app` (cài ngay trên host production, service systemd, tự start khi reboot). Các bước tương tự mục 4 + healthcheck tự động.
- **`pr-check.yml`**: build-check (`npm ci` + `typecheck` + `build`) khi mở PR vào `main`, chạy trên runner GitHub-hosted, **không** đụng production.
- Có sẵn `deploy.sh` cũ trên server (`git pull && docker-compose up -d --build`) — vẫn chạy được nhưng nên ưu tiên workflow để kiểm soát ref + có healthcheck.

> Deploy KHÔNG tự động khi push/merge vào `main` (chủ đích) — luôn phải kích hoạt thủ công (bấm workflow hoặc SSH như mục 4).

---

## 9. Troubleshooting nhanh

| Triệu chứng | Nguyên nhân / Xử lý |
|---|---|
| `docker compose: not a docker command` | Dùng `docker-compose` (có gạch nối). |
| Build báo hết disk | `docker image prune -f && docker builder prune -f`; xem mục 6. |
| Zalo mất kết nối ~30s sau deploy | Bình thường nếu vừa restart `zalo-bridge` (tự reconnect). Tránh restart bridge khi không đổi code bridge. |
| Frontend mãi `health: starting` | Xem log: `docker-compose logs --tail=100 frontend`. Thường do lỗi kết nối DB (`.env` sai) hoặc migration lỗi. |
| `git pull` xung đột | Server chỉ nên chứa code sạch từ `origin/main`. Nếu có sửa tay: `git stash` hoặc `git reset --hard origin/main` (mất sửa tay). |
| SSH không vào được | Kiểm tra đã bật **VPN** chưa (host là IP nội bộ `10.30.195.41`). |

---

## 10. Log deploy 2026-07-14 (tham chiếu)

- Commit deploy: `5fcea36` — fix tồn kho/mock data phần quản lý kho.
- Chỉ rebuild **frontend** (không đụng zalo-bridge → session Zalo không gián đoạn).
- Kết quả: frontend `healthy`, `/api/state` = 200, `/zalo-bridge/health` = 200, domain public = 200.
- Disk sau deploy: 1.2GB trống (93%).
