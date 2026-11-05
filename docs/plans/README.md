# KẾ HOẠCH DỰ ÁN & TIẾN ĐỘ PHÁT TRIỂN (PROJECT PLANS & ROADMAP)

Thư mục này tập trung toàn bộ các tài liệu kế hoạch, phân chia Sprint, backlog Jira và các lộ trình triển khai chi tiết của dự án **Sports Center Management System (SCMS)**.

---

## 1. Kế Hoạch Tổng Thể & Sprint Backlog (Jira)

| Tài liệu | Loại | Mô tả |
|---|:---:|---|
| [**`AGILE_SCRUM_JIRA_PLAN.md`**](AGILE_SCRUM_JIRA_PLAN.md) | **Kế hoạch cốt lõi** | Bản kế hoạch Agile/Scrum hoàn chỉnh: Định nghĩa Epics, User Stories, Acceptance Criteria (AC), Task breakdown, Jira Issue Keys (`SCMS-*`), và phân chia 4 Sprint phát triển. |

---

## 2. Kế Hoạch Triển Khai Tính Năng (Feature Implementation Plans)

| Ngày lập | Tài liệu | Phân hệ | Tóm tắt mục tiêu |
|:---:|---|:---:|---|
| 2026-09-26 | [`2026-09-26-scms-luxury-editorial-frontend.md`](2026-09-26-scms-luxury-editorial-frontend.md) | **Frontend** | Kế hoạch nâng cấp giao diện Web theo chuẩn Luxury Editorial, phong cách sang trọng, typography cao cấp, responsive và tối ưu trải nghiệm người dùng. |
| 2026-10-01 | [`2026-10-01-backend-layered-jpa.md`](2026-10-01-backend-layered-jpa.md) | **Backend** | Kế hoạch tái cấu trúc Backend sang mô hình 3 lớp chuẩn mực (Layered Architecture), Spring Boot 3 + Spring Data JPA, hỗ trợ đa hình CSDL (SQL Server & PostgreSQL) qua `DatabaseTriggerProvider`. |
| 2026-11-05 | [`../superpowers/plans/2026-11-05-supplement-shop.md`](../superpowers/plans/2026-11-05-supplement-shop.md) | **Full-Stack (Shop)** | Kế hoạch thiết kế & triển khai phân hệ Cửa hàng Thực phẩm bổ sung (“Sản phẩm”): kệ hàng công khai, bảng thành phần dinh dưỡng, giỏ hàng, địa chỉ hành chính 2 cấp, thanh toán VNPay/Ví/Tại quầy, xử lý đơn Lễ tân và quản trị tồn kho Quản lý. |

---

## 3. Liên Kết Tài Liệu Hướng Dẫn Kỹ Thuật

- **Cẩm nang kiến trúc toàn diện (Master Guide):** [`../../PROJECT_MASTER_GUIDE.md`](../../PROJECT_MASTER_GUIDE.md) (Quy cách 33 bảng CSDL, 6 Luồng nghiệp vụ cốt lõi, 12 Trạng thái UML).
- **Sơ đồ hệ thống & Minh chứng:** [`../diagrams/README.md`](../diagrams/README.md) (ERD Draw.io, Swimlane flows, State Machine diagrams & Screenshots).
- **Quy tắc kiến trúc Backend:** [`../rules/backend-architecture.md`](../rules/backend-architecture.md) (SOLID, IoC, Package-by-feature, i18n đa ngôn ngữ).
- **Hợp đồng API (OpenAPI):** [`../api-contracts/`](../api-contracts/)
