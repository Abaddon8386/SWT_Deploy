# Audit giao diện cửa hàng SÖL — 06/11/2026

Phạm vi: landing ProductShelf, danh sách/chi tiết sản phẩm, giỏ hàng, checkout, đơn hàng/sổ địa chỉ hội viên, đơn hàng lễ tân, sản phẩm/danh mục/form biên tập quản lý. Thực hiện theo DESIGN.md và các skill `.agents`: systematic-debugging, redesign-existing-projects, ui-ux-pro-max, ponytail, verification-before-completion, requesting-code-review. Backlog hiện chưa có Jira key riêng cho cửa hàng; audit này theo yêu cầu trực tiếp của người dùng.

## Các lỗi đã sửa

| Khu vực | Nguyên nhân và kết quả sửa |
| --- | --- |
| Giỏ hàng | Nội dung dồn lên đầu, CTA chưa thống nhất, tên/giá chen nhau. Dùng layout flex có vùng danh sách cuộn riêng, tổng tiền/CTA cuối khung, giá xuống hàng và nút salmon đủ vùng chạm. |
| Điện thoại xoay ngang | Reviewer tái hiện vùng danh sách chỉ còn 32px tại 844×390, 8px tại 844×320; body bị clip. Giỏ chuyển sang cuộn toàn bộ khi chiều cao ≤520px, kiểm chứng cuộn tới đủ nút số lượng và thanh toán. |
| Giỏ hàng portal | Nút xem giỏ đi thẳng checkout. Header và thanh tóm tắt mở CartDrawer dùng chung, Escape trả focus về nút mở. Checkout cũng có nút sửa giỏ. |
| Báo giá giỏ hàng | Hàng đã xóa còn hiện khi chờ request; tạm tính cũ hoặc 0đ gây hiểu nhầm. Xóa hàng khỏi UI ngay, hiện đang tính/cập nhật hoặc “—”, khóa checkout khi chưa có báo giá hợp lệ. |
| Bảng portal | Bảy vị trí dùng `portal-table-wrap` không có CSS, làm tràn document tới 514px ở 320px. Chuyển sang `portal-table-wrapper`, cuộn nội bộ và hỗ trợ focus bàn phím. |
| Biên tập sản phẩm | Lưới có min-width cố định, preview dinh dưỡng luôn hai cột. Cho cột co theo container, xếp preview xuống dưới trên tablet/mobile. |
| Bộ lọc mục tiêu | Kế thừa `fit-pricing-switch`, kéo theo nền sáng và chiều rộng của bộ chọn gói tập. Bỏ class không đúng chức năng, dùng CSS shop hiện hành. |
| Mua nhanh | Dialog mặc định hẹp, ảnh quá cao trên mobile, nhãn lựa chọn lặp. Thêm kích thước dialog riêng, giới hạn ảnh mobile, giữ nút mua dễ tiếp cận. |
| Ảnh sản phẩm | Tự gán ảnh sản phẩm khác khi thiếu ảnh; ảnh portal bị crop. Dùng SVG packshot theo dạng bào chế khi thiếu/lỗi ảnh, giữ object-fit contain. |
| Lỗi tải dữ liệu | Production tự thay catalog rỗng/lỗi và báo giá lỗi bằng dữ liệu mẫu. API giữ nguyên kết quả rỗng và truyền lỗi; trang chi tiết phân biệt 404 với lỗi mạng có thử lại. |
| Tìm kiếm/tải thêm | Debounce dùng bộ lọc cũ; response tải thêm đến muộn chen vào kết quả mới; lỗi tải thêm xóa mất danh sách đang xem. Cập nhật URL từ giá trị mới nhất, hủy request cũ, giữ thẻ hiện có và thử lại trang lỗi. |
| Checkout | Báo giá đến muộn ghi đè hình thức nhận mới; lỗi mạng hiện 0đ và thiếu thử lại. Chỉ nhận response mới nhất, ẩn tổng chưa xác định, có thử lại và hướng dẫn sửa giỏ không đủ tồn kho. |
| Bàn phím/mobile | Bổ sung focus rõ cho lựa chọn/số lượng, nhãn xóa theo từng sản phẩm, nút 44px và input số lượng mobile 16px. |

## Kiểm chứng

- `npm --prefix apps/web test -- src/features/shop src/features/landing`: **89/89**, 22 file test. Có 9 regression case mới; các lỗi logic đều được tái hiện bằng test thất bại trước khi sửa. Một số test landing ghi ECONNREFUSED từ request phụ ngoài assertion; Vitest không có test thất bại.
- `npm --prefix apps/web run build`: pass. `npm --prefix apps/web run lint`: pass.
- `verify-shop-ui.cjs`: pass luồng catalog → chọn biến thể → giỏ → login → checkout VNPay giả lập → đơn hàng; thêm xử lý đơn lễ tân và form quản lý.
- Matrix **320/390/768/1024/1440/1920/2560px × Dark/Light** cho bảy màn hình chính: không tràn document, không lỗi JavaScript. Kết quả máy đọc: [after/findings.json](after/findings.json).
- States **390/1440px × Dark/Light**: giỏ trống, báo giá lỗi/thử lại, 30 dòng có tên dài, số lượng 20, địa chỉ mới, danh mục, đơn hàng/chi tiết/dialog lễ tân: [states/findings.json](states/findings.json).
- Landscape **844×320 × Dark/Light**: cả thao tác số lượng và thanh toán đều cuộn tới được: [landscape/findings.json](landscape/findings.json).
- `verify-public-ui.cjs` và `verify-public-animation.cjs`: pass, gồm native scroll, reveal hai chiều, reduced motion, form và OTP.
- `verify-ux-consistency.cjs`: pass 13 route, 5 chiều rộng dashboard, dialog và loading/empty/error; bổ sung fixture `/reception/trials` còn thiếu cho script theo chức năng trial hiện có.
- Review độc lập tìm một lỗi P2 về chiều cao giỏ trên màn hình ngang; đã sửa, chạy landscape check và reviewer xác nhận khắc phục. Không có finding còn lại.

Toàn bộ browser check dùng API fixture, không ghi database và không giao dịch thật. Audit này xác minh UI/luồng frontend; không thay thế kiểm thử tích hợp backend và thanh toán với dịch vụ thật.

## Ảnh tiêu biểu

- [Giỏ trước sửa](screenshots/cart-before.png), [giỏ mobile tối](screenshots/cart-dark-mobile.png), [giỏ mobile sáng](screenshots/cart-light-mobile.png).
- [Giỏ nhiều hàng](screenshots/cart-many.png), [lỗi báo giá](screenshots/cart-error.png), [giỏ trống](screenshots/cart-empty.png), [màn hình ngang thấp](screenshots/cart-landscape.png).
- [Catalog portal mobile](screenshots/member-shop.png), [mua nhanh](screenshots/quick-buy.png), [catalog public](screenshots/products-light-mobile.png), [checkout](screenshots/checkout.png).
- [Biên tập sản phẩm](screenshots/manager-editor.png), [chi tiết đơn hàng](screenshots/order-detail.png), [dialog lễ tân](screenshots/staff-dialog.png), [địa chỉ](screenshots/address-dialog.png).

## Chạy lại browser audit

Chạy Vite trên `http://127.0.0.1:5173`, cung cấp `playwright-core` qua NODE_PATH và Chrome qua CHROME_PATH. Các biến chỉ thay đổi thư mục output và kích thước, không thay API thật:

```powershell
$env:SHOP_UI_OUTPUT = 'docs/qa/shop-ui-audit-2026-11-06/after'
$env:SHOP_AUDIT_MATRIX = '1'
node scripts/verify-shop-ui.cjs

$env:SHOP_UI_OUTPUT = 'docs/qa/shop-ui-audit-2026-11-06/states'
$env:SHOP_AUDIT_STATES = '1'
$env:SHOP_AUDIT_WIDTHS = '390,1440'
node scripts/verify-shop-ui.cjs

$env:SHOP_UI_OUTPUT = 'docs/qa/shop-ui-audit-2026-11-06/landscape'
$env:SHOP_AUDIT_WIDTHS = '844'
$env:SHOP_AUDIT_HEIGHT = '320'
node scripts/verify-shop-ui.cjs
```

Để chạy luồng mua hàng gốc, bỏ SHOP_AUDIT_MATRIX/SHOP_AUDIT_STATES/SHOP_AUDIT_HEIGHT trước khi chạy lại script. Các lệnh xuất lại toàn bộ ảnh; thư mục screenshots chỉ giữ bộ ảnh tiêu biểu được chọn cho lần audit này.
