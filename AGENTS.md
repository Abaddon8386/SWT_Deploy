# Hướng dẫn cho contributor và coding agent

Quy tắc chi tiết về kiến trúc backend, ba lớp, SOLID, IoC, JPA và Supabase PostgreSQL nằm tại `docs/rules/backend-architecture.md`; mọi contributor và agent làm backend phải tuân theo cả hai tài liệu.

## Bối cảnh

- Nguồn nghiệp vụ: `docs/PROJECT_MASTER_GUIDE.md`; schema triển khai được định nghĩa bằng JPA Entity, `db/databaseschema.sql` chỉ là tham chiếu cấu trúc lịch sử; backlog: `docs/plans/AGILE_SCRUM_JIRA_PLAN.md`.
- Stack cố định: React + TypeScript ở `apps/web`, Java 21 + Spring Boot 3 ở `apps/api`, database Supabase PostgreSQL.
- Mọi môi trường chạy API dùng profile `supabase`, JDBC PostgreSQL qua TLS và thông tin kết nối từ biến môi trường. Không thêm lại database/profile/driver SQL Server, H2 hoặc MySQL. Test DB thật dùng project Supabase dành cho dev/test và schema biệt lập.
- Ngoại lệ vận hành: VPS tự host chạy `docker compose` với PostgreSQL cục bộ (container 1Panel) chỉ qua `.env` (không commit); code và profile vẫn là `supabase`. Không đổi code/compose/profile để "đưa về Supabase" hay thêm profile `local`; xem `docs/DOCKER_COMPOSE.md`. CI/CD (Render, Vercel) dùng Supabase qua secret của chúng.

## Cách làm một ticket

1. Xác định Jira key, owner màn hình và acceptance criteria trong backlog.
2. Nếu đổi API, cập nhật OpenAPI ở `docs/api-contracts/` trước hoặc cùng PR.
3. Backend: giữ package-by-feature, dùng DTO, validation, service transaction và global error handler. Không trả entity trực tiếp. Bắt buộc bổ sung message key i18n (`messages_vi.properties`, `messages_en.properties`) cho thông báo thành công hoặc lỗi mới.
4. Frontend: đặt UI trong `features/<feature>`, page chỉ compose feature; luôn có loading, empty và error state.
5. Chạy test/lint phù hợp trước khi mở PR và ghi Jira key trong mô tả PR.

## Quy chuẩn thiết kế frontend

- Bắt buộc đọc [DESIGN.md](DESIGN.md) trước khi tạo, sửa hoặc review UI. Đây là quy chuẩn thiết kế chính đang có hiệu lực.
- Trang công khai (`/`, `/login`, `/register`, OTP và trang công khai mới): **SÖL Fitness charcoal–salmon**, font Plus Jakarta Sans, bố cục full width không có viền ngoài; scrollbar salmon trên nền than. Tái sử dụng `PublicLayout`, `AuthLayout` và `fitness-public.css`.
- Quyết định animation mới nhất: **animation xuất hiện của từng component, cuộn dọc native**. Hiệu ứng lặp lại khi component rời rồi quay vào viewport ở cả hai chiều; không reset khi component vẫn còn nhìn thấy một phần. Không dựng lại slide trang ngang–dọc, fullpage scroll hijacking hoặc khóa wheel/touch/keyboard. Tôn trọng `prefers-reduced-motion` và focus bàn phím.
- Theo yêu cầu mới nhất: portal phủ toàn viewport, đồng bộ màu **charcoal–salmon** và màu nút với landing. Giữ nguyên tổ chức component, dashboard bốn cột, sidebar icon, ảnh/thẻ, thứ tự nội dung, cỡ chữ và khoảng cách bên trong. Không đổi thành dashboard hai cột hoặc sidebar có nhãn thường trực.
- Không khôi phục theme Quiet Luxury/serif/nền kem cho trang công khai từ file CSS cũ, ảnh chụp cũ, knowledge graph hoặc gợi ý skill. Hồ sơ tại `docs/qa/portal-redesign*` chỉ là lịch sử đối với landing/login.
- Khi người dùng thay đổi quyết định thiết kế, cập nhật `DESIGN.md` cùng phạm vi liên quan để agent sau không tiếp tục theo hướng cũ.

## Bất biến nghiệp vụ và kiến trúc dữ liệu

- **Code-First & ORM Polymorphism bắt buộc:** Toàn bộ bảng, cột, khóa và quan hệ định nghĩa qua Java Entity; chuyển đổi CSDL không viết lại DDL thủ công mà dùng Hibernate ORM đẩy thẳng (`ddl-auto: update`).
- **Trigger đa hình:** Các trigger nghiệp vụ bắt buộc (capacity, trùng lịch) được nạp tự động qua `DatabaseTriggerProvider` và `PostgreSqlTriggerProvider` sau Hibernate. Chỉ hỗ trợ Supabase PostgreSQL; không tạo adapter cho database khác.
- **CI bắt buộc:** `DatabasePolicyTest`, `DatabaseProfilesTest` và `scripts/test-database-config.ps1` kiểm tra chính sách database. `db/databaseschema.sql` và ba migration V1–V3 là tài liệu lịch sử; không sửa hoặc chạy chúng để triển khai, không thêm migration DDL mới.
- **Đa ngôn ngữ (i18n bắt buộc):** Hệ thống hỗ trợ đa ngôn ngữ qua `Accept-Language` (mặc định `vi`). Bất kỳ tính năng backend mới nào khi thêm thông báo/mã lỗi bắt buộc phải cập nhật đồng thời cả `i18n/messages_vi.properties` và `i18n/messages_en.properties`, dùng `MessageService` để resolve.
- Chỉ Member có subscription `active` và chưa hết hạn được booking/check-in.
- Database trigger kiểm tra capacity và trùng lịch là bắt buộc. Map lỗi SQL đó thành lỗi HTTP dễ hiểu, không vô hiệu trigger.
- `users.deleted_at IS NOT NULL` không được xác thực hoặc hiện trong list mặc định.
- Backend luôn kiểm tra role; ẩn menu ở frontend không phải là authorization.

## Phạm vi MVP

Không tự thêm mobile native, payment gateway thật, AI provider thật, PDF/export hoặc đổi database nếu ticket không nêu rõ.
