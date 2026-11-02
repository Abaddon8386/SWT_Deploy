# Chạy SCMS trên Supabase PostgreSQL — SCRUM-91

Backend truy cập PostgreSQL bằng JDBC. React tiếp tục gọi Spring Boot và dùng JWT hiện có. Không cần `NEXT_PUBLIC_SUPABASE_URL`, publishable/anon key hoặc service-role key cho cách kết nối này.

## Lấy thông tin kết nối

1. Mở project Supabase, chọn **Connect → Session pooler**. Copy đúng host, port, database và username của project; không tự đoán vùng triển khai từ project URL.
2. Database password là mật khẩu PostgreSQL của project, khác publishable/API key. Nếu quên, đặt lại tại **Project Settings → Database**.
3. Trong `.env` ở root, cấu hình kết nối PostgreSQL:

```dotenv
SPRING_PROFILES_ACTIVE=supabase
SPRING_DATASOURCE_URL=jdbc:postgresql://<SESSION_POOLER_HOST>:5432/postgres
SPRING_DATASOURCE_USERNAME=postgres.<PROJECT_REF>
SPRING_DATASOURCE_PASSWORD=<DATABASE_PASSWORD>
APP_JWT_SECRET=<BASE64_RANDOM_SECRET_AT_LEAST_32_BYTES>
DB_SSL_MODE=require
DB_POOL_MAX_SIZE=5
DB_POOL_MIN_IDLE=1
SPRING_JPA_HIBERNATE_DDL_AUTO=update
```

Các giá trị trong dấu `<...>` phải được thay bằng cấu hình thật. Không đưa password hoặc TLS settings vào JDBC URL; không commit `.env`. Username thực tế phải lấy từ Connect, có thể khác ví dụ. Profile database duy nhất là `supabase`; các profile `local`, `postgresql`, SQL Server/H2 đã ngừng hỗ trợ. Web/API vẫn chạy trên máy cá nhân, còn database ở Supabase.

Tạo JWT secret ngẫu nhiên trên Windows (chỉ in secret vào terminal của bạn, không đưa vào log/chats):

```powershell
$jwtBytes = New-Object byte[] 32
$jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $jwtRng.GetBytes($jwtBytes) } finally { $jwtRng.Dispose() }
[Convert]::ToBase64String($jwtBytes)
```

## SSL, pooler và Data API

- Session pooler port 5432 phù hợp backend Spring Boot chạy lâu dài và hỗ trợ kết nối IPv4. Profile giới hạn Hikari pool 5 connection mặc định.
- `sslmode=require` bắt buộc mã hóa kết nối nhưng không xác minh danh tính server. Để xác minh đầy đủ, tải CA certificate từ Supabase và đặt `DB_SSL_MODE=verify-full`, `DB_SSL_ROOT_CERT=C:/certs/prod-supabase.cer`. File CA phải tồn tại trên máy chạy backend.
- Profile tắt server-side prepared statement (`prepareThreshold=0`) để tương thích cả transaction pooler khi cần; vẫn ưu tiên session pooler. Không dùng transaction pooler cho các thao tác cần session state/schema test.
- **Tắt Data API trong Supabase trước lần khởi động schema đầu tiên**, vì SCMS chỉ truy cập qua backend. Hibernate tạo bảng trước bước RLS nên tắt Data API giúp tránh cửa sổ truy cập trong lúc bootstrap. Nếu vẫn bật Data API, cần review exposed schemas, table grants, views/functions và các policy hiện có.
- Khi khởi động với `supabase`, hệ thống bật RLS trên các bảng JPA và bảng nối (bao gồm `role_permissions`). Không tạo policy cho client truy cập trực tiếp. Database role backend phải own bảng hoặc có `BYPASSRLS`; hệ thống kiểm tra quyền trước khi bật RLS. Không tự sửa bảng hệ thống `auth`, `storage` của Supabase.
- Với schema mới, RLS không có policy sẽ chặn truy cập dữ liệu bằng các role Data API chịu RLS. Nếu database đã có policy, initializer không xóa chúng: cần review riêng vì policy cũ vẫn có thể cấp quyền. Giữ phân quyền/soft-delete ở backend như hiện tại.

## Khởi động

```powershell
npm start
```

Runner đọc `.env` và mặc định dùng Supabase PostgreSQL. Hibernate tạo bảng, generated column/JSON; trigger P2/P3/P4 và partial indexes được cài trước seed. Thiếu cấu hình hoặc không cài được trigger bắt buộc sẽ báo lỗi khởi động.

`npm run db:init` kiểm tra cấu hình và hướng dẫn khởi động API. Công cụ khởi chạy không có chức năng reset database.

Khởi tạo Admin đầu tiên bằng `APP_BOOTSTRAP_ADMIN_EMAIL` và `APP_BOOTSTRAP_ADMIN_PASSWORD`, dùng email mới chưa thuộc tài khoản khác. Không có mật khẩu mặc định. Khởi động API với profile `supabase`, đăng nhập bằng email/password tại `/login`, rồi tạo Manager trong `/admin/users`. Sau đó bỏ hai biến bootstrap. Khởi tạo chạy lặp không tạo trùng và không tự thăng quyền tài khoản trùng email.

Manager hiện có vẫn giữ role `CENTER_MANAGER`; username `admin` cũ không đồng nghĩa role `ADMIN`. Cấu hình `APP_BOOTSTRAP_MANAGER_*` cũ không còn tạo Manager: Manager mới phải do Admin tạo. Manager vào `/manager/users` để tạo Coach/Receptionist; Admin tạo các tài khoản này tại `/admin/users` hoặc API `/staff-accounts`. API quản trị `/users` và `/roles` chỉ dành cho Admin.

Google: tài khoản Coach/Receptionist phải được Manager/Admin tạo trước bằng email sẽ dùng đăng nhập Google. Gmail hoặc Google Workspace đã xác minh có thể liên kết với tài khoản đó; role trả về lấy từ database. Google mới chưa có tài khoản chỉ tạo Member. Giữ chặn tài khoản khóa/xóa và Google identity khác đã liên kết; Google dùng email bên thứ ba cần xác minh bổ sung theo cơ chế hiện có. Admin/Manager tiếp tục đăng nhập bằng email/password.


## Kiểm thử trên PostgreSQL thật

Dùng project Supabase dành riêng cho dev/test; role cần quyền tạo schema. Test chạy cùng profile `supabase`, dùng schema ngẫu nhiên `scrum91_test_<uuid>`, tạo bảng bằng Hibernate và chỉ xóa schema này khi kết thúc; không reset `public`.

Điền trong `.env`:

```dotenv
SCMS_POSTGRES_TEST_URL=jdbc:postgresql://<TEST_SESSION_POOLER_HOST>:5432/postgres
SCMS_POSTGRES_TEST_USERNAME=<TEST_DB_USERNAME>
SCMS_POSTGRES_TEST_PASSWORD=<TEST_DB_PASSWORD>
```

Kết nối test áp dụng TLS riêng qua `DB_SSL_MODE` (mặc định `require`) và `DB_SSL_ROOT_CERT`; không thêm `sslmode`, username hoặc password vào test JDBC URL. Tên biến `SCMS_POSTGRES_TEST_*` được giữ để tương thích công cụ hiện có.

Nạp **chỉ các biến test** rồi chạy Maven:

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*(SCMS_POSTGRES_TEST_(URL|USERNAME|PASSWORD))\s*=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[3].Trim(), 'Process')
    }
}
Push-Location apps/api
try { .\mvnw.cmd '-Dtest=PostgreSqlDatabaseIntegrationTest' test } finally { Pop-Location }
```

Test kiểm chứng P2/P3/P4 trên DB thật, booking đồng thời, partial index, generated columns, CHECK constraint, `jsonb`, cài RLS và HTTP smoke qua MockMvc với Spring Security/JPA thật. Smoke hiện bao gồm health, login, catalog, tạo/đọc payment và phát hành/đọc invoice; chưa thay thế kiểm thử API booking/check-in riêng.

Thiếu `SCMS_POSTGRES_TEST_URL` thì cả lớp integration test **skipped**, không tính là PostgreSQL đã được nghiệm thu. Nếu bị ngắt giữa chừng có thể còn schema test; chỉ xóa schema có tên do lần chạy đó tạo, không xóa schema ứng dụng.

Test không cần Supabase API key. RLS test kiểm tra cờ bảo vệ, quyền đọc của JDBC owner và từ chối role `anon` hoặc `pg_read_all_data` nếu test role được phép `SET ROLE`; trường hợp không đủ quyền này được ghi skipped riêng. Để kiểm chứng end-to-end Data API còn cần xác nhận setting/policy Supabase thật. Không tuyên bố cloud an toàn chỉ từ unit test.

Entity nay khai báo các CHECK portable từ schema chuẩn. `ddl-auto: update` không bảo đảm thêm tất cả CHECK vào bảng đã tồn tại; nghiệm thu SCRUM-91 cần chạy trên database/schema rỗng như đã chốt.

## Nguồn

- [Supabase: kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: Spring Boot](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot)
- [Supabase: bảo vệ dữ liệu](https://supabase.com/docs/guides/database/secure-data)
- [pgJDBC: SSL và certificate verification](https://jdbc.postgresql.org/documentation/ssl/)
