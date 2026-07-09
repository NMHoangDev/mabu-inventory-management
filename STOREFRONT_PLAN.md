# Phương án triển khai Website bán hàng (Storefront)

> Tài liệu đề xuất — **chưa triển khai code**. Mục tiêu: thêm một website bán hàng công khai (khách vào xem sản phẩm, đăng ký/đăng nhập, thêm giỏ hàng, đặt hàng, theo dõi đơn) dựa trên đúng dữ liệu kho/sản phẩm/đơn hàng hiện có của InvoiceFlow Manager, đồng thời bổ sung các trang quản lý cần thiết ở khu vực admin `(dashboard)` hiện tại. Duyệt xong phần đề xuất này rồi mới bắt đầu code theo từng phase.

## 1. Bối cảnh — những gì đã có, tái dùng được gì

Đây là phần quan trọng nhất: storefront **không tạo lại** dữ liệu, mà đọc/viết trực tiếp vào các bảng đã tồn tại trong cùng một Postgres (Supabase) mà app Next.js đang dùng qua `pg` (`lib/db/connection.ts`).

| Nhu cầu storefront | Đã có sẵn | Còn thiếu |
|---|---|---|
| Danh sách sản phẩm, giá, tồn kho | `products` (`price`, `compare_at_price`, `cost_price`, `stock`, `status`, `slug`, `seo_title/description`, `tags`, `sales_channels`), `product_images`, `categories` | Chưa có UI/API lọc "sản phẩm nào hiển thị website"; `slug` nhiều sản phẩm có thể đang null |
| Khách hàng | `customers` (`email`, `phone`, `address` qua `customer_addresses`, `total_orders`, `total_spent`, `group_id`) | **Chưa có cột mật khẩu/đăng nhập nào** — auth khách hàng chưa tồn tại |
| Đặt hàng → lưu vào danh sách đơn hàng hiện tại | `lib/orders/repository.ts` → `createOrder()` đã tính subtotal/total, gắn `customer_id` (FK thật), cập nhật stats khách hàng, bắn automation `order.created`/`order.paid`. `OrderSource` **đã có sẵn giá trị `"website"`** — schema đã được thiết kế để đón luồng này từ trước | API công khai gọi tới `createOrder()` với `source: "website"` |
| Theo dõi đơn hàng | `orders`/`order_items` đã đủ field (status, payment_status, fulfillment_status, tracking qua `shippings`) | Chưa có API/trang nào cho khách tự xem đơn của mình (toàn bộ `app/api/*` hiện tại chỉ dành cho nhân viên) |
| Giao diện đồng bộ | `app/globals.css` định nghĩa design token OKLCH (`--primary`, `--radius: 0.625rem`, font Inter 14px), class `.panel`/`.shadow-soft`, `tailwind.config.ts` map hết token này | Storefront tái dùng **nguyên vẹn** file này, không tạo bộ theme riêng |

Kết luận: đây chủ yếu là bài toán **thêm route group công khai + auth khách hàng + vài API mới**, không phải xây lại hệ thống.

## 2. Kiến trúc tổng thể

Thêm một route group mới `app/(storefront)/` nằm **cạnh** `app/(dashboard)/` (giống cách `(dashboard)` đang tồn tại độc lập), dùng chung `app/layout.tsx` root và `app/globals.css`, nhưng có `layout.tsx` riêng (header/footer/menu cửa hàng thay cho `DashboardLayout`).

```
app/
  (dashboard)/          ← không đổi, chỉ bổ sung vài trang quản lý (mục 6)
  (storefront)/         ← MỚI — toàn bộ trang công khai
    layout.tsx           header (logo, tìm kiếm, giỏ hàng, tài khoản) + footer
    page.tsx              trang chủ
    products/page.tsx     danh sách + lọc theo danh mục/tìm kiếm
    products/[slug]/page.tsx   chi tiết sản phẩm
    cart/page.tsx          giỏ hàng
    checkout/page.tsx      thanh toán → tạo đơn
    checkout/success/[id]/page.tsx
    account/login/page.tsx
    account/register/page.tsx
    account/page.tsx       thông tin tài khoản
    account/orders/page.tsx        lịch sử đơn hàng
    account/orders/[id]/page.tsx   theo dõi 1 đơn
  api/
    storefront/            ← MỚI — toàn bộ API công khai, tách hẳn khỏi API nội bộ
      auth/register|login|logout|me/route.ts
      products/route.ts, products/[slug]/route.ts
      categories/route.ts
      cart-price/route.ts        (tính lại giá real-time khi update giỏ, optional)
      checkout/route.ts
      orders/route.ts, orders/[id]/route.ts
```

Tách hẳn `app/api/storefront/*` khỏi `app/api/*` hiện tại để: (a) dễ áp rate-limit/log riêng cho API công khai, (b) không có route công khai nào vô tình dùng chung code path với route nội bộ đang giả định người gọi là nhân viên đã qua middleware.

`middleware.ts` hiện tại chặn mọi route `(dashboard)` bằng cookie `current_staff_id`, và loại trừ (bỏ qua) mọi thứ khác — nghĩa là `(storefront)` **tự động công khai**, không cần sửa middleware cho các trang xem sản phẩm/trang chủ. Chỉ cần thêm một lớp kiểm tra session khách hàng riêng cho các trang/API yêu cầu đăng nhập (`account/*`, `checkout`, `api/storefront/orders*`) — làm ở tầng route/layout đó, không đụng vào middleware nhân viên.

## 3. Auth khách hàng — thiết kế mới, KHÔNG copy nguyên mẫu auth nhân viên

Auth nhân viên hiện tại: cookie `current_staff_id` lưu trực tiếp UUID, middleware chỉ verify UUID đó có tồn tại + `is_active` trong bảng `staff` — **không có token/chữ ký nào**, ai đoán được UUID coi như đăng nhập được. Model này chấp nhận được vì nhân viên là nội bộ, ít người, đã có review nội bộ.

Storefront thì đối diện trực tiếp internet nên **không nên copy nguyên mẫu này** — đề xuất:

- Thêm cột `customers.password_hash text` (cùng format `scrypt` `"<salt>:<hash>"` như `lib/auth/password.ts`, tái dùng luôn file này).
- Thêm bảng `customer_sessions (id, customer_id, token_hash, user_agent, created_at, expires_at)` — cookie chỉ lưu **token ngẫu nhiên** (không phải customer_id), server tra `token_hash` (hash token trước khi lưu, giống cách lưu password) để tìm session còn hạn. Mất/hết hạn → phải đăng nhập lại. Đây là cải tiến bảo mật thật, không phải chỉ mirror staff.
- Cookie riêng, ví dụ `customer_session` (HttpOnly, `SameSite=Lax`), khác hẳn cookie `current_staff_id` — hai hệ thống đăng nhập độc lập, một nhân viên và một khách hàng có thể cùng đăng nhập trên 2 tab khác nhau không đụng nhau.
- Đăng ký: bắt buộc số điện thoại (dùng làm định danh chính, đúng thói quen mua hàng VN) + mật khẩu; email optional. Cần unique index cho `phone` khi không null (kiểm tra dữ liệu cũ trước khi thêm unique — có thể đang có trùng phone giữa các khách hàng nhập tay từ trước, phải xử lý dedupe hoặc để index dạng "cảnh báo" trước khi ép cứng).
- **Yêu cầu đăng nhập mới cho đặt hàng** (đúng như yêu cầu — "đăng nhập để lưu vào khách hàng"), không làm guest checkout ở v1. Điều này đơn giản hoá đáng kể: mọi đơn hàng storefront chắc chắn có `customer_id`, việc phân quyền xem đơn ("đây là đơn của tôi") chỉ cần so `order.customer_id === session.customer_id`, không cần cơ chế token tra cứu đơn cho khách vãng lai.

## 4. Giỏ hàng & Checkout

- **Giỏ hàng v1: lưu ở client (localStorage)**, không tạo bảng DB. Lý do: đơn giản, không cần đồng bộ đa thiết bị ngay, và giỏ hàng "sống" cho tới lúc bấm đặt hàng thì mới cần server biết. Khi người dùng đăng nhập, không cần merge gì cả vì giỏ luôn ở máy họ.
  - *Phase sau (optional)*: nếu cần giỏ hàng theo dõi đa thiết bị/bỏ giỏ hàng (remarketing), thêm bảng `carts`/`cart_items` — không làm ngay vì không nằm trong yêu cầu hiện tại.
- **Checkout**: `POST /api/storefront/checkout` — yêu cầu đã đăng nhập, nhận `items[]` (product_id + quantity từ giỏ client), **server tự tra lại giá/tồn kho hiện tại từ DB** (không tin giá client gửi lên, tránh khách sửa giá qua devtools), rồi gọi `createOrder()` có sẵn trong `lib/orders/repository.ts` với:
  - `source: "website"`
  - `status: "new"` (**không** đặt `"completed"`) → đơn nằm ở trạng thái chờ, **không trừ tồn kho ngay** — nhân viên xác nhận đơn qua trang quản lý hiện tại (`orders/[id]`) như một đơn từ nguồn khác, dùng đúng flow `transitionOrderStatus()` đã có sẵn để trừ kho khi chuyển `completed`. Không cần code mới cho phần trừ/hoàn kho — tái dùng 100%.
  - `payment_status`: mặc định `"unpaid"`, phương thức thanh toán v1 = COD (thu tiền khi nhận hàng) hoặc chuyển khoản thủ công (khách tự chuyển, nhân viên xác nhận tay ở trang đơn hàng, y như cách goods-receipts đang làm với 3 phương thức tiền mặt/chuyển khoản/thẻ) — **không** tích hợp cổng thanh toán (VNPay/Momo/ZaloPay) ở v1, ghi rõ ở mục "Ngoài phạm vi" để không hiểu nhầm là đã có.
  - Sau khi tạo đơn thành công → xoá giỏ hàng client, chuyển tới `checkout/success/[id]`.

## 5. Theo dõi đơn hàng cho khách hàng

- `GET /api/storefront/orders` — trả danh sách đơn của **chính khách đang đăng nhập** (lọc theo `customer_id` lấy từ session, không nhận customer_id từ query string để tránh khách A xem được đơn khách B).
- `GET /api/storefront/orders/[id]` — trả chi tiết 1 đơn, **phải kiểm tra `order.customer_id === session.customer_id`** trước khi trả dữ liệu, kể cả khi ID hợp lệ (nếu không sẽ là lỗ hổng "insecure direct object reference" — bất kỳ khách nào login đều xem được đơn của người khác nếu đoán được UUID).
- Trang `account/orders/[id]` hiển thị timeline trạng thái đơn dựa trên `status`/`payment_status`/`fulfillment_status` đã có, và nếu đơn đã gắn `shippings` thì hiện thêm `tracking_code`/trạng thái vận đơn (bảng `shippings` đã có `order_id` liên kết).

## 6. Bổ sung trang quản lý (admin) hiện tại

Cần thêm để vận hành được storefront, tất cả nằm trong `(dashboard)` đã có, không tạo route group quản lý mới:

1. **Quản lý hiển thị sản phẩm trên web** — hiện tại **chưa có bất kỳ UI nào** đụng tới `product_images`/`slug`/`seo_title`/`published_at` cho sản phẩm thường (chỉ trang `categories` có phần SEO tương tự). Cần thêm vào trang sửa sản phẩm: toggle "Hiển thị trên website" (dựa vào `status`/`published_at`), quản lý ảnh (`product_images`: thêm/xoá/sắp thứ tự), slug (tự sinh từ tên, cho sửa tay), SEO title/description.
2. **Quản lý khách hàng website** — trang `customers` hiện tại thêm: cột/nhãn "Đã có tài khoản web" (dựa vào `password_hash is not null`), và nút "Đặt lại mật khẩu" cho khách (mirror `app/api/zalo/staff/[staffId]/reset-password/route.ts` đang có cho nhân viên — null hoá `password_hash`, lần đăng nhập kế tiếp khách tự đặt lại).
3. **Lọc đơn hàng theo nguồn "Website"** — trang `orders` hiện tại có field `source` trong data nhưng **chưa có ô lọc theo nguồn nào trong UI** — thêm dropdown lọc theo `OrderSource` (store/facebook/website/zalo/other) để nhân viên tách riêng đơn từ web ra xử lý.
4. **Trang cấu hình website** (mới, ví dụ `(dashboard)/settings/storefront/page.tsx`) — quản lý nội dung trang chủ: banner/hero, sản phẩm/danh mục nổi bật (chọn từ danh sách có sẵn), thông tin liên hệ hiển thị ở footer. Lưu vào 1 bảng mới `site_settings` (single-row, giống pattern `shipping_settings` đang dùng: 1 dòng cấu hình, PATCH toàn bộ).

## 7. Thay đổi schema (bump `SCHEMA_VERSION` trong `lib/db/migration.ts`)

- `customers`: + `password_hash text`, kiểm tra/dedupe rồi thêm unique index cho `phone` (where not null).
- Bảng mới `customer_sessions` (id, customer_id fk, token_hash, user_agent, created_at, expires_at) + index theo `token_hash`.
- Bảng mới `site_settings` (id=1, banner_url, hero_title, hero_subtitle, contact_phone, contact_address, featured_category_ids uuid[], featured_product_ids uuid[], updated_at) — 1 dòng duy nhất như `shipping_settings`.
- Backfill `products.slug` cho các sản phẩm đang null (slugify từ `name`, đảm bảo unique — cần script backfill 1 lần, giống cách `search_text` đã được backfill trước đây ở migration v19).
- Không đổi gì ở `orders`/`order_items`/`products` core — chỉ đọc, không cần thêm cột.

## 8. Đồng bộ giao diện

- Không tạo theme/design token riêng cho storefront. Dùng chung `app/globals.css` (biến `--primary`, `--radius`, font Inter) và `tailwind.config.ts` hiện tại.
- Component riêng cho storefront đặt ở `components/storefront/` (Header, Footer, ProductCard, CartDrawer...), style bằng đúng class `.panel`/`.shadow-soft`/màu `primary` đang dùng ở dashboard để hai khu vực nhìn "cùng một sản phẩm" — khác biệt chỉ ở layout (dashboard: bảng dữ liệu dày đặc; storefront: lưới sản phẩm, hero banner, layout thưa hơn phù hợp khách mua hàng).

## 9. Lộ trình triển khai theo phase

| Phase | Nội dung | Phụ thuộc |
|---|---|---|
| **P1 — Nền tảng** | Migration schema (mục 7), auth khách hàng đầy đủ (đăng ký/đăng nhập/đăng xuất/session), layout `(storefront)` + trang chủ tĩnh, API + trang danh sách/chi tiết sản phẩm (chỉ đọc) | Không phụ thuộc |
| **P2 — Giỏ hàng & Đặt hàng** | Giỏ hàng client-side, trang giỏ hàng, checkout gọi `createOrder()`, trang xác nhận đặt hàng thành công | P1 |
| **P3 — Theo dõi đơn hàng** | API + trang lịch sử đơn/chi tiết đơn cho khách (có kiểm tra quyền xem), trang tài khoản cá nhân | P1, P2 |
| **P4 — Quản lý admin** | UI quản lý hiển thị sản phẩm/ảnh/SEO, quản lý tài khoản khách hàng + reset mật khẩu, lọc đơn theo nguồn, trang cấu hình website | Có thể làm song song P1–P3 |


## 11. Rủi ro cần lưu ý khi triển khai

- **Không tin dữ liệu giá/tồn kho từ client** ở bước checkout — luôn tính lại từ DB.
- **Kiểm tra quyền sở hữu đơn hàng** ở mọi API trả dữ liệu đơn cho khách (so `customer_id`), không chỉ dựa vào việc "đã đăng nhập".
- Session khách hàng dùng token ngẫu nhiên + hash lưu DB (không lưu UUID trần trong cookie như đang làm với nhân viên) vì đây là mặt tiền công khai.
- API `app/api/storefront/*` cần validate input (zod) chặt hơn API nội bộ vì nhận request từ bất kỳ ai trên internet, không chỉ nhân viên đã qua middleware.
- Trước khi thêm unique index cho `customers.phone`, phải rà dữ liệu cũ (có thể đã có khách trùng số điện thoại do nhập tay) để tránh migration fail.
