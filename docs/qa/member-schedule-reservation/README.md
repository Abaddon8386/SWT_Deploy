# Member Schedule & Reservation — 04/11/2026

## Phạm vi và nguồn giao việc

Bốn chỉnh sửa cùng màn hình do leader trực tiếp giao qua yêu cầu của người dùng. Dùng branch `fix/member-schedule-reservation-ui` và subject commit đúng yêu cầu; không tạo/gán Jira giả. Backlog lịch sử xác định màn hình MemberClasses thuộc Thịnh, SCRUM-88; tài liệu này không coi đó là ticket mới hoặc tự cập nhật trạng thái Jira. Base: `origin/main` tại `7c93a5c7`.

- Task 1: dấu cộng SVG đối xứng, căn giữa hai chiều trong nút tròn 52px; giữ màu, click, loading, disabled và nhãn trợ năng.
- Task 3: bỏ sao và bộ lọc yêu thích, state/effect/handler riêng của trang. Giữ API favorite dùng chung. Bộ môn vẫn lấy từ danh mục chuẩn hiện có, không thêm môn giả.
- Task 4: chỉ Tuần trước/Tuần này/Tuần kế tiếp; tuần Thứ Hai–Chủ nhật theo `Asia/Ho_Chi_Minh`. URL `week=month` hoặc giá trị lạ được thay bằng `week=0`; giữ tab và bộ môn. Không có persisted month state trong phiên bản cũ. Dọn helper frontend 30 ngày không còn consumer.
- Task 2: xóa chế độ/chọn nhiều buổi, checkbox đặt chỗ, select-all, handler/API helper bulk booking và nhánh kết quả đặt nhiều buổi. Giữ nguyên hủy nhiều buổi tại Lịch học của tôi. Giữ đặt một buổi, hủy, thông báo, kiểm tra chỗ đầy/trùng giờ và API validation gói tập/quyền.

Chỉ sửa frontend, test, tài liệu thiết kế và QA. Không sửa backend, endpoint, entity, trigger hay dữ liệu booking. Không chạm Membership V2, Health Metrics, Daily Workout hoặc branch/PR khác. Backend bulk vẫn giữ để tránh ảnh hưởng consumer ngoài màn hình; không xóa endpoint khi chưa chứng minh an toàn cho mọi consumer.

## Kiểm chứng

- Baseline: 35/35 tests tại MemberClassesPage + memberClassesApi.
- Đã thấy các test mới fail trước sửa: SVG, favorite, khoảng tuần, bulk booking; test UTC tái hiện tuần lệch tại 00:00 thứ Hai giờ Việt Nam.
- Targeted cuối: **46/46 PASS**, 3 files (trang, API, MemberTimetable), chạy với `TZ=UTC`.
- Full frontend: **688/688 PASS**, 102 files.
- Full ESLint: PASS; TypeScript `tsc -b`: PASS; production build: PASS.
- Browser Chrome local: **14/14** cấu hình light/dark × 320, 390, 768, 1024, 1440, 1920, 2560px; không tràn ngang. Nút 52×52px; sai lệch tâm SVG/nút 0px theo cả hai chiều.
- Browser chạy múi giờ `America/Los_Angeles`, đồng hồ cố định `2026-11-04T02:00:00Z`: ba request tuần có đúng ngày trung tâm; bộ môn vẫn được giữ khi đổi tuần. Kiểm tra URL cũ, lọc môn, đặt một buổi pending/success/full, loading/empty/error/retry.
- Đã xem ảnh desktop/mobile. Review độc lập: không có finding nghiêm trọng.
- `git diff --check`: PASS. Rà file ngoài phạm vi và secret: không phát hiện. Token trong script chỉ là chuỗi fixture local, không phải credential.
- Backend tests: NOT RUN (không đổi backend). Live booking/DB thật: NOT RUN; mọi API trong browser QA được intercept, không ghi shared database. Không có mock runtime trong product.

Vitest vẫn in cảnh báo kết nối localhost:3000 từ test environment như baseline, exit 0; không có test fail. Browser không có page error.

## Chạy lại

```powershell
cd apps/web
npm.cmd ci
$env:TZ = 'UTC'
npm.cmd test -- src/features/member/MemberClassesPage.test.tsx src/features/member/memberClassesApi.test.ts src/features/member/components/MemberTimetable.test.tsx
npm.cmd test
npm.cmd run lint
npx.cmd tsc -b
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Từ repo root, với `playwright-core` có sẵn qua `NODE_PATH` và Chrome đã cài:

```powershell
$env:PUBLIC_UI_URL = 'http://127.0.0.1:5179'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/verify-member-schedule.cjs
```

Kết quả: [browser-results.json](browser-results.json), [desktop](schedule-1440.png), [mobile](schedule-390.png). Ảnh mobile được chụp sau cuộn tới nút đặt chỗ. Script là công cụ QA, không được import vào ứng dụng.
