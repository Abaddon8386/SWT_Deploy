# VNPay Sandbox — kiểm chứng 03/11/2026

Phạm vi: SCRUM-76 mở rộng theo yêu cầu người dùng sang gói tập, PT, sân và phiếu thu chờ. Chỉ Sandbox; không deploy hoặc chạy giao dịch có tiền thật.

- Frontend: `npm run build`, `npm run lint`, `npm test` tại `apps/web` đều exit 0; 656 test qua ở lần chạy toàn bộ.
- Backend: `./mvnw -q test` với JDK 21 exit 0; báo cáo có 989 test, 0 lỗi/thất bại, 34 skipped vì các kiểm thử DB thật cần cấu hình Supabase dev/test. `DatabasePolicyTest` (3) và `DatabaseProfilesTest` (8) đều qua. Sau phần dọn phiếu thu khi hủy lượt, chạy lại tập test CourtBookingService/CoachBookingService/VNPay.
- Test mới: HMAC vector độc lập, tamper/hash/merchant, amount ×100, owner, IPN lặp, hai mã success, thất bại, booking đã hủy, IPN rollback/duplicate query, hạn thanh toán và tái dùng tham chiếu, chặn host production, chặn thu tại quầy/hoàn tiền giả, filter chain bảo vệ API.
- Frontend test mới: khóa double submit, ID-only request, retry lỗi, không tin mã thành công/thất bại trên URL quay về.
- `scripts/verify-vnpay-sandbox.cjs` exit 0: bốn đích thanh toán điều hướng sang URL Sandbox tại 390px/1440px; ba trạng thái pending/failed/success do API trả; không tràn ngang, không lỗi JS. API và URL VNPay bị chặn hoàn toàn bằng fixture, không dùng merchant hoặc DB thật.
- Chưa chạy giao dịch merchant Sandbox và nâng cấp schema trên Supabase thật; cần cấu hình theo `docs/VNPAY_SANDBOX.md`.
- `scripts/test-database-config.ps1` chưa chạy: môi trường không có `pwsh`. Không thay database/profile để né kiểm tra.
- Knowledge graph chưa cập nhật: interpreter lưu trong `graphify-out/.graphify_python` là đường dẫn Windows không tồn tại trên máy này và Python hiện tại chưa có module `graphify`. Không sửa graph bằng dữ liệu suy đoán.

Không gộp/commit các thay đổi giao diện hoặc lịch đang có từ tác vụ khác trong workspace.

## Xác minh bản ghép lên main

Checkout riêng trên `origin/main` đã có lịch tuần, bổ sung commit tính phí sân cần cho VNPay và các thay đổi portal/giáo án của chat này. Build/lint frontend exit 0; 664 test frontend qua. Backend: 964 test, 0 lỗi/thất bại, 34 skipped vì thiếu môi trường DB thật. `.env` và merchant HashSecret không được đưa vào checkout/commit.
