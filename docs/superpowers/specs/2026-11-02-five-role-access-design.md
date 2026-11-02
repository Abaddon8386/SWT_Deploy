# Phân quyền năm vai trò — hiện trạng và thiết kế đề xuất

Ngày: 02/11/2026. Phần đề xuất bên dưới là bản đối chiếu ban đầu. Yêu cầu triển khai mới nhất của người dùng đã thay thế các điểm tương ứng: Manager/Admin tạo Coach/Receptionist; chỉ Admin tạo Manager; Google giữ role nhân sự đã cấp. Phạm vi thực hiện nằm trong `../plans/2026-11-02-staff-account-provisioning.md`. Giữ mã CENTER_MANAGER và alias session STAFF để tương thích dữ liệu, không thực hiện chuyển đổi MANAGER được đề xuất bên dưới.

## Yêu cầu đã xác nhận

Hệ thống cần năm vai trò: Member, Coach, Admin, Receptionist, Manager.
Người dùng đã chọn: Admin quản trị tài khoản/phân quyền; Manager quản lý vận hành trung tâm.
Admin không mặc nhiên kế thừa các quyền nghiệp vụ của Manager.

## Hiện trạng xác nhận từ source

Đây là đối chiếu source và tài liệu, chưa phải kết quả kiểm thử toàn bộ luồng trên database đang chạy.

| Vai trò backend | Vai trò session frontend | Chức năng đã có trong source |
| --- | --- | --- |
| MEMBER | MEMBER | Dashboard; gói tập và subscription (đăng ký, gia hạn, nâng cấp, bảo lưu/tiếp tục); lịch lớp, đặt/hủy chỗ và waitlist; đặt HLV 1:1; thẻ và QR check-in; lịch sử giao dịch/hóa đơn; hồ sơ và chỉ số sức khỏe; giáo án/tiến độ; đánh giá HLV; thông báo; phiếu hỗ trợ; chat với lễ tân/HLV; chatbot. |
| COACH | COACH | Lịch dạy/lịch PT và học viên; điểm danh; soạn/kích hoạt giáo án; ghi nhận đánh giá buổi tập; theo dõi chỉ số sức khỏe theo kiểm tra truy cập hiện có; gợi ý giáo án qua phân hệ AI hiện có; xử lý hỗ trợ; chat với hội viên; đơn nội bộ; hồ sơ chuyên môn; xem đánh giá tháng của bản thân. |
| RECEPTIONIST | STAFF | Tra cứu hội viên; quầy POS, ghi nhận thanh toán/hóa đơn; xử lý gói chờ và gia hạn hộ; duyệt/từ chối bảo lưu; QR cổng, quét thẻ/check-in/check-out; lớp/lịch và thao tác điểm danh theo API; hộp thư hỗ trợ; chat hội viên; đơn nội bộ; hồ sơ lễ tân. |
| CENTER_MANAGER | MANAGER | Quản lý tài khoản, khóa/mở khóa/xóa mềm và phân quyền; danh mục bộ môn/phòng/gói; lớp và lịch; quầy lễ tân/check-in; quản lý giáo án/học viên theo API; duyệt hủy gói; báo cáo/doanh thu; audit log và báo cáo lấp đầy; đánh giá/xếp hạng HLV; duyệt đơn nội bộ; xử lý hỗ trợ; hồ sơ. |
| ADMIN | Chưa hỗ trợ | Chưa được IdentitySeeder tạo như role chính; không được SESSION_ROLE chấp nhận khi đăng nhập; xuất hiện trong một số kiểm tra quyền check-in. Chưa có portal Admin hoàn chỉnh. |

Các chức năng trên mô tả những gì source đang có. Quyền cụ thể còn phụ thuộc phạm vi dữ liệu, ownership và điều kiện nghiệp vụ tại service; không có nghĩa mọi thao tác đã được kiểm chứng end-to-end.

## Các điểm không đồng nhất

1. Backend seed bốn role, trong khi frontend dùng STAFF/MANAGER làm tên thay thế cho RECEPTIONIST/CENTER_MANAGER.
2. UserController và RoleController hiện yêu cầu CENTER_MANAGER, nên Manager đang giữ cả quản trị hệ thống và vận hành.
3. Route nhóm Staff/Coach cho phép nhiều role vào chung các trang; menu và quyền API không hoàn toàn trùng nhau. Được vào route không chứng minh có quyền thực hiện thao tác API.
4. JwtAuthenticationFilter hiện chỉ tạo authority ROLE_<role>. Nhiều API kiểm tra hasRole/hasAnyRole trực tiếp; các permission lưu trong database chưa quyết định quyền truy cập những API đó.
5. homePath hiện đưa Manager vào /manager/users. Sau khi tách phải đổi trang mặc định.
6. Tài khoản bootstrap có username admin nhưng role CENTER_MANAGER. Username không phải role; không tự động đổi tài khoản này thành Admin chỉ dựa trên username.

## Thiết kế đề xuất để duyệt

### Bộ role thống nhất

Dùng năm mã chuẩn MEMBER, COACH, ADMIN, RECEPTIONIST, MANAGER xuyên suốt backend/frontend. Nhãn hiển thị dùng tiếng Việt. Không tạo STAFF hoặc CENTER_MANAGER thành vai trò thứ sáu/thứ bảy.

Đề xuất chọn chuẩn hóa MANAGER thay vì giữ CENTER_MANAGER trong database, vì khớp danh sách người dùng yêu cầu và loại bỏ việc đổi tên giữa hai phía. Phương án giữ CENTER_MANAGER sẽ ít đổi dữ liệu hơn nhưng vẫn duy trì hai tên cho cùng vai trò. Chỉ bổ sung ADMIN vào vài danh sách quyền là chưa đủ để tách hai phạm vi đã yêu cầu.

### Phạm vi sau thay đổi

| Role | Phạm vi |
| --- | --- |
| MEMBER | Giữ các chức năng hội viên hiện có, chỉ dữ liệu được phép của bản thân. Booking/check-in tiếp tục yêu cầu subscription active chưa hết hạn. |
| COACH | Giữ chức năng chuyên môn, học viên/lịch được phép, hỗ trợ và đơn nội bộ. Không có quyền POS, quản trị tài khoản hoặc vận hành toàn trung tâm chỉ vì dùng chung nhóm route. |
| RECEPTIONIST | Giữ quầy lễ tân/POS, tra cứu, thanh toán, gói tập, bảo lưu, check-in, hỗ trợ, chat, lớp/lịch và đơn nội bộ theo phạm vi nghiệp vụ hiện có. Không cấp quyền quản trị tài khoản/phân quyền. |
| ADMIN | Danh sách/chi tiết/tạo/cập nhật/khóa/mở khóa/xóa mềm tài khoản, gán role và cấp/thu hồi permission; hồ sơ bản thân. Không tự động được báo cáo doanh thu, quản lý lớp/gói, POS hoặc check-in. |
| MANAGER | Danh mục, lớp/lịch, giám sát giáo án, vận hành lễ tân/check-in, gói và duyệt hủy, hỗ trợ, báo cáo/doanh thu/lấp đầy, đánh giá HLV, duyệt đơn; hồ sơ bản thân. Bỏ quyền quản trị tài khoản và phân quyền. |

Audit log hiện nằm chung màn hình với báo cáo lấp đầy: đề xuất tách vùng audit sang Admin; Manager giữ báo cáo vận hành/lấp đầy. Phải bảo vệ API tương ứng, không chỉ ẩn menu.

### Đồng bộ kỹ thuật và dữ liệu

- Backend: cập nhật seed role/grant, Spring Security request matcher, annotation, kiểm tra role trong service/repository và các policy liên quan. Giữ DTO, transaction, i18n và ownership.
- Frontend: cập nhật UserSession, xử lý session/login, RoleGuard, menu desktop/mobile, trang mặc định và các điều kiện role trong feature. Tái sử dụng màn hình quản lý tài khoản cho Admin; không thiết kế lại portal.
- Permission: quyền quản trị tách cho Admin. Kiểm tra authority phải thực sự áp dụng cho API quản trị tương ứng; không hiển thị chức năng cấp/thu hồi như thể nó đã có hiệu lực nếu API vẫn chỉ kiểm tra role.
- Role cũ CENTER_MANAGER được chuyển sang MANAGER bằng logic nâng cấp dữ liệu qua JPA, giữ user ID và liên kết hồ sơ. Nếu cả hai role đã tồn tại thì hợp nhất liên kết có kiểm soát. Không viết migration DDL hoặc sửa SQL lịch sử.
- Không tự chuyển user Manager thành Admin; bootstrap Admin riêng qua biến môi trường, không mật khẩu mặc định. Giữ đường khởi tạo Admin trên database đã có dữ liệu để không mất khả năng quản trị sau khi tách quyền.
- Session/token cũ cần có chính sách chuyển tiếp: chuẩn hóa tên cũ ở ranh giới và kiểm tra quyền theo role hiện tại của tài khoản; không tin role cũ trong JWT để tiếp tục cấp quyền quản trị.
- Cập nhật OpenAPI, PROJECT_MASTER_GUIDE và DESIGN.md cho quyết định role/menu mới; đối chiếu backlog RBAC hiện có, không tự tạo Jira key.

### Kiểm chứng bắt buộc khi triển khai

1. Test quyền API cho đủ năm role, bao gồm trường hợp bị từ chối: Manager không quản lý user/role; Admin không POS/check-in/vận hành.
2. Test quyền quản trị thực sự thay đổi khi grant/revoke permission; user bị khóa/xóa mềm hoặc đổi role không giữ quyền cũ qua token.
3. Test dữ liệu cũ và bootstrap: giữ liên kết khi chuyển CENTER_MANAGER, chạy lại không nhân đôi dữ liệu, không tự thăng quyền Admin.
4. Test đăng nhập, redirect, menu, route trực tiếp và hồ sơ cho năm role; đăng ký công khai chỉ tạo Member.
5. Chạy test backend/frontend, build/lint liên quan và các kiểm tra database policy bắt buộc. Chỉ xác nhận nâng cấp database thật khi đã chạy trên schema Supabase dev/test biệt lập.

## Nguồn chính đã đối chiếu

- apps/api/src/main/java/com/swp391/scms/users/IdentitySeeder.java
- apps/api/src/main/java/com/swp391/scms/users/UserController.java
- apps/api/src/main/java/com/swp391/scms/users/RoleController.java
- apps/api/src/main/java/com/swp391/scms/security/JwtAuthenticationFilter.java
- apps/api/src/main/java/com/swp391/scms/security/SecurityConfig.java
- Các controller/service scheduling, attendance, membership, coaching, finance, reports, support, chat, operations, health và notifications.
- apps/web/src/shared/api/client.ts
- apps/web/src/app/router.tsx
- apps/web/src/features/portal/portalNavigation.ts
- docs/PROJECT_MASTER_GUIDE.md (mục roles)
