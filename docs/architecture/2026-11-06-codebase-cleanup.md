# Audit cấu trúc và cleanup — 06/11/2026

Phạm vi: vệ sinh repository, cấu trúc module, mã frontend không còn được dùng, dependency/build tooling và các gate CI. Không thay đổi API, schema, nghiệp vụ, thiết kế UI hoặc target deploy.

## Đã xử lý

| Vấn đề xác minh | Thay đổi |
| --- | --- |
| 1.063 file Graphify đang được track, tổng khoảng 186 MiB | Bỏ khỏi Git index, giữ file local; ignore `graphify-out/` ở mọi cấp và metadata/cache Graphify. Lịch sử Git trước đó không bị rewrite. |
| Rule Git bị lặp, `.env*` phía sau che exception mẫu môi trường | Gom rule tại root; giữ `.env.example` và `.env.*.example`, ignore môi trường thật, build/dependencies, coverage và output test runner. Xóa `.gitignore` con bị trùng. |
| Output phân tích local có thể đi vào Docker build context hoặc ESLint | Thêm exclude tương ứng cho hai Docker context và ESLint frontend. |
| Hai npm lockfile rỗng trong thư mục không có `package.json` | Xóa `apps/package-lock.json` và `apps/api/package-lock.json`. Backend tiếp tục dùng Maven. |
| Plugin React của Vite đặt trong runtime dependencies | Chuyển sang `devDependencies`, đồng bộ npm lockfile. Không đổi phiên bản resolve, không thêm/xóa package. |
| Mã frontend không reachable từ entry point, route lazy hoặc test | Xóa 8 file được liệt kê bên dưới; bỏ mock API favorites đã ngừng sử dụng trong test. |
| Scaffold `.gitkeep` tạo cảm giác có module chưa triển khai | Xóa placeholder; bỏ module backend rỗng `classes`/`reporting` khỏi cây Git. Module thật tương ứng là `scheduling`/`reports`. |
| Build chưa chặn biến/import không dùng | Bật `noUnusedLocals`, `noUnusedParameters` trong TypeScript app config. |
| Lệnh Maven npm ở root chỉ gọi wrapper Windows | Dùng launcher Node không thêm dependency, chọn wrapper theo OS, giữ working directory và exit code. Runner PowerShell đầy đủ giữ nguyên. |
| CI có thể bỏ qua test/lint/chính sách database khi file hoặc script mất | Chuyển các gate này thành bắt buộc; dùng Maven Wrapper đã version control. Giữ tên workflow, triggers và các target deploy. |
| Tài liệu chưa mô tả đầy đủ cấu trúc, còn chỉ dẫn SQL Server/schema cũ | Thêm `CONTRIBUTING.md`, bản đồ repo; cập nhật hub tài liệu, hướng dẫn scripts và link quy chuẩn agent. |

### Mã cũ đã xóa

Đối chiếu bằng TypeScript module resolution cho import/export tĩnh và dynamic import, đi từ `main.tsx` cùng test, rồi tìm tham chiếu trong source và scripts:

- `features/landing/types.ts`: type của cấu trúc slide landing cũ.
- `features/member/favoriteDisciplinesApi.ts`: API wrapper favorites cũ; màn hình hiện tại đã bỏ favorites.
- `features/shop/shopFallbackCatalog.ts`: catalog/báo giá mẫu không còn được gọi; giữ nguyên yêu cầu dữ liệu giá/tồn kho từ server.
- `features/wallet/WalletModal.tsx`: modal không còn được import; ví hiện tại được thực hiện trong `PortalShell`.
- `src/hooks/index.ts`, `useCountUp.ts`, `useInView.ts`: barrel và hook cũ không có caller. Hook landing đang hoạt động không bị xóa.
- `shared/lib/receiptImage.ts`: helper không còn có caller.

Các test favorites còn giữ kiểm tra UI và discipline filtering; bỏ mock/assertion cho module đã không còn nằm trong dependency graph.

## Đánh giá cấu trúc

Giữ mô hình hiện tại: `apps/web` và `apps/api` độc lập về dependencies/build, frontend theo feature, backend modular monolith theo nghiệp vụ. Không chuyển sang microservices, không gom thành npm workspace và không đổi build context của Docker/Vercel.

Các điểm còn cần PR refactor riêng:

1. Controller/backend layer ở một số module vẫn đặt ngay package gốc của feature, trong khi module mới dùng `controller/`. Chuẩn hóa từng feature kèm test để giảm churn import và rủi ro reflection/package scan.
2. `StaffClassesPage.tsx`, `MemberCoachBookingView.tsx`, `MemberPackagesPage.tsx` và `PortalShell.tsx` còn lớn; nên tách theo use case/component khi làm ticket liên quan, giữ state ownership và behavior tests.
3. Một số nghiệp vụ còn cross-feature import. Không đủ căn cứ để xóa hoặc đổi thành `shared` hàng loạt; cần phân tích chiều phụ thuộc và quyền sở hữu trước mỗi lần tách.
4. Runner đầy đủ `npm start`/`stop`/`db:init` vẫn dành cho Windows/PowerShell. Launcher Maven và lệnh frontend chạy riêng hỗ trợ macOS/Linux; chưa thay bộ quản lý tiến trình local bằng một runner mới.

Không coi một lần cleanup là chứng nhận toàn bộ codebase đã đạt chuẩn doanh nghiệp. Tài liệu cấu trúc nêu rõ quy ước áp dụng cho code mới và phần legacy còn tồn tại.

## Kết quả kiểm chứng

- `npm run test:web`: **127 file, 840 test pass**.
- `npm run lint:web`: pass.
- `npm run build:web`: pass, bao gồm TypeScript với hai flag kiểm tra unused mới.
- `npm run test:api -- --batch-mode --no-transfer-progress` qua launcher Node, Java 21: **1.207 test, 0 failure, 0 error, 37 skip**. Test DB thật bị skip không được tính là kiểm chứng tích hợp Supabase thực tế.
- `npm ci --dry-run --ignore-scripts --offline`: pass, xác nhận consistency manifest/lockfile mà không thay node_modules.
- So sánh npm lockfile với HEAD: không đổi resolved version và tập package.
- Actionlint: pass cả `CI`, `CD`, `CI VPS`.
- `git check-ignore --no-index`: Graphify ở root/web/api và `.env` thật bị ignore; các mẫu môi trường không bị ignore.
- `git ls-files`: không còn Graphify trong index; hai graph local vẫn tồn tại.
- `git diff --check`: pass.

Giới hạn: chưa chạy Docker image thực tế vì máy không có Docker Engine; chưa kiểm chứng launcher trên Windows; chưa chạy riêng script PowerShell do máy không có `pwsh`. Không thay hoặc chạy CD lên Vercel/Render, không deploy VPS và không tạo giao dịch thật. Git history vẫn chứa Graphify của các commit cũ; cleanup này chỉ bỏ theo dõi từ thay đổi hiện tại.
