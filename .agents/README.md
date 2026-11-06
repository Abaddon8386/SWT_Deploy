# Agent workspace

Bất kỳ AI Agent nào khi tham gia phát triển dự án này PHẢI đọc và tuân thủ:
1. `../AGENTS.md` (root) và `rules/mandatory-rules.md`: Bất biến kiến trúc, phân vai squad, và cấm hard-code.
2. `../docs/rules/backend-architecture.md`: Chuẩn mực 3 lớp, SOLID, IoC, Code-First & ORM Polymorphism, và i18n.
3. `workflows/scms-development.md`: Quy trình 6 bước chuẩn mực để triển khai ticket.

Do not treat files in this directory as product runtime code.

## Danh sách Workflows (`.agents/workflows`)

1. **SCMS Development** (`workflows/scms-development.md` - lệnh `/scms-development`):
   - Quy trình 6 bước chuẩn mực: Đọc Rules -> Kiểm tra Squad Boundaries -> Thiết kế bất biến ORM/Triggers/i18n & Ponytail Ladder -> Triển khai 3 lớp -> Verification test -> Knowledge Graph & Commit.
2. **Ponytail - Lazy Senior Dev Mode** (`workflows/ponytail.md` - lệnh `/ponytail`):
   - Kích hoạt chế độ Senior Dev tinh gọn, tối giản hóa code, ưu tiên built-in/standard library, ngắn gọn và an toàn.
3. **Ponytail Audit** (`workflows/ponytail-audit.md` - lệnh `/ponytail-audit`):
   - Rà soát code thừa, bloat, boilerplate, abstraction thừa trong codebase.
4. **Ponytail Review** (`workflows/ponytail-review.md` - lệnh `/ponytail-review`):
   - Review code diff hoặc PR theo tiêu chuẩn Senior Dev (tinh gọn, an toàn, không over-engineering).
5. **Graphify** (`workflows/graphify.md` - lệnh `/graphify`):
   - Xây dựng hoặc cập nhật knowledge graph cho toàn bộ codebase.

## Danh sách Rules tự động kích hoạt (`.agents/rules`)

1. **Mandatory Rules** (`rules/mandatory-rules.md`):
   - Tự động nạp vào mọi phiên làm việc của Agent. Bắt buộc đọc tài liệu, không code đè phân hệ của người khác, cấm hard-code strings, tuân thủ Code-First & ORM Polymorphism, và áp dụng triết lý Ponytail YAGNI.
2. **Ponytail Rules** (`rules/ponytail.md`):
   - The Ponytail Ladder: Kiểm tra YAGNI -> Tái sử dụng code có sẵn -> Thư viện chuẩn -> Native platform -> Dependency hiện có -> Diff ngắn nhất -> Sửa lỗi tại root cause.
3. **Graphify** (`rules/graphify.md`):
   - Quy tắc truy vấn và cập nhật đồ thị kiến trúc sau khi sửa đổi mã nguồn.

## Danh sách Plugins đã tích hợp (`.agents/plugins`)

1. **Ponytail Plugin** (`plugins/ponytail`):
   - Nguồn: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
   - Cung cấp toàn bộ bundle: `plugin.json`, bộ 6 skills, rules và commands cho Antigravity.

## Danh sách Skills đã tích hợp

1. **SCMS Development** (`skills/scms-development`):
   - Quy ước chuyên biệt cho dự án Sports Center Management System (React, Spring Boot, Supabase PostgreSQL, Hibernate Code-First, Jira).

2. **Ponytail - Lazy Senior Dev Mode** (`skills/ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`):
   - Nguồn: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
   - Giúp Agent viết code tối giản (~54% less code), triệt tiêu over-engineering, áp dụng YAGNI triệt để, ưu tiên Standard Library / built-in thay vì cài dependencies thừa.

3. **UI/UX Pro Max** (`skills/ui-ux-pro-max`, kèm `banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`):
   - Nguồn: [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
   - Hệ thống trí tuệ thiết kế UI/UX với 79 UI styles, 192 color palettes, 74 font pairings, 119 UX guidelines và công cụ tìm kiếm BM25.

4. **Superpowers** (`skills/brainstorming`, `diagnosing-superpowers`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-superpowers`, `verification-before-completion`, `writing-plans`, `writing-skills`):
   - Nguồn: [superpowers](https://github.com/obra/superpowers)
   - Phương pháp phát triển phần mềm chuẩn mực cho AI Agent: TDD, debug có hệ thống, lập kế hoạch chi tiết, kiểm thử trước khi hoàn tất, và điều phối subagent.

5. **Graphify** (`skills/graphify`):
   - Nguồn: [graphify](https://github.com/Graphify-Labs/graphify)
   - Ánh xạ codebase và tài liệu thành knowledge graph để truy vấn kiến trúc, phân tích phụ thuộc và luồng dữ liệu.

6. **Taste Skill (Anti-Slop Frontend)** (`skills/taste-skill`, `taste-skill-v1`, `gpt-tasteskill`, `minimalist-skill`, `brutalist-skill`, `soft-skill`, `redesign-skill`, `stitch-skill`, `image-to-code-skill`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit`, `output-skill`):
   - Nguồn: [taste-skill](https://github.com/leonxlnx/taste-skill)
   - Khung thiết kế frontend chống rập khuôn (anti-slop) cho web/landing page, chuyển động GSAP mượt mà, typography và design systems cao cấp.


