# Member workout history — 2026-11-05

## Scope and baseline
- Branch: main, HEAD 6755e381. Workspace clean before work; no fetch, commit or push.
- Existing attendance backlog: SCRUM-75 (Core Operations / An). This request extends Member Progress; no new Jira key was supplied.
- Baseline frontend: 23 tests passed for Member check-in, Progress and center time.

## Verified source flow
- MemberCheckInPage scans SOL:GATE QR and POSTs /api/v1/check-in/self. CenterCheckinService verifies signed gate QR, current subscription and member state, then applies locking/anti-passback and saveAndFlush.
- CenterCheckin JPA entity maps center_checkins. status is GRANTED or DENIED; checkInTime, checkOutTime and gate are returned in CheckinDto. No CHECK_IN/CHECK_OUT event-type column exists.
- POST /api/v1/check-in/self/checkout updates checkOutTime on the same GRANTED visit. Count its entry once; do not exclude completed visits or add a checkout entry.
- GET /api/v1/check-in/history?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD supports an inclusive range of up to 31 days. Service queries the current Member principal.id(), never a member id supplied by the new UI. No backend/API/schema changes needed.
- Existing WebConfig clock uses Asia/Ho_Chi_Minh. Frontend reuses centerTime helpers for offsetless server timestamps and UTC timestamps.

## Implementation
- Two Progress tabs; original evaluations, weekly measurements and homework remain mounted to retain their state.
- White/salmon history card; Monday-first monthly calendar; month/year navigation; today marker; selected-day filter; latest-first entries with date, time, optional gate and successful status.
- Count distinct successful entry dates and every GRANTED entry, excluding denied, invalid timestamps and future timestamps. No extra checkout count.
- Read real history API on tab mount, month change, window focus or visible document; explicit retry/refresh. Ignore outdated responses. No history polling, localStorage history, generated entries or booking substitution.

## Verification
- Frontend lint: npm.cmd run lint passed. Production build: npm.cmd run build passed.
- Final full frontend suite: 818/818 tests, 127 files, exit 0. Existing suite emits ECONNREFUSED localhost:3000 diagnostics; no failed assertions.
- Focused regression run: 46/46 tests, including Member/Staff QR, Progress, calendar/date aggregation and center time.
- Cases: multiple entries in a day, checkout on an entry, rejected entries, empty day/month, leap February, December/January, UTC+7 midnight, refresh/remount, loading/error/retry and stale responses.
- Real local API: unauthenticated GET http://localhost:8080/api/v1/check-in/history returned HTTP 401. No authenticated Member history or live database contents were inspected.
- Backend QR tests attempted: CenterCheckinServiceTest, CenterCheckinControllerTest, CenterCheckinAccessTest, GateQrServiceTest. Wrapper failed to start; direct cached Maven reached compilation but failed on local spring-boot-starter-web-3.4.4.jar dependency. Tests did not execute; do not claim backend passing.
- No Supabase writes, real QR scan, schema update or production operations. Camera-to-database E2E, authenticated ownership with live accounts and visual desktop/mobile QA remain unverified.
- graphify command and Python unavailable; graph not updated. No architecture/backend changes.

## Changed files
- DESIGN.md
- apps/web/src/features/member/MemberProgressPage.tsx
- apps/web/src/features/member/MemberProgressPage.test.tsx
- apps/web/src/features/member/member-progress.css
- apps/web/src/features/member/WorkoutHistory.tsx
- apps/web/src/features/member/WorkoutHistory.test.tsx
- apps/web/src/features/member/workoutHistoryPresentation.ts
- apps/web/src/features/member/workoutHistory.test.ts
- This report.

## Handoff
No Finance, schedule, QR implementation, backend or schema files changed. Conflict risk is limited to shared Progress files and DESIGN.md. Ready for code review/draft PR with the limitations above; authenticated E2E and visual QA should precede merge. No commit/push performed.

## Tái kiểm tra theo yêu cầu tiếp theo (05/11/2026)

Phần này cập nhật kết luận của lần kiểm tra đầu tiên ở trên.

| Hạng mục | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| Workspace | PASS | Vẫn ở main; giữ nguyên thay đổi chưa commit của task. Không commit/push/tạo PR. |
| Frontend local | PASS | GET http://localhost:5173/member/progress trả 200 text/html. Đây chỉ là xác minh server, chưa chứng minh giao diện đã render sau đăng nhập. |
| API local và proxy | PASS | GET http://localhost:8080/api/v1/check-in/history và http://localhost:5173/api/v1/check-in/history đều trả 401 khi không có phiên; đúng hành vi dự kiến. |
| Xác thực | PASS ở mức code/test | apiFetch gửi Bearer JWT hiện có qua /api/v1; JwtAuthenticationFilter kiểm tra JWT và tài khoản active/chưa xóa, tạo principal. Không đọc hoặc trích xuất token trình duyệt. |
| Member chỉ đọc lịch sử của mình | PASS ở mức code/unit/WebMvc | Service dùng principal.id() trong truy vấn lịch sử; không dùng memberId từ frontend. Chưa kiểm thử hai phiên Member thật. |
| GRANTED / DENIED / checkout | PASS ở mức unit | API lịch sử trả nhật ký gồm cả GRANTED và DENIED; UI lọc GRANTED. Checkout cập nhật cùng bản ghi, không sinh lượt riêng. Test xác nhận hai lượt cùng ngày, lượt đã checkout và lượt bị từ chối. |
| Ngày tháng và nội dung cũ | PASS ở mức component/unit | Test tab, giữ số đo/giáo án, chọn ngày, tháng/năm, năm nhuận, UTC+7 gần nửa đêm, lỗi và retry. |
| Đồng bộ không F5 | PASS ở mức component/unit | Bổ sung test nhận danh sách mới từ API khi focus/visibilitychange; thống kê và danh sách thay đổi theo response mới. Không tạo check-in thật. Tab unmount/remount được kiểm thử ở lần trước. |
| Backend QR tests | PASS | CenterCheckinAccessTest 4, CenterCheckinControllerTest 7, CenterCheckinServiceTest 33, GateQrServiceTest 2: tổng 46, failures/errors/skipped đều 0; Maven BUILD SUCCESS, lệnh chạy trực tiếp exit 0. Toàn bộ dùng mock hoặc WebMvc slice, không ghi Supabase. |
| Frontend test liên quan | PASS | 48/48 test, 7 file, exit 0. ESLint file test được bổ sung đạt exit 0. |
| Phiên Member thật | BLOCKED | Browser access host/native pipe không khả dụng. Người dùng đã chọn tự kiểm thử thủ công. Không sử dụng tài khoản tự suy đoán hoặc trích xuất secret. |
| QR thật hiển thị ở Progress | BLOCKED | Chưa có xác minh E2E bằng dữ liệu Supabase và Member đăng nhập. HTTP 401 không chứng minh dữ liệu thật đã hiển thị. |
| Desktop/mobile trực quan | BLOCKED | Không có kết nối trình duyệt; chưa chụp ảnh/đo overflow/render UI. Test component không thay thế kiểm tra này. |

### Chẩn đoán Maven

Stack trace chỉ ra java.nio.file.AccessDeniedException khi javac đóng ZIP filesystem của spring-boot-starter-web-3.4.4.jar trong Maven cache ngoài workspace. Chạy đúng bốn bộ test mock ngoài sandbox bằng Maven đã cài sẵn và trỏ repository về cache người dùng đã thành công. Đây là giới hạn quyền truy cập cache trong môi trường chạy, không có bằng chứng JAR hỏng. Không sửa pom.xml, dependency, quyền filesystem, profile hay cấu hình dùng chung; không tải lại/xóa cache. Wrapper mặc định vẫn chưa được sửa; đã dùng đường dẫn Maven có sẵn để xác minh.

### Thay đổi ở lần tái kiểm tra

Chỉ bổ sung hai regression test tại WorkoutHistory.test.tsx và cập nhật báo cáo này. Chưa phát hiện bug chức năng được chứng minh bằng các kiểm tra có thể chạy; không thay đổi implementation, QR, backend, schema, lịch học hoặc Finance.

### Các bước kiểm thử thủ công còn lại

1. Mở http://localhost:5173, đăng nhập bằng tài khoản Member test đã được phép và có lịch sử sẵn. Không gửi token, mật khẩu hoặc ảnh chụp có Authorization cho người khác.
2. Mở /member/progress; xác nhận hai nút chuyển tab. Ở tab Tiến độ & Giáo án, kiểm tra đánh giá HLV, thay đổi qua các tuần và bài tập hôm nay vẫn như trước.
3. Mở Lịch sử tập luyện, chọn tháng có dữ liệu thật. Trong DevTools Network, kiểm tra request GET /api/v1/check-in/history?fromDate=...&toDate=... trả 200. Chỉ đối chiếu phần Response đã bỏ thông tin nhạy cảm; không sao chép request headers/token. Xác nhận memberId thuộc Member đang đăng nhập. Backend có thể trả DENIED trong nhật ký; các bản ghi này phải không xuất hiện trong lịch sử/thống kê Progress.
4. Đối chiếu các bản ghi GRANTED với giao diện: tổng lượt bằng số bản ghi hợp lệ, tổng ngày bằng số ngày checkInTime duy nhất ở UTC+7; checkOutTime không cộng lượt. Kiểm tra ngày/giờ/gate và thứ tự mới nhất trước. Chọn ngày không có dữ liệu, ngày nhiều lượt nếu có sẵn, chọn lại/Xem cả tháng; chuyển tháng 12 sang tháng 1 và ngược lại.
5. Dùng tài khoản Member test thứ hai được phép trong cửa sổ riêng, đối chiếu các bản ghi đã biết thuộc từng tài khoản. Mỗi tài khoản chỉ thấy lịch sử của chính mình; không dùng token của tài khoản này cho tài khoản kia. Nếu không có hai tài khoản/dữ liệu phân biệt, ghi mục này chưa xác minh.
6. Kiểm tra desktop 1440px và mobile 390px/768px: không tràn ngang document, đủ 7 cột lịch, nút chuyển tháng/chọn ngày chạm được, nhãn và danh sách không đè nhau, tab cũ không vỡ. Kiểm tra thông báo empty khi thật sự không có dữ liệu.
7. Đồng bộ chỉ đọc: chuyển khỏi tab lịch sử rồi quay lại hoặc chuyển cửa sổ ra/vào; Network phải phát sinh GET mới, không có POST check-in do mở Progress. Không F5. Có thể đối chiếu với một lượt check-in thật phát sinh tự nhiên trong hoạt động được phép.
8. Nếu cần kiểm tra camera thực tế: chỉ trên môi trường/tài khoản được phép ghi check-in, có gói active; mở /member/check-in, chọn Check-in, quét QR cổng còn hạn, chờ GRANTED; mở Progress và đối chiếu thời gian/cổng, số lượt tăng đúng một. Checkout rồi quay lại Progress phải không tăng tổng lượt. Không tạo lượt thử trên Supabase dùng chung/production chỉ để hoàn tất QA; nếu không có môi trường ghi được phép, giữ mục này BLOCKED.

### Quyết định trước PR

Có thể chuẩn bị nội dung review/draft PR với các giới hạn nêu trên. Chưa đủ bằng chứng nghiệm thu hoàn chỉnh: cần Member thật + dữ liệu QR thật hiển thị, đối chiếu quyền giữa các Member và kiểm tra giao diện desktop/mobile. Không có test FAIL trong các bộ liên quan đã chạy; các mục BLOCKED không được coi là PASS.

Kết quả cuối của lần tái kiểm tra: toàn bộ frontend 820/820 test PASS, 0 failed, lệnh exit 0. Bộ test vẫn phát log ECONNREFUSED localhost:3000 như lần trước; không có assertion thất bại. Lint toàn frontend và production build đã PASS ở lần triển khai trước; lần này không đổi mã sản phẩm, file test bổ sung đã lint PASS.

## Tinh chỉnh giao diện lịch sử (05/11/2026)

- Branch riêng: feat/member-workout-history-ui, được tạo từ workspace có tính năng chưa commit; không đổi worktree, không mất thay đổi cũ, không commit/push/PR.
- Chỉ sửa WorkoutHistory.tsx, WorkoutHistory.test.tsx, member-progress.css, DESIGN.md và báo cáo này trong lượt tinh chỉnh.
- Bỏ hai dòng mô tả; 3 chỉ số ngày đã tập/ngày không tập/tổng lượt, cùng chiều cao desktop và 2+1 ô trên mobile. Ngày không tập tính từ đầu tháng đến hôm nay, bao gồm hôm nay; tháng quá khứ tính đủ tháng, tương lai là dấu gạch ngang. Profile/history không có ngày bắt đầu hội viên, nên không suy từ hợp đồng gói tập và không giới hạn bằng dữ liệu không chắc chắn.
- Lịch rộng tối đa 1100px, khoảng cách lớn hơn, ô ngày 80px desktop / 68px tablet / 54px mobile, vẫn 7 cột. Ngày tập có dấu tick, hôm nay gạch chân/dấu chấm, ngày tương lai viền đứt, ngày chọn viền charcoal độc lập với nền salmon; có nhãn trợ năng.
- Danh sách tên Lịch sử tập luyện; hàng compact gồm ngày/giờ, vị trí (ghi rõ khi chưa có thông tin), trạng thái. Phân trang client 5 lượt, trước/sau, tổng lượt, reset khi chọn ngày/đổi tháng. Có clamp trang khi dữ liệu mới ít hơn.
- Giữ API/xác thực/GRANTED/DENIED/checkout/focus refresh; không sửa backend, Progress cũ hoặc Supabase.
- Kiểm thử liên quan: 29/29 PASS. Toàn bộ frontend: 824/824 PASS, exit 0; các log ECONNREFUSED localhost:3000 của suite vẫn xuất hiện như trước.
- TypeScript + production build: PASS, npm.cmd run build exit 0.
- http://localhost:5173/member/progress trả 200. Đăng nhập Member rồi chọn Lịch sử tập luyện để kiểm tra.
- Chưa kiểm tra trực quan desktop 1440px/tablet 768px/mobile 390px: browser host/native pipe vẫn không khả dụng; không dùng dữ liệu giả để thay cho xác minh API thật. Các breakpoint đã triển khai nhưng chưa khẳng định kết quả render.
ESLint toàn frontend: PASS, npm.cmd run lint exit 0. git diff --check PASS; không có lỗi kiểm thử còn lại trong phạm vi thay đổi.

## Demo 2 — Accordion theo ngày (05/11/2026)

- Tiếp tục branch feat/member-workout-history-ui, không sửa worktree khác hoặc commit/push/PR.
- Thay hàng check-in bằng nhóm ngày sau khi lọc GRANTED và chuẩn hóa ngày theo Asia/Ho_Chi_Minh. Ngày/giờ giảm dần. Badge ngày/tháng, DD/MM/YYYY, tổng lượt check-in; không coi mỗi lượt là một phiên tập.
- Mặc định mọi nhóm đóng; nút native hỗ trợ focus/bàn phím theo hành vi trình duyệt, aria-expanded, aria-controls và panel gắn nhãn. Nhấn mở/đóng; chi tiết giữ đủ giờ, vị trí và trạng thái thành công.
- Phân trang 5 ngày thay cho 5 lượt. Toàn bộ lượt của một ngày nằm cùng nhóm. Bộ lọc lịch chỉ hiển thị nhóm ngày được chọn; đổi tháng/ngày reset trang đầu. Nhóm mới hoặc nhóm trở lại trang mặc định đóng.
- Ba thống kê, lịch tháng và trạng thái ngày, API/xác thực, focus refresh, tab Progress/biểu đồ giữ nguyên; không thay backend, schema hay thao tác Supabase.
- Files chỉnh lượt này: WorkoutHistory.tsx, WorkoutHistory.test.tsx, member-progress.css, DESIGN.md, báo cáo QA này.
- Component/helper/Progress tests liên quan: 31/31 PASS. Toàn bộ frontend: 826/826 PASS, exit 0. Đã kiểm tra nhóm ngày Việt Nam qua UTC+7 nửa đêm, DENIED, checkout không cộng lượt, ngày 1/nhiều lượt, mặc định đóng/mở/đóng, focus nút, thứ tự nhóm/giờ, 5 ngày/trang, chọn ngày, đổi tháng, empty/error và refresh.
- Suite vẫn phát log ECONNREFUSED/ETIMEDOUT tới localhost:3000; không có assertion fail.
- Responsive đã có CSS desktop và mobile, giữ hỗ trợ tablet. Chưa xác minh render/overflow bằng ảnh thật ở 390/768/1440px vì browser host/native pipe không khả dụng. Kiểm thử bàn phím thực tế Enter/Space trên trình duyệt và E2E Member thật vẫn theo checklist thủ công ở trên.
- URL http://localhost:5173/member/progress trả HTTP 200. Đăng nhập Member, mở tab Lịch sử tập luyện để kiểm tra Accordion mới.
Kết quả cuối Demo 2: ESLint toàn frontend PASS; TypeScript + production build PASS (exit 0); git diff --check PASS. Không có dependency mới.
