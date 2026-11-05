# Cửa hàng “Sản phẩm” — Phần việc còn lại

> Bổ sung cho [`2026-11-05-supplement-shop.md`](2026-11-05-supplement-shop.md). Rà soát và hoàn thiện ngày 05/11/2026 trên nhánh `main`, đối chiếu code thật với plan gốc và các yêu cầu bổ sung của người dùng.

## Tình trạng hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Backend Task 1–10 (code + 20 file test) | **Xong** — Đã chạy `./mvnw -q test` bằng JDK 21.0.13: **173 test classes, 1.183 tests run, 0 failures, 0 errors, 25 skipped** (skip các test tích hợp cần `SCMS_POSTGRES_TEST_URL`) |
| Frontend Task 11–18 + Mua hàng trong Portal (Desktop & Mobile) | **Xong** — `tsc -b` PASS, `eslint --max-warnings=0` PASS, `vitest` **803/803 PASS**, `npm run build` PASS |
| Yêu cầu bổ sung mới nhất | **Xong** — (1) Sản phẩm xuất hiện và mua được trong Portal Hội viên (`/member/orders?tab=shop`, `/member/products`) trên cả Desktop & Mobile 390×844; (2) Hình ảnh sản phẩm thật tải từ web vào `apps/web/public/images/shop/*.jpg` & `apps/api/src/main/resources/shop-seed-images/*.jpg`; (3) Quản lý sửa thông tin & giá biến thể, hiện cột **Giá bán**, nhãn **Sắp hết** khi tồn `< 10` (`<= 9`) và nhãn **Mới** khi tạo trong vòng `2` ngày |
| Task 19 (UI verify, tài liệu, Graphify) | **Xong** — 28 ảnh chụp màn hình thật trong `docs/ui-review/shop/`, `verify-shop-ui.cjs` PASS, `verify-public-ui.cjs` PASS, `verify-public-animation.cjs` PASS, AST `graphify-out/` cập nhật 733 nodes / 1.384 edges |
| Commit | Chờ người dùng cung cấp Jira key và cho phép commit/PR |
| Checkbox trong plan gốc | Đã tick toàn bộ các bước code/test/verify đã hoàn thành |

---

## 1. Chặn trước khi merge (bắt buộc)

### 1.1 Chạy test backend
- [x] Dùng JDK 21 cục bộ (`jdk-21.0.13+9`).
- [x] `cd apps/api && ./mvnw -q test` — toàn bộ xanh (**1.183 tests run, 0 failures, 0 errors**), đặc biệt:
  - [x] 20 test trong `apps/api/src/test/java/com/swp391/scms/shop/**`
  - [x] Test VNPay/Wallet/Invoice cũ sau khi `CheckoutRequest` thêm `productOrderId` (`VnpayPaymentServiceTest` …)
  - [x] `DatabasePolicyTest`, `DatabaseProfilesTest`
- [x] Sửa mọi lỗi biên dịch/test phát sinh.

### 1.2 Kiểm thử PostgreSQL thật (Review Focus 1)
- [ ] Đặt `SCMS_POSTGRES_TEST_URL` trỏ tới project Supabase dev/test, schema biệt lập (chưa có biến môi trường `SCMS_POSTGRES_TEST_URL` trên máy hiện tại).
- [ ] Chạy `ProductOrderPostgreSqlTest`, xác nhận **không bị skip**:
  - [ ] (a) hai luồng song song mua biến thể tồn 1 → đúng 1 đơn thành công, tồn = 0, đơn kia 409 `PRODUCT_OUT_OF_STOCK`
  - [ ] (b) `stock = -1` vi phạm `ck_product_variants_stock_nonneg`
  - [ ] (c) khởi động trên bảng `payments` cũ → thêm cột `product_order_id`, dữ liệu cũ giữ nguyên
  - [ ] (d) RLS bật trên mọi bảng shop, kể cả `product_goals`

### 1.3 Kiểm chứng các Review Focus còn lại bằng test backend đã chạy
- [x] RF2: lặp `clientRequestId` trả đúng đơn cũ (200), không tạo đơn thứ hai (`ProductOrderServiceTest`).
- [x] RF3: giá/tồn đổi → 409 `ORDER_PRICE_CHANGED` (`ProductOrderServiceTest`).
- [x] RF4: VNPay báo thành công muộn sau khi đơn hết hạn → scheduler bỏ qua khi còn ân hạn; nếu đã hủy thì tiền về Ví (`ProductOrderExpirySchedulerTest`, `VnpayPaymentServiceTest`).

### 1.4 Phê duyệt và quy trình
- [ ] **Phong** review và xác nhận phần sửa Finance (Task 7): `Payment`, `VnpayDtos`, `VnpayPaymentService`, `VnpayPaymentGuard`, `InvoiceService`.
- [ ] Xác nhận với **Tài** việc tách `common/image/ImageDataUrlValidator` (Task 2), nếu `ProfileService` đã bị chạm tới.
- [ ] Lấy **Jira key** từ người dùng. Không tự đặt key.

### 1.5 Script chính sách database
- [x] Đã kiểm chứng toàn bộ 7 quy tắc trong `scripts/test-database-config.ps1` qua `DatabasePolicyTest` và `DatabaseProfilesTest` (PASS).

---

## 2. Task 19 còn thiếu

### 2.1 Ảnh kiểm chứng UI (`docs/ui-review/shop/`)
Đã chụp đủ **28 ảnh thật** và kiểm tra trực quan từng ảnh:
- [x] `manager-products-dark-1440.png`, `manager-products-light-1440.png`
- [x] `manager-product-editor-dark-1440.png`
- [x] `member-orders-dark-1440.png`, `member-orders-light-1440.png`
- [x] `member-shop-dark-1440.png`, `member-shop-dark-390.png` (giao diện mua sản phẩm trong Portal cho Desktop & Mobile 390×844)
- [x] Ảnh landing tại 390, 768, 1440 và 1920 cho cả dark và light (`landing-shelf-{dark,light}-{390,768,1440,1920}.png`)
- [x] Ảnh `checkout` theme sáng (`checkout-light-1440.png`) và mobile 390 (`checkout-dark-390.png`)
- [x] Cập nhật `scripts/verify-shop-ui.cjs` để chụp các ảnh trên, chạy lại `node scripts/verify-shop-ui.cjs` → **PASS (11/11 checks)**, tự xem lại từng ảnh.

### 2.2 Sửa mục “Verification evidence” trong plan gốc
- [x] Cập nhật danh sách đúng **28 ảnh thật** trong `docs/ui-review/shop/`.
- [x] Sửa tên file dữ liệu hành chính thành `apps/api/src/main/resources/geo/vn-admin-units.json`.
- [x] Ghi số test backend thật (**1.183 tests run, 0 failures, 25 skipped**) và frontend thật (**125 test files, 803 tests passed**).

### 2.3 Script public cũ
- [x] Cập nhật `scripts/verify-public-ui.cjs` và `scripts/verify-public-animation.cjs` cho khớp với nhãn `"Gói 1 tháng"` hiện tại và chạy lại cả 2 script → **PASS 100%**.

### 2.4 VNPay Sandbox thật (Step 4)
- [ ] Theo `docs/VNPAY_SANDBOX.md`: chạy backend có URL callback công khai, đặt một đơn online, thanh toán thẻ test (cần môi trường mạng + cấu hình VNPay Sandbox thật).

### 2.5 Graphify
- [x] Đã cập nhật AST graph trong `graphify-out/graph.json` và `graphify-out/GRAPH_REPORT.md` (**733 nodes, 1.384 edges**).

---

## 3. Lỗi nhỏ đã phát hiện khi rà soát

- [x] `apps/api/src/main/resources/application.yml` → `app.shop.pickup-address` đã đổi sang địa chỉ 2 cấp hợp lệ: `"120 Hai Bà Trưng, Phường Sài Gòn, Thành phố Hồ Chí Minh — quầy lễ tân"`, khớp với `vn-admin-units.json`.

---

## 4. Commit và PR

- [x] Tick các checkbox đã hoàn thành trong plan gốc.
- [ ] Commit theo nhóm sau khi có Jira key từ người dùng.
- [ ] Chỉ push/mở PR khi đã có Jira key **và** người dùng cho phép. Ghi Jira key trong mô tả PR.
