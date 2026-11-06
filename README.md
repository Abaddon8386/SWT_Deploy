<div align="center">

# 🏛️ SÖL Wellness Sanctuary — Sports Center Management System (SCMS)

[![CD](https://github.com/Agile4Life/SWP391/actions/workflows/cd.yml/badge.svg)](https://github.com/Agile4Life/SWP391/actions/workflows/cd.yml)
[![CI](https://github.com/Agile4Life/SWP391/actions/workflows/ci.yml/badge.svg)](https://github.com/Agile4Life/SWP391/actions/workflows/ci.yml)
![Java 21](https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white)
![Spring Boot 3](https://img.shields.io/badge/Spring_Boot-3.x-6DB33F?logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react&logoColor=black)
![Supabase PostgreSQL](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=black)

**Nền tảng quản trị trung tâm thể thao & chăm sóc sức khỏe toàn diện (SWP391 Monorepo)**  
*Đặt lịch lớp học · Quản lý gói hội viên · Check-in QR · Theo dõi chỉ số cơ thể · Báo cáo doanh thu thời gian thực*

<br />

<img src="docs/ui-review/fitness-reference/hero-desktop.png" alt="SÖL Wellness Sanctuary Landing Page" width="100%" />

</div>

---

## ✨ Giới thiệu tổng quan

**Sports Center Management System (SCMS)** là hệ thống quản lý vận hành trung tâm thể hình & wellness hiện đại, kết hợp cổng thông tin đa phân hệ (**React + Vite + TypeScript**) với **Spring Boot 3 REST API (Java 21)** và cơ sở dữ liệu đám mây **Supabase PostgreSQL** theo kiến trúc **Hibernate Code-First** cùng hệ thống **PostgreSQL Trigger** kiểm soát toàn vẹn nghiệp vụ.

- **CI/CD Tự động hóa:** Xem [Hướng dẫn GitHub Actions → Vercel + Render](docs/CICD_SETUP.md) để cấu hình Secrets và theo dõi toàn bộ luồng kiểm thử (CI) lẫn triển khai Production (CD) trong tab **Actions**.
- **Cơ sở dữ liệu đám mây:** Sử dụng duy nhất profile `supabase` (**Supabase PostgreSQL** qua TLS), tự động ánh xạ schema từ JPA Entity và nạp trigger nghiệp vụ khi khởi chạy. Xem chi tiết tại [Hướng dẫn Supabase](docs/SUPABASE_SETUP.md).
- **Docker Compose trên server:** [Hướng dẫn chạy web + API](docs/DOCKER_COMPOSE.md), dùng [compose.yml](compose.yml) và [compose.env.example](compose.env.example); database tiếp tục nằm trên Supabase.
- **VPS song song Render/Vercel:** [Quy trình cập nhật code, GitHub checks và build/deploy trong 1Panel](docs/VPS_CICD_SETUP.md). `CI VPS` tự chạy khi push/PR; triển khai VPS bằng tay, không thay thế CD Render/Vercel.

---

## 🖥️ Các màn hình chính của hệ thống (Main Screens Showcase)

### 1. Trang chủ & Cổng Đăng nhập (`/` & `/login`)

**Quy chuẩn thiết kế chính:** [DESIGN.md](DESIGN.md). Phần công khai dùng SÖL Fitness charcoal–salmon, bố cục full width, scrollbar đồng bộ và animation xuất hiện từng component khi cuộn dọc. Portal giữ thiết kế riêng hiện có.

Giao diện giới thiệu dịch vụ cao cấp tích hợp trợ lý AI và cổng đăng nhập phân luồng tự động theo 4 vai trò (**Hội viên**, **Lễ tân**, **Huấn luyện viên**, **Quản lý trung tâm**):

| Trang chủ SÖL Wellness Sanctuary (`/`) | Cổng Đăng nhập Đa vai trò (`/login`) |
| :---: | :---: |
| <img src="docs/ui-review/fitness-reference/hero-desktop.png" alt="Landing Page" width="100%" /> | <img src="docs/ui-review/fitness-reference/login-desktop.png" alt="Login Page" width="100%" /> |

---

### 2. Phân hệ Hội viên — Member Portal (`/member/*`)
Không gian cá nhân giúp hội viên theo dõi thời hạn gói tập, đăng ký gói mới, đặt lịch lớp học có kiểm tra trùng lịch/sức chứa và xuất trình mã QR check-in:

#### 📊 Trang tổng quan Hội viên (`/member/dashboard`)
<p align="center">
  <img src="docs/qa/portal-redesign/member-dashboard-1440.png" alt="Member Dashboard" width="100%" />
</p>

| 💳 Gói tập & Lịch sử Thanh toán (`/member/packages`) | 📅 Đặt lịch Lớp học & Lịch của tôi (`/member/classes`) |
| :---: | :---: |
| <img src="docs/qa/portal-redesign/member-packages-1440.png" alt="Member Packages" width="100%" /> | <img src="docs/qa/portal-redesign/member-classes-1440.png" alt="Member Classes" width="100%" /> |

| 🪪 Thẻ Hội viên Điện tử & QR Check-in (`/member/card`) | 🧬 Hồ sơ Cá nhân & Chỉ số Sức khỏe BMI (`/member/profile`) |
| :---: | :---: |
| <img src="docs/qa/portal-redesign/member-card-1440.png" alt="Member QR Card" width="100%" /> | <img src="docs/qa/portal-redesign/member-profile-1440.png" alt="Member Profile Desktop" width="100%" /> |

---

### 3. Phân hệ Lễ tân & Thu ngân — Front Desk & POS (`/staff/*`)
Bộ công cụ tác nghiệp tại quầy lễ tân: đăng ký nhanh hội viên mới, thu ngân POS (Tiền mặt / VietQR), cổng kiểm soát ra vào bằng mã QR và điều phối lịch lớp học:

| 🧾 Quầy Thu ngân POS & Cấp Gói tập (`/staff/reception`) | 🔍 Cổng Quét QR Check-in Thời gian thực (`/staff/check-in`) |
| :---: | :---: |
| <img src="docs/qa/portal-redesign/staff-reception-1440.png" alt="Staff Reception POS" width="100%" /> | <img src="docs/qa/portal-redesign/staff-checkin-1440.png" alt="Staff QR Check-in" width="100%" /> |

#### 🗓️ Quản lý Lớp học & Xếp lịch Phòng tập (`/staff/classes`)
<p align="center">
  <img src="docs/qa/portal-redesign/staff-classes-1440.png" alt="Staff Class Scheduling" width="100%" />
</p>

---

### 4. Phân hệ Huấn luyện viên — Coach Workspace (`/staff/attendance`)
Màn hình chuyên biệt cho Huấn luyện viên điểm danh học viên theo từng buổi tập, chấm điểm kỹ thuật và tạo nhận xét/đánh giá kết quả tập luyện hỗ trợ bởi AI:

<p align="center">
  <img src="docs/qa/portal-redesign/coach-attendance-1440.png" alt="Coach Attendance and Evaluation" width="100%" />
</p>

---

### 5. Phân hệ Quản lý Trung tâm — Center Manager (`/manager/*`)
Trung tâm điều hành dành cho cấp Quản lý: theo dõi báo cáo doanh thu, tỷ lệ gia hạn, quản trị danh mục vận hành (Bộ môn, Phòng tập, Gói tập) và phân quyền tài khoản RBAC:

#### 📈 Báo cáo Doanh thu & Thống kê Vận hành (`/manager/reports`)
<p align="center">
  <img src="docs/qa/portal-redesign/manager-reports-1440.png" alt="Manager Revenue Reports" width="100%" />
</p>

| 🗂️ Danh mục Vận hành: Bộ môn · Phòng tập · Gói tập (`/manager/catalogs`) | 🔐 Quản lý Tài khoản & Phân quyền RBAC (`/manager/users`) |
| :---: | :---: |
| <img src="docs/qa/portal-redesign/manager-catalogs-1440.png" alt="Manager Catalogs" width="100%" /> | <img src="docs/qa/portal-redesign/manager-users-1440.png" alt="Manager Users & RBAC" width="100%" /> |

---

## 🏗️ Kiến trúc hệ thống & Luồng trạng thái

```mermaid
flowchart LR
    subgraph Client["🌐 Frontend (Vercel)"]
        Web["React + Vite + TypeScript\n(apps/web)"]
    end

    subgraph Server["⚙️ Backend API (Render)"]
        API["Spring Boot 3 + Java 21\n3-Layer Architecture + i18n\n(apps/api)"]
    end

    subgraph Database["🗄️ Cloud Database (Supabase)"]
        PG[("Supabase PostgreSQL\nHibernate Code-First + Triggers")]
    end

    Web <-->|"REST API (JWT + Accept-Language)"| API
    API <-->|"JDBC over TLS (Profile: supabase)"| PG
```

### Sơ đồ trạng thái nghiệp vụ cốt lõi

| Vòng đời Tài khoản Người dùng (`users.status`) | Vòng đời Gói Hội viên (`membership_subscriptions.status`) |
| :---: | :---: |
| <img src="docs/diagrams/screenshots/page_1.png" alt="User Account State Diagram" width="100%" /> | <img src="docs/diagrams/screenshots/page_2.png" alt="Membership Subscription State Diagram" width="100%" /> |

> [!IMPORTANT]
> **Bất biến nghiệp vụ & Kiến trúc dữ liệu:**
> - **Code-First & ORM Polymorphism:** Toàn bộ bảng, cột, khóa và quan hệ được định nghĩa qua JPA Entity (`ddl-auto: update`). Các file SQL trong `db/` chỉ là tài liệu lịch sử, không dùng để triển khai.
> - **Database Triggers bắt buộc:** Kiểm tra sức chứa lớp học (`capacity`) và chống trùng lịch (`schedule overlap`) được nạp tự động qua `PostgreSqlTriggerProvider`.
> - **Chính sách CI nghiêm ngặt:** `DatabasePolicyTest`, `DatabaseProfilesTest` và `scripts/test-database-config.ps1` đảm bảo hệ thống chỉ dùng `Supabase PostgreSQL`.
> - **Đa ngôn ngữ (i18n):** Hỗ trợ `vi` (mặc định) và `en` qua header `Accept-Language`.

---

## 📂 Cấu trúc thư mục (Monorepo)

```text
SWP391/
├── apps/
│   ├── api/        Spring Boot 3 REST API (Java 21, Maven, JPA/Hibernate, Security, i18n)
│   └── web/        React + Vite + TypeScript Web Portal (Feature-sliced UI)
├── db/             Tài liệu cấu trúc & lịch sử dữ liệu (chỉ tham chiếu, không dùng bootstrap DB)
├── docs/           Tài liệu dự án (Master Guide, Plans, Diagrams, Rules, API Contracts, QA)
├── scripts/        Script tự động hóa khởi chạy local (run-local, stop-local, init-db)
└── .github/        GitHub Actions workflows cho CI (ci.yml) và CD (cd.yml)
```

---

## 🚀 Hướng dẫn khởi động Local

### Cách 1: 1-Click (Khuyên dùng trên Windows)
1. Chạy `npm start` (hoặc bấm đúp vào [`scripts/run-local.bat`](scripts/run-local.bat) / chạy `.\scripts\run-local.ps1`).
2. Bộ chạy tự động kiểm tra môi trường và cấu hình Supabase, sau đó khởi chạy đồng thời **Web + API**. Hibernate tự động tạo/cập nhật bảng và cài đặt PostgreSQL trigger khi API khởi động.
3. Để dừng toàn bộ hệ thống: chạy `npm run stop` (hoặc bấm đúp [`scripts/stop-local.bat`](scripts/stop-local.bat)).

📖 Xem chi tiết tại [docs/LOCAL_DEV_GUIDE.md](docs/LOCAL_DEV_GUIDE.md).

### Cách 2: Khởi động thủ công
1. Cài đặt **Java 21+**, **Maven 3.9+**, **Node.js 20+** và chuẩn bị thông tin kết nối **Supabase PostgreSQL**.
2. Sao chép `.env.example` thành `.env` và điền thông số kết nối theo [Hướng dẫn Supabase](docs/SUPABASE_SETUP.md).
3. Khởi chạy Backend API:
   ```powershell
   cd apps/api
   .\mvnw.cmd spring-boot:run
   ```
4. Khởi chạy Frontend Web:
   ```powershell
   cd apps/web
   npm install
   npm run dev
   ```

🔗 **Điểm truy cập Local:**
- **Web Portal:** `http://localhost:5173`
- **API Healthcheck:** `http://localhost:8080/api/v1/health`
- **Swagger UI (OpenAPI):** `http://localhost:8080/swagger-ui/index.html`

---

## 📚 Tài liệu tham khảo nhanh

| Tài liệu | Mô tả |
| :--- | :--- |
| [📘 PROJECT_MASTER_GUIDE.md](docs/PROJECT_MASTER_GUIDE.md) | Đặc tả nghiệp vụ tổng thể, phân quyền vai trò và quy trình cốt lõi |
| [🏛️ backend-architecture.md](docs/rules/backend-architecture.md) | Quy chuẩn kiến trúc 3 lớp, SOLID, IoC, JPA và Supabase PostgreSQL |
| [☁️ SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Hướng dẫn cấu hình JDBC TLS, RLS và schema test biệt lập trên Supabase |
| [🔄 CICD_SETUP.md](docs/CICD_SETUP.md) | Hướng dẫn thiết lập GitHub Actions CI/CD tự động lên Vercel & Render |
| [📋 AGILE_SCRUM_JIRA_PLAN.md](docs/plans/AGILE_SCRUM_JIRA_PLAN.md) | Backlog tính năng, phân công màn hình và tiêu chí nghiệm thu (AC) |
| [🤖 AGENTS.md](AGENTS.md) | Quy tắc bắt buộc dành cho contributor và AI coding agent |

---

## 🤝 Quy ước làm việc (Contribution Guidelines)

Xem [CONTRIBUTING.md](CONTRIBUTING.md) để cài đặt/chạy checks và [bản đồ cấu trúc repo](docs/architecture/REPOSITORY_STRUCTURE.md) để đặt code đúng module. Graphify là output local, không được commit.

- Đọc kỹ [AGENTS.md](AGENTS.md), [docs/rules/backend-architecture.md](docs/rules/backend-architecture.md) và [docs/plans/AGILE_SCRUM_JIRA_PLAN.md](docs/plans/AGILE_SCRUM_JIRA_PLAN.md) trước khi nhận ticket.
- Mỗi Pull Request xử lý một Jira ticket với nhánh đặt tên theo mẫu `SCMS-123/short-description`.
- Định nghĩa mọi thay đổi schema qua **JPA Entity** và cập nhật trigger PostgreSQL qua `PostgreSqlTriggerProvider`.
- Bổ sung đồng thời cả `messages_vi.properties` và `messages_en.properties` cho mọi thông báo hoặc mã lỗi mới ở Backend.
- **Tuyệt đối không** commit `.env`, mật khẩu, JWT secret, API token hoặc dữ liệu nhạy cảm.

---

<div align="center">
  <sub>© 2026 <b>Agile4Life — SWP391 Team</b>. Built with ❤️ using Spring Boot 3, React, and Supabase PostgreSQL.</sub>
</div>
