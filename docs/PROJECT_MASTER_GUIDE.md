# CẨM NANG TOÀN TẬP DỰ ÁN HỆ THỐNG QUẢN LÝ TRUNG TÂM THỂ THAO (SPORTS CENTER MANAGEMENT SYSTEM)

> **Tài liệu hướng dẫn kỹ thuật toàn diện (Comprehensive Master Guide) dành cho AI Agent, Kỹ sư phần mềm & Nhóm phát triển.**  
> **Môn học:** SWP391 - Đồ án Phát triển Phần mềm (Software Development Project) — FPT University  
> **Repository:** `SWP391` (`PhongTCT/SWP391_GROUP1`)  
> **Hệ quản trị CSDL chuẩn:** Supabase PostgreSQL (Hibernate Code-First)
> **Phiên bản tài liệu:** 1.0.0 (Master Release)

> **Quy chuẩn UI hiện hành (22/10/2026):** đọc [DESIGN.md](../DESIGN.md) trước khi làm frontend. Phần công khai dùng charcoal–salmon, full width và animation xuất hiện từng component; cuộn dọc native, không dùng slide trang ngang–dọc. Portal giữ thiết kế hiện tại. Các mô tả phong cách hoặc gợi ý thư viện trước đây trong cẩm nang không thay thế quy chuẩn này.

---

## MỤC LỤC TỔNG QUAN

1. [Tổng Quan Đề Tài & Bối Cảnh Nghiệp Vụ](#1-tổng-quan-đề-tài--bối-cảnh-nghiệp-vụ)
2. [Cấu Trúc Thư Mục & Bản Đồ Tài Nguyên Kho Lưu Trữ](#2-cấu-trúc-thư-mục--bản-đồ-tài-nguyên-kho-lưu-trữ)
3. [Thiết Kế Cơ Sở Dữ Liệu Chuyên Sâu (Database Schema Deep-Dive)](#3-thiết-kế-cơ-sở-dữ-liệu-chuyên-sâu-database-schema-deep-dive)
   - [3.1. Tổng quan 10 Modules & 33 Bảng CSDL](#31-tổng-quan-10-modules--33-bảng-csdl)
   - [3.2. Chi tiết từng Module và quan hệ khóa ngoại (FK)](#32-chi-tiết-từng-module-và-quan-hệ-khóa-ngoại-fk)
   - [3.3. Các ràng buộc nghiệp vụ nâng cao, Triggers & Partial Indexes](#33-các-ràng-buộc-nghiệp-vụ-nâng-cao-triggers--filtered-indexes)
4. [Hệ Thống 6 Luồng Nghiệp Vụ Cốt Lõi (6 Core Business Flows)](#4-hệ-thống-6-luồng-nghiệp-vụ-cốt-lõi-6-core-business-flows)
   - [4.1. Ma trận chức năng tổng hợp (Actor × Flow Matrix)](#41-ma-trận-chức-năng-tổng-hợp-actor--flow-matrix)
   - [4.2. Bóc tách chi tiết từng Luồng từ Flow 1 đến Flow 6](#42-bóc-tách-chi-tiết-từng-luồng-từ-flow-1-đến-flow-6)
5. [Hệ Thống 12 Biểu Đồ Trạng Thái UML (12 State Machine Diagrams)](#5-hệ-thống-12-biểu-đồ-trạng-thái-uml-12-state-machine-diagrams)
6. [Bộ Công Cụ Tự Động Hóa & Quản Trị Sơ Đồ (Tooling & Scripts)](#6-bộ-công-cụ-tự-động-hóa--quản-trị-sơ-đồ-tooling--scripts)
7. [Hướng Dẫn Triển Khai Phần Mềm Cho Agent Tiếp Theo (Implementation Blueprint)](#7-hướng-dẫn-triển-khai-phần-mềm-cho-agent-tiếp-theo-implementation-blueprint)

---

## 1. TỔNG QUAN ĐỀ TÀI & BỐI CẢNH NGHIỆP VỤ

### 1.1. Mục tiêu hệ thống
Dự án **Sports Center Management System** xây dựng một nền tảng số hóa đồng bộ và toàn diện phục vụ công tác vận hành, kinh doanh, đào tạo và chăm sóc khách hàng cho các trung tâm thể thao đa năng phức hợp (Gym, Yoga, Pilates, Bơi lội, Võ thuật, v.v.).

Hệ thống giải quyết các bài toán lớn:
- **Tự động hóa thẻ thành viên & Check-in:** Xóa bỏ thẻ nhựa vật lý, sử dụng mã QR Code động trên ứng dụng di động để quét qua cổng và đối soát thời hạn gói tập tức thì.
- **Tối ưu hóa công suất lớp học (Class Utilization):** Quản lý thời khóa biểu trực quan, đặt chỗ giữ chỗ trước theo từng buổi (có thể đặt cả tuần hoặc cả tháng một lượt), tự động giải phóng chỗ trống khi có học viên hủy lịch. Tính năng hàng chờ (Waitlist) đã được bỏ.
- **Minh bạch tài chính & Báo cáo quản trị:** Đa dạng kênh thanh toán (POS, Chuyển khoản, Tiền mặt, Cổng trực tuyến), tự động phát hành hóa đơn điện tử, cập nhật công nợ và báo cáo doanh thu đa chiều theo thời gian thực.
- **Tích hợp Trí Tuệ Nhân Tạo (AI Engine):**
  - **AI Coaching:** Phân tích thể trạng, chỉ số BMI, lịch sử chấn thương và mục tiêu thể lực của hội viên để gợi ý giáo án bài tập cá nhân hóa cho Huấn luyện viên (Coach).
  - **AI Chatbot:** Trợ lý ảo phục vụ 24/7 trên ứng dụng di động, giải đáp thắc mắc về kỹ thuật động tác, chế độ dinh dưỡng và quy chế dịch vụ.
- **Quản trị vận hành & Kiểm toán an toàn (Audit Trail):** Phân quyền truy cập dựa trên vai trò (**RBAC**), ghi vết 100% các biến động dữ liệu nhạy cảm vào bảng `audit_logs`.

### 1.2. Các chủ thể tham gia (6 Actors)
1. 👤 **Hội viên / Khách hàng (`Member`):** Người dùng cuối, đăng ký tài khoản, mua gói dịch vụ, đặt/hủy lớp học, quét mã QR check-in vào cổng, tập luyện theo giáo án HLV, tương tác với AI Chatbot.
2. 💁 **Nhân viên Lễ tân (`Receptionist`):** Tiếp đón khách tại quầy, tra cứu thông tin hội viên qua SĐT/CCCD/Mã HV, tiếp nhận thanh toán đa kênh, in hóa đơn, hỗ trợ đặt/hủy lớp trực tiếp và quét mã QR check-in sảnh.
3. 🏋️ **Huấn luyện viên (`Coach`):** Theo dõi danh sách lớp, thông tin thể trạng học viên, sử dụng AI gợi ý giáo án, phê duyệt kế hoạch huấn luyện, giao bài tập về nhà (homework), điểm danh buổi tập và đánh giá tiến độ học viên.
4. 👔 **Quản lý Trung tâm (`Center Manager`):** Quản trị toàn bộ danh mục hệ thống (lớp học, bộ môn, phòng tập, gói dịch vụ), phân công HLV phụ trách lớp, phân quyền chức năng (RBAC), xem báo cáo doanh thu tài chính đa chiều và giám sát nhật ký kiểm toán.
5. 🤖 **Trợ lý Trí tuệ nhân tạo (`AI Engine`):** Động cơ AI xử lý NLP (Chatbot tư vấn) và thuật toán phân tích hồ sơ thể chất (AI Recommendation) hỗ trợ HLV xây dựng giáo án bài tập.
6. ⚙️ **Lõi hệ thống phần mềm (`System Core`):** Xử lý nghiệp vụ ngầm, điều phối cơ sở dữ liệu, kiểm soát điều kiện logic (Triggers), quản lý tác vụ nền (Cron/Scheduler) để quét sự kiện đổi lịch, nhắc hẹn trước 2 giờ và cảnh báo hết hạn gói trước 7 ngày.

---

## 2. CẤU TRÚC THƯ MỤC & BẢN ĐỒ TÀI NGUYÊN KHO LƯU TRỮ

```
SWP391/
├── README.md                        # Hướng dẫn tổng quan kho lưu trữ
├── AGENTS.md                        # Quy ước làm việc cho contributor và coding agent
├── package.json                     # Monorepo scripts (dev, build, test, db:init)
│
├── apps/                            # Mã nguồn phần mềm (Codebase)
│   ├── web/                         # Giao diện Frontend React + TypeScript (Vite)
│   └── api/                         # Dịch vụ Backend Java 21 + Spring Boot 3
│
├── db/                              # CSDL, triggers đa hình & schema nguồn
│   ├── README.md                    # Hướng dẫn khởi tạo CSDL
│   ├── databaseschema.sql           # Toàn bộ DDL CSDL T-SQL (33 bảng, Triggers, Seed Data)
│   └── migrations/                  # Các bản migration CSDL
│
├── docs/                            # Trung tâm lưu trữ toàn bộ tài liệu & thiết kế
│   ├── README.md                    # Mục lục tra cứu tài liệu tổng thể
│   ├── PROJECT_MASTER_GUIDE.md      # Cẩm nang kiến trúc và nghiệp vụ toàn diện
│   ├── LOCAL_DEV_GUIDE.md           # Hướng dẫn cài đặt và chạy môi trường local
│   ├── plans/                       # Kế hoạch dự án, phân chia Sprint & Jira Backlog
│   │   ├── README.md
│   │   ├── AGILE_SCRUM_JIRA_PLAN.md # Kế hoạch Agile/Scrum & User Stories phân hệ
│   │   ├── 2026-09-26-scms-luxury-editorial-frontend.md
│   │   └── 2026-10-01-backend-layered-jpa.md
│   ├── diagrams/                    # Tài liệu sơ đồ hệ thống & ảnh minh chứng
│   │   ├── README.md                # Bảng tổng hợp thuyết minh chi tiết các sơ đồ
│   │   ├── build_state_diagrams.js  # Script tự động sinh State Diagram ra XML Draw.io & PNG
│   │   ├── erd_sports_center.drawio # ERD tổng thể 33 bảng chia 6 tabs phân hệ
│   │   ├── erd_complete_all_relationships.drawio # ERD chi tiết 54 quan hệ
│   │   ├── sports_center_all_flows_swimlane.drawio # Swimlane phân làn hoàn chỉnh (7 tabs)
│   │   ├── state_diagrams.drawio    # 12 Biểu đồ trạng thái UML chuẩn
│   │   └── screenshots/             # Bộ ảnh chụp minh chứng kết xuất trực tiếp từ các sơ đồ
│   ├── rules/                       # Quy tắc kiến trúc mã nguồn & tiêu chuẩn kỹ thuật
│   │   └── backend-architecture.md  # Chuẩn 3 lớp, SOLID, IoC, JPA & i18n
│   ├── api-contracts/               # Hợp đồng giao tiếp API (OpenAPI YAML)
│   ├── adr/                         # Bản ghi quyết định kiến trúc (Modular Monolith)
│   └── specs/                       # Đặc tả thiết kế kỹ thuật chi tiết
│
└── scripts/                         # Bộ công cụ tự động hóa chạy local
    ├── README.md                    # Hướng dẫn sử dụng các script
    ├── run-local.bat / run-local.ps1 # Khởi chạy hệ thống 1-click
    ├── stop-local.bat / stop-local.ps1 # Dừng các server local
    └── init-db.bat / init-db.ps1    # Khởi tạo CSDL tự động
```

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU CHUYÊN SÂU (DATABASE SCHEMA DEEP-DIVE)

Mô hình dữ liệu được triển khai bằng **JPA Entity trên Supabase PostgreSQL**, gồm 33 bảng tham chiếu, chuẩn hóa từ **1NF đến 3NF**, xử lý hoàn toàn các bất thường về lưu trữ (anomalies).

### 3.1. Tổng quan 10 Modules & 33 Bảng CSDL

| Module | Tên Phân Hệ | Số bảng | Danh sách các bảng thành phần |
|:---:|---|:---:|---|
| **A** | **Định danh & Phân quyền (Identity & RBAC)** | 8 | `roles`, `permissions`, `role_permissions`, `users`, `members`, `coaches`, `receptionists`, `center_managers` |
| **B** | **Danh mục & Cơ sở vật chất (Master Facilities)** | 3 | `disciplines`, `rooms`, `membership_packages` |
| **C** | **Gói thành viên (Subscriptions)** | 1 | `membership_subscriptions` |
| **D** | **Lớp học & Lịch học (Classes & Scheduling)** | 4 | `classes`, `class_sessions`, `class_enrollments`, `session_bookings` |
| **E** | **Check-in & Điểm danh (Checkin & Attendance)** | 2 | `center_checkins`, `session_attendance` |
| **F** | **Thanh toán & Báo cáo (Billing & Reporting)** | 4 | `payments`, `invoices`, `invoice_items`, `report_snapshots` |
| **G** | **Huấn luyện & Đánh giá (Coaching & Evaluation)** | 4 | `training_plans`, `training_plan_items`, `session_evaluations`, `member_progress_logs` |
| **H** | **Trí tuệ nhân tạo (AI Engine)** | 3 | `ai_recommendation_logs`, `ai_chat_sessions`, `ai_chat_messages` |
| **I** | **Thông báo & Hỗ trợ (Notifications & Support)** | 3 | `notifications`, `support_requests`, `support_request_messages` |
| **J** | **Quản trị hệ thống & Kiểm toán (Audit Logs)** | 1 | `audit_logs` |
| **TỔNG** | **Toàn bộ hệ thống** | **33 Bảng** | **Đạt chuẩn 3NF, đầy đủ Khóa chính, Khóa ngoại, Chỉ mục** |

---

### 3.2. Chi tiết từng Module và quan hệ khóa ngoại (FK)

#### Module A: Định danh & Phân quyền (Identity & RBAC)
Áp dụng chiến lược thiết kế **Table-per-Type (TPT) Inheritance**. Bảng `users` lưu giữ toàn bộ thông tin tài khoản dùng chung (auth, email, hash password, status), trong khi các bảng con kế thừa liên kết 1-1 bằng khóa ngoại trỏ về `users.id` với hành vi `ON DELETE CASCADE`:
1. `roles`: Vai trò hệ thống (`id`, `code`, `name`, `description`). Có 5 role code: `ADMIN`, `CENTER_MANAGER` (Manager), `COACH`, `MEMBER`, `RECEPTIONIST`. Admin quản trị tài khoản/phân quyền và tạo Manager; Manager chỉ tạo Coach/Receptionist qua chức năng tài khoản nhân sự. Admin cũng tạo được Coach/Receptionist. Đăng ký công khai chỉ tạo Member. Google đăng nhập Member hoặc Coach/Receptionist đã được cấp tài khoản bằng email đã xác minh, trả role từ database; không tự cấp role nhân sự và không ghi đè role thành Member.
2. `permissions`: Danh mục quyền hạn chi tiết (`id`, `code`, `name`, `module`).
3. `role_permissions`: Bảng liên kết nhiều-nhiều (N-N) gán quyền cho vai trò, có `UNIQUE(role_id, permission_id)`.
4. `users`: Bảng trung tâm người dùng (`id`, `role_id` -> `roles`, `email`, `phone`, `password_hash`, `gender` CHECK `male/female/other`, `status` CHECK `active/inactive/locked`, `deleted_at` cho soft delete).
5. `members`: Hồ sơ hội viên (`user_id` PK/FK -> `users.id`, `membership_code` UNIQUE, `join_date`, `health_notes`, `fitness_goal`, `fitness_level` CHECK `beginner/intermediate/advanced`, thông tin liên hệ khẩn cấp).
6. `coaches`: Hồ sơ huấn luyện viên (`user_id` PK/FK -> `users.id`, `specialization`, `bio`, `certification`, `hire_date`, `employment_status` CHECK `active/on_leave/terminated`).
7. `receptionists`: Hồ sơ nhân viên lễ tân (`user_id` PK/FK -> `users.id`, `shift`, `employment_status`).
8. `center_managers`: Hồ sơ người quản lý trung tâm (`user_id` PK/FK -> `users.id`, `hire_date`).

#### Module B: Danh mục & Cơ sở vật chất
9. `disciplines`: Bộ môn thể thao (`id`, `name` UNIQUE, `description`). Ví dụ: Gym, Yoga, Zumba, Bơi, Boxing.
10. `rooms`: Phòng tập / Sân bãi (`id`, `name`, `location`, `capacity`, `status` CHECK `available/maintenance/closed`).
11. `membership_packages`: Gói tập dịch vụ (`id`, `name`, `price`, `duration_days`, `class_credit_limit`, `status` CHECK `active/inactive`, `created_by` -> `users.id`).

#### Module C: Gói thành viên
12. `membership_subscriptions`: Hợp đồng/lượt đăng ký gói của hội viên (`id`, `member_id` -> `members.user_id`, `package_id` -> `membership_packages.id`, `previous_subscription_id` tự tham chiếu để lưu cây gia hạn, `start_date`, `end_date`, `status` CHECK `pending_payment/active/expired/cancelled`, `qr_code` UNIQUE để quét check-in).

#### Module D: Lớp học & Lịch học
13. `classes`: Lớp học (`id`, `name`, `discipline_id` -> `disciplines`, `coach_id` -> `coaches`, `room_id` -> `rooms`, `capacity`, `level` CHECK `beginner/intermediate/advanced/all`, `status` CHECK `active/inactive/archived`).
14. `class_sessions`: Buổi học cụ thể theo lịch (`id`, `class_id` -> `classes.id ON DELETE CASCADE`, `session_date`, `start_time`, `end_time`, `status` CHECK `scheduled/completed/cancelled`, `cancel_reason`).
15. `class_enrollments`: Học viên đặt chỗ lớp (`id`, `class_id` -> `classes`, `member_id` -> `members`, `status` CHECK `booked/cancelled/completed`, `enrolled_at`, `cancelled_at`, `cancelled_by`, `cancel_reason`).
16. `session_bookings`: Chỗ của hội viên ở **một buổi học** (`id`, `session_id` -> `class_sessions`, `member_id` -> `members`, `status` CHECK `booked/cancelled/completed`, `booked_at`, `batch_id` gom các buổi đặt hàng loạt, `cancelled_at`, `cancelled_by`, `cancel_reason`). Sức chứa tính theo từng buổi (số người đặt buổi đó cộng người ghi danh cả lớp). Bảng `class_waitlists` đã bỏ cùng tính năng hàng chờ.

#### Module E: Check-in & Điểm danh
17. `center_checkins`: Lịch sử ra vào trung tâm (`id`, `member_id`, `check_in_time`, `check_out_time`, `method` CHECK `qr/manual`, `recorded_by` -> `users.id`, `gate`).
18. `session_attendance`: Điểm danh từng buổi học của học viên (`id`, `session_id` -> `class_sessions`, `member_id` -> `members`, `status` CHECK `present/absent/late/excused`, `checked_in_at`, `recorded_by` -> `coaches.user_id`, `notes`). Có `UNIQUE(session_id, member_id)`.

#### Module F: Thanh toán & Báo cáo
19. `payments`: Giao dịch thanh toán (`id`, `member_id`, `subscription_id`, `class_enrollment_id`, `amount`, `method` CHECK `cash/pos/bank_transfer/online_wallet`, `status` CHECK `success/pending/failed/refunded`, `paid_at`, `received_by` -> `users.id`).
20. `invoices`: Hóa đơn điện tử (`id`, `payment_id` UNIQUE -> `payments.id`, `invoice_number` UNIQUE, `issued_at`, `subtotal_amount`, `tax_amount`, `total_amount` là cột tính toán, `pdf_url`).
21. `invoice_items`: Chi tiết dòng hàng hóa đơn (`id`, `invoice_id` -> `invoices.id ON DELETE CASCADE`, `description`, `quantity`, `unit_price`, `amount` là cột tính toán).
22. `report_snapshots`: Bản lưu trữ ảnh chụp báo cáo tài chính (`id`, `report_type` CHECK `revenue/membership/class_utilization`, `period_start`, `period_end`, `data` `jsonb`, `generated_by` -> `users.id`).

#### Module G: Huấn luyện & Đánh giá thể lực
23. `training_plans`: Kế hoạch huấn luyện (`id`, `member_id` -> `members`, `coach_id` -> `coaches`, `class_id`, `goal`, `start_date`, `end_date`, `status` CHECK `draft/active/completed/cancelled`, `is_ai_generated` BIT, `ai_recommendation_id` -> `ai_recommendation_logs.id`).
24. `training_plan_items`: Chi tiết bài tập trong kế hoạch (`id`, `training_plan_id` -> `training_plans.id ON DELETE CASCADE`, `day_of_week` CHECK 1-7, `exercise_name`, `description`, `sets`, `reps`, `duration_minutes`, `order_index`).
25. `session_evaluations`: Đánh giá buổi tập của học viên (`id`, `session_id`, `member_id`, `coach_id`, `performance_notes`, `progress_score`, `feedback`, `evaluated_at`).
26. `member_progress_logs`: Nhật ký theo dõi các chỉ số cơ thể (`id`, `member_id`, `metric_name` như Cân nặng, % Mỡ, Vòng eo..., `metric_value`, `unit`, `recorded_by`, `recorded_at`).

#### Module H: Trí tuệ nhân tạo (AI Engine)
27. `ai_recommendation_logs`: Nhật ký đề xuất bài tập của AI (`id`, `coach_id`, `member_id`, `input_context` `jsonb`, `recommended_content` `jsonb`, `model_name`, `is_applied` boolean).
28. `ai_chat_sessions`: Phiên hội thoại giữa hội viên và Chatbot (`id`, `member_id`, `topic`, `started_at`, `ended_at`).
29. `ai_chat_messages`: Chi tiết tin nhắn hội thoại (`id`, `session_id` -> `ai_chat_sessions.id ON DELETE CASCADE`, `sender` CHECK `member/ai`, `message`, `created_at`).

#### Module I: Thông báo & Hỗ trợ
30. `notifications`: Hộp thư thông báo đẩy (`id`, `user_id` -> `users.id`, `type` CHECK `schedule_change/package_expiry/class_reminder/system/support_reply/payment`, `title`, `message`, `is_read` BIT, `related_entity_type`, `related_entity_id`).
31. `support_requests`: Phiếu yêu cầu hỗ trợ / khiếu nại (`id`, `member_id`, `assigned_to` -> `users.id`, `subject`, `description`, `status` CHECK `open/in_progress/resolved/closed`).
32. `support_request_messages`: Lịch sử trao đổi trong phiếu hỗ trợ (`id`, `support_request_id` -> `support_requests.id ON DELETE CASCADE`, `sender_user_id` -> `users.id`, `message`).

#### Module J: Hệ thống & Kiểm toán
33. `audit_logs`: Ghi vết toàn bộ hành vi hệ thống (`id`, `user_id` -> `users.id`, `action`, `entity_type` có CHECK giới hạn các bảng dữ liệu, `entity_id`, `old_value` `jsonb`, `new_value` `jsonb`, `ip_address`, `created_at`).

---

### 3.3. Các ràng buộc nghiệp vụ nâng cao, Triggers & Partial Indexes

SQL examples below describe PostgreSQL constraints installed by `PostgreSqlTriggerProvider` after Hibernate. Do not execute them manually or create table-migration scripts.

Để bảo đảm toàn vẹn dữ liệu ở cấp độ cao nhất mà ứng dụng không thể bị rách dữ liệu (race conditions), database cài đặt 5 cơ chế bảo vệ cốt lõi:

#### 1. Partial Unique Indexes (Đánh chỉ mục duy nhất có điều kiện)
- **Đặt chỗ lớp học (`uq_enrollment_active`):**
  ```sql
  CREATE UNIQUE INDEX uq_enrollment_active
  ON class_enrollments (class_id, member_id)
  WHERE status = 'booked';
  ```
  *Ý nghĩa:* Không bao giờ có 2 dòng `booked` cùng lúc cho 1 hội viên trong 1 lớp, nhưng **cho phép lưu vô số dòng `cancelled` và `completed`**. Nhờ đó học viên có thể hủy rồi đăng ký lại thoải mái mà lịch sử booking không bị ghi đè hay mất mát.
- **Đặt chỗ theo buổi (`uq_session_booking_active`):**
  ```sql
  CREATE UNIQUE INDEX uq_session_booking_active
  ON session_bookings (session_id, member_id)
  WHERE status = 'booked';
  ```
  *Ý nghĩa:* Một hội viên chỉ giữ một chỗ `booked` cho mỗi buổi, nhưng vẫn lưu được lịch sử `cancelled`.

#### 2. Trigger kiểm tra sĩ số lớp học ([P2 — Class Capacity])
- **`trg_enrollments_check_capacity`** kích hoạt `AFTER INSERT, UPDATE` trên `class_enrollments`:
  Đếm tổng số bản ghi có `status = 'booked'`. Nếu `COUNT(*) > classes.capacity`, trigger lập tức bắn lỗi:  
  *PostgreSQL phát sinh SQLSTATE `23514`, constraint `trg_enrollments_check_capacity`; transaction bị rollback.*

#### 3. Trigger chống trùng lịch Huấn luyện viên & Phòng học ([P3 — Schedule Conflict])
- **`trg_sessions_check_conflict`** kích hoạt `AFTER INSERT, UPDATE` trên `class_sessions`:
  Kiểm tra điều kiện giao thoa khung giờ chuẩn toán học:  
  `NOT (i.end_time <= s2.start_time OR i.start_time >= s2.end_time)`
  - Bắn lỗi nếu **cùng Huấn luyện viên** bị trùng giờ giữa 2 buổi dạy khác nhau trong cùng ngày.
  - Bắn lỗi nếu **cùng Phòng tập** bị 2 lớp xếp chồng chéo khung giờ.

#### 4. Trigger kiểm tra gói thành viên còn hạn ([P4 — Membership Validation])
- **`trg_enrollments_check_membership`:** Chặn ngay lập tức nếu hội viên cố tình book lớp mà không có `membership_subscriptions` nào đạt điều kiện: `status = 'active' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE`.
- **`trg_checkins_check_membership`:** Chặn quét QR qua cổng trung tâm nếu gói tập đã hết hạn hoặc chưa thanh toán kích hoạt.

#### 5. Computed Columns STORED (Cột tính toán lưu vật lý)
- `invoices.total_amount GENERATED ALWAYS AS (subtotal_amount + tax_amount) STORED`
- `invoice_items.amount GENERATED ALWAYS AS (quantity * unit_price) STORED`
*Ý nghĩa:* Loại bỏ hoàn toàn rủi ro sai lệch dữ liệu tài chính (inconsistency) do lập trình viên tính toán nhầm ở tầng code.

---

## 4. HỆ THỐNG 6 LUỒNG NGHIỆP VỤ CỐT LÕI (6 CORE BUSINESS FLOWS)

Mô hình quy trình nghiệp vụ được chuẩn hóa qua sơ đồ Swimlane trong [sports_center_all_flows_swimlane.drawio](file:///d:/SWP391_PROJECT/SWP391/sports_center_all_flows_swimlane.drawio) và tài liệu quy chuẩn.

### 4.1. Ma trận chức năng tổng hợp (Actor × Flow Matrix)

| Chức năng chi tiết trong hệ thống | Thuộc Luồng | Member | Receptionist | Coach | Center Manager | AI Engine | System Core |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Đăng ký tài khoản / Đăng nhập OTP | Flow 1 | **X** | **X** | **X** | **X** | | **X** |
| Cập nhật hồ sơ cá nhân & chỉ số sức khỏe | Flow 1 | **X** | | | | | **X** |
| Tra cứu hồ sơ hội viên nhanh tại quầy | Flow 1 | | **X** | | **X** | | **X** |
| Xem danh mục gói tập (mới & gia hạn) | Flow 1 | **X** | **X** | | **X** | | **X** |
| Mua gói tập mới / Gia hạn gói tập | Flow 1 | **X** | **X** | | | | **X** |
| Kích hoạt gói tập & Sinh mã QR định danh | Flow 1 | | | | | | **X** |
| Xem thời khóa biểu lớp học & lịch dạy HLV | Flow 2 | **X** | **X** | **X** | **X** | | **X** |
| Đăng ký lớp học & Giữ chỗ trước | Flow 2 | **X** | **X** | | | | **X** |
| Đối soát điều kiện gói & sĩ số còn trống | Flow 2 | | | | | | **X** |
| Đặt lịch nhiều buổi một lượt (cả tuần / cả tháng) | Flow 2 | **X** | | | | | **X** |
| Học viên chủ động Hủy đăng ký lớp trên App | Flow 2 | **X** | | | | | **X** |
| Lễ tân hỗ trợ Hủy đăng ký lớp giúp hội viên | Flow 2 | | **X** | | | | **X** |
| Tự động hoàn lại lượt học & cập nhật sĩ số | Flow 2 | | | | | | **X** |
| Thu tiền đa phương thức (POS, CK, Tiền mặt) | Flow 3 | **X** | **X** | | | | **X** |
| Tự động phát hành & in hóa đơn điện tử | Flow 3 | **X** | **X** | | | | **X** |
| Quản lý công nợ & trạng thái hoàn tiền | Flow 3 | | **X** | | **X** | | **X** |
| Xem Dashboard tài chính & doanh thu đa chiều | Flow 3 | | | | **X** | | **X** |
| Xem tỷ lệ lấp đầy phòng học & hủy lịch | Flow 3 | | | | **X** | | **X** |
| Xem báo cáo tăng trưởng & biến động hội viên | Flow 3 | | | | **X** | | **X** |
| Xuất file báo cáo thống kê (Excel, PDF) | Flow 3 | | | | **X** | | **X** |
| Quản lý tài khoản người dùng (CRUD Users) | Flow 4 | | | | **X** | | **X** |
| Quản lý danh mục Lớp học, Bộ môn, Phòng tập | Flow 4 | | | | **X** | | **X** |
| Phân công Huấn luyện viên phụ trách lớp | Flow 4 | | | | **X** | | **X** |
| Cấu hình gói dịch vụ (giá, hạn, quyền lợi) | Flow 4 | | | | **X** | | **X** |
| Thiết lập ma trận phân quyền truy cập (RBAC) | Flow 4 | | | | **X** | | **X** |
| Giám sát nhật ký hoạt động hệ thống (Audit Log)| Flow 4 | | | | **X** | | **X** |
| Xem danh sách lớp & mục tiêu thể chất HV | Flow 5 | | | **X** | | | **X** |
| Lập kế hoạch huấn luyện (cá nhân / nhóm) | Flow 5 | | | **X** | | | **X** |
| Gửi prompt yêu cầu AI gợi ý bài tập | Flow 5 | | | **X** | | **X** | **X** |
| AI phân tích thể trạng & gợi ý giáo án | Flow 5 | | | | | **X** | |
| Coach tinh chỉnh, phê duyệt & áp dụng giáo án | Flow 5 | | | **X** | | | **X** |
| Giao bài tập về nhà (homework) qua App | Flow 5 | **X** | | **X** | | | **X** |
| Điểm danh học viên vào lớp tập (4 trạng thái)| Flow 5 | | | **X** | | | **X** |
| Đánh giá kỹ thuật & ghi nhận tiến độ sau tập | Flow 5 | | | **X** | | | **X** |
| Đồng bộ kết quả vào biểu đồ thể lực HV | Flow 5 | **X** | | | | | **X** |
| Hội viên chat trò chuyện với Trợ lý AI 24/7 | Flow 6 | **X** | | | | **X** | **X** |
| AI xử lý NLP tra cứu kiến thức & chính sách | Flow 6 | | | | | **X** | |
| Background Job giám sát sự kiện đổi lịch/HLV | Flow 6 | | | | | | **X** |
| Cảnh báo gói tập sắp hết hạn (trước 7 ngày) | Flow 6 | **X** | **X** | | | | **X** |
| Nhắc nhở buổi tập sắp diễn ra (trước 2 giờ) | Flow 6 | **X** | | | | | **X** |
| Đẩy thông báo đa kênh (Push / SMS / In-App) | Flow 6 | **X** | | | | | **X** |

---

### 4.2. Bóc tách chi tiết từng Luồng từ Flow 1 đến Flow 6

#### Flow 1: Quản Lý Người Dùng & Gói Thành Viên (User & Membership Management)
- **Mục tiêu:** Tiếp nhận đăng ký tài khoản, định danh hội viên, bán gói tập mới, gia hạn gói cũ và cấp thẻ QR điện tử.
- **Tiến trình:**
  1. *Hội viên* gửi thông tin đăng ký hoặc đăng nhập. Hệ thống kiểm tra tính hợp lệ qua OTP/Mật khẩu.
  2. *Hội viên* cập nhật hồ sơ sức khỏe cá nhân (chiều cao, cân nặng, tiền sử bệnh án, mục tiêu giảm cân/tăng cơ).
  3. *Hội viên* duyệt danh mục gói và chọn Mua mới hoặc Gia hạn.
  4. Yêu cầu chuyển đến *Lễ tân* (tại quầy) hoặc cổng thanh toán online.
  5. *Hệ thống* xác thực thanh toán: Nếu hợp lệ -> sinh bản ghi `membership_subscriptions` mới (hoặc kế thừa `previous_subscription_id`), sinh chuỗi mã `qr_code` duy nhất và gửi thẻ điện tử về ứng dụng di động của Hội viên.

#### Flow 2: Đăng Ký Lớp Học & Quản Lý Lịch Tập (Class Booking & Schedule Management)
- **Mục tiêu:** Quản lý thời khóa biểu, cho phép hội viên đăng ký giữ chỗ lớp học, kiểm soát sĩ số theo từng buổi và xử lý hủy lớp linh hoạt.
- **Tiến trình:**
  1. *Hội viên* xem lịch học tuần, thông tin HLV phụ trách, phòng học và số chỗ còn lại.
  2. Bấm "Đăng ký lớp": *Hệ thống* chạy Trigger kiểm tra:
     - Gói tập của hội viên còn active và hạn dùng `>=` ngày học?
     - Sĩ số lớp hiện tại có `< capacity`?
  3. **Trường hợp còn chỗ:** Xác nhận đặt chỗ (`status = 'booked'`), ghi nhận vào `class_enrollments`, gửi thông báo xác nhận và đồng bộ vào lịch cá nhân trên App.
  4. **Trường hợp hết chỗ (Full Slot):** Buổi học hiển thị "Buổi đã đầy"; hội viên chọn buổi khác. Hội viên có thể bật "Đặt nhiều buổi" để chọn nhiều buổi (cả tuần, 30 ngày tới) và đặt một lượt; buổi đầy hoặc trùng giờ được bỏ qua và báo lại.
  5. **Quy trình Hủy lớp:** Hội viên tự bấm hủy trên App (trước giờ học quy định) hoặc Lễ tân hỗ trợ hủy tại quầy -> Chuyển trạng thái booking sang `cancelled` -> Hệ thống giải phóng chỗ ngay lập tức.

#### Flow 3: Quản Lý Thanh Toán & Báo Cáo Thống Kê (Payment & Report Management)
- **Mục tiêu:** Tiếp nhận thanh toán đa phương thức, tự động phát hành hóa đơn và cung cấp hệ thống báo cáo quản trị toàn diện cho Ban Quản lý.
- **Tiến trình:**
  1. Giao dịch mua gói hoặc phí dịch vụ phát sinh -> *Lễ tân* hoặc cổng trực tuyến ghi nhận phương thức (`cash`, `pos`, `bank_transfer`, `online_wallet`).
  2. *Hệ thống* lưu bản ghi `payments` (`status = 'success'`), tự động tạo hóa đơn `invoices` kèm các chi tiết dòng hàng `invoice_items` với cột thành tiền tự động tính `STORED`.
  3. Lễ tân in biên lai hoặc hệ thống gửi hóa đơn điện tử dạng PDF qua Email/App của Hội viên.
  4. *Center Manager* truy cập Bảng điều khiển (Admin Dashboard):
     - Lọc doanh thu theo ngày/tháng/quý/năm, theo từng bộ môn, gói tập hoặc HLV.
     - Xem tỷ lệ lấp đầy phòng tập và tỷ lệ hủy lớp.
     - Xuất dữ liệu báo cáo ra file Excel (.xlsx) hoặc PDF. Bản chụp dữ liệu được lưu định dạng JSON trong `report_snapshots`.

#### Flow 4: Quản Trị & Cấu Hình Hệ Thống (System Administration & Configuration)
- **Mục tiêu:** Cung cấp cổng quản trị tập trung cho Center Manager quản lý toàn bộ tài nguyên, cấu hình dịch vụ và kiểm soát an toàn thông tin.
- **Tiến trình:**
  1. *Center Manager* đăng nhập Admin Portal -> Hệ thống xác thực quyền hạn thông qua RBAC.
  2. Thực hiện các nghiệp vụ quản trị:
     - **CRUD Người dùng:** Khóa/Mở tài khoản, phân vai trò HLV/Lễ tân/Hội viên.
     - **CRUD Cơ sở vật chất:** Khởi tạo phòng tập, cấu hình sức chứa, danh mục bộ môn.
     - **Quản trị Lớp học & Phân công:** Thiết lập lớp học, gán HLV phụ trách, lên lịch ca dạy (Tránh trùng lịch nhờ Trigger DB).
     - **Cấu hình Gói tập:** Thiết lập gói dịch vụ mới, biểu phí, số ngày hiệu lực, hạn mức số buổi học.
     - **Cấu hình RBAC:** Gán quyền hạn chức năng linh hoạt cho từng Role.
  3. Mọi thao tác cập nhật CSDL đều được hệ thống tự động ghi nhật ký vào `audit_logs` (lưu IP, user_id, old_value JSON, new_value JSON).

#### Flow 5: Kế Hoạch Huấn Luyện & Hỗ Trợ AI Cho HLV (Training Planning & AI Coaching)
- **Mục tiêu:** Hỗ trợ Huấn luyện viên cá nhân hóa lộ trình tập luyện cho học viên nhờ sức mạnh của AI, kết hợp quản lý buổi tập và đánh giá thể lực.
- **Tiến trình:**
  1. *Coach* mở danh sách học viên trong lớp, tra cứu hồ sơ sức khỏe, chỉ số BMI, lịch sử tập và chấn thương.
  2. *Coach* gửi yêu cầu tạo kế hoạch tập luyện -> Chọn chế độ **"Yêu cầu AI hỗ trợ"**.
  3. *AI Engine* phân tích dữ liệu thể chất đầu vào và trả về gợi ý danh mục bài tập, số sets, reps, thời gian nghỉ và lưu vào `ai_recommendation_logs`.
  4. *Coach* rà soát gợi ý, tinh chỉnh khối lượng vận động và bấm "Phê duyệt" -> Kế hoạch chuyển từ `draft` sang `active` trong bảng `training_plans`.
  5. *Coach* giao bài tập về nhà (homework) kèm hướng dẫn qua App cho học viên.
  6. **Tại buổi học:** Coach thực hiện điểm danh học viên trên giao diện mobile (Present, Late, Absent, Excused), giám sát kỹ thuật động tác.
  7. **Kết thúc buổi:** Coach nhập đánh giá điểm tiến độ (Progress Score) và nhận xét -> Hệ thống đồng bộ dữ liệu vào `member_progress_logs` để học viên theo dõi biểu đồ tăng trưởng sức khỏe trên App.

#### Flow 6: Trợ Lý AI & Quản Lý Thông Báo Hội Viên (AI Assistant & Notifications)
- **Mục tiêu:** Nâng cao trải nghiệm hội viên thông qua trợ lý ảo NLP 24/7 và hệ thống thông báo chủ động (Proactive Notification Engine).
- **Tiến trình:**
  1. **Nhánh 1: Chatbot AI tương tác 24/7:**
     - Hội viên mở ứng dụng, đặt câu hỏi về chế độ ăn kiêng, bài tập cardio, lịch các lớp Yoga sáng mai hoặc quy định hoàn vé.
     - Chatbot tiếp nhận, xử lý NLP, tra cứu CSDL trung tâm và phản hồi tức thì.
     - Hội viên có thể đánh giá 1-5 sao chất lượng câu trả lời. Lịch sử hội thoại được lưu tại `ai_chat_sessions` & `ai_chat_messages`.
  2. **Nhánh 2: Động cơ thông báo chạy ngầm (Background Event Engine):**
     - Scheduler tự động quét các sự kiện phát sinh:
       + Lớp học bị đổi giờ hoặc đổi HLV -> Đẩy thông báo `schedule_change`.
       + Gói tập còn `<= 7 ngày` trước khi hết hạn -> Đẩy thông báo `package_expiry` nhắc gia hạn.
       + Lớp học sắp bắt đầu trong vòng `2 giờ` -> Đẩy thông báo `class_reminder` nhắc học viên đến lớp.
     - Thông báo được lưu vào bảng `notifications` và bắn qua kênh Push Notification di động / SMS.

---

## 5. HỆ THỐNG 12 BIỂU ĐỒ TRẠNG THÁI UML (12 STATE MACHINE DIAGRAMS)

Hệ thống được mô hình hóa trạng thái nghiêm ngặt bằng 12 biểu đồ State Machine chuẩn UML trong [state_diagrams.drawio](file:///d:/SWP391_PROJECT/SWP391/state_diagrams.drawio), tương ứng với các trường trạng thái trong CSDL:

```
+----------------------------------------------------------------------------------------------------+
|                                 12 UML STATE MACHINE DIAGRAMS                                     |
+----+----------------------------+---------------------------------+--------------------------------+
| TT | Tên Biểu Đồ Trạng Thái    | Bảng CSDL & Trường Trạng Thái   | Các Trạng Thái Hợp Lệ (States)|
+----+----------------------------+---------------------------------+--------------------------------+
| 01 | Tài khoản người dùng       | users.status                    | reg -> active, inactive, locked|
| 02 | Gói hội viên               | membership_subscriptions.status | pending_payment, active,       |
|    |                            |                                 | expired, cancelled             |
| 03 | Đăng ký lớp học            | class_enrollments.status        | booked, cancelled, completed   |
| 04 | Buổi học                   | class_sessions.status           | scheduled, completed, cancelled|
| 05 | Giao dịch thanh toán       | payments.status                 | pending, success, failed,      |
|    |                            |                                 | refunded                       |
| 06 | Yêu cầu hỗ trợ             | support_requests.status         | open, in_progress, resolved,   |
|    |                            |                                 | closed                         |
| 07 | Kế hoạch tập luyện         | training_plans.status           | draft, active, completed,      |
|    |                            |                                 | cancelled                      |
| 08 | Check-in trung tâm         | center_checkins                 | arriving -> qr -> checkedin /  |
|    |                            |                                 | rejected -> insession -> out   |
| 09 | Điểm danh buổi học         | session_attendance.status       | unmarked -> present, late,     |
|    |                            |                                 | absent, excused                |
| 10 | Thông báo hệ thống         | notifications                   | triggered -> created (is_read=0|
|    |                            |                                 | -> delivered -> read (is_read=1|
| 11 | Phiên trò chuyện AI        | ai_chat_sessions                | opened -> asking -> processing |
|    |                            |                                 | -> replied -> rated -> ended   |
| 12 | Chỗ đặt theo buổi học      | session_bookings.status         | booked, cancelled, completed   |
|    |                            |                                 |                                |
+----+----------------------------+---------------------------------+--------------------------------+
```

### Chi tiết các bước chuyển trạng thái (State Transitions):

#### 1. Tài khoản người dùng (`users.status`)
- `[*] -> [Đang đăng ký]`: Người dùng tạo tài khoản mới.
- `[Đang đăng ký] -> [Đang hoạt động]`: Xác thực OTP thành công (`status = 'active'`).
- `[Đang đăng ký] -> [*]`: Quá thời gian xác thực / Hủy đăng ký.
- `[Đang hoạt động] -> [Bị khóa]`: Vi phạm chính sách / Quản trị viên khóa (`status = 'locked'`).
- `[Bị khóa] -> [Đang hoạt động]`: Quản trị viên mở khóa tài khoản.
- `[Đang hoạt động] -> [Tạm ngưng]`: Người dùng xin tạm ngưng hoặc quản trị cấu hình (`status = 'inactive'`).
- `[Tạm ngưng] -> [Đang hoạt động]`: Kích hoạt lại tài khoản.
- `[Đang hoạt động] -> [*]`: Xóa mềm tài khoản (`deleted_at IS NOT NULL`).

#### 2. Gói hội viên (`membership_subscriptions.status`)
- `[*] -> [Chờ thanh toán]`: Khách hàng chọn gói tập (`pending_payment`).
- `[Chờ thanh toán] -> [Đang hiệu lực]`: Thanh toán thành công, hệ thống cấp mã QR (`active`).
- `[Chờ thanh toán] -> [Đã hủy gói]`: Hủy đơn / Thanh toán thất bại (`cancelled`).
- `[Đang hiệu lực] -> [Đã hết hạn]`: Thời gian vượt quá ngày kết thúc `end_date < CURRENT_DATE` (`expired`).
- `[Đang hiệu lực] -> [Đã hủy gói]`: Ban quản trị hủy gói hoặc duyệt hoàn tiền.
- `[Đang hiệu lực] -> [Đang hiệu lực]`: Gia hạn gói (cập nhật ngày `end_date`).
- `[Đã hết hạn] -> [Chờ thanh toán]`: Hội viên tiếp tục mua gói mới.

#### 3. Đăng ký lớp học (`class_enrollments.status`)
- `[*] -> [Đã đặt chỗ]`: Hội viên đăng ký thành công khi gói còn hạn & lớp còn chỗ (`booked`).
- `[Đã đặt chỗ] -> [Đã hủy chỗ]`: Hội viên tự hủy trên App hoặc Lễ tân hủy giúp tại quầy (`cancelled`).
- `[Đã đặt chỗ] -> [Đã hoàn thành]`: Lớp học kết thúc, điểm danh hoàn tất (`completed`).
- *Lưu ý DB:* Bộ lọc `uq_enrollment_active (WHERE status = 'booked')` cho phép 1 học viên sở hữu nhiều dòng `cancelled`/`completed` nhưng chỉ duy nhất 1 dòng `booked`.

#### 4. Buổi học (`class_sessions.status`)
- `[*] -> [Đã lên lịch]`: Tạo ca học thành công, không xung đột HLV và phòng (`scheduled`).
- `[Đã lên lịch] -> [Đã hoàn thành]`: HLV điểm danh và hoàn tất buổi học (`completed`).
- `[Đã lên lịch] -> [Đã hủy buổi]`: HLV xin nghỉ đột xuất hoặc phòng gặp sự cố bảo trì (`cancelled`). Hệ thống tự động đẩy thông báo cho toàn bộ học viên đã đăng ký.

#### 5. Giao dịch thanh toán (`payments.status`)
- `[*] -> [Chờ thanh toán]`: Khởi tạo đơn thanh toán (`pending`).
- `[Chờ thanh toán] -> [Thành công]`: Giao dịch xác thực thành công qua POS/Ngân hàng/Tiền mặt (`success`) -> Kích hoạt xuất hóa đơn `invoices`.
- `[Chờ thanh toán] -> [Thất bại]`: Thẻ bị từ chối / Hết thời gian chờ (`failed`).
- `[Thất bại] -> [Chờ thanh toán]`: Thử thực hiện lại giao dịch.
- `[Thành công] -> [Đã hoàn tiền]`: Quản trị viên duyệt yêu cầu hoàn trả tiền (`refunded`).

#### 6. Yêu cầu hỗ trợ (`support_requests.status`)
- `[*] -> [Đang mở]`: Hội viên gửi yêu cầu khiếu nại/hỗ trợ trên App (`open`).
- `[Đang mở] -> [Đang xử lý]`: Nhân viên tiếp nhận và được gán phiếu (`in_progress`).
- `[Đang xử lý] -> [Đang mở]`: Nhân viên yêu cầu hội viên cung cấp thêm thông tin.
- `[Đang xử lý] -> [Đã giải quyết]`: Nhân viên đưa ra phương án xử lý thỏa đáng (`resolved`).
- `[Đã giải quyết] -> [Đã đóng]`: Hội viên bấm xác nhận hoặc hệ thống tự đóng sau 72 giờ (`closed`).
- `[Đang mở] -> [Đã đóng]`: Hội viên tự rút lại yêu cầu hỗ trợ.

#### 7. Kế hoạch tập luyện (`training_plans.status`)
- `[*] -> [Bản nháp]`: HLV khởi tạo kế hoạch tập hoặc gọi AI gợi ý (`draft`).
- `[Bản nháp] -> [Đang áp dụng]`: HLV phê duyệt và gán chính thức cho học viên (`active`).
- `[Bản nháp] -> [Đã hủy bỏ]`: Hủy bản nháp không sử dụng (`cancelled`).
- `[Đang áp dụng] -> [Đã hoàn thành]`: Học viên hoàn tất toàn bộ chu kỳ bài tập (`completed`).
- `[Đang áp dụng] -> [Đã hủy bỏ]`: Ngừng kế hoạch giữa chừng để đổi kế hoạch mới.

#### 8. Check-in trung tâm (`center_checkins`)
- `[*] -> [Đến trung tâm] -> [Xuất trình mã QR]`: Hội viên mở App quét mã tại cổng kiểm soát.
- `[Xuất trình mã QR] -> [Check-in hợp lệ]`: Trigger kiểm tra gói tập còn active và còn hạn -> Cho phép qua cổng, lưu `check_in_time`.
- `[Xuất trình mã QR] -> [Bị từ chối vào]`: Gói tập hết hạn / không hợp lệ -> Cổng báo đỏ, lễ tân nhắc gia hạn.
- `[Check-in hợp lệ] -> [Đang tập luyện] -> [Đã Check-out]`: Hội viên tập xong quét thẻ ra về, hệ thống cập nhật `check_out_time`.

#### 9. Điểm danh buổi học (`session_attendance.status`)
- `[*] -> [Chưa điểm danh]`: Lớp học bắt đầu, danh sách học viên ở trạng thái chờ (`unmarked`).
- `[Chưa điểm danh] -> [Có mặt]`: Học viên đến đúng giờ (`present`).
- `[Chưa điểm danh] -> [Đi muộn]`: Học viên đến sau giờ quy định (`late`).
- `[Chưa điểm danh] -> [Vắng mặt]`: Học viên không đến lớp (`absent`).
- `[Chưa điểm danh] -> [Có phép]`: Học viên đã báo bận trước cho HLV/Lễ tân (`excused`).

#### 10. Thông báo hệ thống (`notifications`)
- `[*] -> [Được kích hoạt]`: Phát sinh sự kiện (đổi lịch, hết hạn gói, nhắc giờ học).
- `[Được kích hoạt] -> [Đã tạo]`: Bản ghi được ghi vào CSDL (`is_read = 0`).
- `[Đã tạo] -> [Đã gửi đến thiết bị]`: Push Notification gửi thành công đến điện thoại.
- `[Đã gửi đến thiết bị] -> [Đã đọc]`: Người dùng nhấn mở xem thông báo (`is_read = 1`).

#### 11. Phiên trò chuyện AI (`ai_chat_sessions`)
- `[*] -> [Đã khởi tạo phiên]`: Người dùng nhấn mở khung chat với Trợ lý AI.
- Chu trình lặp bên trong:
  - `[Hội viên đặt câu hỏi]` -> `[AI đang xử lý NLP]` -> `[AI đã phản hồi]`.
  - `[AI đã phản hồi] -> [Đã đánh giá phản hồi]`: Người dùng chấm 1-5 sao.
  - `[AI đã phản hồi] -> [Hội viên đặt câu hỏi]`: Đặt câu hỏi kế tiếp.
- `[Đang hoạt động] -> [Kết thúc phiên] -> [*]`: Người dùng đóng cửa sổ chat hoặc hết thời gian timeout (30 phút không hoạt động), lưu toàn bộ hội thoại.

#### 12. Chỗ đặt theo buổi học (`session_bookings.status`)
- `[*] -> [Đã đặt chỗ]`: Hội viên đặt một buổi, hoặc nhiều buổi một lượt (`booked`).
- `[Đã đặt chỗ] -> [Đã hủy]`: Hội viên hoặc lễ tân/quản lý hủy trước giờ bắt đầu, hoặc buổi học bị hủy, hoặc gói tập tạm hoãn/hết hạn (`cancelled`); chỗ được giải phóng ngay.
- `[Đã đặt chỗ] -> [Hoàn thành]`: Buổi học đã diễn ra (`completed`).

---

## 6. BỘ CÔNG CỤ TỰ ĐỘNG HÓA & QUẢN TRỊ SƠ ĐỒ (TOOLING & SCRIPTS)

Nhóm phát triển đã thiết lập bộ công cụ tự động hóa mạnh mẽ bằng **Node.js** giúp render và kiểm thử chất lượng đồ họa phần mềm:

### 6.1. Script sinh State Diagrams tự động: [build_state_diagrams.js](file:///d:/SWP391_PROJECT/SWP391/build_state_diagrams.js)
- **Chức năng:** Tự động sinh file `state_diagrams.drawio` chứa đầy đủ 12 tab biểu đồ trạng thái chuẩn UML.
- **Quy chuẩn đồ họa tích hợp:**
  - Sử dụng hệ màu pastel theo chuẩn thiết kế quốc tế: Xanh lá (`#E8F5E9`) cho Thành công/Hoạt động, Vàng chanh (`#FFF8E1`) cho Khởi tạo/Chờ, Xanh dương (`#E3F2FD`) cho Xử lý/Thông tin, Tím (`#F3E5F5`) cho Tạm ngưng/Cảnh báo, Đỏ hồng (`#FFEBEE`) cho Khóa/Lỗi/Hủy.
  - Tự động tính toán tọa độ X/Y của các nút trạng thái, nút bắt đầu (`STYLE_START`) và nút kết thúc (`STYLE_END_OUTER` + `STYLE_END_INNER`).
  - Đường nối tự động định tuyến vuông góc (`orthogonalEdgeStyle`) với nhãn có nền trắng (`labelBackgroundColor=#ffffff`) chống đè vạch kẻ.
- **Lệnh thực thi:**
  ```powershell
  node build_state_diagrams.js
  ```

### 6.2. Script sinh Swimlane Diagrams tự động: [build_clean_swimlane.js](file:///d:/SWP391_PROJECT/SWP391/build_clean_swimlane.js)
- **Chức năng:** Tạo ra file sơ đồ phân làn `sports_center_all_flows_swimlane.drawio` và cập nhật `sports_center_flow.drawio` với 7 tabs hoàn chỉnh (Master Swimlane + 6 Flows độc lập).
- **Quy chuẩn kỹ thuật:**
  - **Zero Overlap:** Mỗi bước quy trình sở hữu tọa độ X tịnh tiến riêng biệt trên trục thời gian, tuyệt đối không đè nhau trong cùng một làn.
  - **Phân vùng giai đoạn (Phase Banners & Separators):** Header màu phân tách từng giai đoạn nghiệp vụ rõ ràng, đường nét đứt (`dashed=1`) chạy dọc toàn bộ các làn.
  - **Màu sắc làn phân vai chuẩn hóa:** Hội viên (Xanh dương pastel), Lễ tân (Xanh lá pastel), Hệ thống (Cam pastel), Huấn luyện viên (Hồng pastel), AI Engine (Vàng pastel), Quản lý (Tím pastel).
- **Lệnh thực thi:**
  ```powershell
  node build_clean_swimlane.js
  ```

### 6.3. Script kiểm thử tĩnh tính hợp lệ: [verify_diagrams.js](file:///d:/SWP391_PROJECT/SWP391/verify_diagrams.js)
- **Chức năng:** Kiểm thử tự động tính đúng đắn của toàn bộ các file `.drawio` trước khi bàn giao:
  - Phân tích cú pháp XML, đếm số nodes và số edges trong từng tab.
  - Kiểm tra tính toàn vẹn của liên kết: Xác thực 100% `source` và `target` của từng edge phải tồn tại trong tập hợp Node IDs (chống hiện tượng cạnh mồ côi - Dangling edges).
  - Quét va chạm không gian: Phát hiện bất kỳ 2 node nào trong cùng một swimlane bị giao thoa tọa độ `[x .. x+w]`.
- **Lệnh thực thi:**
  ```powershell
  node verify_diagrams.js
  ```

---

## 7. HƯỚNG DẪN TRIỂN KHAI PHẦN MỀM CHO AGENT TIẾP THEO (IMPLEMENTATION BLUEPRINT)

Khi một AI Agent hoặc lập trình viên mới tiếp nhận dự án này để bắt đầu giai đoạn **Viết mã (Coding / Implementation Phase)**, hãy tuân thủ chặt chẽ các chỉ dẫn kiến trúc sau:

### 7.1. Kiến trúc Công nghệ Khuyến nghị (Recommended Tech Stack)
- **Hệ quản trị CSDL:** Supabase PostgreSQL; schema được đồng bộ từ JPA Entity bằng Hibernate.
- **Backend Service:**
  - *Option 1 (Java Enterprise):* Java 17+ kết hợp **Spring Boot 3.x**, Spring Data JPA / Hibernate, Spring Security + JWT, Lombok, MapStruct.
  - *Option 2 (TypeScript Modern):* **NestJS** (hoặc Express TS), TypeORM / Prisma ORM, Passport JWT, Zod / Class-Validator.
  - *Option 3 (.NET Core):* **ASP.NET Core 8 Web API**, Entity Framework Core 8.
- **Frontend Portal (Quản trị & Lễ tân):** React.js / Next.js hoặc Vue.js 3 với giao diện Dashboard hiện đại (TailwindCSS / Ant Design / Material UI), tích hợp bộ lọc báo cáo, bảng biểu Chart.js / ApexCharts và trình đọc mã vạch QR camera.
- **Mobile Client (Hội viên & Huấn luyện viên):** React Native hoặc Flutter:
  - Hiển thị thẻ thành viên QR Code động.
  - Đăng ký lịch tập, nhận Push Notification qua Firebase Cloud Messaging (FCM).
  - Tích hợp giao diện Chatbot AI và nhật ký theo dõi chỉ số thể lực (BMI, cân nặng).
- **Tích hợp Trí tuệ nhân tạo (AI Engine):**
  - Sử dụng **OpenAI API (GPT-4o-mini / GPT-4o)** hoặc **Google Gemini API (Gemini 1.5 Flash / Pro)**.
  - Cấu hình Prompting dạng JSON Structured Outputs để đảm bảo giáo án gợi ý khớp 100% với schema bảng `training_plan_items`.
  - Triển khai RAG (Retrieval-Augmented Generation) để Chatbot trả lời chính xác bảng giá và nội quy của trung tâm.

---

### 7.2. Thiết Kế RESTful API Blueprint

```
===================================================================================
MODULE                      METHOD   ENDPOINT                                  MÔ TẢ NGHIỆP VỤ
===================================================================================
1. Định danh & Auth         POST     /api/v1/auth/register                     Đăng ký tài khoản hội viên mới
                            POST     /api/v1/auth/verify-otp                   Xác thực OTP kích hoạt tài khoản
                            POST     /api/v1/auth/login                        Đăng nhập hệ thống & nhận JWT Token
                            GET      /api/v1/users/me                          Lấy thông tin cá nhân hiện tại
                            PUT      /api/v1/users/profile                     Cập nhật hồ sơ & chỉ số sức khỏe
-----------------------------------------------------------------------------------
2. Gói tập & Thành viên     GET      /api/v1/membership-packages               Lấy danh mục các gói tập đang mở
                            POST     /api/v1/subscriptions/purchase           Mua gói mới / Gia hạn gói tập
                            GET      /api/v1/subscriptions/my-card             Lấy mã QR thẻ thành viên hiện hành
-----------------------------------------------------------------------------------
3. Lớp học & Đặt chỗ        GET      /api/v1/classes                           Tra cứu danh sách lớp & bộ môn
                            GET      /api/v1/classes/schedule                  Xem thời khóa biểu theo tuần
                            POST     /api/v1/classes/{id}/book                 Đăng ký giữ chỗ vào lớp học
                            POST     /api/v1/classes/{id}/cancel               Hủy đăng ký lớp học
                            POST     /api/v1/classes/session-bookings/bulk     Đặt nhiều buổi học một lượt
-----------------------------------------------------------------------------------
4. Check-in & Điểm danh     POST     /api/v1/checkin/scan-qr                   Quét mã QR vào cổng trung tâm
                            POST     /api/v1/sessions/{id}/attendance          HLV điểm danh học viên lớp học
-----------------------------------------------------------------------------------
5. Thanh toán & Hóa đơn     POST     /api/v1/payments/process                  Ghi nhận thanh toán (POS/CK/Tiền mặt)
                            GET      /api/v1/invoices/{id}/pdf                 Tải file PDF hóa đơn điện tử
                            GET      /api/v1/reports/revenue                   Báo cáo doanh thu tài chính
                            GET      /api/v1/reports/class-utilization         Báo cáo tỷ lệ lấp đầy phòng học
-----------------------------------------------------------------------------------
6. Huấn luyện & AI          GET      /api/v1/coaching/members/{id}/metrics     Xem biểu đồ chỉ số thể lực học viên
                            POST     /api/v1/ai/generate-workout-plan          Gọi AI gợi ý bài tập theo thể trạng
                            POST     /api/v1/training-plans                    Tạo & phê duyệt kế hoạch huấn luyện
                            POST     /api/v1/sessions/{id}/evaluate            HLV ghi nhận đánh giá sau buổi tập
-----------------------------------------------------------------------------------
7. Chatbot & Thông báo      POST     /api/v1/ai/chat/message                   Gửi tin nhắn hỏi đáp với Chatbot AI
                            GET      /api/v1/notifications                    Lấy danh sách thông báo của người dùng
                            PUT      /api/v1/notifications/{id}/read          Đánh dấu thông báo đã đọc
-----------------------------------------------------------------------------------
8. Cửa hàng Sản phẩm        GET      /api/v1/public/products                  Danh mục thực phẩm bổ sung công khai
   (Supplement Shop)        GET      /api/v1/public/products/{slug}           Chi tiết sản phẩm & Bảng thành phần
                            POST     /api/v1/public/shop/quote                Báo giá giỏ hàng & phí vận chuyển
                            GET      /api/v1/public/geo/provinces             Danh mục 34 Tỉnh/Thành phố (2 cấp)
                            POST     /api/v1/shop/orders                      Hội viên đặt đơn hàng (giữ tồn kho)
                            POST     /api/v1/staff/product-orders/{id}/...    Lễ tân thu tiền tại quầy / giao hàng
                            POST     /api/v1/manager/products                 Quản lý CRUD sản phẩm & điều chỉnh tồn
===================================================================================
```

### 7.2.1. Nghiệp vụ Cửa hàng Thực phẩm bổ sung (“Sản phẩm” — Cập nhật 05/11/2026)
- **Đối tượng mua hàng:** Khách vãng lai xem danh mục `/products`, bảng thành phần dinh dưỡng (`NutritionFacts`), giá mỗi khẩu phần (`pricePerServing`) và thêm vào giỏ hàng (`localStorage`). Khi thanh toán (`/checkout`), hệ thống yêu cầu đăng nhập tài khoản `MEMBER` (không bắt buộc có gói tập `active` — khác với đặt lớp/check-in).
- **Trừ tồn kho & Giữ hàng:** Tồn kho (`product_variants.stock`) được kiểm tra và trừ ngay khi tạo đơn dưới khóa bi quan `PESSIMISTIC_WRITE` theo thứ tự `variantId` tăng dần kèm `CHECK (stock >= 0)`. Đơn thanh toán online giữ hàng **15 phút**; đơn nhận tại quầy trả tại quầy giữ hàng **24 giờ**. Scheduler tự động hủy đơn quá hạn và hoàn tồn kho (`stock_movements` ghi nhận `order_hold` / `order_release`).
- **Tích hợp Tài chính & Hoàn tiền:** Tái sử dụng `payments` (`product_order_id`), `vnpay_payment_attempts`, `wallets` và `invoices`. Khi hủy đơn đã thanh toán (`paid` / `processing`), hệ thống tự động hoàn tiền vào **Ví điện tử** của hội viên (`wallet_transactions` loại `REFUND`, `reference_id = orderId` chống hoàn trùng).
- **Địa chỉ hành chính 2 cấp:** Áp dụng mô hình Tỉnh/Thành phố → Phường/Xã/Đặc khu (34 tỉnh/thành, 3.321 đơn vị cấp xã từ `vn-admin-units.json`), lưu snapshot tên tỉnh và phường trên từng đơn hàng để bảo toàn lịch sử.

---

### 7.3. Những quy tắc "Sống Còn" (Critical Gotchas) Dành Cho Agent Code

> [!CAUTION]
> **1. Hibernate Code-First on Supabase PostgreSQL only:**
> JPA entities define tables, columns and relationships. Historical files in `db/` are reference material, never deployment scripts. Update diagrams when entity/state definitions change; run Maven tests and verify upgrades against an isolated Supabase dev/test schema before merging.

> [!IMPORTANT]
> **2. Tôn trọng tầng bảo vệ Trigger của PostgreSQL:**
> Khi viết mã Backend (Spring Boot), lập trình viên phải bắt các lỗi SQL Exception từ database ném ra (ví dụ mã SQLSTATE và constraint của Trigger `trg_enrollments_check_capacity` khi lớp đầy chỗ, hoặc `trg_sessions_check_conflict` khi xếp trùng giờ giáo viên) và chuyển đổi thành mã lỗi HTTP thân thiện:
> - `409 Conflict` cho capacity/trùng lịch hoặc `403 Forbidden` cho membership, kèm message i18n theo request.

> [!TIP]
> **3. Xử lý Soft-Delete trên bảng `users`:**
> Bảng `users` sử dụng cơ chế xóa mềm qua trường `deleted_at`. Khi viết các câu truy vấn tìm kiếm hoặc xác thực đăng nhập, luôn luôn kèm theo điều kiện `WHERE deleted_at IS NULL` để không tính các tài khoản đã bị vô hiệu hóa.

> [!NOTE]
> **4. Cơ chế đồng bộ hóa dữ liệu AI:**
> Bảng `ai_recommendation_logs` có quan hệ 1-N với `training_plans`. Khi HLV chấp nhận gợi ý của AI để tạo giáo án, phải cập nhật cờ `is_applied = 1` trong bảng `ai_recommendation_logs` và lưu `ai_recommendation_id` vào bảng `training_plans` để phục vụ công tác đo lường hiệu quả (Metrics / Analytics) của mô hình AI.

---

## 8. KẾT LUẬN & TRẠNG THÁI DỰ ÁN

Dự án **Sports Center Management System (SWP391)** hiện tại đã hoàn thiện toàn bộ giai đoạn khảo sát, mô hình hóa dữ liệu và thiết kế kiến trúc quy trình:
- **33/33 bảng CSDL** đã được kiểm chứng chuẩn hóa 3NF và được định nghĩa bằng Entity để Hibernate đồng bộ trên PostgreSQL.
- **6/6 luồng nghiệp vụ Swimlane** đã được phân ranh giới phân vai rõ ràng, zero overlap và có sẵn file vẽ Draw.io phục vụ thuyết minh đồ án.
- **12/12 sơ đồ máy trạng thái UML** đã được kết xuất thành ảnh minh họa và file vector trực quan.
- **Hệ thống scripts tự động** giúp duy trì tính nhất quán tuyệt đối giữa mã nguồn và tài liệu.

Bất kỳ AI Agent hoặc nhóm lập trình viên nào tiếp quản tài liệu này đều có thể tự tin triển khai trực tiếp mã nguồn ứng dụng (Web, Mobile, Backend API) mà không gặp bất kỳ sự mâu thuẫn hay mơ hồ nào về mặt nghiệp vụ!
