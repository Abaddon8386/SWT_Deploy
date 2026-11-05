# Phase 2: Wallet, Avatar Dropdown & Upload, Receptionist-to-Manager Refund, Unlimited Paid Courts & Full Package CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai toàn bộ các tính năng và quy tắc nghiệp vụ Phase 2 theo quyết định của người dùng (`A1`–`A6`) cùng các lỗi nghiệp vụ cốt lõi phát hiện từ đợt Audit toàn hệ thống.

**Architecture:** Giữ nguyên kiến trúc 3 lớp (`Controller -> Service -> Repository`) tại `apps/api` (Spring Boot 3 + JPA Code-First + Supabase PostgreSQL + i18n `MessageService`) và kiến trúc `features/<feature>` tại `apps/web` (React + TypeScript). Bổ sung phân hệ Ví điện tử (`wallet`), menu Avatar đa năng kèm upload ảnh đại diện có kiểm tra ràng buộc, luồng Lễ tân gửi yêu cầu hủy gói có lý do -> Quản lý duyệt hoàn tiền về Ví kèm thông báo Realtime, mở giới hạn đặt sân trả phí và mở đầy đủ CRUD gói tập/giá cho Quản lý.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Java 21, Spring Boot 3, Spring Security, Hibernate/JPA, PostgreSQL Triggers (`postgresql-triggers.sql`), Supabase Realtime.

**Spec:** `C:\Users\User\.gemini\antigravity\brain\0528f92a-71c2-420b-ab18-c1e92dce6809\mainflow_audit_report.md` & `DESIGN.md`

## Global Constraints

- **Code-First & ORM Polymorphism:** Định nghĩa bảng/cột mới (`wallets`, `wallet_transactions`, các trường cấu hình `packages` hoặc `membership_cancellation_requests`) qua JPA Entity (`ddl-auto: update`); không thêm file migration SQL thủ công.
- **Đa ngôn ngữ (i18n bắt buộc):** Mọi thông báo thành công/mã lỗi mới ở Backend phải cập nhật đồng thời cả 3 file: `messages_vi.properties`, `messages_en.properties`, `messages.properties` và dùng `MessageService`.
- **Thiết kế giao diện (`DESIGN.md`):** Đồng bộ bảng màu charcoal–salmon, dùng `Modal`, `Select`, `DatePicker`, `useConfirm`, `notify()`, định dạng giờ qua `centerTime.ts`.

## Review Focus

- **Nạp & trừ Ví qua VNPay idempotent:** Nếu cả Return URL và IPN cùng gọi về cho một `vnp_TxnRef`, giao dịch chỉ được cộng tiền vào ví và trừ thanh toán đúng 1 lần duy nhất (`PESSIMISTIC_WRITE` trên `VnpayTransaction` và `Wallet`).
- **Upload Avatar ràng buộc chặt:** Chặn file không phải ảnh (`image/jpeg`, `image/png`, `image/webp`), chặn file `> 2MB`, và kiểm tra kích thước ảnh hợp lệ ở cả Frontend lẫn Backend.
- **Luồng hủy gói & hoàn tiền phân quyền nghiêm ngặt:** Hội viên không tự bấm hủy gói active trên UI; Lễ tân bắt buộc nhập lý do (`reason` không rỗng) khi tạo yêu cầu hủy trình Quản lý; Quản lý duyệt chỉ cộng tiền hoàn vào Ví đúng 1 lần.
- **Đặt sân không giới hạn số lượng khi trả phí:** Hội viên vẫn được hưởng đúng số lượt miễn phí theo hạng gói (`Silver: 1, Gold: 2, Platinum: 3` lượt/tháng); từ lượt vượt hạn mức hoặc đặt xa hơn 7 ngày sẽ tính phí theo bảng giá sân mà không bị trigger DB chặn lỗi `COURT_BOOKING_TOO_FAR` hay `COURT_BOOKING_LIMIT_REACHED`.
- **Xóa lớp học an toàn:** Lớp đã có học viên đặt chỗ hoặc lịch sử điểm danh/thanh toán khi xóa sẽ tự động hủy các buổi tương lai, gửi thông báo cho học viên và chuyển sang `inactive` thay vì văng lỗi Foreign Key 409.

---

### Task 1: Phân quyền `/manager/staff-accounts` vs `/admin/users` & Chuẩn hóa Menu Avatar + Upload Avatar có ràng buộc (`A1` & `A2`)

**Files:**
- Modify: `apps/web/src/features/portal/portalNavigation.ts`
- Modify: `apps/web/src/features/portal/PortalShell.tsx`
- Modify: `apps/web/src/features/manager/StaffAccountsPage.tsx`
- Modify: `apps/web/src/features/member/MemberProfilePage.tsx`
- Modify: `apps/web/src/features/member/profileApi.ts`
- Modify: `apps/api/src/main/java/com/swp391/scms/profile/ProfileController.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/profile/ProfileService.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/profile/ProfileDto.java`
- Modify: `DESIGN.md`

**Interfaces:**
- Produces:
  - Avatar Dropdown trong `PortalShell.tsx` (chứa: **Ví của tôi & Số dư**, **Hồ sơ cá nhân & Ảnh đại diện**, **Đăng xuất**).
  - Upload Avatar (`POST /api/v1/profile/avatar` hoặc cập nhật `avatarUrl` kèm kiểm tra định dạng `image/jpeg | image/png | image/webp`, dung lượng `<= 2MB`, kích thước `100x100`–`4096x4096`).
  - Đầy đủ CRUD thông tin cá nhân trong `/member/profile` cho mọi vai trò (bao gồm `specialization`, `bio`, `certification` cho `COACH` và `shift` cho `RECEPTIONIST`).

- [ ] **Step 1: Cập nhật `portalNavigation.ts` & `StaffAccountsPage.tsx` (`A1`)**
  - Giữ cả `/manager/staff-accounts` cho Manager (quản lý Lễ tân/HLV) và `/admin/users` cho Admin; bổ sung `useConfirm()` trước khi khóa/mở khóa tài khoản nhân sự trên `StaffAccountsPage.tsx`.
- [ ] **Step 2: Xây dựng Avatar Dropdown trong `PortalShell.tsx` (`A2`)**
  - Khi bấm vào Avatar trên thanh header của Portal, sổ ra menu gồm: Số dư Ví (nếu là Member), Chỉnh sửa thông tin cá nhân (`/member/profile`), và Đăng xuất (`logout`).
- [ ] **Step 3: Thêm tính năng Upload hình Avatar kèm ràng buộc & CRUD thông tin cá nhân (`A2`)**
  - Ràng buộc Frontend & Backend: Chỉ chấp nhận `image/jpeg`, `image/png`, `image/webp`; dung lượng tối đa `2MB`; kiểm tra magic bytes/data URL hợp lệ.
  - Hiển thị và cho phép sửa thông tin chuyên môn HLV / ca trực Lễ tân ngay trong `/member/profile`.
- [ ] **Step 4: Chạy test xác minh Task 1**
  - Run: `cd apps/web && npx vitest run src/features/member/ src/features/manager/`

---

### Task 2: Hệ thống Ví điện tử (`Wallet`), Tự động nạp/trừ khi thanh toán VNPay & Xác thực Return URL tức thì (`A2` & `A5`)

**Files:**
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/Wallet.java`
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/WalletTransaction.java`
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/WalletRepository.java`
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/WalletTransactionRepository.java`
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/WalletService.java`
- Create: `apps/api/src/main/java/com/swp391/scms/wallet/WalletController.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/payments/vnpay/VnpayController.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/payments/vnpay/VnpayIpnHandler.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/payments/vnpay/VnpayPaymentService.java`
- Modify: `apps/web/src/features/payments/VnpayReturnPage.tsx`
- Modify: `apps/web/src/features/payments/vnpayApi.ts`
- Create: `apps/web/src/features/wallet/WalletModal.tsx`
- Create: `apps/web/src/features/wallet/walletApi.ts`

**Interfaces:**
- Produces:
  - `GET /api/v1/wallet/my` -> `{ balance, updatedAt, transactions: WalletTransactionDto[] }`
  - `POST /api/v1/wallet/pay` -> Thanh toán trực tiếp bằng số dư Ví cho gói tập / sân / PT 1:1 nếu số dư đủ.
  - `POST /api/v1/payments/vnpay/verify-return` -> Nhận các tham số `vnp_*` từ `VnpayReturnPage`, xác thực chữ ký HMAC-SHA512 `vnp_SecureHash`, nếu thành công (`00`) thì tự động ghi nhận nạp vào Ví (`TOPUP_VNPAY`) và trừ Ví (`PAYMENT_DEBIT`) để kích hoạt dịch vụ ngay lập tức + bắn thông báo Realtime; nếu hủy/thất bại (`24`...) thì đánh dấu `failed` và giải phóng ngay khóa 30 phút của `VnpayPaymentGuard`.

- [ ] **Step 1: Tạo Entity `Wallet`, `WalletTransaction`, Repository & `WalletService`**
  - Ràng buộc `balance >= 0`, khóa bi quan `@Lock(LockModeType.PESSIMISTIC_WRITE)` khi cộng/trừ tiền ví.
  - Mọi biến động số dư ví (`TOPUP_VNPAY`, `PAYMENT_DEBIT`, `REFUND_CREDIT`) đều lưu lịch sử `WalletTransaction` và bắn thông báo Realtime (`NotificationService`).
- [ ] **Step 2: Tích hợp xác thực chữ ký Return URL (`A5`) & Tự động Nạp/Trừ Ví trong luồng VNPay (`A2`)**
  - Trong `VnpayReturnPage.tsx`, truyền query string `vnp_*` lên `POST /api/v1/payments/vnpay/verify-return` để xử lý idempotent cùng `VnpayIpnHandler`.
  - Khi thanh toán VNPay thành công, `WalletService` ghi nhận bút toán nạp tiền từ VNPay vào Ví và bút toán trừ Ví thanh toán cho khoản mục tương ứng.
- [ ] **Step 3: Hiển thị Ví & Lịch sử giao dịch Ví trong menu Avatar (`WalletModal.tsx`)**
- [ ] **Step 4: Chạy test Backend & Frontend cho Ví và VNPay**

---

### Task 3: Luồng Hủy gói tập & Hoàn tiền về Ví (Ẩn ở UI Member, Lễ tân tạo yêu cầu kèm lý do -> Quản lý duyệt hoàn tiền về Ví + Realtime Notifications) (`A2`)

**Files:**
- Modify: `apps/api/src/main/java/com/swp391/scms/memberships/MembershipCancellationRequest.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/memberships/MembershipCancellationController.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/memberships/MembershipCancellationService.java`
- Modify: `apps/web/src/features/member/MemberPackagesPage.tsx`
- Modify: `apps/web/src/features/reception/StaffReceptionPage.tsx`
- Modify: `apps/web/src/features/reception/receptionApi.ts`
- Modify: `apps/web/src/features/manager/ManagerReportsPage.tsx`
- Modify: `apps/web/src/features/manager/reportsApi.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/memberships/cancellations/staff-request` (Chỉ `RECEPTIONIST` / `STAFF`): nhận `{ subscriptionId, memberId, reason, requestedRefundAmount }`, bắt buộc `reason` không được trống (`@NotBlank`). Gửi thông báo Realtime cho tất cả `CENTER_MANAGER`.
  - `GET /api/v1/memberships/cancellations` (`RECEPTIONIST`, `CENTER_MANAGER`): lấy danh sách yêu cầu hủy gói tập.
  - `POST /api/v1/memberships/cancellations/{id}/review` (Chỉ `CENTER_MANAGER`): nhận `{ approved, managerNote, refundAmount }`. Khi `approved = true`: chuyển gói tập sang `cancelled`, cộng `refundAmount` trực tiếp vào **Ví (`Wallet`)** của hội viên (`REFUND_CREDIT`), và gửi thông báo Realtime cho cả Hội viên lẫn Lễ tân gửi yêu cầu!

- [ ] **Step 1: Đảm bảo UI Hội viên (`/member/packages`) không hiển thị nút hủy gói đang hoạt động hay hoàn tiền**
- [ ] **Step 2: Thêm chức năng `"Yêu cầu hủy gói & hoàn tiền"` trên màn Lễ tân (`/staff/reception`)**
  - Khi Lễ tân chọn hội viên đang có gói `active` (hoặc `frozen`), có nút mở Modal `"Trình Quản lý hủy gói tập"`, bắt buộc nhập lý do hủy chi tiết (`reason`) và số tiền đề xuất hoàn về ví.
- [ ] **Step 3: Thêm khu vực `"Duyệt yêu cầu hủy gói & Hoàn tiền về Ví"` trên màn Quản lý (`/manager/reports`)**
  - Hiển thị các yêu cầu do Lễ tân gửi lên (kèm tên hội viên, gói tập, người gửi, lý do hủy, số tiền đề xuất). Quản lý bấm `"Phê duyệt & Hoàn tiền về Ví"` hoặc `"Từ chối"`.
- [ ] **Step 4: Kiểm thử luồng Lễ tân tạo yêu cầu -> Quản lý duyệt -> Tiền cộng vào Ví Hội viên + Thông báo Realtime**

---

### Task 4: Mở giới hạn Đặt sân thoải mái (Giữ hạn mức miễn phí theo gói, đặt thêm tự động tính tiền) (`A3`)

**Files:**
- Modify: `apps/api/src/main/resources/db/triggers/postgresql-triggers.sql`
- Modify: `apps/api/src/main/java/com/swp391/scms/facilities/CourtBookingService.java`
- Modify: `apps/web/src/features/courts/CourtBookingFeature.tsx`
- Modify: `apps/web/src/features/courts/CourtBookingList.tsx`

- [ ] **Step 1: Bỏ giới hạn ngày đặt trước 7 ngày (`COURT_BOOKING_TOO_FAR`) và giới hạn số lượt đặt trong ngày (`COURT_BOOKING_LIMIT_REACHED`, `DAILY_LIMIT`) trong `postgresql-triggers.sql` & `CourtBookingService.java`**
  - Giữ nguyên kiểm tra: hội viên có gói `active` bao phủ ngày đặt, khung giờ chưa qua, không trùng lịch sân, và tính toán hạn mức miễn phí theo gói (`Silver: 1, Gold: 2, Platinum: 3` lượt/tháng).
  - Khi hội viên còn lượt miễn phí trong tháng và chọn dùng quota: miễn phí (`0 đ`).
  - Khi hội viên đã dùng hết lượt miễn phí trong tháng hoặc muốn đặt thêm bao nhiêu sân tùy ý: cho phép đặt thoải mái và tính phí theo đơn giá sân (`CourtPricing`) qua Ví / VNPay / Tiền mặt tại quầy!
- [ ] **Step 2: Sửa thông báo trên `CourtBookingFeature.tsx` khi đặt sân tính phí**
  - Hiển thị rõ số tiền tính thêm và phương thức thanh toán thay vì báo nhầm đã thanh toán khi giao dịch đang `pending`.
- [ ] **Step 3: Chạy test đặt sân lẻ & đặt sân định kỳ nhiều lượt**

---

### Task 5: Xóa lớp học an toàn (`A4`), Bổ sung nút Hủy buổi học / PT 1:1 & Kiểm tra trùng lịch 2 chiều

**Files:**
- Modify: `apps/api/src/main/java/com/swp391/scms/scheduling/ClassService.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/scheduling/SessionBookingService.java`
- Modify: `apps/api/src/main/resources/db/triggers/postgresql-triggers.sql`
- Modify: `apps/web/src/features/classes/StaffClassesPage.tsx`
- Modify: `apps/web/src/features/coaching/CoachClassesPage.tsx`

- [ ] **Step 1: Cập nhật `ClassService.deleteClass` (`A4`)**
  - Nếu lớp học đã có lịch sử (`session_bookings`, `session_attendance`, `session_evaluations`, `coach_reviews`, hoặc `payments`): tự động hủy các buổi học tương lai (`status = 'cancelled'`), gửi thông báo hủy lịch tới toàn bộ học viên đã đặt chỗ, và chuyển trạng thái lớp sang `inactive` (ngừng hoạt động) thay vì xóa cứng gây lỗi Foreign Key.
- [ ] **Step 2: Thêm nút `"Hủy buổi học"` trên `StaffClassesPage.tsx` & `CoachClassesPage.tsx` và nút `"Hủy buổi kèm 1:1"` trên `CoachClassesPage.tsx`**
- [ ] **Step 3: Kiểm tra trùng lịch 2 chiều Lớp học (`session_bookings`) ↔ PT 1:1 (`coach_bookings`) và đơn nghỉ phép đã duyệt của HLV (`existsApprovedLeaveOn`)**

---

### Task 6: Giữ giá gốc & Bổ sung Full CRUD Gói tập và Sửa giá linh hoạt cho Quản lý (`A6`) + Các lỗi nghiệp vụ còn lại

**Files:**
- Modify: `apps/api/src/main/java/com/swp391/scms/facilities/CatalogSeeder.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/facilities/PackageService.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/facilities/dto/PackageDto.java`
- Modify: `apps/web/src/features/manager/ManagerCatalogsPage.tsx`
- Modify: `apps/web/src/features/manager/catalogApi.ts`
- Modify: `apps/web/src/features/member/memberDashboardApi.ts`
- Modify: `apps/api/src/main/java/com/swp391/scms/attendance/service/SessionAttendanceService.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/coaching/service/CoachLeaderboardService.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/analytics/RevenueReportService.java`
- Modify: `DESIGN.md`

- [ ] **Step 1: Đồng bộ giá giữ nguyên `199.000đ / 299.000đ / 599.000đ` trong `CatalogSeeder.java` & `DESIGN.md` (`A6`)**
  - Sửa `correctedLegacyPrice` không tự động ép giá về `299k/499k/999k` để tôn trọng mức giá Quản lý đã chỉnh sửa trong DB.
- [ ] **Step 2: Mở đầy đủ tính năng Tạo gói mới & Sửa toàn bộ thông tin/giá gói tập cho Quản lý trên `/manager/catalogs` (`A6`)**
  - Cho phép Manager thêm gói tập mới và chỉnh sửa tự do: Tên gói, Giá bán (`price`), Thời hạn (`durationDays`), Hạng thẻ (`tier`), Mô tả quyền lợi (`description`), Trạng thái mở bán (`active` / `inactive`), và bỏ lọc cứng `isStandardDiscipline` trên `catalogApi.ts` để Manager quản lý danh mục không bị ẩn bản ghi.
- [ ] **Step 3: Sửa 4 lỗi nghiệp vụ còn lại từ báo cáo Audit**
  1. `memberDashboardApi.ts`: Lấy lịch học sắp tới từ `GET /api/v1/classes/session-bookings/my`.
  2. `SessionAttendanceService.java`: Chỉ lưu `SessionEvaluation` khi `Boolean.TRUE.equals(request.publishEvaluations())`.
  3. `CoachLeaderboardService.java`: Không gán mặc định `5.00` sao cho HLV có `0` lượt đánh giá.
  4. `RevenueReportService.java`: Tính cả `session_bookings` trong báo cáo tỷ lệ lấp đầy phòng học.
- [ ] **Step 4: Chạy toàn bộ test suite Backend & Frontend + Cập nhật `graphify`**

