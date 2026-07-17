# Mô tả thiết kế giao diện Website bán hàng (Storefront)

> Tài liệu **mô tả UI/UX** — chỉ mô tả bố cục, màu sắc, thành phần giao diện, không chứa code. Khác với `STOREFRONT_PLAN.md` (tài liệu kiến trúc backend/schema/API), file này mô tả **những gì người dùng nhìn thấy**: đầy đủ danh sách trang, cấu trúc bố cục từng trang, hệ màu, typography, component dùng chung. Nội dung dựa trên phần storefront **đã triển khai thực tế** tại `app/(storefront)/` + `components/storefront/`, kèm ghi chú những chỗ còn thiếu/chưa nhất quán nên hoàn thiện tiếp.

---

## 1. Nguyên tắc thiết kế chung

- **Dùng chung 1 hệ token màu** với khu vực quản lý `(dashboard)` — không tạo theme riêng cho storefront. Token định nghĩa ở `app/globals.css` bằng biến CSS dạng OKLCH (`--primary`, `--background`, `--border`...), áp dụng qua `tailwind.config.ts`.
- **Font**: Inter, cỡ gốc 14px, `line-height: 1.5`. Tiêu đề (`h1-h4`) dùng `font-weight: 600`, không letter-spacing đặc biệt.
- **Bo góc**: `--radius: 0.625rem` (10px) làm chuẩn cho input/button/panel nhỏ; card sản phẩm/hero dùng bo lớn hơn (`rounded-2xl`, `rounded-3xl`) để tạo cảm giác "mềm", thân thiện hơn khu quản trị (vốn dùng bo góc nhỏ, dày đặc dữ liệu).
- **Shadow**: 2 lớp bóng chuẩn dùng xuyên suốt — `shadow-soft` (bóng rất nhẹ, dùng cho card/panel tĩnh) và `shadow-elegant` (bóng có sắc primary, dùng cho trạng thái hover/nổi bật, ví dụ ProductCard khi hover).
- **Mật độ bố cục**: khu quản trị (dashboard) ưu tiên bảng dữ liệu dày đặc; storefront ngược lại — bố cục **thưa, nhiều khoảng trắng, lưới sản phẩm lớn**, phù hợp trải nghiệm mua sắm.
- **Chiều rộng nội dung**: container chính giới hạn `max-w-6xl`, canh giữa (`mx-auto`), padding ngang `px-4`, padding dọc `py-6` — áp dụng cho mọi trang qua `layout.tsx` chung.

## 2. Bảng màu (Color Palette)

Toàn bộ màu là biến CSS (OKLCH), không hard-code hex trong component chức năng (trang sản phẩm/giỏ hàng/thanh toán/tài khoản). Ý nghĩa và cách dùng:

| Token | Sắc thái | Dùng ở đâu |
|---|---|---|
| `--background` | Xám xanh rất nhạt, gần trắng | Nền toàn trang |
| `--foreground` | Xanh than đậm (gần đen) | Màu chữ chính |
| `--card` | Trắng tinh | Nền card/panel |
| `--primary` | **Xanh dương đậm (brand color)** | Nút CTA chính, giá sản phẩm, link active, viền khi hover/chọn |
| `--primary-glow` | Xanh dương sáng hơn, dùng phối gradient với primary | Gradient thương hiệu (`--gradient-brand`) |
| `--secondary` | Xám xanh rất nhạt | Nền phụ (ảnh placeholder, pill chưa chọn) |
| `--accent` | Xanh dương nhạt (tint của primary) | Nền trạng thái "đang chọn" (category pill active, payment method active) |
| `--muted-foreground` | Xám trung tính | Chữ phụ, caption, số lượng, ngày tháng |
| `--border` | Xám rất nhạt | Viền card/input mặc định |
| `--destructive` | Đỏ cam | Badge "Hết hàng", cảnh báo lỗi |
| `--success` | Xanh lá | Icon/trạng thái thành công (đặt hàng thành công, đã giao) |
| `--warning` / `--warning-bg` | Vàng cam / vàng rất nhạt | Thanh thông báo (announcement bar) |

**Vấn đề cần thống nhất (ghi nhận, chưa sửa)**: các trang mang tính "marketing" (Trang chủ - phần hero, Giới thiệu, Liên hệ) hiện đang dùng màu Tailwind literal thay vì biến token — hero gradient `from-indigo-500 via-purple-500 to-pink-500`, các khối "giá trị cốt lõi" dùng `bg-blue-50/bg-emerald-50/bg-purple-50` pastel rời rạc, CTA cuối trang About dùng nền `bg-slate-900` đen tuyền. Trong khi các trang "chức năng" (sản phẩm/giỏ hàng/thanh toán/tài khoản) dùng đúng token `--primary`/`--accent`/`--border`. Nên thống nhất lại: hero/marketing dùng gradient dựa trên `--primary`/`--primary-glow` sẵn có (`--gradient-brand`) thay vì tự chọn indigo-purple-pink, và khối "giá trị cốt lõi" nên dùng cùng 1 sắc `--accent` thay vì 3 màu pastel khác nhau — để toàn bộ storefront nhìn "cùng một thương hiệu" từ đầu đến cuối, không bị lệch tông giữa trang chủ và trang sản phẩm.

## 3. Bố cục khung sườn (Header / Footer / Container)

Mọi trang thuộc `(storefront)` dùng chung 1 layout: `Header` (sticky) → nội dung trang (trong container `max-w-6xl`) → `Footer`.

### Header (sticky, luôn hiển thị khi cuộn)
Nền trắng mờ (`bg-white/80` + `backdrop-blur`), viền dưới mảnh, đổ bóng nhẹ. Bố cục 1 hàng ngang, từ trái sang phải:
1. **Logo** — icon cửa hàng + tên shop (lấy động từ cấu hình `site_settings`, không hard-code).
2. **Menu điều hướng** (chỉ hiện ở màn hình ≥ tablet): Trang chủ / Sản phẩm / Giới thiệu / Liên hệ.
3. **Ô tìm kiếm** dạng pill bo tròn (chỉ hiện ở màn hình ≥ nhỏ), icon kính lúp.
4. **Icon giỏ hàng** — có badge tròn màu primary hiển thị số lượng sản phẩm trong giỏ.
5. **Khu vực tài khoản** — chưa đăng nhập: nút "Đăng nhập" dạng pill; đã đăng nhập: avatar + dropdown (Tài khoản / Đơn hàng của tôi / Đăng xuất).

*Thiếu*: chưa có menu dạng hamburger cho di động — trên màn hình nhỏ, menu điều hướng biến mất hoàn toàn thay vì gập lại thành menu thả xuống. Cần bổ sung để mobile không mất lối vào "Giới thiệu"/"Liên hệ".

### Footer (nền trắng, viền trên)
Lưới 4 cột (rút gọn thành 1 cột trên di động):
1. Logo + slogan ngắn + icon mạng xã hội (Facebook/Instagram/Twitter).
2. "Danh mục" — link nhanh tới các danh mục sản phẩm.
3. "Hỗ trợ" — Giới thiệu / Liên hệ / Chính sách bảo mật / Điều khoản.
4. "Liên hệ" — địa chỉ, số điện thoại (lấy từ cấu hình, có fallback mặc định), email.

Dưới cùng: thanh bản quyền (năm hiện tại + tên shop, tự động) và nhãn phương thức thanh toán chấp nhận (Visa/Mastercard/Momo — hiện là chữ, chưa có icon).

*Thiếu*: link mạng xã hội, "Chính sách bảo mật", "Điều khoản" hiện trỏ tới `#` (chưa có trang thật) — cần thay bằng link thật hoặc ẩn đi cho tới khi có nội dung.

## 4. Danh sách đầy đủ các trang

### 4.1. Trang chủ (`/shop`)
Bố cục 1 cột, các khối xếp dọc từ trên xuống:
1. **Thanh thông báo** (tuỳ chọn, chỉ hiện khi admin cấu hình) — nền vàng nhạt, có chấm nhấp nháy thu hút chú ý.
2. **Hero banner** — khối lớn bo góc 3xl, nền gradient thương hiệu (hoặc ảnh nền nếu admin upload), tiêu đề + mô tả ngắn lấy từ cấu hình web, nút CTA trắng bo tròn "Mua Sắm Ngay" kèm mũi tên.
3. **Dải danh mục** — các pill bo tròn hoàn toàn, mỗi pill có tên danh mục + số lượng sản phẩm, cuộn ngang trên di động.
4. **Lưới "Sản phẩm mới nhất"** — responsive 2/3/4 cột tuỳ độ rộng màn hình, dùng ProductCard (chi tiết ở mục 5), có trạng thái loading (spinner) và trạng thái rỗng.

### 4.2. Danh sách sản phẩm (`/shop/products`)
- Tiêu đề trang + số lượng kết quả tìm được (caption nhỏ).
- Bộ lọc theo danh mục dạng **pill ngang** (không phải sidebar dọc) — pill đang chọn có viền + nền primary nhạt.
- Lưới sản phẩm 2/3/4 cột, cùng ProductCard với trang chủ.
- Phân trang dạng nút vuông (trước/sau) + chữ "Trang X/Y", 24 sản phẩm/trang.
- Hỗ trợ tìm kiếm qua query string (đồng bộ với ô tìm kiếm ở Header).

### 4.3. Chi tiết sản phẩm (`/shop/products/[slug]`)
Lưới 2 cột trên desktop (dồn 1 cột trên di động):
- **Cột trái**: ảnh chính hình vuông trong khung "panel", dải ảnh thu nhỏ bên dưới (ảnh đang chọn có viền primary).
- **Cột phải**: tên danh mục (caption nhỏ) → tên sản phẩm → giá (chữ lớn, đậm, màu primary) → đơn vị tính → mô tả ngắn → bộ đếm số lượng (nút trừ/cộng) → nút "Thêm vào giỏ" (khi bấm hiện thông báo "Đã thêm vào giỏ!" 2 giây) → banner cảnh báo nếu hết hàng.
- Bên dưới: khối mô tả chi tiết sản phẩm.

*Thiếu* (so với một trang sản phẩm thương mại điện tử đầy đủ): chưa có tab tách riêng Mô tả / Thông số kỹ thuật, chưa có phần đánh giá (reviews), chưa có "Sản phẩm liên quan" ở cuối trang.

### 4.4. Giỏ hàng (`/shop/cart`)
- **Trạng thái rỗng**: icon + thông báo + nút quay lại mua sắm.
- **Có sản phẩm**: lưới 3 cột — 2 cột trái là danh sách dòng sản phẩm (ảnh nhỏ, tên, đơn giá, bộ đếm số lượng, thành tiền dòng, nút xoá hình thùng rác); 1 cột phải là bảng tóm tắt (tổng số lượng, tổng tiền, nút "Tiến hành thanh toán").

### 4.5. Thanh toán (`/shop/checkout`)
- Yêu cầu đăng nhập trước — chưa đăng nhập thì hiện lời mời + nút đăng nhập thay vì form.
- Lưới 3 cột: 2 cột trái là form (địa chỉ giao hàng, ghi chú, và các thẻ chọn phương thức thanh toán COD/chuyển khoản/thẻ — thẻ đang chọn có viền + nền primary nhạt); 1 cột phải là tóm tắt đơn hàng (danh sách sản phẩm cuộn được, tổng tiền, nút đặt hàng).

### 4.6. Đặt hàng thành công (`/shop/checkout/success/[id]`)
Bố cục hẹp, canh giữa trang — icon thành công lớn màu xanh lá, mã đơn/phương thức thanh toán/tổng tiền trong 1 khung, 2 nút hành động: "Xem đơn hàng" (viền) và "Tiếp tục mua sắm" (nền primary).

### 4.7. Đăng nhập / Đăng ký (`/shop/account/login`, `/register`)
Card hẹp canh giữa màn hình. Đăng nhập: SĐT + mật khẩu. Đăng ký: họ tên + SĐT + email (tuỳ chọn) + mật khẩu. Nút submit nền primary, link chuyển qua lại giữa 2 trang.

### 4.8. Tài khoản (`/shop/account`)
Panel tóm tắt thông tin cá nhân (tên/SĐT/email/mã khách hàng) + link tới "Đơn hàng của tôi" + nút đăng xuất.

### 4.9. Lịch sử đơn hàng (`/shop/account/orders`)
Danh sách card, mỗi card 1 đơn: mã đơn, ngày đặt, tóm tắt sản phẩm, badge trạng thái, tổng tiền.

### 4.10. Chi tiết 1 đơn hàng (`/shop/account/orders/[id]`)
- Link quay lại danh sách.
- **Thanh tiến trình giao hàng** dạng các bước nối tiếp (icon tick/vòng tròn rỗng): Đã xác nhận → Đang đóng gói → Đang giao → Đã giao — hoặc banner riêng nếu đơn bị huỷ/hoàn trả.
- Danh sách sản phẩm trong đơn, bảng chi phí (tạm tính/giảm giá/phí ship/tổng), phương thức + trạng thái thanh toán, ghi chú đơn.

### 4.11. Giới thiệu (`/shop/about`)
Canh giữa, rộng vừa phải. Tiêu đề lớn + mô tả → banner ảnh lớn tỉ lệ 21:9 → 3 khối "giá trị cốt lõi" dạng thẻ (icon tròn màu pastel + tiêu đề + mô tả ngắn, ví dụ: Cam kết chất lượng / Giao hàng nhanh / Hỗ trợ 24/7) → khối CTA nền tối cuối trang mời khách mua sắm.

### 4.12. Liên hệ (`/shop/contact`)
Canh giữa, rộng vừa phải. Tiêu đề lớn → lưới 2 cột: cột trái là khối thông tin liên hệ (địa chỉ/điện thoại/email, mỗi mục có icon tròn pastel riêng), cột phải là form liên hệ (họ tên/SĐT/email/nội dung) + nút gửi nền primary.

*Thiếu quan trọng*: form liên hệ hiện **chưa nối với backend** (chỉ hiện `alert()` khi bấm gửi) — cần API nhận và lưu/gửi liên hệ nếu muốn dùng thật; thông tin liên hệ hiển thị hiện đang là dữ liệu mẫu cứng, cần thay bằng dữ liệu thật của cửa hàng.

## 5. Component dùng chung

- **ProductCard** — thẻ trắng bo góc lớn, viền nhạt; khi hover: nổi lên nhẹ (dịch chuyển lên trên), viền chuyển màu primary, đổ bóng "elegant". Ảnh vuông, phóng to nhẹ khi hover; nếu chưa có ảnh thì hiện icon ảnh-lỗi trên nền phụ. Hết hàng: phủ mờ trắng + nhãn "Hết hàng" màu đỏ cam. Bên dưới ảnh: tên sản phẩm (tối đa 2 dòng, cắt bớt nếu dài), giá tiền đậm màu primary, và nút tròn "thêm vào giỏ" ở góc — phóng to nhẹ khi hover, mờ đi và khoá khi hết hàng.
- **Badge trạng thái đơn hàng** — pill nhỏ bo tròn hoàn toàn, màu nền/chữ đổi theo trạng thái (xanh lá = thành công, cam = đang xử lý, đỏ = huỷ/hết hàng).
- **Nút CTA chính** — nền primary, chữ trắng, bo góc chuẩn `--radius`.
- **Panel/Card chức năng** — nền trắng, viền nhạt, bóng "soft" (class `.panel` dùng chung với dashboard).

## 6. Iconography

Toàn bộ icon dùng bộ **lucide-react** (cùng bộ với khu quản trị) — không trộn bộ icon khác, đảm bảo phong cách nét mảnh nhất quán. Icon tiêu biểu đã dùng: `ShoppingCart`/`ShoppingBag` (giỏ hàng), `Search` (tìm kiếm), `User`/`Package`/`LogOut` (tài khoản), `CheckCircle2`/`Circle` (tiến trình đơn hàng), `ImageOff` (ảnh lỗi/thiếu), `MapPin`/`Phone`/`Mail` (liên hệ), `ShieldCheck`/`Truck`/`Clock` (giá trị cốt lõi).

## 7. Responsive

- Breakpoint chính dùng: `sm`, `md` (Tailwind mặc định).
- Lưới sản phẩm: 2 cột (mobile) → 3 cột (tablet) → 4 cột (desktop).
- Menu điều hướng Header và ô tìm kiếm: ẩn hoàn toàn dưới `md`/`sm` (xem ghi chú thiếu mobile-menu ở mục 3).
- Footer: 4 cột → gập thành 1 cột trên di động.
- Trang chi tiết sản phẩm, giỏ hàng, thanh toán: lưới nhiều cột trên desktop → dồn về 1 cột trên di động.

## 8. Tổng hợp việc nên hoàn thiện tiếp (ưu tiên đề xuất)

1. Thêm menu di động (hamburger/drawer) cho Header — hiện khách dùng điện thoại không vào được "Giới thiệu"/"Liên hệ" qua menu.
2. Thống nhất màu sắc giữa trang "marketing" (Trang chủ hero, Giới thiệu, Liên hệ) với trang "chức năng" — dùng chung token `--primary`/`--accent`/`--gradient-brand` thay vì màu Tailwind literal rời rạc (indigo/purple/pink/slate).
3. Nối form Liên hệ với backend thật (API lưu/gửi liên hệ) thay vì `alert()`.
4. Thay placeholder (link mạng xã hội `#`, trang Chính sách/Điều khoản `#`, thông tin liên hệ mẫu) bằng nội dung thật hoặc ẩn đi.
5. (Tuỳ mức độ ưu tiên) bổ sung cho trang chi tiết sản phẩm: tab Mô tả/Thông số, phần đánh giá, khối "Sản phẩm liên quan".
