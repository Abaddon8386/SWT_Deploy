# Điểm nhấn neon Dark — 05/11/2026

Giữ nền charcoal, font và bố cục SÖL; thêm ánh salmon sát mép cho điều hướng đang chọn, nút chính, thẻ hội viên và gói nổi bật. Các thẻ thường giữ bề mặt phẳng. Không thêm thư viện, JavaScript animation hoặc text-shadow.

## Ảnh kiểm chứng

- Dashboard desktop: [trước](before-member-dashboard-1440.png), [sau](after-member-dashboard-1440.png).
- [Dashboard mobile](after-member-dashboard-390.png), [Light](after-dashboard-light-1440.png).
- [Đăng nhập desktop](after-login-1440.png), [mobile](after-login-390.png).
- [Gói nổi bật](after-pricing-1440.png), [dialog quản lý](after-manager-dialog-1440.png).

Ảnh dùng API giả lập; tên, giá và thông tin hội viên trong ảnh là dữ liệu kiểm chứng. Không gọi thao tác ghi lên API thật. Widget chat trong ảnh thuộc thay đổi song song trong workspace, không nằm trong phần chỉnh neon.

## Kết quả

- `npm --prefix apps/web run build`: đạt.
- `npm --prefix apps/web run lint`: đạt.
- Kiểm chứng trực tiếp bằng Chrome/Playwright với API giả lập: đạt 9 trường hợp route/kích thước. Dashboard kiểm tra tại 390/768/1440/1920/2560px, landing và đăng nhập tại 390/1440px; không tràn ngang, dashboard desktop giữ bốn cột.
- Tương phản chữ phụ trên nền token được đo: portal `#cbc7c3` trên `#303030` đạt **7,85:1** (trước: 6,70:1); public trên `#2b2b2b` đạt **8,43:1**. Đây là phép đo các token đã đổi, không phải kiểm toán tương phản toàn bộ ứng dụng.
- Chuyển Light giữ `--portal-muted: #68645f` và không có glow mới ở rail đang chọn.
- Reduced motion: thẻ hội viên không có animation hoặc dịch chuyển khi hover; focus input còn rõ.
- Tab đang chọn, form và native dialog của Danh mục vận hành: nền Dark đúng, focus rõ, Escape đóng dialog.
- Reveal của gói tập phát lại sau khi rời và quay về viewport; đổi reduced motion trực tiếp giữ gói hiển thị; menu mobile mở và đóng khi chọn liên kết. Không có lỗi JavaScript trong lượt kiểm chứng trực tiếp.
- Dữ liệu đo: [trước](before-report.json), [sau](after-report.json).

## Bổ sung glow chạy cho nút màu

Theo yêu cầu tiếp theo, viền sáng của nút màu trong Dark chạy chậm theo vòng 7,2 giây; hover/focus tăng sáng, bấm nén nhẹ. Lớp mask giữ phần giữa nút rỗng để không phủ lên nhãn. Nút đỏ giữ sắc đỏ; không thêm chuyển động cho card/nền.

- Build và lint sau thay đổi: đạt.
- Chrome/Playwright: đạt 6 trường hợp desktop/mobile (390/1440px), gồm nút portal, đăng nhập và vòng mũi tên landing. Góc gradient thay đổi giữa hai mẫu cách nhau 250ms; kích thước nút ổn định, document không tràn ngang.
- Native disabled và aria-disabled ngừng chạy. Light và reduced motion không chạy; bật lại chế độ chuyển động thì hiệu ứng tiếp tục. Vòng mũi tên trên ảnh HLV giữ vị trí absolute.
- Đăng nhập vẫn bấm được và hiện lỗi API giả lập đúng chỗ; không có lỗi JavaScript.
- [Dữ liệu kiểm chứng animation](animated-buttons-report.json), [ảnh đăng nhập mobile](animated-login-390.png), [ảnh portal desktop](animated-portal-1440.png).

## Giới hạn của script có sẵn

- `scripts/verify-public-ui.cjs` dừng ở dòng 47: kiểm tra số `.fit-site--landing` ngay sau navigation, trước khi route tải xong (`0 !== 1`). Script còn dùng tab “Tất cả gói tập” đã được thay bằng “Gói 1 tháng”.
- `scripts/verify-public-animation.cjs` qua kiểm tra replay hai chiều, partial visibility, cuộn native, carousel HLV và gallery; dừng tại dòng 76 khi đợi 6 buổi học. Fixture có nhóm “Movement & Core” không thuộc danh mục bộ môn chuẩn và bị lọc, nên trang hiện 4 buổi.
- `scripts/verify-ux-consistency.cjs` dừng khi đợi `.portal-v2`: fixture chưa cung cấp `/auth/me` hợp lệ, nên bước đồng bộ phiên đưa trình duyệt về đăng nhập. Lượt kiểm chứng trực tiếp dùng `{ username: 'review', role: 'MEMBER' }` (và `CENTER_MANAGER` ở catalog) để kiểm tra đúng portal.
- Các luồng trực tiếp nêu trên được kiểm chứng riêng theo UI hiện hành. Không sửa logic nghiệp vụ hoặc các script lịch sử trong phạm vi chỉnh neon.
