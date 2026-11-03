# Thanh toán VNPay Sandbox

Phạm vi theo yêu cầu 03/11/2026: mua/gia hạn/nâng cấp gói tập, buổi PT trả theo giờ, lượt đặt sân vượt quyền lợi và các phiếu thu đang chờ (bao gồm lớp học nếu đã có phiếu thu). Phần miễn phí theo gói không tạo giao dịch. Chỉ hỗ trợ Sandbox; mã kiểm tra cấu hình từ chối host production dù đổi cấu hình.

## Cấu hình backend

Đăng ký tài khoản merchant thử nghiệm tại [VNPay Sandbox](https://sandbox.vnpayment.vn/devreg/). Lấy TmnCode và HashSecret từ VNPay. Không đưa khóa thật hoặc khóa Sandbox vào Git, mã React, biến `VITE_*`, log hay chat.

Thêm vào môi trường chạy Spring Boot:

```dotenv
VNPAY_ENABLED=true
VNPAY_TMN_CODE=YOURCODE
VNPAY_HASH_SECRET=
VNPAY_RETURN_URL=https://your-web.example/member/payments/vnpay/return
VNPAY_TIMEOUT_MINUTES=15
```

`YOURCODE` là placeholder, không phải tài khoản đã cấu hình. Không có merchant code/secret thì API checkout trả 503 với thông báo đã dịch. URL thanh toán cố định `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`; không có công tắc chuyển production.

- **Return URL:** trang React ở trên, chỉ hiển thị kết quả từ API có xác thực. Local có thể dùng `http://localhost:5173/member/payments/vnpay/return`. Cần đăng nhập bằng chính hội viên tạo đơn để đọc giao dịch.
- **IPN URL:** đăng ký với VNPay địa chỉ HTTPS công khai `https://your-api.example/api/v1/payments/vnpay/ipn`. VNPay phải truy cập được endpoint từ Internet; localhost/địa chỉ LAN không đủ. Dev có thể dùng tunnel HTTPS vào API. Endpoint GET này không cần JWT nhưng luôn kiểm tra HMAC-SHA512.
- API vẫn chạy profile `supabase`, JDBC TLS. Hibernate `ddl-auto=update` thêm `vnpay_transactions` và hai liên kết nullable `payments.coach_booking_id`, `payments.court_booking_id`. `PostgreSqlDataSecurityInitializer` tự bật RLS cho entity mới. Không chạy DDL/migration lịch sử.
- Các khoản sân/PT cũ đã trả tiền giữ nguyên dữ liệu; không suy đoán/backfill liên kết bằng nội dung note. Chỉ phiếu thu mới tạo bằng luồng này có liên kết mới.

## Website đang dùng

- Frontend: `https://sportcenterswp391.vercel.app`
- Backend: `https://swp391-u1fs.onrender.com`
- Return URL: `https://sportcenterswp391.vercel.app/member/payments/vnpay/return`
- IPN đăng ký tại VNPay: `https://swp391-u1fs.onrender.com/api/v1/payments/vnpay/ipn`

Trên Render → service backend → Environment, thêm `VNPAY_ENABLED=true`, `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` do VNPay cấp, `VNPAY_RETURN_URL` như trên, `VNPAY_TIMEOUT_MINUTES=15`; lưu và redeploy backend có mã tích hợp VNPay. Không đặt HashSecret trên Vercel hoặc biến `VITE_*`. `.env` tại máy chỉ phục vụ runner local, không tự đồng bộ lên Render. Cần deploy frontend có trang Return URL và đăng ký IPN trên merchant Sandbox trước khi thử giao dịch đầy đủ.

## Thử luồng

1. Khởi động backend với env merchant và frontend; đăng ký IPN và Return URL cho merchant Sandbox.
2. Gói tập: chọn mua/gia hạn/nâng cấp → chọn phương thức thanh toán → “Thanh toán VNPay Sandbox”. Giá do backend lấy từ subscription/phiếu thu; không nhận giá từ trình duyệt.
3. Sân: chọn “VNPay Sandbox” khi lượt vượt quyền lợi → đặt → thanh toán tại thẻ “Lượt đặt của tôi”. Đặt định kỳ thanh toán từng buổi có phí riêng. Lượt miễn phí theo gói giữ nguyên.
4. PT: đặt buổi trả theo giờ → dùng nút VNPay trong hộp thanh toán hoặc tại lịch hẹn chưa trả. Lễ tân vẫn có thể thu tại quầy nếu chưa có giao dịch VNPay đang chờ.
5. “Giao dịch & hóa đơn” có phần phiếu thu chờ thanh toán; chọn VNPay cho phiếu thu của chính mình.
6. Dùng thông tin ngân hàng/thẻ thử nghiệm được [VNPay cung cấp](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html). Không dùng thẻ/tài khoản thật.
7. Kiểm tra khi thành công: Payment=success, có hóa đơn, gói được kích hoạt/mã QR hoặc booking.paymentStatus=paid; thử tải lại IPN không tạo thêm giao dịch/hóa đơn. Thử thất bại/hủy, IPN tới muộn, sửa amount/hash, đăng nhập tài khoản khác.

## Đối soát và giới hạn

- Return URL không ghi sổ hay cấp quyền. API chỉ ghi nhận khi IPN hợp lệ, khớp merchant/reference/amount và cả `vnp_ResponseCode`, `vnp_TransactionStatus` bằng `00`.
- Giao dịch đang chờ được dùng lại đến hết hạn, không tạo tham chiếu mới khi bấm lại. Giao dịch đã có IPN thất bại được thử lại bằng tham chiếu mới; giữ lịch sử tham chiếu cũ.
- **Hết hạn tại máy không chứng minh ngân hàng chưa thu tiền.** Khi chưa có IPN, hệ thống chặn thu thêm tại quầy, mở giao dịch khác và hủy lượt đang có giao dịch. Lễ tân phải đối soát trên merchant Sandbox/nhờ VNPay gửi lại IPN. Chưa có job tự gọi QueryDR; không sửa DB để ép thành công/thất bại. Kết quả thành công hợp lệ đến muộn vẫn được xử lý nếu khoản thu còn hợp lệ.
- Chưa tích hợp API refund VNPay. Endpoint hoàn tiền nội bộ từ chối khoản đã trả thành công qua VNPay để tránh ghi nhận “đã hoàn” khi cổng chưa hoàn tiền. Đây là phạm vi thanh toán, không phải tự động hoàn tiền.
- Không có merchant credentials trong repository nên unit test và browser test dùng dữ liệu/chữ ký giả lập; chưa xác nhận kết nối merchant Sandbox hoặc nâng cấp DB Supabase thật. Chỉ báo hoàn tất kiểm thử VNPay thực tế sau khi chạy được bước 1–7.

## Kiểm thử tại repository

- `JAVA_HOME=<JDK21> ./mvnw test` tại `apps/api`.
- `pwsh -File scripts/test-database-config.ps1` khi có PowerShell.
- `npm --prefix apps/web run build`, `npm --prefix apps/web run lint`, `npm --prefix apps/web test`.
- `NODE_PATH=<thư mục node_modules có playwright-core> CHROME_PATH=<đường dẫn Chromium/Chrome> node scripts/verify-vnpay-sandbox.cjs` khi Vite đang chạy. Script chặn toàn bộ API và URL VNPay, không tạo giao dịch thật.

Hợp đồng API: [openapi-vnpay.yaml](api-contracts/openapi-vnpay.yaml). Tài liệu giao thức chính thức: [PAY 2.1.0](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html).
