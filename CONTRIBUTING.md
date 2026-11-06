# Hướng dẫn đóng góp

Đọc [AGENTS.md](AGENTS.md), [cấu trúc repository](docs/architecture/REPOSITORY_STRUCTURE.md) và [backlog](docs/plans/AGILE_SCRUM_JIRA_PLAN.md) trước khi sửa code. Với backend đọc thêm [quy chuẩn kiến trúc](docs/rules/backend-architecture.md); với UI đọc [DESIGN.md](DESIGN.md).

## Làm việc theo phạm vi

Mỗi PR giải quyết một ticket hoặc một thay đổi kỹ thuật có thể review độc lập. Ghi vấn đề, hành vi sau sửa, Jira key nếu có, kiểm chứng và giới hạn thực tế. Refactor giữ nguyên API/hành vi cần tách khỏi thay đổi nghiệp vụ để reviewer kiểm tra được.

Giữ code theo feature, tái sử dụng component/tiện ích đang có. Không thêm database khác, DDL migration mới, abstraction hoặc dependency khi chưa có nhu cầu rõ ràng. Thay đổi API phải cập nhật contract; thông báo backend mới phải có cả tiếng Việt và tiếng Anh.

## Cài đặt và kiểm chứng

Yêu cầu Node.js 22.12+ hoặc Node.js 24 LTS, Java 21. Dùng npm lockfile và Maven Wrapper của repo; không cần cài Maven riêng.

```sh
npm --prefix apps/web ci
npm run lint:web
npm run test:web
npm run build:web
npm run test:api
```

Các lệnh Maven ở root (`dev:api`, `build:api`, `test:api`) đi qua `scripts/run-maven.mjs`, chọn wrapper theo hệ điều hành. `npm start`/`npm run dev`, `stop` và `db:init` vẫn là bộ runner Windows/PowerShell hiện có; xem [hướng dẫn runner](scripts/README.md). macOS/Linux có thể chạy API và web ở hai terminal sau khi cấu hình môi trường theo [Supabase setup](docs/SUPABASE_SETUP.md).

Test DB thật chỉ dùng Supabase dev/test với schema biệt lập và biến môi trường dành riêng cho test; không dùng production để chạy test. Một test bị skip vì thiếu cấu hình không được báo là đã kiểm chứng DB thật. CI còn chạy `scripts/test-database-config.ps1` bằng PowerShell.

## Trước khi gửi PR

- Chạy checks phù hợp với thay đổi; ghi đúng kết quả, kể cả test skip hoặc chưa chạy Docker/browser.
- Kiểm tra `git diff --check` và `git diff --cached` trước khi commit.
- Không commit secret, `.env` thật, Graphify, dependencies hoặc build output. Mẫu `.env.example` phải dùng placeholder.
- Giữ nguyên các luồng Render/Vercel và CI VPS khi thay đổi cấu trúc; cập nhật tài liệu đường dẫn nếu có di chuyển file.
- Không tự ý xóa ảnh QA, SQL lịch sử hoặc tài liệu đang được tham chiếu như một cách giảm kích thước repo.
