# CI/CD: GitHub Actions → Vercel + Render

Repo có hai workflow trong tab **Actions**:

- **CI** (`ci.yml`): test/lint/build frontend, kiểm tra cấu hình database và test backend.
- **CD** (`cd.yml`): sau khi CI thành công trên `main`, deploy đúng commit đó lên Vercel và Render. PR và `develop` chỉ chạy CI. Commit đã bị thay thế trên `main` được bỏ qua.

CD triển khai theo thứ tự: kiểm tra CI của đúng SHA → deploy Render → kiểm tra
backend qua HTTPS → deploy Vercel → kiểm tra frontend qua HTTPS. Backend chưa
vượt qua health check thì frontend không được deploy. Lỗi deploy hoặc health check
làm job đỏ; workflow không tự rollback bản đã deploy.

Chạy CD thủ công cũng chỉ được thực hiện từ `main`, và bắt buộc lần CI mới nhất
của đúng SHA trên `main` phải `completed/success`, thuộc chính repo, được kích hoạt
bởi `push` hoặc `workflow_dispatch`. CI từ PR/fork không được dùng để phát hành.
Lần CI mới hơn đang chạy hoặc thất bại sẽ chặn deploy, dù trước đó cùng SHA đã có
một lần CI thành công. Job `release` chỉ cần thêm quyền **Actions: read**.

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

Trong tab **Variables**, thêm `VERCEL_CLI_VERSION`: phiên bản CLI chính xác dạng
`x.y.z` đã kiểm tra. Có thể xem bản hiện có bằng `npm view vercel version`, rồi
lưu số phiên bản đó; không dùng `latest` hoặc range để tránh CLI tự đổi giữa các lần chạy.

Variable `FRONTEND_URL` là tùy chọn: đặt URL HTTPS của tên miền production công khai
nếu muốn chỉ định rõ tên miền cần kiểm tra. Nếu không đặt, CD tự tra cứu public
production alias của project từ Vercel API để tránh kiểm tra URL hash riêng lẻ bị bật
Deployment Protection. Không đưa token vào URL.

## 2. Vercel

- Dùng project frontend hiện tại, liên kết cùng repo này và production branch `main`.
- Project Settings → Build and Deployment → **Root Directory** phải là `apps/web`.
  Workflow chạy CLI từ gốc monorepo; Vercel áp dụng Root Directory đã lưu.
- Giữ các biến môi trường frontend trong Vercel với target **Production**.
  `vercel pull` tải cấu hình này trước khi build.
- Khi chuyển production sang Actions, tắt Git auto-deploy production trên Vercel
  để tránh mỗi commit tạo hai deployment. Nếu vẫn cần preview PR, chỉ tắt
  auto-deploy của nhánh `main` bằng cấu hình `git.deploymentEnabled` tương ứng.
  Workflow này không tự thay đổi cấu hình cloud.
- Rewrite API hiện tại nằm trong `apps/web/vercel.json`, trỏ về Render.
- Sau deploy, check yêu cầu HTTP 200, `Content-Type: text/html`, thẻ root React và
  script module. Trang đăng nhập bảo vệ deployment không được tính là thành công.

## 3. Render

- Dùng service backend hiện tại, liên kết cùng repo và nhánh `main`.
- Settings → Build & Deploy → **Auto-Deploy = Off** khi dùng workflow này.
  Không chọn `After CI Checks Pass` đồng thời với CD để tránh deploy hai lần.
- Giữ build/start command, Dockerfile và biến môi trường backend hiện có.
  API vẫn dùng profile `supabase`, JDBC PostgreSQL qua TLS; không thay database.
- CD gọi Render API với `commitId` của CI, rồi kiểm tra trạng thái tối đa 30 phút.
  Timeout hoặc hủy Actions không tự hủy deployment đã gửi lên Render; xem dashboard trước khi chạy lại.
- Sau khi Render báo `live`, CD lấy `serviceDetails.url` từ Render API và gọi
  `/api/v1/health`. Phản hồi phải HTTP 200 và JSON có `status: UP`, `service: scms-api`.
  Không cần thêm variable URL backend; token Render không gửi tới endpoint health.
- Cả hai HTTP check thử tối đa 12 lần, timeout mỗi request 10 giây, nghỉ 5 giây giữa
  các lần. Đây là kiểm tra khả năng phản hồi; endpoint health hiện chưa công bố SHA
  hay kiểm tra database, và check frontend chưa chạy JavaScript trong trình duyệt.
- Backend mới vẫn cần tương thích với frontend cũ trong thời gian chuyển phiên bản.

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
