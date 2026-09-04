# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tổng quan

InvoiceFlow Manager là app quản lý kho/hóa đơn/đơn hàng (Next.js 16 App Router + TypeScript + Tailwind + Supabase Postgres/Storage) cho một doanh nghiệp thật, kèm module tích hợp Zalo cá nhân (nhắn tin, broadcast, tự động chuyển tiếp tin nhắn) chạy qua một service Node riêng ở `services/zalo-bridge`. README.md ở root mô tả một scope cũ (giai đoạn "demo frame only" cho products/inventory/sales) — **không còn đúng thực tế**, các module đó đã lên production thật (orders, inventory, suppliers, finance, zalo...).

## Lệnh thường dùng

```bash
npm run dev         # Next.js dev server, cổng 4000 (không phải 3000 như README ghi)
npm run build
npm start            # next start, cổng 4000
npm run typecheck    # tsc --noEmit
```

Không có test suite/framework nào được cấu hình (không có script `test`, không có Jest/Vitest/Playwright trong deps).

### Chạy zalo-bridge (service riêng, bắt buộc để test bất kỳ tính năng Zalo)

```bash
cd services/zalo-bridge
npm install
cd zca-js && npm install --omit=dev && cd ..   # zca-js link local, cần cài deps riêng
npm start            # hoặc `npm run dev` (node --watch), cổng 3001
```

- Bridge login lại bằng session Zalo **thật** đã lưu ở `services/zalo-bridge/data/sessions/shop-owner.json` — đây là tài khoản Zalo thật của user, không phải mock. Nếu có forward-rule đang `is_enabled`, bridge sẽ tự forward tin nhắn thật ngay khi start và có tin mới.
- Helper `services/zalo-bridge/kill-port-3001.ps1` để kill process đang giữ cổng 3001 (PowerShell).
- `PORT` là biến port thực sự được đọc (không phải `ZALO_BRIDGE_PORT` dù README bridge có nhắc tới biến này — biến đó không được code nào đọc).

## Kiến trúc lớn

### Hai "backend" riêng biệt, cùng ghi vào 1 Supabase project

1. **Next.js app** (`app/api/*`) — nói chuyện trực tiếp với Postgres qua `pg` (`lib/db/connection.ts`). Schema core (hóa đơn, sản phẩm, kho, đơn hàng, nhà cung cấp, thu chi...) được **tự động migrate khi app khởi động** bởi `lib/db/migration.ts` (`SCHEMA_VERSION` tăng dần, hiện là 22 — bump version này mỗi khi đổi schema core). **Lưu ý quan trọng khi viết SQL mới**: `products` **không có** cột `image_url` (ảnh nằm ở bảng riêng `product_images.url`, join LATERAL theo `position asc limit 1`) và **không có** `stock_quantity` (tồn kho thật là `products.stock`, cập nhật trực tiếp bởi `lib/orders/repository.ts` khi đơn `completed`) — `product_variants`/`inventory_levels` gần như không được dùng trong dữ liệu thật (chỉ vài dòng lịch sử), đừng join qua đó để lấy tồn kho/ảnh.
2. **`services/zalo-bridge`** (Express + `zca-js`) — service Node độc lập, login vào Zalo cá nhân qua cookie, expose REST + SSE, và **tự ghi trực tiếp vào Supabase** (`services/zalo-bridge/src/services/supabaseSync.js`) — **không đi qua Next.js API** cho dữ liệu Zalo (conversations, messages, forward rules, forward logs). Bảng liên quan tới Zalo/staff được quản lý bằng các file SQL rời trong `supabase/migrations/*.sql` — **các file này KHÔNG tự apply**, phải chạy tay (SQL editor / `psql $DATABASE_URL -f ...`) trước khi tính năng tương ứng hoạt động được (không có `supabase/config.toml` nên cũng không dùng `supabase db push`).

Next.js gọi bridge qua `lib/zalo-api.ts` (client-side, base URL đọc từ `NEXT_PUBLIC_ZALO_BRIDGE_URL` / fallback `NEXT_PUBLIC_API_BASE_URL`) và một vài route server-side proxy (`app/api/zalo/accounts/*`, đọc `ZALO_BRIDGE_URL` trước). `lib/api-client.ts` + rewrite `/api/v1/*` trong `next.config.mjs` là tàn dư của một backend Python cũ (cổng 8765) — chỉ còn dùng ở `app/smoke/HealthSmoke.tsx`, coi như legacy/không liên quan tới luồng chính.

### Auth

Không dùng JWT — cookie `current_staff_id` (không HttpOnly) + password hash bằng `crypto.scrypt` (`lib/auth/password.ts`, format lưu `"<salt-hex>:<hash-hex>"`), verify qua bảng Supabase `staff`. Password kiểu "bootstrap on first login": nếu `staff.password_hash` đang null, lần login đầu tiên sẽ set luôn password đó làm password chính thức.

`middleware.ts` (root, mới thêm) chặn truy cập mọi route `(dashboard)` khi thiếu cookie hợp lệ — verify bằng REST fetch trực tiếp tới Supabase (chạy Edge runtime nên không dùng `pg` được). Trước đây **hoàn toàn không có** middleware nào, mọi trang mở được không cần đăng nhập.

### Production deploy

`docker-compose.yml`: `frontend` (:4000) + `zalo-bridge` (:3001) + `router` (nginx :8080, config ở `nginx/nginx.conf`) — nginx forward `/zalo-bridge/*` → bridge, còn lại → frontend. Domain thật: `timetech.markeeai.com`. `.env.production.example` là template cho `.env` dùng bởi Docker Compose (`env_file:`).

**Hạ tầng thật (đã SSH khảo sát trực tiếp 2026-07-09, không phải suy đoán):**
- Host: 1 VM Ubuntu 20.04 (`10.30.195.41`, hostname `testseeding2`) dùng **CHUNG** với project khác không liên quan (`crawl_fb_backend_ssh1`) — không phải máy dedicated riêng cho InvoiceFlow, cẩn thận khi dọn disk/prune Docker vì có thể ảnh hưởng container của project kia.
- Code nằm ở `/home/vanthuong/opt/apps/mabuu/mabu-inventory-management` (user `vanthuong`, đã thêm vào group `docker` ngày 2026-07-09 nên **không cần `sudo`** cho lệnh docker nữa — trước đó mọi lệnh docker đều phải `sudo` vì user chưa ở group `docker`).
- Server chỉ có binary `docker-compose` (v2 standalone, KHÔNG có plugin `docker compose` — gọi `docker compose ...` sẽ lỗi "not a docker command"). Luôn dùng `docker-compose` (có gạch nối) khi viết script/workflow cho host này.
- Có sẵn `deploy.sh` thủ công cũ trên server (`git pull && sudo docker-compose up -d --build`) — vẫn hoạt động được, nhưng giờ nên dùng workflow `deploy-app.yml` (xem mục CI/CD) để có healthcheck + kiểm soát rõ ref nào đang deploy.
- Disk có lúc chỉ còn ~1.2GB trống (93% đầy) do image/build-cache Docker tồn đọng — đã dọn 1 lần (`docker image prune -f` + `docker builder prune -f`, an toàn vì chỉ xoá dangling image/cache, không đụng image đang chạy) về còn ~4-5GB trống. Nên định kỳ kiểm tra `df -h /` + `docker system df` trên host này, KHÔNG chỉ dựa vào `docker image prune -f` cuối mỗi lần deploy (xem `deploy-app.yml`) vì build cache có thể tích tụ nhanh hơn image.

### CI/CD (`.github/workflows/`, thêm 2026-07-09)

- **`pr-check.yml`**: build-check thuần (`npm ci` + `npm run typecheck` + `npm run build`) trên GitHub-hosted runner (`ubuntu-latest`), chạy khi có PR vào `main`. Không đụng gì tới production, không cần self-hosted runner.
- **`deploy-app.yml`**: deploy thật lên production — **CHỈ chạy khi bấm "Run workflow" thủ công** trong tab Actions (input `ref`, mặc định `main`) — **không** tự động deploy khi push/merge vào `main` (chủ đích, để luôn kiểm soát được thời điểm code thật sự lên production). Chạy trên self-hosted runner label `app` (`runs-on: [self-hosted, app]`), `working-directory` là đường dẫn thật ở trên. Các bước: kiểm tra `.env` đã tồn tại (không tự tạo/ghi đè) → `git fetch/checkout/pull` theo `ref` → `docker-compose build frontend zalo-bridge` → `up -d` 2 service đó → restart `router` → `docker image prune -f` → healthcheck `http://localhost:8080/api/state` (frontend + DB, dùng chung endpoint với `HEALTHCHECK` trong `frontend.Dockerfile`) và `http://localhost:8080/zalo-bridge/health`.
- **Self-hosted runner đã cài** (2026-07-09): service systemd `actions.runner.NMHoangDev-mabu-inventory-management.mabu-app-timetech.service` chạy dưới user `vanthuong`, cài tại `~/actions-runner-mabu` trên chính host production, label `app`, `enabled` (tự start lại khi reboot VM). Nếu cần cài lại/cài thêm runner: Settings → Actions → Runners → New self-hosted runner trên GitHub repo, lấy token (sống ~1h) rồi `./config.sh --url https://github.com/NMHoangDev/mabu-inventory-management --token <TOKEN> --labels app --unattended` + `sudo ./svc.sh install vanthuong && sudo ./svc.sh start`.
- **Lưu ý khi deploy**: restart `zalo-bridge` container sẽ làm rớt WS session Zalo thật đang sống ~10-30s (tự reconnect, xem mục "Cảnh báo khi chạy bridge local" phía trên) — đây là side-effect bình thường của mọi lần deploy đụng tới bridge, không phải lỗi.
- Repo này **không có nhánh `dev` riêng** và **chủ động không làm CI/CD cho "bản dev"** (khác với pattern 2 host dev/app tách biệt ở project khác) — mọi thứ tập trung vào 1 host production duy nhất (`timetech.markeeai.com`).

### Local dev — set đúng để bridge "thấy" được Next.js local

`.env.local` (root, không track git, chứa secrets Supabase thật) từng trỏ `NEXT_PUBLIC_ZALO_BRIDGE_URL`/`NEXT_PUBLIC_API_BASE_URL` thẳng về **production** (`https://timetech.markeeai.com/zalo-bridge`) — nghĩa là chạy `npm run dev` local vẫn gọi bridge production, code mới trong `services/zalo-bridge/src` (forward rules, v.v.) sẽ **không** được test. Đã sửa lại (2026-07-09) để 3 biến này trỏ về `http://localhost:3001`:

```
NEXT_PUBLIC_ZALO_BRIDGE_URL=http://localhost:3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ZALO_BRIDGE_URL=http://localhost:3001
```

Muốn debug lại qua domain thật thì đổi tạm 3 dòng trên về `https://timetech.markeeai.com/zalo-bridge`. Để test full luồng Zalo local, phải chạy **song song**: `npm run dev` (frontend :4000) + `cd services/zalo-bridge && npm start` (bridge :3001) — CORS/`ALLOWED_ORIGINS` mặc định của bridge (`services/zalo-bridge/src/index.js`) đã cho phép `localhost:3000/4000` nên không cần set thêm.

**Cảnh báo khi chạy bridge local**: bridge login vào tài khoản Zalo **thật** ("shop-owner"). Nếu bridge production (trên server, chạy 24/7) đang cùng giữ session này, bridge local sẽ bị Zalo kick WS gần như ngay lập tức (`cmd=3000 Overlimit connection` → `Another connection is opened, closing this one`) — đây không phải bug code (đã có auto-reconnect 3 lần/30s + watchdog 5 phút trong `sessionManager.js`, xem comment "Problem B fix"), mà là do Zalo chỉ cho 1 connection sống/account. Muốn test ổn định, hoặc tạm dừng bridge production, hoặc đăng ký thêm 1 account Zalo phụ riêng cho local (hệ thống đã hỗ trợ multi-account qua `accountRegistry.js`).

## Lịch sử gần đây (đã lên `main`, tham khảo khi cần đào sâu 1 tính năng cụ thể)

Staff auth thật + reset password, Zalo forward rules (nhóm chính tự chuyển tiếp), đơn hàng gắn trừ/hoàn tồn kho (`stock_deducted_at`), fix `ensureConversationInSupabase()` (group bị lưu nhầm `thread_type`) — tất cả đã **commit** (`08fd044`, `819536e`, `c7380bf`...), không còn nằm trong working tree. Đọc `git log --oneline` + tìm theo tên file/tính năng thay vì tin nguyên văn phần dưới nếu cần chi tiết — phần này chỉ tóm tắt định hướng, không phải trạng thái file real-time.

## Tính năng thêm 2026-07-09 (session này)

- **Fix bug tìm kiếm sản phẩm** ở `products/cost-adjustments/new` và `products/stock-checks/new`: cả 2 repository (`lib/cost-adjustments/repository.ts`, `lib/stock-checks/repository.ts`) từng query cột **không tồn tại** (`products.image_url`, `products.stock_quantity`, `product_variants.unit` — đã verify trực tiếp trên DB thật) khiến API luôn lỗi 500 bị client "nuốt câm" (không check `res.ok`). Đã sửa dùng đúng `product_images` (LATERAL join) + `products.stock` (tồn kho thật — xem ghi chú ở mục kiến trúc products phía trên) + thêm debounce/unaccent/trigram giống `/orders/new`.
- **Nhà cung cấp ↔ sản phẩm**: bảng mới `product_suppliers` (`SCHEMA_VERSION` 21→22, `lib/db/migration.ts`), trang chi tiết `app/(dashboard)/suppliers/[id]/page.tsx` (xem/sửa NCC + list sản phẩm NCC đang cung cấp + tồn kho hiện tại), `AddSupplierModal` thêm chọn sản phẩm khi add/edit NCC, trang `/suppliers` thêm ô lọc theo sản phẩm (component dùng chung `components/suppliers/SupplierProductSearch.tsx`, gọi thẳng `/api/orders/search-products` — không viết lại logic search).
- **Trang POS mới** (`app/(dashboard)/pos/page.tsx`, nav "Bán hàng (POS)"): bán hàng tại quầy kiểu Sapo, đa tab đơn (lưu localStorage), tìm sản phẩm/khách hàng dùng lại đúng API của `/orders/new`, phím tắt F1-F10. **Tái dùng `createOrder()` qua `POST /api/orders`** để tạo đơn (status `completed`, `fulfillment_status: "shipped"`) — không viết luồng tạo đơn/trừ kho riêng. Khi thanh toán có tiền, tự tạo thêm 1 phiếu thu `POST /api/cash-book` (best-effort) — trước đó **không có** chỗ nào tự sync đơn hàng ↔ sổ quỹ trong repo.
  - **KHÔNG được sửa `app/(dashboard)/pos/page.tsx` nữa** trừ khi user yêu cầu đích danh trang POS — user đã yêu cầu chủ động (2026-07-17) chỉ fix bug ở `/orders/new`, không đụng vào POS dù 2 trang có logic giỏ hàng/tạo đơn tương tự nhau. Đã có lần tự ý áp dụng luôn 1 fix (chặn thêm SP vượt tồn kho) sang cả POS và bị yêu cầu revert.
- **CI/CD** (`.github/workflows/`): xem mục "CI/CD" ở phần Production deploy phía trên.

## Tính năng thêm 2026-09-04 (session này, **CHƯA COMMIT, CHƯA DEPLOY** khi viết dòng này)

- **Tách "Thông báo Zalo" trong app chính thành 2 route/thư mục con** (chat vs forward), thuần refactor cấu trúc — hành vi/API giữ nguyên 100%:
  - `/thong-bao-zalo` → `/zalo/chat` (có redirect 308 ở `next.config.mjs`), `components/zalo/*` tách thành `components/zalo/chat/` (6 file, dùng `useZalo.ts`) và `components/zalo/forward/ZaloForwardRulesDashboard.tsx`. `ZaloAccountSwitcher.tsx` ở lại `components/zalo/` gốc (dùng chung 2 route). Nav (`DashboardLayout.tsx`) đổi mục "Thông báo Zalo" phẳng thành cha "Zalo" + 2 `subItems` (trước đây `/zalo/forward-rules` **không có trong nav**, chỉ vào được qua link trong trang chat).
- **2 module Zalo mới, tách hẳn FE+BE riêng, deploy chung host** (`services/zalo-account-module/`, `services/zalo-forward-module/`) — bổ sung, KHÔNG thay thế `/zalo/chat` + `/zalo/forward-rules` ở app chính (2 nơi vẫn cùng đọc/ghi chung bảng Supabase, không xung đột):
  - **`zalo-account-module`** (Next.js nhẹ, port **3002 publish thẳng ra host**, dự kiến subdomain riêng vd `zalo-accounts.timetech.markeeai.com`): quản lý account Zalo + gán quyền staff↔account tập trung (CRUD account proxy qua bridge `/auth/accounts*`, CRUD staff/assignment thẳng Supabase — port từ `app/api/zalo/accounts/*` + `app/api/zalo/staff/*`). Có 1 hardening cố ý so với bản gốc: `app/api/staff/[staffId]/assign/route.ts` bản gốc **hoàn toàn không check quyền** — bản module mới thêm `requireAdmin()`.
  - **`zalo-forward-module`** (Next.js + custom `server.js`, port **3003 publish thẳng ra host**, dự kiến subdomain riêng vd `zalo-forward.timetech.markeeai.com`): tách **toàn bộ** phần điều phối forward (không chỉ UI quản lý rule) ra khỏi `services/zalo-bridge/src/services/forwardEngine.js` — chi tiết xem `worker/poller.js` trong module. Đổi cơ chế detect từ hook trực tiếp vào WS listener sống (`sessionManager.js`) sang **poll bảng `zalo_messages`** (watermark persist ở bảng mới `zalo_forward_cursor`, thay cho Set in-memory 60s TTL của bản cũ — không mất/lặp khi module restart). Việc **gửi thật** vẫn bắt buộc đi qua `zalo-bridge` (Zalo chỉ cho 1 kết nối WS sống/account — xem mục "Cảnh báo khi chạy bridge local") qua 3 endpoint mới thêm vào `services/zalo-bridge/src/routes/zalo-client.js`: `POST /api/all-platform/zalo/forward/{text,media,sticker}`.
    - **2 cột Supabase mới bắt buộc phải có** để poller hoạt động đúng (migration `supabase/migrations/2026-09-04_zalo_forward_module.sql`, **CHƯA APPLY** — nhớ chạy tay trước khi bật module): `zalo_messages.raw_content` (JSONB — lưu payload sticker gốc, cột `content` cũ chỉ lưu string nên bỏ qua object) và `zalo_messages.mentions` (JSONB — cần để giữ tag `@All` khi forward, trước đây hoàn toàn không persist). Không vá 2 cột này thì poller **mất khả năng forward sticker + mất tag @All** dù logic có đúng.
    - **`FORWARD_DRY_RUN=true` mặc định** (biến env, xem `.env.production.example`) — poller vẫn detect+match+ghi `zalo_forward_logs` (status=`dry_run`) nhưng KHÔNG gọi endpoint gửi thật. **Cutover** (tắt hẳn hook cũ trong `sessionManager.js` dòng gọi `handleIncomingGroupMessage` + đặt `FORWARD_DRY_RUN=false`) **PHẢI làm cùng lúc trong 1 lần deploy** — nếu chạy song song dù vài giây, mỗi tin nhắn sẽ bị forward **2 lần** (không có cơ chế chặn nhau giữa 2 process). Tính tới thời điểm viết dòng này, hook cũ **CHƯA bị tắt** — forwardEngine.js cũ vẫn đang là engine forward thật duy nhất, module mới chỉ chạy dry-run song song để verify.
  - Cả 2 module dùng chung cookie `current_staff_id` với app chính — **KHÔNG qua nginx/router `:8080`**, mỗi module publish thẳng port (3002, 3003) ra host, dự kiến trỏ subdomain riêng cùng gốc domain với app chính. Để cookie đăng nhập ở app chính dùng chung được cho các subdomain này, **bắt buộc set `STAFF_COOKIE_DOMAIN`** (vd `.timetech.markeeai.com`, có dấu chấm đầu) trong `.env` rồi rebuild lại `frontend` (nơi thật sự set cookie, `lib/zalo/auth.ts`) — thiếu bước này thì 2 module vẫn hoạt động nhưng bắt đăng nhập lại riêng, không dùng chung session được. Mỗi module tự nhân bản `middleware.ts`/`lib/zalo/auth.ts` thành `src/lib/zaloAuth.ts` riêng (không import chéo được giữa các Next.js project độc lập).
  - Vì publish port HTTP thuần (không tự có TLS) ra ngoài, **nên đặt subdomain sau Cloudflare proxy (orange-cloud) hoặc TLS terminator khác** trước khi trỏ DNS — không nên để DNS trỏ thẳng IP:port public không mã hoá (cookie `current_staff_id` không HttpOnly, sẽ đi cleartext).
  - Hạ tầng: `docker-compose.yml` thêm 2 service (`zalo-account-module` port 3002, `zalo-forward-module` port 3003, cả 2 `ports:` publish thẳng ra host, join `invoiceflow-net`, KHÔNG qua `router`), 2 Dockerfile mới ở root repo (`zalo-account-module.Dockerfile`, `zalo-forward-module.Dockerfile`) theo đúng convention 2-stage alpine của `frontend.Dockerfile`. `nginx/nginx.conf` **không đổi gì cho 2 module này** (thiết kế ban đầu dùng path-prefix qua nginx đã đổi sang publish port riêng theo yêu cầu thực tế).
  - **Chưa deploy lên production** — thiếu quyền SSH/VPN vào `10.30.195.41` và không có `gh` CLI/token để tự trigger `deploy-app.yml` trong phiên làm việc này. Cần người có quyền làm theo đúng thứ tự: (1) chạy migration SQL (`2026-09-04_zalo_forward_module.sql`) trên Supabase thật, (2) set `STAFF_COOKIE_DOMAIN` trong `.env` trên server, (3) deploy `frontend` (để STAFF_COOKIE_DOMAIN có hiệu lực) + `zalo-bridge` (đã đổi code, nhưng cutover forward CHƯA bật) + build mới 2 service `zalo-account-module`/`zalo-forward-module` (giữ `FORWARD_DRY_RUN=true`), (4) mở port 3002/3003 trên firewall VM nếu đang chặn, trỏ DNS subdomain (khuyến nghị qua Cloudflare proxy), (5) để dry-run chạy 1 thời gian, đối chiếu `zalo_forward_logs` (status=`dry_run`) với traffic thật, (6) chỉ khi khớp đúng mới cutover: tắt hook `handleIncomingGroupMessage` trong `sessionManager.js` + đặt `FORWARD_DRY_RUN=false` **cùng lúc trong 1 lần deploy**.
