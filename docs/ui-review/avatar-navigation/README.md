# Menu tài khoản góc phải — 05/11/2026

Cuối sidebar chỉ giữ liên kết về landing. Hồ sơ và đăng xuất dùng menu avatar topbar cho Member, Lễ tân, HLV, Quản lý và Admin; avatar hiện cả mobile. Ví chỉ hiện cho Member. Bỏ nút đăng xuất trùng trong menu Thêm; giữ dialog xác nhận đăng xuất.

- Build và lint frontend: đạt.
- 26 kiểm thử trong AppLayout và PortalShell mobile/session/loading: đạt.
- Chrome với API giả lập: 20 trường hợp (5 vai trò × 320/390/768/1440px) đạt. Avatar hiển thị, vùng chạm ≥44px, dropdown nằm trong viewport, không tràn ngang. Escape đóng và trả focus; nhấn ngoài đóng; đăng xuất có xác nhận, hủy giữ phiên. Không có lỗi JavaScript.
- [Dữ liệu kiểm chứng](browser-report.json).
- Ảnh: [Member desktop](member-1440.png), [Member mobile](member-390.png), [Admin desktop](admin-1440.png).

Dữ liệu trong ảnh là giả lập. Không thao tác tài khoản hoặc ví thật.
