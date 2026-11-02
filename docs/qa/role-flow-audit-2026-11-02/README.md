# Kiểm tra luồng giữa năm role — 02/11/2026

Mốc source được kiểm tra: `4082e02`. Phạm vi là audit; không sửa product code hoặc dữ liệu.

## Kết quả

**Có lỗi liên role và lỗi ở bước nghiệp vụ.** Không thấy trang trắng trong 38 lượt mở các màn hình thuộc menu của năm role; 10 lượt đăng nhập/đăng xuất chuyển đúng trang và xóa session đúng khi đăng xuất bình thường. Điều đó không chứng minh các thao tác nghiệp vụ đều chạy được.

Đã xác nhận sáu vấn đề dưới đây. Ưu tiên sửa POS, dữ liệu học viên mẫu và đồng bộ session trước khi chạy nghiệm thu liên role trên database thật.

### 1. P1 — Manager/Receptionist không tải được gói mua mới/gia hạn tại POS

- Luồng: `/staff/reception` → tra cứu → chọn hội viên → tải lựa chọn gói tập.
- Frontend gửi `GET /api/v1/memberships/subscriptions/members/{memberId}/renewal-candidates`. API trả **403** cho cả `CENTER_MANAGER` và `RECEPTIONIST`.
- Controller cho phép hai role này, nhưng matcher tổng quát `/api/v1/memberships/subscriptions/**` yêu cầu `MEMBER` và chặn trước controller. POST `.../members/{memberId}/renew/{id}` bị chặn tương tự.
- `StaffReceptionPage` dùng `Promise.all` để tải gói và lịch sử gia hạn; một request lỗi khiến cả lựa chọn mua mới và gia hạn không tải được. Luồng thu tiền cho yêu cầu đã chờ thanh toán là đường riêng và không bị lỗi matcher này.
- Bằng chứng: probe MockMvc dùng filter thật nhận bốn response 403 và service không được gọi; endpoint `/pending` vẫn trả 200. Trình duyệt tái hiện thông báo không tải được gói với fixture trả đúng trạng thái đã xác nhận.
- Nguồn: `apps/api/src/main/java/com/swp391/scms/security/SecurityConfig.java:126`, `apps/api/src/main/java/com/swp391/scms/membership/MembershipSubscriptionController.java:68`, `apps/web/src/features/reception/StaffReceptionPage.tsx:112`.
- Hướng sửa: thêm matcher GET/POST chính xác cho các endpoint nhân viên trước matcher Member; giữ nguyên giới hạn Member ở các endpoint tự đăng ký.

### 2. P1 — Danh sách học viên rỗng/lỗi bị thay bằng dữ liệu mẫu có ID thật

- Luồng: Coach hoặc Manager → `/coach/training-plans`, trong khi `/classes` trả danh sách rỗng hoặc tải roster thất bại.
- `aiApi.getCoachMembers()` trả `SAMPLE_MEMBERS` thay vì empty/error. UI hiện bốn tên mẫu cùng mục tiêu/thông tin sức khỏe, không có cảnh báo lỗi tải dữ liệu.
- Trình duyệt xác nhận: với `/classes = []`, cả Coach và Manager vẫn thấy Lê Hoàng Long, Trần Thị Thu Thảo, Nguyễn Văn Minh và Đỗ Quỳnh Anh.
- Nút lưu gửi `member_id` từ mẫu vào API thật. Nếu ID không tồn tại sẽ 404; nếu trùng một Member thật thì có nguy cơ lưu vào người khác với danh tính hiển thị giả. Audit không ghi dữ liệu vào database để thử trường hợp này.
- Nguồn: `apps/web/src/features/coaching/aiApi.ts:109`, `apps/web/src/features/coaching/aiApi.ts:148`, `apps/web/src/features/coaching/CoachTrainingPlanPage.tsx:143`, `apps/api/src/main/java/com/swp391/scms/coaching/service/TrainingPlanService.java:69`.
- Hướng sửa: trả empty/error từ API adapter, bỏ dữ liệu mẫu khỏi luồng live và khóa thao tác lưu khi chưa xác minh được hội viên.

### 3. P1 — Đổi tài khoản ở tab khác giữ màn hình và state tài khoản cũ

- Luồng: tab A đang là Member; tab B đăng xuất/đăng nhập Admin hoặc Coach trong cùng browser profile.
- `localStorage` đã chuyển sang tài khoản mới, nhưng portal không subscribe thay đổi session. Tab A vẫn ở dashboard Member, hiện tên và menu cũ.
- Trình duyệt xác nhận: storage role `ADMIN`, nhưng tab A vẫn hiện `Xin chào, Member account` và toàn bộ menu Member.
- Chat giữ selected conversation/messages trong state; `ChatWorkspace` không có key theo identity. Đây là rủi ro dữ liệu cũ còn hiển thị, không phải bằng chứng backend bỏ qua authorization. Các request mới lấy token mới từ cùng storage.
- Nguồn: `apps/web/src/features/portal/PortalShell.tsx:20`, `apps/web/src/shared/ui/RoleGuard.tsx:6`, `apps/web/src/features/chat/ChatPage.tsx:20`, `apps/web/src/features/chat/ChatPage.tsx:24`.
- Hướng sửa: một nguồn auth state có subscription cho cùng tab và cross-tab; reset/remount state theo identity khi đổi tài khoản.

### 4. P2 — Manager được mở màn hình giáo án nhưng không lưu được

- Luồng: Manager → menu Soạn giáo án → Lưu & Kích hoạt giáo án.
- Payload không có `coach_id`, màn hình cũng không có chọn HLV. Backend mặc định dùng `currentUserId` làm Coach ID.
- Manager bình thường không có bản ghi `coaches` tương ứng, nên service trả `ResourceNotFoundException`/404.
- Bằng chứng: browser ghi được POST không chứa `coach_id`; probe gọi service thật, xác nhận nó tìm Coach bằng user ID của Manager và ném ResourceNotFoundException. Trình duyệt dùng fixture 404 để xác nhận thông báo lỗi ở bước lưu.
- Nguồn: `apps/web/src/features/portal/portalNavigation.ts:21`, `apps/web/src/features/coaching/aiApi.ts:177`, `apps/api/src/main/java/com/swp391/scms/coaching/service/TrainingPlanService.java:72`.
- Hướng sửa: Manager chọn Coach được phép và gửi `coach_id`; Coach tiếp tục dùng identity của bản thân.

### 5. P2 — Admin đổi role nhưng frontend vẫn giữ role cũ sau refresh

- Luồng: user đang đăng nhập Member; Admin đổi user đó sang Manager bằng tài khoản khác; user refresh và mở `/manager/users`.
- `RoleGuard` vẫn đọc role Member đã lưu trong localStorage nên đẩy về dashboard Member. Backend JWT filter đã lấy role mới từ database, do đó các API Member lại có thể trả 403.
- Không có luồng reconcile role hiện tại hoặc bắt đăng nhập lại khi role thay đổi. Refresh trang chỉ đọc lại cùng role cũ trong localStorage.
- Bằng chứng: xác nhận bằng truy vết source, chưa thử cập nhật role trên database thật trong audit này.
- Nguồn: `apps/web/src/shared/api/client.ts:16`, `apps/web/src/shared/ui/RoleGuard.tsx:11`, `apps/api/src/main/java/com/swp391/scms/security/JwtAuthenticationFilter.java:49`.
- Hướng sửa: xác minh lại tài khoản/role khi vào hoặc quay lại portal và sau khi Admin đổi role của chính mình; cập nhật route/session theo dữ liệu server.

### 6. P2 — Response 401 của phiên cũ xóa phiên mới

- Luồng: request của Member cũ đang chờ; tài khoản Coach mới đăng nhập; request cũ trả 401.
- `apiFetch` xóa session hiện tại mà không so token của request với token đang lưu. Hàm tải PDF có cùng vấn đề.
- Trình duyệt xác nhận: sau khi lưu token Coach mới rồi trả 401 cho request Member cũ, token và session đều thành `null`, tab bị chuyển đến `/login?expired=1`.
- Nguồn: `apps/web/src/shared/api/client.ts:82`, `apps/web/src/shared/api/client.ts:106`.
- Hướng sửa: chỉ xử lý mất phiên nếu token gây 401 vẫn là token của phiên hiện tại; bỏ response thuộc phiên đã bị thay thế.

## Trạng thái sửa (02/11/2026)

Cả sáu vấn đề đã được đối chiếu lại với code và sửa. Phần mô tả bên trên giữ nguyên làm hồ sơ lúc phát hiện.

| # | Cách sửa | Kiểm chứng |
| --- | --- | --- |
| 1 | `SecurityConfig`: thêm matcher GET `renewal-candidates` và POST `renew/{id}` cho `CENTER_MANAGER`/`RECEPTIONIST` đứng trước matcher MEMBER | `OperationsSecurityRegressionTest`: staff 200/201, Member/Coach 403, cả hai prefix URL |
| 2 | `aiApi.getCoachMembers` bỏ `SAMPLE_MEMBERS`: rỗng trả `[]`, lỗi được ném; trang giáo án có empty state, error state và không cho lưu khi chưa có học viên thật | `aiApi.test.ts`, `CoachTrainingPlanPage.test.tsx` |
| 3 | `client.ts` có `subscribeAuthSession` (cùng tab và sự kiện `storage`); `RoleGuard` dùng `useCurrentUser`; `PortalShell` remount theo `identifier:role` nên chat/state tài khoản cũ bị bỏ | `PortalShell.session.test.tsx`, `client.test.ts` |
| 4 | Manager chọn Coach phụ trách (`GET /classes/coaches`) và gửi `coach_id`; Coach không gửi `coach_id` | `CoachTrainingPlanPage.test.tsx`, `aiApi.test.ts` |
| 5 | Thêm `GET /api/v1/auth/me` (role hiện hành từ DB); portal gọi `syncSessionWithServer` khi vào và khi quay lại tab, role đổi thì cập nhật session và `RoleGuard` điều hướng lại | `AuthSessionEndpointTest`, `PortalShell.session.test.tsx`, `client.test.ts` |
| 6 | `apiFetch`/`apiFetchPdf` chỉ xóa phiên khi token gây 401 vẫn là token đang lưu; response của phiên bị thay thế bị bỏ qua (`SESSION_REPLACED`) | `client.test.ts` |

Chưa kiểm chứng: luồng POS và đổi role trên database Supabase thật, và hai tab trình duyệt thật. Các test dùng MockMvc/jsdom với service được mock.

## Các phần đã kiểm tra và giới hạn

| Kiểm tra | Kết quả |
| --- | --- |
| Đăng nhập password và đăng xuất lần lượt năm role | 10 bước đúng redirect và xóa storage bình thường |
| Mở màn hình trong menu theo role | 38 lượt; không có uncaught JS error hoặc shell không render |
| Staff POS khi API gia hạn trả 403 | Tái hiện trên Manager và Receptionist |
| Empty coach classes | Cả Coach/Manager hiển thị bốn học viên mẫu |
| Manager lưu giáo án thiếu coachId | Ghi nhận payload browser, service probe xác nhận lookup sai Coach |
| Cross-tab đổi Member → Admin | Tab cũ vẫn hiển thị Member |
| Late old-token 401 sau khi có Coach session mới | Session mới bị xóa |
| Realtime membership cố ý disabled | Có cảnh báo chặn mua cho đến khi sync; nút Thử đồng bộ lại tải REST thành công và xóa cảnh báo. Không tính đây là một trong sáu lỗi trên |
| Java diagnostic probes | 3 tests qua, xác nhận hành vi lỗi hiện tại và endpoint đối chứng |

Browser dùng bản production build trên local preview, chặn toàn bộ API bằng fixture và không gọi external HTTPS. Probe backend dùng security filter/controller/service thật với repository/service dependency được mock. Không khởi động API kết nối Supabase, không kiểm thử Google thật, camera thật, realtime transport thật hoặc ghi nhận thanh toán/booking/check-in vào database. Các màn hình có render thành công chưa chứng minh transaction nghiệp vụ end-to-end đã qua.

## Chạy lại

Browser: chạy preview ở port 4173, cung cấp `playwright-core` qua `NODE_PATH` và Chrome qua `CHROME_PATH` nếu cần; chạy `node scripts/audit-role-flows.cjs`. Script chỉ dùng tài khoản/dữ liệu fixture, ghi `browser-results.json` và ảnh minh chứng trong thư mục này. Exit 0 nghĩa probe đã chạy xong, không có nghĩa các finding đã được sửa.

Java: file `RoleFlowPolicyProbeTest.java` được giữ trong thư mục QA, không nằm trong test suite thường xuyên vì nó mô tả hành vi lỗi hiện tại. Để chạy lại, copy file vào `apps/api/src/test/java/com/swp391/scms/security/`, chạy `mvnw.cmd -Dtest=RoleFlowPolicyProbeTest test` tại `apps/api`, rồi bỏ bản copy. File dùng cùng package và dependency test sẵn có; không dùng database. `policy-probe-results.json` ghi kết quả của lượt audit.

Các ảnh và dữ liệu kết quả chỉ chứa fixture. Không có thông tin tài khoản thật hoặc mật khẩu thực.
