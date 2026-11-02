# Bàn giao: Tính năng đặt sân (Tennis, Cầu lông, Bơi lội)

> Dành cho coding agent tiếp nhận. Đọc cùng `AGENTS.md`, `docs/rules/backend-architecture.md`, `DESIGN.md` (chỉ là bản ghi chép, không phải ràng buộc) và `docs/PROJECT_MASTER_GUIDE.md`.
> Ngày lập: 02/11/2026. Trạng thái: đặc tả này đã được triển khai theo [kế hoạch triển khai](2026-11-02-court-booking-implementation.md) (người dùng duyệt cả tám mặc định ở mục 3 và cả hai giai đoạn). Bằng chứng kiểm thử nằm cuối file kế hoạch; riêng test trigger với Supabase thật (`CourtBookingPostgreSqlTest`) chưa chạy vì thiếu `SCMS_POSTGRES_TEST_URL`. Một số chi tiết triển khai khác đề xuất ở dưới (ví dụ route availability dùng `{id}`, thêm mã lỗi `COURT_BOOKING_INVALID_SLOT/FORBIDDEN/INVALID_COURT`) — kế hoạch triển khai là nguồn đúng.

## 1. Mục tiêu

Hiện hội viên chỉ đặt chỗ theo **buổi lớp có lịch** (đặt lớp, hàng chờ) và đặt PT 1:1. Cần thêm **đặt sân/làn theo khung giờ** cho các bộ môn có sân: **Tennis, Cầu lông, Bơi lội (làn)**. Gym, Boxing tiếp tục chỉ dùng lớp.

Nguyên tắc từ người dùng (02/11/2026): giữ UI gọn, tập trung vào việc chính, không thêm số liệu hay nội dung quảng bá không có thật; chỉ làm **logic đặt lịch/đặt sân**.

## 2. Phạm vi MVP

Trong phạm vi:
- Hội viên xem sân còn trống theo ngày, đặt, xem và hủy lượt đặt của mình.
- Chống trùng giờ ở cấp cơ sở dữ liệu (trigger), kể cả trùng với **buổi lớp** đang dùng cùng phòng.
- Chỉ hội viên có gói `active` còn hạn mới đặt được (bất biến nghiệp vụ trong `AGENTS.md`).
- Lễ tân/quản lý xem danh sách đặt sân theo ngày và hủy hộ (giai đoạn 2, xem mục 9).

Ngoài phạm vi (theo `AGENTS.md`, không tự thêm): cổng thanh toán thật, tính phí theo giờ, AI, PDF/export, app mobile native, đổi database.

## 3. Điều cần xác nhận với người dùng TRƯỚC khi code

Các mặc định dưới đây là **đề xuất**, chưa được duyệt. Hỏi người dùng (một lần, gộp câu hỏi) rồi mới triển khai.

| # | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| 1 | Độ dài một lượt đặt | Khung cố định 60 phút, bắt đầu đúng giờ chẵn |
| 2 | Giờ mở cửa mỗi sân | Lấy theo cấu hình sân (mới), không hard-code; mặc định 06:00–22:00 chỉ để seed |
| 3 | Có tính phí/lượt không | Không: đặt sân nằm trong quyền lợi của gói, **không** phát sinh thanh toán |
| 4 | Giới hạn mỗi hội viên | Tối đa 2 lượt đang hiệu lực mỗi ngày, đặt trước tối đa 7 ngày |
| 5 | Hủy | Hội viên hủy được trước giờ bắt đầu ≥ 2 giờ (cùng tinh thần "đặt trước 2 tiếng" của PT 1:1) |
| 6 | Bơi lội có đặt theo làn không | Có, mỗi làn là một "sân" (room); nếu không cần thì bỏ Bơi lội khỏi MVP |
| 7 | Gói nào được đặt sân | Mọi gói active; nếu có gói không gồm quyền này thì cần field trên gói (hỏi trước) |
| 8 | Lễ tân đặt hộ hội viên | Giai đoạn 2 |

## 4. Hiện trạng code liên quan (đã kiểm chứng)

Backend (`apps/api/src/main/java/com/swp391/scms`):
- `facilities/entity/Room.java`: bảng `rooms` gồm `name`, `location`, `capacity`, `status` (`available|maintenance|closed`). **Chưa gắn bộ môn**, nên chưa biết phòng nào là sân Tennis.
- `facilities/service/DisciplineService`, `CatalogSeeder`: bộ môn chuẩn (Gym, Bơi lội, Boxing, Tennis, Cầu lông) được seed/đổi tên khi API khởi động. Bộ môn không có API xóa.
- `resources/db/triggers/postgresql-triggers.sql`: nơi đặt trigger. Mẫu cần theo:
  - `scms_check_session_conflict()` / `trg_sessions_check_conflict`: dùng `pg_advisory_xact_lock` theo `room:<id>` rồi kiểm tra chồng giờ `NEW.start_time < existing.end_time AND NEW.end_time > existing.start_time`, lỗi `ERRCODE = '23P01'` kèm `CONSTRAINT`.
  - `scms_require_active_membership_for_enrollment()` / `trg_enrollments_check_membership`: kiểm tra gói active.
  - `scms_guard_pt_schedule()`: mẫu trigger chặn trùng lịch PT, đồng thời nhiều bảng.
- `config/trigger/DatabaseTriggerProvider` + `PostgreSqlTriggerProvider`: trigger được nạp sau Hibernate; **không tạo migration DDL thủ công**.
- `common/GlobalExceptionHandler.java` (khoảng dòng 186–216): dịch lỗi trigger sang HTTP theo tên `CONSTRAINT`. Thêm nhánh cho trigger mới ở đây.
- `scheduling/service/SessionEligibility.ensureMembershipCoversSession(...)` và `MembershipSubscriptionRepository.hasActiveMembership(...)`: tái dùng cho kiểm tra gói.
- `scheduling/service/ClassService.ensureNoSessionConflict(...)` (SCRUM-132): kiểm tra trước trùng phòng/HLV cho buổi lớp. **Phải bổ sung kiểm tra với lượt đặt sân** (xem mục 5.3).
- `security/SecurityConfig.java`: khai báo quyền theo route (`hasRole("MEMBER")`...). Thêm route mới tại đây, kiểm tra role ở backend.
- `common/i18n/MessageService`: mọi thông báo qua key; cập nhật **cả** `i18n/messages_vi.properties` và `messages_en.properties` (và `messages.properties` nếu dự án đang giữ đồng bộ; xem `MessageBundlesConsistencyTest`).
- Mẫu tham chiếu nên đọc: `scheduling/service/EnrollmentService`, `WaitlistService`, `EnrollmentController`, test `WaitlistConcurrencyRegressionTest`, `ConcurrencyBookingIntegrationTest`.

Frontend (`apps/web/src`):
- `features/member/MemberClassesPage.tsx`: đặt lớp; đã hỗ trợ `?discipline=<tên bộ môn>`. `memberClassesApi.ts` là mẫu lớp API.
- `features/landing/SportPage.tsx` + `sportPages.ts`: trang `/swimming`, `/boxing`, `/tennis`, `/badminton`. Nút chính hiện là `Đặt lịch <bộ môn>` dẫn tới `/member/classes?discipline=…` (biến `bookPath`). Với bộ môn có sân, đổi đích sang trang đặt sân mới.
- `shared/lib/disciplines.ts`: danh mục bộ môn chuẩn và `matchesDiscipline` (có bí danh).
- `features/portal/portalNavigation.ts`: `PORTAL_NAV` và `MOBILE_PRIMARY_NAV`; `app/router.tsx`: route + `RoleGuard`.
- `shared/lib/portalNotices.ts`: `notify()` cho kết quả thao tác (đã thay mọi banner thành công); `shared/ui/ActionMenu`, `RefreshButton`, `LoadingSkeleton`, `Modal`.
- `shared/api/client.ts`: `apiFetch`, lỗi `ApiError` có `code`.

## 5. Thiết kế đề xuất

### 5.1 Dữ liệu (Code-First, Java Entity; không viết DDL)

- Sửa `Room`: thêm cột nullable `discipline_id` (FK `disciplines`) để biết sân thuộc bộ môn nào. Thêm field tùy chọn `open_time`/`close_time` nếu chốt "giờ mở cửa theo sân" ở câu hỏi 2. Cột mới nullable để `ddl-auto: update` không làm hỏng dữ liệu cũ; có test cập nhật schema theo quy tắc trong `backend-architecture.md`.
- Entity mới `CourtBooking` (package `com.swp391.scms.courts`, tách `controller/service/repository/entity/dto`), bảng `court_bookings`:
  - `id`, `room_id` (FK rooms), `member_id` (FK users), `booking_date`, `start_time`, `end_time`, `status` (`booked|cancelled`, `@Check`), `created_at`, `cancelled_at`, `cancel_reason`.
  - Index `(room_id, booking_date)` và `(member_id, booking_date)`.
- Quản lý (CENTER_MANAGER) gán bộ môn cho phòng ở trang Danh mục vận hành hiện có (`features/manager/ManagerCatalogsPage.tsx`, tab Phòng tập). Seeder **không** tự tạo sân vì chỉ seed khi bảng rỗng.

### 5.2 API (cập nhật `docs/api-contracts/` TRƯỚC hoặc cùng PR; tạo `openapi-court-booking.yaml`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/api/v1/courts?discipline=<tên>` | MEMBER, RECEPTIONIST, CENTER_MANAGER | Danh sách sân theo bộ môn (room có `discipline_id`, status `available`) |
| GET | `/api/v1/courts/{roomId}/availability?date=YYYY-MM-DD` | như trên | Các khung giờ trong ngày kèm trạng thái `free|booked|class|past` (ẩn danh người đặt) |
| POST | `/api/v1/court-bookings` | MEMBER | Body `{ roomId, date, startTime }`; độ dài lấy theo cấu hình |
| GET | `/api/v1/court-bookings/my` | MEMBER | Lượt đặt của tôi (sắp tới và đã qua, phân trang) |
| PATCH | `/api/v1/court-bookings/{id}/cancel` | MEMBER (chủ lượt), CENTER_MANAGER, RECEPTIONIST | Hủy; hội viên bị giới hạn theo quy tắc hủy |
| GET | `/api/v1/court-bookings?date=&roomId=` | RECEPTIONIST, CENTER_MANAGER | Giai đoạn 2 |

Mã lỗi gợi ý (mỗi mã cần key i18n vi + en): `COURT_BOOKING_SLOT_TAKEN` (409, trùng lượt đặt hoặc buổi lớp), `COURT_BOOKING_MEMBERSHIP_INVALID` (403), `COURT_BOOKING_PAST_SLOT` (400), `COURT_BOOKING_TOO_FAR` (400), `COURT_BOOKING_LIMIT_REACHED` (409), `COURT_BOOKING_COURT_UNAVAILABLE` (409, sân `maintenance|closed`), `COURT_BOOKING_CANCEL_TOO_LATE` (400), `COURT_BOOKING_NOT_FOUND` (404). Không trả entity, stack trace hay thông điệp SQL.

### 5.3 Toàn vẹn dữ liệu (bắt buộc, không vô hiệu trigger)

Thêm vào `postgresql-triggers.sql` và nạp qua `PostgreSqlTriggerProvider`:
1. `trg_court_bookings_check_conflict` (BEFORE INSERT/UPDATE trên `court_bookings`): khóa `pg_advisory_xact_lock(hashtextextended('room:'||room_id,0))` — **dùng cùng khóa `room:<id>` với `scms_check_session_conflict`** để lượt đặt sân và buổi lớp cùng phòng không chạy đua — rồi chặn chồng giờ với (a) `court_bookings` khác `status='booked'` cùng phòng cùng ngày, (b) `class_sessions` không `cancelled` có lớp cùng `room_id`. Dùng `ERRCODE='23P01'` và `CONSTRAINT='trg_court_bookings_check_conflict'`.
2. Mở rộng `scms_check_session_conflict()` (hướng ngược lại): tạo/sửa buổi lớp không được trùng một lượt đặt sân đang `booked` cùng phòng.
3. `trg_court_bookings_check_membership`: chỉ cho INSERT khi hội viên có gói active còn hạn bao phủ ngày đặt (mẫu `scms_require_active_membership_for_enrollment`).
4. Hội viên không được có hai lượt `booked` chồng giờ nhau (mọi sân).
5. Map ba tên constraint trên trong `GlobalExceptionHandler` sang mã lỗi ở mục 5.2.
6. Service vẫn kiểm tra trước (bản đẹp cho UI) nhưng **trigger là nguồn sự thật**; thêm test song song (nhiều luồng đặt cùng một khung giờ, đúng một luồng thành công), theo mẫu `WaitlistConcurrencyRegressionTest`.
7. Bổ sung kiểm tra lượt đặt sân vào `ClassService.ensureNoSessionConflict`.

### 5.4 Frontend

- Feature mới `features/courts/` (page chỉ ghép feature; theo `AGENTS.md`), route `/member/courts` (có `?discipline=Tennis`), `RoleGuard` cho MEMBER.
- Luồng: chọn bộ môn (chip từ `DISCIPLINES`, chỉ bộ môn có sân) → chọn ngày (7 ngày tới) → lưới khung giờ theo sân → bấm khung `free` → xác nhận trong `Modal` → `notify()` thành công. Lưới ghi rõ khung `class` ("Đang có lớp") và `booked`, `past` bị vô hiệu.
- Hủy ở danh sách "Lượt đặt của tôi" bằng `ActionMenu` hoặc nút nhỏ có xác nhận.
- Bắt buộc có trạng thái loading (`LoadingSkeleton`), rỗng ("Chưa có sân cho bộ môn này"), lỗi có nút thử lại; hiển thị lỗi 409 trùng giờ bằng thông điệp dịch từ `ApiError.code` và tự tải lại lưới.
- `SportPage`: với `tennis`, `badminton`, `swimming` đổi `bookPath` của hội viên sang `/member/courts?discipline=<tên>` (giữ `/member/classes?...` ở link phụ cho lịch lớp); Boxing giữ nguyên. Cập nhật `SportPage.test.tsx`.
- Thêm mục menu vào `PORTAL_NAV` (icon khác các mục sẵn có), không đưa vào `MOBILE_PRIMARY_NAV` trừ khi người dùng yêu cầu. Giao diện theo token portal sáng/tối, vùng chạm ≥44px trên mobile, cuộn native.
- Không hiển thị số liệu bịa (số sân, giờ mở cửa) nếu không lấy từ API.

## 6. Kiểm thử (bắt buộc)

Backend (`apps/api`, chạy `./mvnw.cmd -q -o test -Dtest=<tên>` rồi toàn bộ trước khi commit):
- Unit test service (đặt thành công, trùng, quá khứ, quá xa, hết gói, sân bảo trì, hủy quá muộn, quyền sở hữu).
- Controller test + `MethodSecurityPolicyTest`/policy test theo mẫu hiện có cho quyền từng route.
- Test đồng thời (trigger) và test trùng với buổi lớp ở **cả hai chiều**.
- `MessageBundlesConsistencyTest` phải qua (đủ key vi/en).
- `DatabasePolicyTest`, `DatabaseProfilesTest`, `scripts/test-database-config.ps1` vẫn qua (CI bắt buộc).

Frontend (`apps/web`): `npx tsc -b`, `npx eslint src --max-warnings=0`, `npx vitest run`; thêm test cho API client, trang đặt sân (loading/rỗng/lỗi/409), `SportPage`. Có thể chụp màn hình bằng Playwright với API giả lập để kiểm tra bố cục desktop 1440px và mobile 390px.

## 7. Thứ tự làm và commit (mỗi phần một commit nhỏ, có thể hoàn tác)

1. Chốt câu hỏi mục 3 với người dùng; viết `docs/api-contracts/openapi-court-booking.yaml`.
2. Entity (`Room.discipline_id`, `CourtBooking`), repository, trigger SQL, `GlobalExceptionHandler`, i18n; test trigger.
3. Service + controller + `SecurityConfig` + test.
4. Quản lý gán bộ môn cho phòng trong Danh mục vận hành.
5. Frontend `features/courts`, route, menu.
6. Nối nút đặt sân từ `SportPage`.
7. Giai đoạn 2: màn hình lễ tân/quản lý xem và hủy hộ.
8. Cập nhật `DESIGN.md` ghi lại việc đã làm.

Ghi Jira key vào mô tả PR nếu có (xem `docs/plans/AGILE_SCRUM_JIRA_PLAN.md`; chưa có key cho tính năng này, hỏi người dùng).

## 8. Lưu ý khi làm việc trong repo này

- Có thay đổi của người khác chưa commit tại `apps/web/src/shared/liquid-glass/LiquidGlassChatbot*` và `apps/api/.../ai/service/AiChatService.java`. **Không sửa, không stage** các file đó; chỉ `git add` file thuộc phần việc của bạn.
- Cả web và API đều chạy được độc lập; dev server web: `npm --prefix apps/web run dev` (cổng 5173). Môi trường API cần profile `supabase` và biến môi trường (xem `docs/SUPABASE_SETUP.md`); không đưa thông tin kết nối vào code hay commit.
- Hệ thống cũ chỉ đặt chỗ theo buổi lớp có lịch: đừng gộp đặt sân vào `class_enrollments`.
- Ký tự `\` trong lệnh shell của công cụ có thể bị nuốt; khi cần ghi file chứa `\n`, dùng công cụ ghi file thay vì heredoc.
- Mọi thông báo mới phải có key i18n; mọi thay đổi API phải có OpenAPI; lỗi nghiệp vụ dùng exception có kiểu, không trả thông điệp SQL.

## 9. Tiêu chí chấp nhận

- Hội viên có gói active đặt được một khung trống; hội viên không có gói hoặc gói hết hạn nhận lỗi 403 dễ hiểu (vi/en).
- Hai hội viên đặt cùng khung cùng lúc: đúng một người thành công, người còn lại nhận 409 và lưới tự cập nhật.
- Không thể đặt khung đang có buổi lớp cùng phòng; không thể tạo buổi lớp trùng lượt đặt sân đang `booked`.
- Khung quá khứ, quá 7 ngày, sân bảo trì/đóng đều bị chặn cả ở UI lẫn backend.
- Hủy giải phóng khung ngay; hủy quá muộn bị từ chối.
- Các route kiểm tra role ở backend; ẩn menu ở frontend không phải là phân quyền.
- UI có loading, rỗng, lỗi; không còn số liệu bịa; mobile không tràn ngang.
- Toàn bộ test backend và frontend qua; `docs/api-contracts/` và `DESIGN.md` đã cập nhật.
