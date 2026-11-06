# CI/CD: GitHub Actions → Vercel + Render

## Bộ env tối thiểu cho repo này

| Đặt ở đâu | File example | Nội dung |
| --- | --- | --- |
| Vercel → Environment Variables → Production | [`apps/web/.env.production.example`](../apps/web/.env.production.example) | `VITE_API_BASE_URL=/api/v1` (có thể bỏ vì code đã mặc định). |
| Render → Environment | [`apps/api/.env.render.example`](../apps/api/.env.render.example) | Kết nối Supabase, JWT secret, profile và origin frontend. |
| GitHub → Secrets and variables → Actions | [`.github/.env.actions.example`](../.github/.env.actions.example) | 5 Repository Secrets mà `cd.yml` đang đọc. |

Các file chỉ là mẫu tham khảo để nhập giá trị vào dashboard; hosting/Actions không tự đọc
file có đuôi `.example`. Không ghi credential thật vào các file này.

Thiết lập Vercel: **Root Directory `apps/web`**, preset **Vite**, build **`npm run build`**,
output **`dist`**. Render: **Docker**, Root Directory **`apps/api`**, Dockerfile **`./Dockerfile`**;
giữ Docker Command mặc định để image dùng `PORT` của Render.

Luồng API dùng cùng origin: trình duyệt gọi `/api/v1` trên Vercel, rewrite trong
`apps/web/vercel.json` chuyển tới `https://swp391-u1fs.onrender.com/api/v1`.
Nếu dùng service Render khác, phải sửa `destination` của rewrite rồi deploy lại.
Đặt `APP_CORS_ALLOWED_ORIGINS` và `APP_WEB_ORIGIN` bằng domain HTTPS Vercel thực tế,
không có path hoặc dấu `/` cuối. Không cần đưa thông tin database/JWT lên Vercel.

Bộ tối thiểu chỉ phục vụ khởi chạy ứng dụng và CI/CD. Để đăng ký/quên mật khẩu gửi được
OTP, bật thêm block SMTP trong mẫu Render; nếu chưa cấu hình, gửi OTP trả HTTP 503.
Database mới có thể tạo admin đầu tiên bằng hai biến bootstrap được chú thích trong mẫu.
Google login, realtime, AI và VNPay chỉ cấu hình khi cần tính năng tương ứng.

Sau khi nhập env, tắt auto-deploy production trên Render/Vercel theo mục 2–3 để Actions
điều phối; push `main` chạy **CI → CD Render → CD Vercel**. Thiếu Secrets của nền tảng nào
thì CD bỏ qua nền tảng đó. Nên đặt thêm Variable `FRONTEND_URL` để bật kiểm tra web sau deploy.

Repo có hai workflow trong tab **Actions**:

- **CI** (`ci.yml`): tự kiểm tra code mỗi khi push hoặc mở PR — test/lint/build frontend, kiểm tra cấu hình database và test backend.
- **CD** (`cd.yml`): tự đưa code lên môi trường thật sau khi CI xanh trên `main`. PR và `develop` chỉ chạy CI.

```text
push vào main ─▶ CI xanh ─▶ CD bước 1: deploy backend (Render) + kiểm tra /health
                                      └─▶ CD bước 2: deploy frontend (Vercel) + kiểm tra trang chủ
```

Quy tắc an toàn:

- CD chỉ chạy khi CI **xanh**, và chỉ nhận CI do `push`/chạy tay trên chính repo này (không nhận CI của PR hay fork).
- CD deploy đúng commit (SHA) mà CI vừa kiểm tra.
- Backend deploy hoặc health check lỗi thì frontend **không** được deploy.
- Có commit mới trên `main` thì CI cũ bị hủy nên không kích hoạt CD; các lần CD xếp hàng chạy lần lượt, không chạy song song.
- Có rollback tự động khi bản mới đã chạy nhưng không khỏe (xem mục **Rollback tự động**). Build/deploy lỗi thì
  Render giữ bản cũ; mọi trường hợp lỗi job đều đỏ để nhóm vào dashboard Render/Vercel kiểm tra.

## Dùng lại cho dự án React + Spring Boot khác

Hai file workflow viết theo dạng mẫu, copy sang dự án khác rồi sửa vài chỗ:

| Cần sửa | Ở đâu | Ghi chú |
| --- | --- | --- |
| Thư mục frontend / backend | `ci.yml`, các dòng có chú thích `<--` | Mặc định `apps/web` và `apps/api`. |
| Nhánh production | `cd.yml` → `branches`; `ci.yml` → `push.branches` | Mặc định `main`. |
| Phiên bản Node / Java | `ci.yml` | Mặc định Node 22, Java 21. |
| Đường dẫn health check | Variable `BACKEND_HEALTH_PATH` | Mặc định `/api/v1/health`; Spring Boot Actuator dùng `/actuator/health`. |

Các điểm giúp mẫu chạy được ở dự án chưa đầy đủ:

- Không có script `test` hoặc `lint` trong `package.json` thì bước đó tự bỏ qua.
- Không có `mvnw` thì dùng `mvn` của máy chạy; dự án Gradle đổi bước backend thành `./gradlew build`.
- Bước kiểm tra Supabase chỉ chạy khi có `scripts/test-database-config.ps1` (riêng dự án này).
- Chưa thêm secret Render hoặc Vercel thì phần deploy tương ứng tự bỏ qua, CD không báo đỏ.
  CI vẫn chạy bình thường nên có thể dùng CI trước, thêm CD sau.
- Nếu hosting khác Render/Vercel (Railway, Fly.io, VPS...), giữ nguyên CI và thay nội dung job
  `backend` / `frontend` trong `cd.yml` bằng lệnh deploy của nền tảng đó.

## 1. GitHub Secrets và Variables

Trong repo GitHub, mở **Settings → Secrets and variables → Actions**.
Thêm các **Repository secrets** sau, không đưa token vào source hoặc chat:

| Secret | Giá trị |
| --- | --- |
| `VERCEL_TOKEN` | Token có quyền deploy project hiện tại, tạo tại Vercel Account Settings → Tokens. |
| `VERCEL_ORG_ID` | Team/account ID của project Vercel đã deploy. |
| `VERCEL_PROJECT_ID` | ID của project frontend hiện tại. |
| `RENDER_API_KEY` | API key tạo tại Render Account Settings → API Keys, có quyền truy cập service backend. |
| `RENDER_SERVICE_ID` | ID `srv-...` trong URL dashboard của service backend hiện tại. |

Lấy hai ID Vercel từ project settings hoặc `.vercel/project.json` sau khi chạy
`vercel link` cho project hiện tại. Không tạo project mới.

Trong tab **Variables**, nên thêm `VERCEL_CLI_VERSION`: phiên bản CLI chính xác dạng
`x.y.z`. Có thể xem bản hiện có bằng `npm view vercel version`, rồi lưu số phiên bản đó
để CLI không tự đổi giữa các lần chạy. Chưa đặt thì CD dùng bản `latest`.

Variable `FRONTEND_URL` là tùy chọn: đặt URL HTTPS của tên miền production công khai
(ví dụ `https://ten-mien.vercel.app`) để CD kiểm tra trang chủ sau khi deploy. Nếu không
đặt, bước kiểm tra frontend được bỏ qua. Không đưa token vào URL.

Variable `BACKEND_HEALTH_PATH` là tùy chọn: chỉ đặt khi health check của backend khác
`/api/v1/health` (Spring Boot Actuator dùng `/actuator/health`).

Các biến `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SCMS_AI_*`, `GEMINI_API_KEY` từng được
CD cũ đẩy từ GitHub lên Render. CD hiện tại không còn làm vậy: đặt chúng trực tiếp trên
Render (mục 3) và có thể xóa khỏi GitHub.

Lưu ý: CI chưa truyền `SCMS_POSTGRES_TEST_URL/USERNAME/PASSWORD` vào bước Maven, nên đặt các
biến này ở GitHub hiện chưa làm CI chạy test trên database thật.

## 2. Vercel

- Dùng project frontend hiện tại, liên kết cùng repo này và production branch `main`.
- Project Settings → Build and Deployment → **Root Directory** phải là `apps/web`.
  Workflow chạy CLI từ gốc monorepo; Vercel áp dụng Root Directory đã lưu.
- Biến môi trường frontend đặt trong Vercel với target **Production**; `vercel pull` tải chúng
  trước khi build. Biến `VITE_*` được nhúng lúc build nên đổi giá trị phải deploy lại.

  | Biến | Bắt buộc? | Ghi chú |
  | --- | --- | --- |
  | `VITE_GOOGLE_CLIENT_ID` | Chỉ khi dùng đăng nhập Google | Cùng Client ID với backend. |
  | `VITE_API_BASE_URL` | Không | Mặc định `/api/v1`, được `vercel.json` chuyển tiếp về Render. |
- Khi chuyển production sang Actions, tắt Git auto-deploy production trên Vercel
  để tránh mỗi commit tạo hai deployment. Nếu vẫn cần preview PR, chỉ tắt
  auto-deploy của nhánh `main` bằng cấu hình `git.deploymentEnabled` tương ứng.
  Workflow này không tự thay đổi cấu hình cloud.
- Rewrite API hiện tại nằm trong `apps/web/vercel.json`, trỏ về Render. Đổi service Render
  thì phải sửa địa chỉ `destination` trong file này.
- Khi có `FRONTEND_URL`, CD yêu cầu trang trả HTTP 200 và có thẻ `id="root"` của React.

## 3. Render

- Dùng service backend hiện tại, liên kết cùng repo và nhánh `main`.
- Settings → Build & Deploy → **Auto-Deploy = Off** khi dùng workflow này.
  Không chọn `After CI Checks Pass` đồng thời với CD để tránh deploy hai lần.
- Giữ build/start command và Dockerfile hiện có (profile `supabase` đã đặt trong Dockerfile).
  Biến môi trường backend phải đặt sẵn trong Render Dashboard → Environment; CD không tự đồng bộ.

  **Bắt buộc** (thiếu thì backend không khởi động):

  | Biến | Ghi chú |
  | --- | --- |
  | `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | Kết nối JDBC tới Supabase PostgreSQL. |
  | `APP_JWT_SECRET` | Chuỗi bí mật ký JWT, dài và ngẫu nhiên. |

  **Nên đặt** (mặc định trỏ về `localhost`): `APP_CORS_ALLOWED_ORIGINS`, `APP_WEB_ORIGIN` = tên miền Vercel.

  **Theo tính năng:**

  | Tính năng | Biến |
  | --- | --- |
  | Chat realtime Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (chỉ key `sb_publishable_...`), `SUPABASE_CHAT_JWT_SECRET` |
  | AI | `SCMS_AI_PROVIDER`, `SCMS_AI_MODEL`, `SCMS_AI_API_KEY`; chat AI tách riêng được bằng `SCMS_AI_CHAT_*` |
  | Gửi OTP qua email | `APP_OTP_DELIVERY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` |
  | Đăng nhập Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (`https://<domain-render>/api/v1/auth/google/callback`, khớp Google Cloud Console) |
  | Tạo admin đầu tiên | `APP_BOOTSTRAP_ADMIN_EMAIL`, `APP_BOOTSTRAP_ADMIN_PASSWORD` |

  Các biến còn lại (`DB_POOL_*`, `DB_SSL_MODE`, `APP_QR_*`, cron) đã có mặc định, không cần đặt.
  API vẫn dùng profile `supabase`, JDBC PostgreSQL qua TLS; không thay database.
- CD gọi Render API với `commitId` của CI, rồi hỏi trạng thái mỗi 15 giây, tối đa 30 phút.
  Timeout hoặc hủy Actions không tự hủy deployment đã gửi lên Render; xem dashboard trước khi chạy lại.
- Sau khi Render báo `live`, CD lấy `serviceDetails.url` từ Render API và gọi
  `/api/v1/health`. Phản hồi phải HTTP 200 và JSON có `status: UP`.
  Không cần thêm variable URL backend; token Render không gửi tới endpoint health.
- Cả hai HTTP check thử tối đa 12 lần, nghỉ 5 giây giữa các lần. Đây chỉ là kiểm tra khả năng
  phản hồi; endpoint health chưa công bố SHA hay kiểm tra database.
- Backend mới vẫn cần tương thích với frontend cũ trong thời gian chuyển phiên bản.

## Rollback tự động

Không cần thêm secret hay variable mới: dùng lại `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` đã có.

| Phần | Khi nào chạy | Làm gì |
| --- | --- | --- |
| Backend (Render) | Bản mới đã `live` nhưng health check `/api/v1/health` không trả `UP` sau 12 lần thử | Trước khi deploy, CD ghi lại deploy đang `live`; khi lỗi, gọi `POST /v1/services/{id}/rollback` với `deployId` đó, chờ tối đa 10 phút tới khi `live`, rồi health check lại. |
| Frontend (Vercel) | Trang chủ ở `FRONTEND_URL` không phản hồi sau khi deploy | Chạy `vercel rollback` về bản production ngay trước đó (gói Hobby chỉ lùi được 1 bản). |

Lưu ý:

- Job luôn báo **đỏ** sau khi rollback để nhóm biết có sự cố. Backend lỗi thì frontend không được deploy.
- Build lỗi hoặc deploy thất bại: Render giữ bản cũ đang chạy, không cần rollback.
- Frontend chỉ tự rollback khi đã đặt Variable `FRONTEND_URL`; nếu không có thì không có tín hiệu lỗi.
- Rollback chỉ đưa code về bản cũ, không đưa database về cũ (`ddl-auto: update` chỉ thêm). Thay đổi entity phải tương thích ngược.
- Commit lỗi vẫn nằm trên `main`: `git revert` rồi push, nếu không lần push sau sẽ deploy lại bản lỗi.
- Nếu không có deploy `live` trước đó (service mới), CD chỉ ghi cảnh báo và không rollback được.
- Phần Render đã được kiểm tra với API giả (3 tình huống: health lỗi, bình thường, build lỗi), chưa chạy trên service thật.
  Phần Vercel chưa chạy thật; nên thử một lần bằng commit cố ý làm health check hoặc trang chủ lỗi.

## 4. Đưa workflow lên GitHub

Push/merge `.github/workflows/ci.yml`, `.github/workflows/cd.yml` cùng tài liệu này
lên nhánh mặc định `main`. `workflow_run` yêu cầu file CD nằm trên nhánh mặc định.
Sau đó push/merge thay đổi vào `main`, hoặc mở **Actions → CI → Run workflow → main**.
CI thành công sẽ kích hoạt CD; bên trái Actions sẽ có **CI** và **CD**.

Chỉ chạy CI trên `main` sau khi đã thêm Secrets/Variable và kiểm tra đúng project/service.
Workflow thiếu cấu hình sẽ báo lỗi rõ ràng, không tạo project/service mới.

Tài liệu chính thức: [Vercel + GitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel),
[Render trigger deploy](https://api-docs.render.com/reference/create-deploy),
[Render auto-deploy](https://render.com/docs/deploys#configuring-auto-deploys),
[GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
