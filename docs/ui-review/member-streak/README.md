# Trang streak tập luyện — 05/11/2026

Menu avatar của Member chỉ có liên kết mở `/member/streak`; biểu đồ nằm trên trang riêng. Tham chiếu [SVG người dùng gửi](https://raw.githubusercontent.com/longurara/longurara/output/snake-dark.svg), chuyển sang charcoal–salmon, lưới 13 tuần và rắn 5 đoạn chạy bằng CSS. Mobile giới hạn lưới cao 144px, card padding 16px. Không thêm thư viện hoặc thay schema.

`GET /api/v1/check-in/streak` chỉ cho Member xem chính mình, không cache. Chỉ tính các ngày có GRANTED trước giờ hiện tại; nhiều lượt trong cùng ngày tính một. Mốc ngày theo Asia/Ho_Chi_Minh. Chưa tập hôm nay vẫn giữ chuỗi kết thúc hôm qua; quay lại sau ngày nghỉ bắt đầu từ 1. Kỷ lục tính trên toàn bộ lịch sử; lưới chỉ chứa ngày tập thuộc 13 tuần gần nhất.

- 34 kiểm thử service/quyền check-in cuối cùng: đạt. Kiểm thử toàn backend cũng đạt; 34 kiểm thử PostgreSQL thật bị skip do không có môi trường dev/test được cấu hình.
- 734 kiểm thử frontend toàn dự án: đạt sau khi cập nhật vị trí nút đăng xuất và liên kết streak.
- Build và lint được kiểm tra trước khi commit.
- Chrome với API giả lập: đạt tại 320×640, 390×844, 768×1000, 1440×1000; rắn thực sự di chuyển và nằm trong lưới, không tràn ngang. Light, reduced motion, loading/empty/error/retry và ẩn streak ở vai trò khác đều đạt. Không có lỗi JavaScript.
- Ảnh: [mobile](streak-390.png), [desktop](streak-1440.png), [Light](streak-light-1440.png), [trạng thái rỗng](streak-empty.png). [Dữ liệu đo](browser-report.json).

Ảnh và lượt kiểm chứng trình duyệt dùng dữ liệu giả lập, không đọc hoặc ghi thông tin hội viên thật. Chưa xác minh truy vấn trên Supabase thật. Cập nhật knowledge graph bị bộ duyệt tự động từ chối vì quét rộng repository ngoài phạm vi tính năng; không chạy lại hoặc dùng cách vòng qua.
