# Member Schedule runtime verification — 05/11/2026

Người dùng đã kiểm tra trực tiếp localhost và xác nhận cả bốn task đáp ứng yêu cầu leader.

## Source và nguyên nhân

Port 5173 trước đó phục vụ checkout gốc `main` tại `7c93a5c7`, còn bản sửa `6a753bda` phục vụ tại port 5179. Đã chạy đúng worktree `%TEMP%/SWP391_member_schedule`, branch `fix/member-schedule-reservation-ui`, tại localhost:5173; không sửa checkout gốc.

Bản cũ dùng chữ `+`: line box được grid căn giữa nhưng nét glyph thấp 3,5–4,5px do baseline/font. Bản sửa dùng SVG 36×36, viewBox 0 0 24 24, path đối xứng quanh (12,12), nút 52×52. Browser đo tâm SVG/path sai lệch 0px; nét raster ±0,5px do subpixel/antialiasing. Không cần sửa thêm CSS, SVG hay transform.

## Kiểm chứng

- Bỏ bulk booking **lớp học**, favorite của trang và khoảng 30 ngày. Giữ single booking, hủy một/nhiều buổi, API favorite chung và luồng PT riêng.
- Chrome local: light/dark × 320, 390, 768, 1024, 1440, 1920, 2560px: **14/14 PASS**, không tràn ngang hoặc page error.
- Đã click cả 6 môn chuẩn và reset; đổi ba tuần, giữ môn, URL `week=month` về tuần này; browser Los Angeles vẫn gửi đúng tuần Asia/Ho_Chi_Minh.
- Đã kiểm tra normal/hover/loading/disabled, phản hồi single booking/full, loading/empty/error/retry và xác nhận trước khi hủy một/nhiều buổi.
- Browser authenticated UI dùng **fixture mạng cô lập**, chặn mọi request khỏi backend. Người dùng xác nhận không có môi trường test DB cô lập: **API/DB E2E: NOT RUN**. Không có tuyên bố đã ghi booking thật, không ghi shared database.
- Targeted: **46/46 PASS**, 3 files với TZ=UTC; full frontend: **688/688 PASS**, 102 files. Full ESLint, TypeScript, production build và diff whitespace: PASS.
- Sửa test chuyển tab PT để mock API review bị bỏ sót, loại sleep 50ms gây flaky; không sửa implementation PT.

## Phạm vi PR

Khi fetch kiểm tra, PR #98 có head `6a753bda` và chỉ một commit Member Schedule so với main; không có thay đổi Equipment ngoài phạm vi trong diff PR. Không sửa/revert code của đồng đội. Không đổi backend, Membership V2, Health Metrics hay Daily Workout.

Giữ tối thiểu ba ảnh có vai trò khác nhau và hai JSON đo hình học/pixel. 22 ảnh/file tạm hoặc trùng được lưu ngoài worktree tại `%TEMP%/SWP391_member_schedule_qa_archive_20261105`, không đưa vào commit.

## Bằng chứng và chạy lại

[Trước desktop](before-light-1440.png) · [Sau desktop](after-light-1440.png) · [Sau mobile dark](after-dark-390.png)

[Đo trước](before-measurements.json) · [Đo sau](after-measurements.json) · [Browser checks](interaction-checks/browser-results.json)

Với Vite local, Chrome và playwright-core có sẵn qua NODE_PATH:

```powershell
$env:PUBLIC_UI_URL = 'http://localhost:5173'
$env:SCHEDULE_QA_OUTPUT = "$env:TEMP/member-schedule-browser-verification"
node scripts/verify-member-schedule.cjs
```

Output chạy lại để ngoài repository, tránh commit screenshot sinh lại hoặc trùng. Script QA không được import vào ứng dụng.
