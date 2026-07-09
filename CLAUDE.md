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

1. **Next.js app** (`app/api/*`) — nói chuyện trực tiếp với Postgres qua `pg` (`lib/db/connection.ts`). Schema core (hóa đơn, sản phẩm, kho, đơn hàng, nhà cung cấp, thu chi...) được **tự động migrate khi app khởi động** bởi `lib/db/migration.ts` (`SCHEMA_VERSION` tăng dần, hiện là 18 — bump version này mỗi khi đổi schema core).
2. **`services/zalo-bridge`** (Express + `zca-js`) — service Node độc lập, login vào Zalo cá nhân qua cookie, expose REST + SSE, và **tự ghi trực tiếp vào Supabase** (`services/zalo-bridge/src/services/supabaseSync.js`) — **không đi qua Next.js API** cho dữ liệu Zalo (conversations, messages, forward rules, forward logs). Bảng liên quan tới Zalo/staff được quản lý bằng các file SQL rời trong `supabase/migrations/*.sql` — **các file này KHÔNG tự apply**, phải chạy tay (SQL editor / `psql $DATABASE_URL -f ...`) trước khi tính năng tương ứng hoạt động được (không có `supabase/config.toml` nên cũng không dùng `supabase db push`).

Next.js gọi bridge qua `lib/zalo-api.ts` (client-side, base URL đọc từ `NEXT_PUBLIC_ZALO_BRIDGE_URL` / fallback `NEXT_PUBLIC_API_BASE_URL`) và một vài route server-side proxy (`app/api/zalo/accounts/*`, đọc `ZALO_BRIDGE_URL` trước). `lib/api-client.ts` + rewrite `/api/v1/*` trong `next.config.mjs` là tàn dư của một backend Python cũ (cổng 8765) — chỉ còn dùng ở `app/smoke/HealthSmoke.tsx`, coi như legacy/không liên quan tới luồng chính.

### Auth

Không dùng JWT — cookie `current_staff_id` (không HttpOnly) + password hash bằng `crypto.scrypt` (`lib/auth/password.ts`, format lưu `"<salt-hex>:<hash-hex>"`), verify qua bảng Supabase `staff`. Password kiểu "bootstrap on first login": nếu `staff.password_hash` đang null, lần login đầu tiên sẽ set luôn password đó làm password chính thức.

`middleware.ts` (root, mới thêm) chặn truy cập mọi route `(dashboard)` khi thiếu cookie hợp lệ — verify bằng REST fetch trực tiếp tới Supabase (chạy Edge runtime nên không dùng `pg` được). Trước đây **hoàn toàn không có** middleware nào, mọi trang mở được không cần đăng nhập.

### Production deploy

`docker-compose.yml`: `frontend` (:4000) + `zalo-bridge` (:3001) + `router` (nginx :8080, config ở `nginx/nginx.conf`) — nginx forward `/zalo-bridge/*` → bridge, còn lại → frontend. Domain thật: `timetech.markeeai.com`. `.env.production.example` là template cho `.env` dùng bởi Docker Compose (`env_file:`).

### Local dev — set đúng để bridge "thấy" được Next.js local

`.env.local` (root, không track git, chứa secrets Supabase thật) từng trỏ `NEXT_PUBLIC_ZALO_BRIDGE_URL`/`NEXT_PUBLIC_API_BASE_URL` thẳng về **production** (`https://timetech.markeeai.com/zalo-bridge`) — nghĩa là chạy `npm run dev` local vẫn gọi bridge production, code mới trong `services/zalo-bridge/src` (forward rules, v.v.) sẽ **không** được test. Đã sửa lại (2026-07-09) để 3 biến này trỏ về `http://localhost:3001`:

```
NEXT_PUBLIC_ZALO_BRIDGE_URL=http://localhost:3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ZALO_BRIDGE_URL=http://localhost:3001
```

Muốn debug lại qua domain thật thì đổi tạm 3 dòng trên về `https://timetech.markeeai.com/zalo-bridge`. Để test full luồng Zalo local, phải chạy **song song**: `npm run dev` (frontend :4000) + `cd services/zalo-bridge && npm start` (bridge :3001) — CORS/`ALLOWED_ORIGINS` mặc định của bridge (`services/zalo-bridge/src/index.js`) đã cho phép `localhost:3000/4000` nên không cần set thêm.

**Cảnh báo khi chạy bridge local**: bridge login vào tài khoản Zalo **thật** ("shop-owner"). Nếu bridge production (trên server, chạy 24/7) đang cùng giữ session này, bridge local sẽ bị Zalo kick WS gần như ngay lập tức (`cmd=3000 Overlimit connection` → `Another connection is opened, closing this one`) — đây không phải bug code (đã có auto-reconnect 3 lần/30s + watchdog 5 phút trong `sessionManager.js`, xem comment "Problem B fix"), mà là do Zalo chỉ cho 1 connection sống/account. Muốn test ổn định, hoặc tạm dừng bridge production, hoặc đăng ký thêm 1 account Zalo phụ riêng cho local (hệ thống đã hỗ trợ multi-account qua `accountRegistry.js`).

## Việc đang làm trong working tree (uncommitted, tính tới 2026-07-09)

- **Staff auth thật + reset password**: `supabase/migrations/2026-07-10_staff_password.sql` (cột `staff.password_hash`), `lib/auth/password.ts`, `app/api/auth/zalo/me/route.ts` (login giờ bắt buộc password + bootstrap-on-first-login), `app/api/zalo/staff/[staffId]/reset-password/route.ts` (admin-only, null hoá `password_hash` để user set lại), `app/api/zalo/staff/route.ts` (tạo/sửa staff giờ bắt buộc role `admin`), `app/login/page.tsx` (modal nhập password). Migration đã apply lên Supabase (đã verify `staff.password_hash` tồn tại).
- **Zalo forward rules** ("nhóm chính" tự động chuyển tiếp tin nhắn sang nhóm đích): `supabase/migrations/2026-07-09_zalo_forward_rules.sql` (bảng `zalo_forward_rules`/`zalo_forward_targets`/`zalo_forward_logs` + view `v_zalo_forward_rules_active`, RLS permissive — auth thật nằm ở tầng API Next.js), CRUD ở `app/api/zalo/forward-rules/**`, UI ở `app/(dashboard)/zalo/forward-rules/` + `components/zalo/ZaloForwardRulesDashboard.tsx` (đã thêm nút back → `/thong-bao-zalo`), thực thi ở `services/zalo-bridge/src/services/forwardEngine.js` (fire-and-forget hook từ `sessionManager.js` mỗi khi có message nhóm — cache rule 8s, có loop-guard, dedup, rate-limit `ZALO_FORWARD_MAX_PER_MIN`, log mọi lần forward). Migration đã apply, đã có 1 rule thật (`Team 6` → `3 vs fb`) nhưng `zalo_forward_logs` vẫn trống — code review không thấy bug, chỉ là chưa có tin nhắn nào tới nhóm chính trong lúc bridge (bản có forwardEngine hook) đang chạy live; cần test thật: gửi tin vào nhóm chính trong khi bridge local đang chạy, rồi kiểm tra `zalo_forward_logs`.
- **Đơn hàng gắn với trừ/hoàn tồn kho**: `lib/orders/repository.ts` (+~208 dòng) — deduct/restore stock khi tạo/sửa/xoá/đổi trạng thái đơn (idempotent qua cột mới `order_items.stock_deducted_at`, `SCHEMA_VERSION` 17→18), trang edit đơn mới `app/(dashboard)/orders/[id]/edit/page.tsx`. Logic transaction khá phức tạp — nên test kỹ create/edit/cancel/reopen/delete đơn `completed`.
- **Multi-select khi thêm sản phẩm**: `app/(dashboard)/products/cost-adjustments/new/page.tsx` và `.../stock-checks/new/page.tsx` — chọn nhiều sản phẩm một lần thay vì từng cái; `app/api/cost-adjustments/products-search/route.ts` bỏ guard chặn query rỗng để hỗ trợ mode "browse" này.
- **Sửa/xoá nhà cung cấp**: `app/(dashboard)/suppliers/page.tsx` + `components/suppliers/AddSupplierModal.tsx` (modal dùng chung add/edit).
- **Fix (2026-07-09)**: `components/zalo/useZalo.ts` — `ensureConversationInSupabase()` trước đây chỉ coi tên là "fallback cần re-resolve" dựa theo regex tên (`Group <id>`/`Zalo <id>`), không hề so sánh `thread_type` đã lưu với `thread_type` thực từ SSE/bridge → nếu 1 group từng bị lưu nhầm `thread_type="user"` (và tên bị set = sender_name của 1 tin trong nhóm) thì sẽ kẹt vĩnh viễn hiển thị tên người thay vì tên nhóm (chỉ tự sửa được nếu "may" trùng tên fallback với sender 1 tin sau đó). Đã thêm check `hasWrongType` (khi `threadType==="group"` mà `existing.thread_type!=="group"` → vẫn coi là cần resolve lại qua `/group-info`) để tự sửa đáng tin cậy hơn.
- File log rác (`tsout.log`, `services/zalo-bridge/bridge-*.log`) đã được thêm vào `.gitignore`.

Khi tiếp tục các việc trên: 2 migration đã apply rồi (không cần chạy lại), nhưng luôn nhớ chạy bridge local (không phải production) để test — và để ý rủi ro "Overlimit connection" nếu production bridge cũng đang sống.
