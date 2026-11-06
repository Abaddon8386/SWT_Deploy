# Cấu trúc repository

Dự án là monorepo gồm một React SPA và một Spring Boot modular monolith. Hai ứng dụng có build context riêng để chạy trên Vercel/Render hoặc Docker Compose trên VPS.

```text
.
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/              # Router, layout và composition cấp ứng dụng
│   │   │   ├── features/         # UI, API client và test theo nghiệp vụ
│   │   │   ├── shared/           # Component, tiện ích và hạ tầng dùng chung
│   │   │   └── main.tsx          # Entry point
│   │   ├── public/              # Asset được phục vụ trực tiếp
│   │   ├── package.json         # Dependencies và script của frontend
│   │   ├── package-lock.json    # Lockfile npm duy nhất của ứng dụng
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── api/
│       ├── src/main/java/com/swp391/scms/
│       │   ├── <feature>/       # Domain module, xem quy ước bên dưới
│       │   ├── common/          # API envelope, exception, i18n, xử lý ảnh
│       │   ├── config/          # Cấu hình Spring và trigger provider
│       │   └── security/        # Authentication/authorization infrastructure
│       ├── src/main/resources/  # Profile, i18n, trigger và resource nghiệp vụ
│       ├── src/test/            # Test theo package/module tương ứng
│       ├── .mvn/               # Cấu hình Maven Wrapper được version control
│       ├── mvnw / mvnw.cmd
│       ├── pom.xml              # Dependencies backend; không dùng npm
│       └── Dockerfile
├── scripts/                     # Runner, kiểm tra chính sách và công cụ QA
├── .github/workflows/           # CI, CD Render/Vercel, CI Docker VPS
├── docs/
│   ├── architecture/           # Bản đồ cấu trúc và audit kỹ thuật
│   ├── adr/                    # Quyết định kiến trúc
│   ├── api-contracts/          # Hợp đồng API
│   ├── rules/                  # Quy chuẩn bắt buộc
│   ├── plans/                  # Backlog và kế hoạch triển khai
│   └── qa/                     # Báo cáo và minh chứng QA có chủ đích
├── db/                         # Tham chiếu SQL lịch sử, không dùng triển khai
├── .agents/                    # Tooling và quy tắc dành cho coding agent
├── compose.yml                 # Ghép web/API trên VPS
└── package.json                # Lệnh tiện ích ở root, không phải npm workspace
```

## Ranh giới frontend

- `app/` khai báo route, layout và ghép các feature; không chứa logic nghiệp vụ.
- `features/<feature>/` sở hữu màn hình, API client, state/hook và component của nghiệp vụ đó. Component riêng đặt trong `components/`, hook riêng đặt trong `hooks/` khi cần.
- `shared/` chỉ chứa mã được dùng chung thực sự. Không tạo thêm thư mục `utils`, `hooks` hoặc `services` ở root `src/` cho mã chỉ phục vụ một feature.
- Test đặt cạnh module (`*.test.ts`, `*.test.tsx`). Fixture chỉ phục vụ QA nằm trong test/script, không dùng làm fallback giá/tồn kho ở production.
- Cross-feature import phải có mục đích cụ thể. Không di chuyển tiện ích vào `shared` chỉ để né dependency cycle; loại vòng phụ thuộc tại nguồn.
- `features/portal` quản lý shell và navigation; các feature nghiệp vụ không tạo shell riêng cho từng role.

## Ranh giới backend

Theo [quy chuẩn backend](../rules/backend-architecture.md), mỗi feature sở hữu `controller/`, `service/`, `repository/`, `entity/`, `dto/` và `mapper/` khi cần. Luồng xử lý là controller → service → repository; không gọi repository trực tiếp từ controller và không trả entity qua API.

Code hiện có vẫn có một số controller ở package gốc của feature, như `membership`, `coaching`, `reports`, `facilities`. Đây là bố cục đang tồn tại, không phải một tầng nghiệp vụ thứ hai. Chuẩn hóa từng module trong một PR riêng cùng test và import liên quan; không đổi package hàng loạt chỉ để thư mục trông đồng đều.

- `scheduling` sở hữu lịch lớp; không tạo lại module `classes` rỗng song song.
- `reports` sở hữu báo cáo; không tạo lại package `reporting` rỗng song song.
- `catalog` phục vụ catalog công khai; `facilities` quản lý danh mục vận hành. Hai module có trách nhiệm khác nhau.
- Các adapter/provider được giữ khi có lý do nghiệp vụ, kiểm thử hoặc thay thế thực tế; không tạo interface chỉ để bọc một implementation.
- Schema do JPA Entity quản lý, trigger qua `DatabaseTriggerProvider`. Giữ Supabase PostgreSQL và profile `supabase` cho API.

## File được version control

Giữ source, test, lockfile cần thiết, Maven Wrapper, cấu hình build/deploy, mẫu môi trường đã loại secret và tài liệu được duy trì.

Không commit `graphify-out/` ở bất kỳ cấp thư mục nào, metadata/cache `.graphify*`, dependencies, kết quả build, coverage, output test runner, log hoặc `.env` thật. Graphify là chỉ mục local có thể sinh lại, không phải source of truth của kiến trúc. `.gitignore` ở root là nguồn quy tắc chung; Docker context cũng loại output phân tích local.

Root giữ lockfile nhỏ cho metadata của `package.json`; `apps/web` giữ lockfile dependencies thật. Không tạo lockfile npm trong `apps/` hoặc `apps/api/` khi không có npm package ở đó. Không giữ `.gitkeep` trong thư mục đã có file hoặc scaffold chưa có implementation.

Ảnh QA đang được tài liệu tham chiếu không phải cache mặc định: chỉ thêm ảnh minh chứng có chủ đích, tránh commit toàn bộ output từ mỗi lần chạy browser.

## Build và deploy

- **CI:** test, lint, type checking/build frontend; chính sách database và test backend.
- **CD:** giữ luồng đã qua CI → Render → Vercel.
- **CI VPS:** build và kiểm tra hai Docker image. Deploy VPS thủ công trong 1Panel, sau đó health check theo [hướng dẫn VPS](../VPS_CICD_SETUP.md).
- Không gom thành npm workspaces hoặc đổi build context trong lần cleanup này: Dockerfile, Maven và Vercel đang dựa trên đường dẫn hiện tại.

Xem [audit cleanup](2026-11-06-codebase-cleanup.md) để biết các mục đã xử lý và phần còn cần refactor riêng.
