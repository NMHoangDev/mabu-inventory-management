# Hướng dẫn test — cập nhật liên tục

File này liệt kê **cách test thủ công** cho từng tính năng đã làm, theo từng session. Đây là tài liệu để QA/tự kiểm tra trước khi deploy — không phải test tự động (repo không có test suite, xem `CLAUDE.md`). Mỗi lần làm tính năng mới, **thêm mục mới bên dưới** (không xoá mục cũ, trừ khi tính năng đó đã bị gỡ khỏi code) và **đồng thời cập nhật `INTERNAL_HANDBOOK.md`** (mục "Tính năng mới nhất").

An toàn khi test: DB local trỏ thẳng Supabase **production thật** (xem `INTERNAL_HANDBOOK.md` mục 3) — mọi dữ liệu tạo ra khi test đều là dữ liệu thật, **luôn dọn lại sau khi test xong** (xoá đơn/sản phẩm test, revert lại field đã sửa nhầm trên sản phẩm có sẵn).

Chuẩn bị chung trước khi test bất kỳ mục nào bên dưới:
```bash
npm run dev   # port 4000
```
Đăng nhập: mở `http://localhost:4000`, chọn tài khoản **Dev** hoặc **System Admin**. Nếu cần set cookie thủ công (test bằng script/curl không qua UI login) — xem mẹo ở `INTERNAL_HANDBOOK.md` mục 2 (Auth): chỉ cần biết `staff.id` đang `is_active=true`, set cookie `current_staff_id=<id>`, không cần biết password thật. Lấy id qua `GET /api/zalo/staff`.

---

## Session 2026-07-26

### A. Sổ quỹ theo phương thức thanh toán

1. Vào `/finance/cash-ledger`.
2. Kiểm tra khối mới **"Số dư theo hình thức thanh toán"** hiện ngay dưới khối tổng thu/chi/tồn cuối kỳ cũ.
3. Đối chiếu tay: cộng các phiếu "Thu" trừ phiếu "Chi" theo từng `HTTT` (cột trong bảng phía dưới) — số phải khớp đúng khối mới.
4. Tạo thử 1 phiếu thu (`/finance/receipt-vouchers/new`) hoặc phiếu chi (`/finance/payment-vouchers/new`) với `payment_method` khác nhau (Tiền mặt/Chuyển khoản) → quay lại `/finance/cash-ledger`, số dư phải cập nhật đúng.
5. **API trực tiếp** (nếu muốn test nhanh không qua UI): `GET /api/cash-book/balance-by-method` → trả `{ balances: [{method, total_receipts, total_payments, balance}, ...] }`.

### B. Công nợ nhà cung cấp trên trang chi tiết NCC

1. Vào `/suppliers`, chọn 1 NCC đã có phiếu nhập hàng (`total_orders > 0`).
2. Vào trang chi tiết NCC đó → khu vực "Lịch sử giao dịch" phải có thêm 2 dòng **"Đã thanh toán"** và **"Còn nợ"** (đỏ nếu > 0).
3. Đối chiếu với báo cáo `/reports/finance/supplier-debt` — số "Còn nợ" của đúng NCC này ở 2 nơi phải khớp nhau.
4. **API trực tiếp**: `GET /api/suppliers/[id]` → response có thêm field `debt: {total_receipts, total_amount, total_paid, outstanding}`.

### C. Nhà cung cấp trên trang chi tiết sản phẩm

1. Vào `/suppliers/[id]` của 1 NCC, thêm 1 sản phẩm vào danh sách "Sản phẩm đang cung cấp" (nếu chưa có).
2. Vào `/products/inventory/[id]` của đúng sản phẩm đó → phải thấy section mới **"Nhà cung cấp"** liệt kê đúng NCC vừa gắn (tên, SKU NCC nếu có, giá vốn, badge "Ưu tiên" nếu bật).
3. Sản phẩm chưa gắn NCC nào → section hiện "Chưa có nhà cung cấp nào cung cấp sản phẩm này."
4. **API trực tiếp**: `GET /api/inventory/products/[id]` (⚠️ route thật trang này gọi, KHÔNG phải `/api/products/[id]`) → response `{ product: {..., suppliers: [...]} }`.

### D. Xuất Excel — Đơn hàng (`/orders`)

1. Vào `/orders`, bấm **"Xuất file"**.
2. Modal hiện đúng: radio "Giới hạn kết quả xuất" (Tất cả / Trang này), radio "Loại xuất file" (tổng quan theo đơn / theo sản phẩm / chi tiết), link "Tùy chọn trường hiển thị".
3. Bấm "Tùy chọn trường hiển thị" → modal con hiện nhóm field ("Thông tin đơn hàng", "Thông tin giao hàng", "Sản phẩm" — nhóm "Sản phẩm" CHỈ hiện khi chọn loại file "theo sản phẩm"/"chi tiết"). Test checkbox "chọn tất cả" từng nhóm (tri-state khi chọn 1 phần).
4. Bấm "Xuất file" → file `.xlsx` tải về, mở được, đúng số dòng (loại "tổng quan theo đơn" = số đơn; "theo sản phẩm"/"chi tiết" = số dòng sản phẩm trong các đơn), đúng cột đã chọn.
5. **Test trực tiếp qua API** (không cần UI):
   ```bash
   curl -X POST http://localhost:4000/api/orders/export -H "Content-Type: application/json" \
     -H "Cookie: current_staff_id=<staff_id>" \
     -d '{"scope":"all","filters":{},"exportType":"order_summary","fields":["code","customer_name","total","status"]}' \
     -o don-hang.xlsx
   ```

### E. Xuất Excel — Sản phẩm (`/products`)

1. Vào `/products`, bấm **"Xuất file"** (chỉ có radio phạm vi, KHÔNG có radio loại file — khác đơn hàng vì đây là danh sách phẳng).
2. Lọc/tìm kiếm sản phẩm trước, chọn phạm vi "Tất cả" → export phải khớp đúng số sản phẩm đang hiển thị sau lọc (không phải toàn bộ DB nếu đang lọc), vì trang này tải hết bảng về trình duyệt rồi tự lọc — export dùng đúng data đã lọc trong bộ nhớ trình duyệt.
3. Chọn phạm vi "Trang này" → chỉ xuất đúng 20 dòng đang xem.
4. Mở file `.xlsx`, kiểm tra field đã chọn ở "Tùy chọn trường hiển thị" (3 nhóm: Thông tin cơ bản / Giá & tồn kho / Phân loại & SEO).

### F. Xuất Excel — 7 báo cáo tồn kho (`/reports/inventory/*`)

1. Vào lần lượt: `/reports/inventory/summary`, `/detail`, `/stock-ledger`, `/below-threshold`, `/above-threshold`, `/in-out-balance`, `/stock-check`.
2. Mỗi trang phải có nút **"Xuất file"** ở góc trên bên phải (cạnh nút "Trợ giúp").
3. Bấm vào → chỉ có field-picker (không có radio phạm vi/loại file — các báo cáo này không phân trang phía client).
4. Xuất thử `detail` hoặc `ledger` — **quan trọng**: số dòng trong file phải KHÔNG bị giới hạn ở mức trang xem đang hiện (200 dòng cho detail/ledger, 100 cho below/above/stock_check, 50 SKU cho in_out) — nếu dữ liệu thật nhiều hơn mức đó thì file xuất ra phải có nhiều hơn số dòng hiển thị trên trang.
5. Xuất `summary` → phải dùng dữ liệu của `detail` làm nguồn (trang summary tự nó không có danh sách dòng).
6. **Regression check quan trọng**: sau khi đổi route `GET /api/reports/inventory`, vào lại từng trang báo cáo và xác nhận **số liệu hiển thị không đổi so với trước** (route GET giữ nguyên limit cũ, chỉ export mới bỏ giới hạn).

### G. Nhập Excel — Sản phẩm (tạo mới + cập nhật theo SKU)

1. Vào `/products`, bấm **"Nhập file"**.
2. Bấm "Tải file mẫu" → file có cột: SKU*, Tên sản phẩm*, Mã vạch, Đơn vị tính, Mô tả, Giá bán, Giá so sánh, Giá vốn, Thương hiệu, Loại sản phẩm, Trạng thái. **Không có cột tồn kho** — cố ý, để không thể lỡ ghi đè tồn kho qua import.
3. Điền vào mẫu: 1 dòng SKU hoàn toàn mới (phải có Tên sản phẩm), 1 dòng SKU đã tồn tại sẵn trong hệ thống (test cập nhật — Tên sản phẩm có thể để trống, giữ tên cũ), 1 dòng cố ý để trống SKU (test báo lỗi).
4. Upload file → bấm "Xem trước" → bảng preview phải phân loại đúng 3 dòng: 1 "sẽ tạo", 1 "sẽ cập nhật", 1 "dòng lỗi" (kèm lý do "Thiếu SKU.").
5. Bấm "Xác nhận nhập" → kết quả cuối hiện đúng `created: 1, updated: 1`, `errors` liệt kê dòng lỗi.
6. **Kiểm tra bắt buộc**: vào `/products/inventory/[id]` của sản phẩm vừa cập nhật (theo SKU đã có sẵn) → **tồn kho (Tồn kho) phải giữ nguyên, không đổi** dù giá/tên đã cập nhật.
7. Dọn dẹp: xoá sản phẩm test vừa tạo mới, revert lại tên/giá của sản phẩm đã cập nhật về giá trị ban đầu (ghi lại giá trị TRƯỚC khi test để có gì revert).

### H. Nhập Excel — Đơn hàng (tạo hàng loạt)

1. Vào `/orders`, bấm **"Nhập file"**.
2. Tải file mẫu → cột: Mã đơn tạm, Tên khách hàng*, SĐT khách hàng, SKU sản phẩm*, Số lượng*, Đơn giá (bỏ trống = lấy giá sản phẩm), Ghi chú dòng, Ghi chú đơn, Chiết khấu đơn, Phí vận chuyển, Nguồn đơn.
3. Điền: 1 dòng để trống "Mã đơn tạm" (1 đơn 1 sản phẩm), 2 dòng cùng chung 1 giá trị "Mã đơn tạm" khác (test gộp thành 1 đơn nhiều sản phẩm), 1 dòng SKU sai/không tồn tại (test báo lỗi).
4. Upload → "Xem trước" → preview theo từng nhóm đơn: đơn 1 sản phẩm, đơn nhiều sản phẩm (đúng `itemCount: 2`), và 1 đơn báo lỗi "Không tìm thấy SKU...".
5. "Xác nhận nhập" → `created` liệt kê đúng 2 đơn (mã đơn thật `SONyyyymmddNNN`), `errors` có đúng 1 dòng lỗi SKU sai.
6. **Kiểm tra bắt buộc**: vào từng đơn vừa tạo (`/orders` → click vào đơn) → trạng thái phải là **"Chờ thanh toán"** (không phải "Hoàn tất"), ghi chú có tiền tố `[IMPORT-EXCEL]`. Tồn kho các sản phẩm liên quan **không đổi** (import không trừ kho vì đơn chưa `completed`).
7. Dọn dẹp: xoá các đơn test vừa tạo (`DELETE /api/orders/[id]` hoặc từ UI nếu có nút xoá).

### I. Module Khuyến mại (CTKM) — quản lý + tự động áp ở `/orders/new`

Xem thiết kế đầy đủ ở `INTERNAL_HANDBOOK.md` mục 11 trước khi test — đặc biệt lưu ý mục 11.0 nếu gặp lỗi lạ về DB (bảng `promotions` mồ côi / advisory lock kẹt).

**I.1. Tạo CTKM "Chiết khấu theo số lượng sản phẩm" (ưu tiên, khớp ảnh Sapo mẫu)**
1. Vào `/promotions` → "+ Tạo khuyến mại" → chọn card **"Chiết khấu"** (card "Tặng sản phẩm" phải **không bấm được**, có badge "Sắp có").
2. Điền "Tên khuyến mại" (bắt buộc — để trống phải hiện lỗi inline "Tên khuyến mại không được để trống"). Phương thức mặc định đã là "Chiết khấu theo số lượng sản phẩm".
3. Bấm "Thêm điều kiện" → tìm chọn 1 sản phẩm bất kỳ đã có `price > 0` (⚠️ nếu chọn sản phẩm giá 0đ, chiết khấu kiểu "amount" sẽ tự động bị kẹp về 0 — đây là hành vi ĐÚNG của engine, không phải bug, vì không thể giảm giá nhiều hơn giá trị sản phẩm) → nhập SL từ `20`, để trống SL đến (không giới hạn), Chiết khấu `1000đ`.
4. Lưu → phải quay về `/promotions`, thấy đúng mã `KMxxxxxx`, trạng thái "Đang chạy", "Số phiếu còn lại" = `∞`.

**I.2. Test trùng khoảng số lượng (không chặn, engine tự chọn mức lợi nhất)** — test nhanh qua API, không cần UI:
```bash
curl -X POST http://localhost:4000/api/promotions/apply -H "Content-Type: application/json" \
  -H "Cookie: current_staff_id=<staff_id>" \
  -d '{"items":[{"line_id":"x","product_id":"<id>","product_name":"x","quantity":30,"unit_price":14200}]}'
```
Nếu CTKM có 2 dòng chồng nhau cho cùng sản phẩm (vd `20→∞`=1000đ và `20→49`=500đ), kết quả PHẢI chọn **1000đ** (mức lợi hơn cho khách), không phải dòng khớp trước theo thứ tự cấu hình.

**I.3. Áp dụng ở `/orders/new` — test bắt buộc, đây là tính năng chính**
1. Vào `/orders/new`, thêm đúng sản phẩm ở bước I.1 vào giỏ, sửa Số lượng = 50, sửa Đơn giá tay = 14.200đ (để khớp đúng ảnh mẫu; bỏ qua bước này nếu sản phẩm bạn chọn đã có giá bán > 0 sẵn).
2. Chờ ~1 giây → phải thấy dải "Có N chương trình khuyến mại phù hợp" phía trên nút "Áp dụng chương trình khuyến mại".
3. Bấm nút → modal "Áp dụng khuyến mại" hiện đúng tên CTKM, nhãn phương thức, số tiền giảm dự kiến (`-50.000 VND` cho case ở trên), link "Xem điều kiện" bung ra đúng mô tả bậc số lượng.
4. Tick chọn → bấm "Áp dụng" → **điều kiện PASS chính xác**: ô Chiết khấu của dòng đó hiện thêm dòng phụ `KM · 7%` (`50.000/710.000 = 7,04%` làm tròn), cột Thành tiền = `660.000 VND`, khối tổng bên phải hiện "Đã áp dụng 1 CTKM - <tên>", "Chiết khấu sản phẩm -50.000 VND", "Khách phải trả 660.000 VND".
5. Bấm lại vào dòng "Đã áp dụng..." → mở lại modal → bấm **"Ngừng áp dụng"** → dòng phải khôi phục đúng về chiết khấu tay trước đó (hoặc về 0 nếu chưa từng chiết khấu tay), Thành tiền trở lại `710.000 VND`.
6. Test tự tách dòng: áp CTKM xong, sửa tay ô Chiết khấu của dòng đó → dòng phải **tự tách khỏi CTKM** (không còn bị effect debounce ghi đè lại giá trị cũ).
7. Test nhảy bậc: áp CTKM xong, đổi Số lượng sang giá trị thuộc bậc khác (hoặc dưới `qty_from` để hết điều kiện) → sau ~1 giây phải thấy chiết khấu tự cập nhật đúng bậc mới, hoặc CTKM tự gỡ kèm thông báo cam "Chương trình ... không còn phù hợp và đã được gỡ khỏi đơn."
8. **Regression bắt buộc**: xoá hết CTKM test (bước dọn dẹp bên dưới) rồi vào lại `/orders/new`, xác nhận trang vẫn hoạt động bình thường y như trước khi có module này (thêm SP, sửa chiết khấu tay, chiết khấu tổng đơn, lưu đơn) — không có CTKM nào không được làm thay đổi hành vi cũ.

**I.4. Test 3 phương thức còn lại (mỗi loại tạo thử 1 CTKM tối thiểu)**
- **Chiết khấu theo tổng giá trị đơn hàng**: tạo 1-2 bậc theo tổng tiền, verify qua `/api/promotions/apply` với `items` có tổng đủ lớn → phải trả `order_discount` khớp bậc cao nhất mà đơn đạt được.
- **Chiết khấu theo từng sản phẩm**: chọn vài sản phẩm + SL tối thiểu + Giới hạn KM → verify khi giỏ có nhiều dòng vượt Giới hạn KM, engine phải phân bổ ưu tiên dòng có chiết khấu/đơn vị cao nhất trước.
- **Chiết khấu sản phẩm mua thêm theo tổng giá trị đơn hàng**: đặt ngưỡng T + chọn SP mua thêm → verify đơn CHƯA đạt ngưỡng (chỉ tính các dòng không phải SP mua thêm) thì không có candidate; đạt ngưỡng thì SP mua thêm được giảm giá.

**I.5. Nếu sau này được phép mở rộng sang POS** — đọc kỹ mục 11.8 của `INTERNAL_HANDBOOK.md` (lý do + danh sách điểm sửa cụ thể) trước khi động vào `app/(dashboard)/pos/page.tsx` — file này vẫn đang bị rule cấm sửa cho tới khi người dùng cho phép đích danh.

**Dọn dẹp bắt buộc sau khi test xong** (DB local là production thật):
```bash
curl -X DELETE http://localhost:4000/api/promotions/<id> -H "Cookie: current_staff_id=<staff_id>"
```
Xoá hết CTKM test đã tạo (I.1, I.4). Nếu lỡ tạo đơn hàng thật ở bước I.3 (bấm "Tạo đơn hàng" thay vì chỉ xem trước), xoá luôn đơn đó (`DELETE /api/orders/[id]`) — việc này cũng sẽ xoá theo `order_promotions` liên quan (FK `on delete cascade`).

### J. In hóa đơn (`/orders/[id]`)

1. Vào chi tiết 1 đơn hàng bất kỳ, bấm icon in (🖨️) ở góc trên.
2. Phải mở ra layout hóa đơn riêng (`components/orders/PrintableInvoice.tsx`) — không phải in nguyên trang dashboard (sidebar/nav/nút bấm phải bị ẩn hoàn toàn khi in, chỉ còn nội dung hóa đơn).
3. Kiểm tra nội dung hóa đơn in ra có đủ: thông tin cửa hàng (lấy từ settings), mã đơn, ngày tạo, khách hàng, danh sách sản phẩm + SL + đơn giá + thành tiền, tổng tiền, đã thanh toán, còn lại.
4. Test qua trình duyệt thật: `Ctrl+P` hoặc nút in → xem bản xem trước (print preview) phải đúng khổ giấy, không bị cắt chữ/tràn cột.

### K. Đơn trả hàng (`/orders/returns/*`)

Xem thiết kế đầy đủ ở `INTERNAL_HANDBOOK.md` mục 12 trước khi test — đặc biệt lưu ý phần "sự cố đã gặp" nếu thấy lỗi lạ về DB (advisory lock kẹt khi migration chạy sau khi bump `SCHEMA_VERSION`).

**K.1. Trả một phần sản phẩm của 1 đơn `completed` đã trừ kho**
1. Vào `/orders/returns/new` ("Chọn đơn hàng để trả") → xác nhận danh sách CHỈ hiện đơn `status=completed` đã từng trừ kho và còn ít nhất 1 dòng chưa trả hết (đơn đã trả hết hoàn toàn phải biến mất khỏi danh sách này).
2. Bấm "Đổi trả" ở 1 đơn → vào form, nhập SL trả nhỏ hơn SL đã mua ở 1 dòng bất kỳ (ví dụ mua 3, trả 1) → xem "Tổng tiền hoàn" tự tính đúng = SL trả × đơn giá.
3. Nhập lý do trả hàng (tuỳ chọn) → bấm "Tạo phiếu trả hàng" → phải chuyển về `/orders/returns`, thấy đúng phiếu vừa tạo (mã `THyyyymmddNNN`) với đúng số tiền hoàn.
4. Vào lại `/products/inventory/<id>` của sản phẩm vừa trả → tab "Lịch sử kho" phải có thêm 1 dòng `+SL trả` (nhãn "Hoàn kho (huỷ đơn)" — tái dùng nhãn có sẵn của `movement_type='order_restore'`, không phải bug), tồn kho (`Tồn kho` tab) phải tăng đúng SL trả.
5. Vào `/finance/payment-vouchers` → phải có thêm 1 phiếu chi mới, loại "Trả hàng", đúng số tiền hoàn, chứng từ gốc = mã phiếu trả vừa tạo.
6. Vào lại `/orders/[id]` của đơn gốc → `fulfillment_status` **PHẢI giữ nguyên** (không tự chuyển "Hoàn trả") vì mới trả 1 phần — nút "Đổi trả hàng" vẫn hiện (đơn còn SL chưa trả).

**K.2. Trả nốt phần còn lại → xác nhận đơn chuyển "Hoàn trả"**
1. Từ đơn ở K.1, vào lại `/orders/returns/new/<order_id>` (qua nút "Đổi trả hàng" ở trang chi tiết đơn), trả nốt SL còn lại của TẤT CẢ các dòng.
2. Tạo phiếu → vào `/orders/[id]` → badge trạng thái xử lý phải chuyển thành "Hoàn trả", panel "Xử lý đơn hàng" hiện "Đơn hàng đã hoàn trả, không còn bước xử lý tiếp theo."
3. Vào lại `/orders/returns/new` (picker) → đơn này phải **biến mất** khỏi danh sách (đã trả hết, không còn gì để trả).

**K.3. Test validate — trả vượt số lượng còn lại phải bị chặn**
```bash
curl -X POST http://localhost:4000/api/order-returns -H "Content-Type: application/json" \
  -H "Cookie: current_staff_id=<staff_id>" \
  -d '{"order_id":"<order_id>","items":[{"order_item_id":"<order_item_id>","quantity_returned":9999}]}'
```
Phải trả lỗi rõ ràng nêu tên sản phẩm + SL tối đa được trả, **KHÔNG** ghi gì vào DB (tồn kho, `cash_book`, `order_returns` đều không đổi — kiểm tra lại `products.stock` trước/sau để xác nhận rollback đúng).

**K.4. Regression — `/orders/new` không bị ảnh hưởng**
Tạo thử 1 đơn mới bình thường ở `/orders/new`, xác nhận toàn bộ luồng cũ (thêm SP, chiết khấu, thanh toán) vẫn hoạt động y như trước khi có tính năng trả hàng.

**Dọn dẹp**: tính năng này **chưa có API xoá `order_returns`** (theo đúng thiết kế — "trả hàng" là nghiệp vụ thật đã hoàn kho/hoàn tiền, không thiết kế để xoá dễ dàng như 1 bản nháp). Nếu test trên dữ liệu production thật và muốn dọn sạch, phải xoá tay qua SQL (xoá `order_return_items` → `order_returns` → revert `cash_book`/`products.stock`/`stock_movements` đã ghi tương ứng) — cân nhắc kỹ trước khi test trên production, ưu tiên test trên 1 đơn hàng test tự tạo riêng thay vì đơn hàng thật của khách.

---

## Ghi chú khi thêm mục mới vào file này

- Mỗi tính năng mới: thêm 1 mục con dưới session tương ứng (hoặc tạo session mới nếu là ngày khác), theo format: mô tả bước test UI + (nếu có) cách test nhanh qua API/curl + bước dọn dữ liệu test.
- Ưu tiên ghi rõ **điều kiện PASS cụ thể** (số liệu phải khớp gì với gì), không chỉ "kiểm tra hoạt động đúng" chung chung.
- Nếu tính năng có khả năng ảnh hưởng dữ liệu production thật (tạo/sửa/xoá), luôn ghi rõ bước dọn dẹp ở cuối.
