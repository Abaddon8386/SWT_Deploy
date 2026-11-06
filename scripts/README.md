# BỘ CÔNG CỤ KHỞI CHẠY HỆ THỐNG (LOCAL RUNNER SCRIPTS)

Thư mục này chứa các script tự động hóa khởi chạy, kiểm tra môi trường và quản lý tiến trình local cho dự án **Sports Center Management System (SCMS)**.

Runner mặc định dùng Supabase PostgreSQL; cấu hình theo [SUPABASE_SETUP.md](../docs/SUPABASE_SETUP.md). API/Web chạy nền, log tại `api.log`, `api-error.log`, `web.log`, `web-error.log` ở root. Hibernate tạo/cập nhật schema và cài trigger khi API khởi động.

Runner chỉ chấp nhận profile `supabase`; không chạy database thay thế trên máy cá nhân. Kiểm tra cấu hình bằng `powershell -ExecutionPolicy Bypass -File scripts/test-database-config.ps1` từ root.

Runner chờ API báo `UP` tại `/api/v1/health` trước khi khởi chạy web, rồi kiểm tra web ở cổng 5173 trước khi báo hoàn tất và mở trình duyệt. Dịch vụ SÖL đang hoạt động được dùng lại; web không tự chuyển sang cổng khác nếu 5173 đang bị chiếm. Nếu dịch vụ chưa sẵn sàng sau 120 giây, runner báo lỗi kèm vị trí log.

---

## Danh Mục Script

| Script Windows (Batch) | Script PowerShell | Chức năng chính |
|---|---|---|
| [`run-local.bat`](run-local.bat) | [`run-local.ps1`](run-local.ps1) | **Khởi chạy hệ thống:** Kiểm tra Node.js, Java 21 và cấu hình Supabase; nạp `.env`; chạy Backend API (8080) + Frontend Web (5173). |
| [`stop-local.bat`](stop-local.bat) | [`stop-local.ps1`](stop-local.ps1) | **Dừng nhanh các tiến trình local:** Quét và giải phóng cổng 8080 (API) và 5173 (Web). |
| [`init-db.bat`](init-db.bat) | [`init-db.ps1`](init-db.ps1) | **Kiểm tra cấu hình database:** Hướng dẫn khởi động API để Hibernate đồng bộ schema; không thực thi DDL hoặc reset dữ liệu. |

---

## Cách Sử Dụng

### Cách 1: Chạy trực tiếp từ thư mục `scripts/`
- Bấm đúp chuột vào file `.bat` tương ứng (`run-local.bat`, `stop-local.bat`, `init-db.bat`).

### Cách 2: Chạy qua lệnh NPM từ thư mục gốc
Tại thư mục gốc của dự án:
```bash
npm start          # Khởi động hệ thống (Web + API)
npm run stop       # Dừng hệ thống
npm run db:init    # Khởi tạo CSDL
```


## Maven Wrapper trên Windows, macOS và Linux

`run-maven.mjs` dùng Node.js để chọn `mvnw.cmd` trên Windows hoặc `./mvnw` trên macOS/Linux, chạy trong `apps/api` và giữ exit code của Maven. Các lệnh ở root:

```sh
npm run dev:api
npm run build:api
npm run test:api
```

Các lệnh này yêu cầu Java 21 và biến môi trường ứng dụng được cấu hình khi chạy API. Chúng không tự nạp `.env`; bộ runner PowerShell ở trên mới thực hiện việc nạp file. `npm start`, `stop`, `db:init` vẫn dành cho Windows/PowerShell.

Các script `audit-*.cjs`, `verify-*.cjs` là công cụ QA chủ động, không phải mã runtime hoặc gate CI mặc định. Chỉ chạy đúng script cho phạm vi cần kiểm chứng; không commit toàn bộ output sinh tự động.
