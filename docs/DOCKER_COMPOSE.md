# Chạy SCMS bằng Docker Compose

Áp dụng SCRUM-110 (Docker/production prep). Cấu hình tại `compose.yml` chạy hai service:

- `web`: build React/Vite bằng Node 24, phục vụ bằng Nginx; mặc định mở cổng host **8080**.
- `api`: Dockerfile Java 21 hiện có, profile **supabase**, cổng 8080 chỉ trong mạng Compose.

Trình duyệt gọi `/api/v1` cùng domain với web; Nginx chuyển nguyên đường dẫn và query tới API. Refresh các route như `/products`, `/login`, `/member/orders` trả về React. Database vẫn là Supabase PostgreSQL qua TLS; Hibernate/trigger khởi tạo theo cấu hình backend hiện hành.

## Cấu hình lần đầu trên Ubuntu/server

Cần Docker Engine đang chạy và plugin Docker Compose v2.20+ (hoặc bản mới hơn). Tại thư mục repo, ví dụ `/opt/scms`:

```bash
cd /opt/scms
cp -n compose.env.example .env
nano .env
```

`cp -n` giữ nguyên `.env` nếu file đã tồn tại. Khi dùng lại `.env` từ môi trường dev, bổ sung/đổi các biến theo `compose.env.example`, đặc biệt các URL đang trỏ về cổng 5173 hoặc 8080 cũ.

Điền bốn biến bắt buộc:

```dotenv
SPRING_DATASOURCE_URL=jdbc:postgresql://YOUR_SUPABASE_SESSION_POOLER_HOST:5432/postgres
SPRING_DATASOURCE_USERNAME=YOUR_DATABASE_USERNAME
SPRING_DATASOURCE_PASSWORD='YOUR_DATABASE_PASSWORD'
APP_JWT_SECRET=YOUR_RANDOM_SECRET
```

Lấy host/username/password từ Supabase **Connect → Session pooler**, giữ `DB_SSL_MODE=require`. Tạo JWT secret bằng `openssl rand -hex 32`. Dùng dấu nháy đơn quanh giá trị có `$` hoặc `#` để Compose không nội suy nhầm. Không commit `.env`.

Đổi `APP_WEB_ORIGIN`, `APP_CORS_ALLOWED_ORIGINS`, `GOOGLE_REDIRECT_URI` và `VNPAY_RETURN_URL` sang địa chỉ truy cập thật. Ví dụ chạy trực tiếp cổng 8080 dùng `http://YOUR_SERVER_IP:8080`; có domain/TLS dùng `https://your-domain.example`. Có thể đặt `WEB_PORT=80` nếu cổng 80 còn trống, hoặc giữ 8080 để reverse proxy hiện có chuyển tiếp vào. Production dùng HTTPS để camera QR/PWA hoạt động đầy đủ.

## Build và chạy

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 300
docker compose ps
curl -fsS http://localhost:8080/api/v1/health
```

Truy cập `http://YOUR_SERVER_IP:8080` (đổi cổng theo `WEB_PORT`). Web đợi API trả health thành công trước khi khởi động. `docker compose config --quiet` kiểm tra cấu hình mà không in thông tin kết nối/JWT ra terminal.

Kiểm tra lỗi và cập nhật source:

```bash
docker compose logs --tail=100 api web
git pull --no-rebase origin main
docker compose up -d --build --wait --wait-timeout 300
```

Khi thay `GOOGLE_CLIENT_ID` hoặc `VITE_GOOGLE_CLIENT_ID`, phải build lại web vì Vite nhúng client ID vào bundle lúc build. `VITE_API_BASE_URL` trong Compose luôn là `/api/v1`, nên không bị URL `localhost:8080` trong `.env` dev ghi đè. SMTP/OTP, OAuth, Supabase Realtime và VNPay dùng các biến runtime tùy chọn trong file mẫu; điền đầy đủ trước khi bật các chức năng đó. API không nhận biến môi trường của host nếu chưa khai báo trong `.env`.

Chỉ dừng ứng dụng:

```bash
docker compose down
```

Database nằm ngoài Compose nên lệnh này không xóa dữ liệu Supabase.

## Tùy chọn triển khai

- Máy có reverse proxy/TLS sẵn có thể đặt `WEB_BIND_ADDRESS=127.0.0.1` để chỉ proxy trên host truy cập cổng web. Proxy phải giữ `Host` và gửi `X-Forwarded-Proto` đúng giao thức bên ngoài.
- `API_IMAGE` và `WEB_IMAGE` cho phép dùng image đã build từ CI/CD. Khi dùng image từ registry, đặt hai biến này rồi chạy `docker compose pull` và `docker compose up -d --no-build --wait --wait-timeout 300`. Các thiết lập Vite phải được nhúng từ lần build image đó.
- Muốn dùng file môi trường riêng, dùng cả `SCMS_ENV_FILE` (biến runtime API) và `--env-file` (biến nội suy Compose): `SCMS_ENV_FILE=.env.server docker compose --env-file .env.server up -d --build --wait --wait-timeout 300`.

## Ghi chú VPS: dùng PostgreSQL cục bộ (1Panel) thay cho Supabase

Chỉ áp dụng cho VPS tự chạy `docker compose`; push lên GitHub vẫn dùng cấu hình Supabase qua CI/CD (Render, Vercel) và không đọc `.env` của VPS.

- Code không đổi: profile vẫn là `supabase` (chỉ là tên profile, driver là PostgreSQL chuẩn). Chỉ `.env` quyết định database.
- `.env` trên VPS trỏ `SPRING_DATASOURCE_URL=jdbc:postgresql://1Panel-postgresql-SFES:5432/agile4life`, `SPRING_DATASOURCE_USERNAME=agile4life`, `DB_SSL_MODE=require`. `.env.db.supabase` giữ cấu hình Supabase để chuyển lại bằng cách chép các dòng `SPRING_DATASOURCE_*` và `DB_SSL_MODE` sang `.env`. Cả hai file đều bị `.gitignore`.
- Container `1Panel-postgresql-SFES` không do `compose.yml` quản lý. Hiện nó được nối vào mạng `scms_default` của stack để API phân giải được tên. Không chạy `docker compose down` (xóa mạng) rồi `up` mà không kiểm tra lại; nếu container Postgres bị tạo lại hoặc mạng bị tạo lại thì nối lại bằng `docker network connect scms_default 1Panel-postgresql-SFES`, rồi `docker compose restart api`.
- Hibernate `ddl-auto: update` sẽ tạo/cập nhật bảng và nạp trigger trên Postgres cục bộ giống Supabase.

## Kiểm chứng cấu hình (06/11/2026)

- Compose parse bằng biến giả: pass; đã kiểm tra port override, client ID công khai, profile/TLS, API không mở cổng host và bốn biến bắt buộc.
- `npm ci --dry-run` và frontend production build: pass.
- `DatabasePolicyTest`, `DatabaseProfilesTest`: 11 test pass; `scripts/test-database-config.ps1`: 10 case pass. Không kết nối database thật trong các kiểm tra này.
- Chưa build/chạy image hoặc kiểm tra Nginx trong container: Docker CLI có sẵn nhưng Docker Engine trên máy thực hiện chưa khả dụng. Cần chạy các lệnh health ở trên trên server có Engine và cấu hình Supabase hợp lệ.

Tài liệu tham chiếu: [Compose services/healthcheck](https://docs.docker.com/reference/compose-file/services/), [nội suy `.env`](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass), [Vite static deploy](https://vite.dev/guide/static-deploy.html).
