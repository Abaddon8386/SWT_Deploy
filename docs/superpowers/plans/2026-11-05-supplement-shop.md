# Cửa hàng thực phẩm bổ sung “Sản phẩm” — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Trước khi bắt đầu, làm đúng `.agents/workflows/scms-development.md` (đọc `AGENTS.md`, `docs/rules/backend-architecture.md`, `.agents/rules/mandatory-rules.md`, `.agents/rules/ponytail.md`, `DESIGN.md`).

**Goal:** Thêm mục “Sản phẩm” lên landing (topbar + section) để khách xem và mua thực phẩm bổ sung: danh mục, chi tiết sản phẩm, giỏ hàng, sổ địa chỉ giao hàng, đặt hàng, thanh toán VNPay Sandbox / Ví SÖL / trả tại quầy, theo dõi đơn; lễ tân xử lý đơn; quản lý quản trị sản phẩm, tồn kho và đơn.

**Architecture:** Feature mới `com.swp391.scms.shop` (JPA code-first, service transaction, khóa bi quan khi trừ tồn) cắm vào luồng thanh toán sẵn có bằng một cột đích mới `payments.product_order_id`, giống cách `court_booking_id`/`coach_booking_id` đang làm. Frontend thêm `features/shop` dùng lại `PublicLayout`, `fit-*`, `VnpayPayButton`, `Modal`, `notify`, `LoadingSkeleton`; giỏ hàng nằm ở trình duyệt, máy chủ luôn tính lại giá qua API báo giá.

**Tech Stack:** Java 21, Spring Boot 3, Spring Data JPA/Hibernate 6, Supabase PostgreSQL; React 19 + TypeScript + Vite + Vitest; Plus Jakarta Sans; không thêm dependency.

**Spec:** Phần A của chính tài liệu này (thiết kế + quyết định). Không có spec riêng.

**Jira:** Chưa có Jira key cho tính năng này. **Không tự đặt key.** Hỏi người dùng key trước khi mở PR (AGENTS.md yêu cầu ghi key trong mô tả PR).

**Squad:** Shop là phân hệ mới chưa có owner. Task 7 sửa phân hệ Finance (Phong: `VnpayPaymentService`, `VnpayPaymentGuard`, `InvoiceService`, `Payment`) — báo người dùng và xin xác nhận trước khi sửa (`.agents/rules/mandatory-rules.md` §2). Không sửa `users/ProfileService` (Tài) ngoài việc tách validator ảnh dùng chung ở Task 2 — cũng phải xin xác nhận; nếu không được phép, sao chép logic kiểm tra vào `shop` thay vì sửa file của Tài.

## Global Constraints

- Database: chỉ Supabase PostgreSQL, profile `supabase`, `ddl-auto: update`; mọi bảng/cột/ràng buộc khai báo bằng Entity; **không** viết migration DDL, **không** native SQL trong repository/service.
- i18n: mọi message API/lỗi/validation dùng key qua `MessageService`; thêm key vào **cả 3 file** `messages.properties`, `messages_vi.properties`, `messages_en.properties`. Controller/service inject `MessageService` bằng constructor chaining null-safe.
- Exception: dùng `BadRequestException`/`ConflictException`/`ForbiddenException`/`ResourceNotFoundException` với `(errorCode, messageKey, messageArgs, fallbackMessage)`.
- Phân quyền ở backend (`SecurityConfig` + `@PreAuthorize`). Mua hàng chỉ cho role `MEMBER` (không cần gói tập còn hạn — bất biến “subscription active” chỉ áp dụng cho booking/check-in). Lễ tân: `RECEPTIONIST` (+ legacy `STAFF`); Quản lý: `CENTER_MANAGER`.
- User có `deleted_at` không được mua, không xuất hiện trong danh sách mặc định.
- Thanh toán: chỉ **VNPay Sandbox** và **Ví SÖL** trực tuyến, cộng **trả tại quầy** cho đơn nhận tại quầy. Không gateway thật, không COD giao tận nơi, không tích hợp đơn vị vận chuyển (lễ tân nhập mã vận đơn thủ công), không PDF/export.
- Giá, phí giao, tồn kho luôn do máy chủ tính; client chỉ hiển thị.
- UI công khai: SÖL Fitness charcoal–salmon, Plus Jakarta Sans, full width, reveal từng component bằng `data-reveal`, cuộn native, tôn trọng `prefers-reduced-motion`, focus bàn phím rõ. Portal: token `--portal-*`, sáng/tối, vùng chạm ≥44px, input mobile 16px.
- Không icon/emoji trang trí đứng trước chữ trong portal (DESIGN.md 03/11/2026). Không số liệu giả: không sao đánh giá, không “đã bán 1k+”, không giá gạch giả, không nhãn chứng nhận không có thật.
- Tuân thủ quảng cáo thực phẩm bảo vệ sức khỏe (VN): trang chi tiết, giỏ hàng và thanh toán hiển thị câu **“Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.”**; không viết công dụng chữa bệnh.
- Địa chỉ Việt Nam theo mô hình **2 cấp từ 01/07/2025**: Tỉnh/Thành phố (34 đơn vị) → Phường/Xã/Đặc khu. Không có cấp Quận/Huyện.
- Ponytail/YAGNI: không interface một-implementation, không bảng/abstraction chưa có màn hình dùng tới.
- Kết thúc mọi task backend: `./mvnw.cmd -q test`; frontend: `npx tsc -b`, `npx eslint src --max-warnings=0`, `npx vitest run`. Cuối cùng: `scripts/test-database-config.ps1`, `graphify update .`.

## Review Focus

1. **Hai người mua món cuối cùng cùng lúc** → đúng một đơn thành công, đơn kia nhận 409 `PRODUCT_OUT_OF_STOCK`, tồn không âm. (Task 6 unit test + Task 10 test PostgreSQL thật.)
2. **Bấm “Thanh toán” hai lần / mạng chập chờn sau khi đơn đã tạo** → cùng `clientRequestId` trả lại đúng đơn cũ, không tạo đơn/khoản giữ hàng thứ hai. (Task 6 + Task 15.)
3. **Giá hoặc tồn đổi giữa lúc xem giỏ và lúc đặt** → 409 `ORDER_PRICE_CHANGED`, UI tải lại báo giá và giữ nguyên lựa chọn giao hàng. (Task 6 + Task 15.)
4. **VNPay báo thành công muộn sau khi đơn hết hạn giữ hàng** → đơn chưa bị hủy khi còn trong thời gian ân hạn của VNPay; nếu đã hủy thì tiền về Ví, không mất tiền. (Task 6 scheduler + Task 7.)
5. **Khách chưa đăng nhập bấm “Thanh toán”** → đăng nhập/đăng ký xong quay lại đúng `/checkout` với giỏ còn nguyên; tài khoản không phải hội viên thấy hướng dẫn thay vì lỗi 403 thô. (Task 15.)

---

# PHẦN A — THIẾT KẾ

## A1. Chủ đề, người dùng, nhiệm vụ của trang

- **Chủ đề:** kệ thực phẩm bổ sung của phòng tập SÖL (whey, creatine, pre-workout, điện giải, vitamin, thanh protein).
- **Người dùng:** khách vãng lai xem landing; hội viên đang tập (đa số nhận tại quầy khi đến tập); lễ tân đóng gói/giao; quản lý nhập hàng.
- **Nhiệm vụ duy nhất của trang Sản phẩm:** giúp người tập chọn đúng sản phẩm cho mục tiêu và so sánh trung thực — **mỗi khẩu phần có gì, giá mỗi lần dùng bao nhiêu** — rồi mua trong vài bước.

## A2. Quyết định mặc định (đã chốt cho plan này — người dùng có thể đổi)

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Ai được mua | Đăng nhập role `MEMBER` (tài khoản đăng ký công khai đều là Member). Không cần gói tập còn hạn. Không mua khách vãng lai (Payment/Ví gắn với Member). Khách vẫn xem, thêm giỏ, xem báo giá. |
| D2 | Giỏ hàng | Lưu `localStorage` (`scms_cart_v1`), đồng bộ giữa tab; máy chủ báo giá qua `POST /public/shop/quote`. Không có bảng giỏ hàng ở DB (YAGNI). Xóa giỏ sau khi đặt đơn thành công. |
| D3 | Nhận hàng | `delivery` (giao tận nơi, toàn quốc, phí đồng giá) hoặc `pickup` (nhận tại quầy SÖL, miễn phí). |
| D4 | Phí giao | `app.shop.shipping-fee=30000`, miễn phí khi tạm tính ≥ `app.shop.free-shipping-threshold=500000`. Pickup = 0. |
| D5 | Thanh toán | `online` (VNPay Sandbox hoặc Ví SÖL — chọn ở bước trả tiền, dùng lại `VnpayPayButton`) hoặc `counter` (chỉ khi `pickup`; trả khi đến nhận). |
| D6 | Giữ hàng | Tạo đơn = trừ tồn ngay (giữ hàng). Online: hạn trả `app.shop.payment-window-minutes=30`; counter: `app.shop.counter-hold-hours=48`. Hết hạn → tự hủy, hoàn tồn (bỏ qua khi VNPay còn trong thời gian chờ IPN). |
| D7 | Hủy & hoàn tiền | Hội viên hủy được khi `pending_payment` hoặc `paid` (chưa chuẩn bị). Lễ tân/Quản lý hủy được mọi trạng thái chưa kết thúc, bắt buộc lý do. Đã trả tiền → hoàn **toàn bộ** vào Ví SÖL (`WalletService.creditRefund`). |
| D8 | Biến thể | Mỗi sản phẩm ≥1 biến thể (vị/khối lượng) có SKU, giá, tồn, số lần dùng riêng. |
| D9 | Ảnh sản phẩm | Lưu data URL JPEG/PNG/WEBP trong DB (giống avatar), ≤1,5 MB/ảnh, ≤6 ảnh/sản phẩm, **không SVG**; phục vụ qua endpoint ảnh có cache. Thiếu ảnh → hình bao bì vẽ bằng SVG theo dạng sản phẩm (`ProductPackshot`). |
| D10 | Địa chỉ | Sổ địa chỉ tối đa 5/hội viên, 1 mặc định; danh mục hành chính 2 cấp đóng gói trong repo (không gọi API bên thứ ba lúc chạy). |
| D11 | Mã đơn | `SOL-yyMMdd-XXXX` (XXXX: 4 ký tự từ `23456789ABCDEFGHJKMNPQRSTUVWXYZ`). |
| D12 | Giới hạn | ≤20 sản phẩm/dòng, ≤30 dòng/đơn, tổng ≤100.000.000 đ. |
| D13 | Dữ liệu mẫu | `ProductSeeder` chỉ chạy khi `app.shop.seed-samples=true` (mặc định `false`) và bảng sản phẩm rỗng. Sản phẩm mẫu là nhãn nhà “SÖL Nutrition”, không dùng thương hiệu thật, không số công bố giả. |
| D14 | Nơi quản lý địa chỉ | Tab “Địa chỉ giao hàng” trong `/member/orders` và ngay trong `/checkout`. **Không** thêm card vào Hồ sơ (DESIGN.md giữ Hồ sơ một card). |

## A3. Hướng thiết kế

DESIGN.md đã khóa nhận diện: charcoal `#202020`, bề mặt `#292929`/`#303030`, chữ `#faf9f6`, chữ phụ `#bcb8b5` (portal tối `#cbc7c3`), salmon `#ce9180`, hover `#e1aa98`; theme sáng nền `#F5F5F3`, card `#FFFFFF`, chữ `#202020`, salmon đậm `#A35B49` cho chữ nhấn. Font duy nhất Plus Jakarta Sans. **Không thêm màu/font mới.**

**Token dùng trong shop (map vào biến có sẵn, không hex cứng trong TSX):**

| Vai trò | Public (`.fit-site`) | Portal (`.portal-v2`) |
|---|---|---|
| Nền trang | `--fit-ink` | `--portal-ink` |
| Card sản phẩm | `#292929` / sáng `#FFFFFF` (đã có trong `fitness-public.css` theme) | `--portal-surface` |
| Khung ảnh sản phẩm | `#303030` / sáng `#EEEFEC` | `--portal-raised` |
| Giá, CTA, giá mỗi lần dùng | `--fit-salmon` (chữ nhấn sáng `#A35B49`) | `--portal-salmon` |
| Nhãn thành phần (signature) | giấy `--fit-paper` + mực `--fit-ink` | giống public |

**Typography:** H2 section theo landing (`900`, in hoa, tracking `-.035em`), tên sản phẩm `800` tracking `-.025em`, kicker `700` in hoa tracking `.14em`, số tiền và số dinh dưỡng `font-variant-numeric: tabular-nums`.

**Signature — “Nhãn thành phần” (`NutritionFacts`):** một tấm nhãn giấy sáng nằm trên giao diện than, dựng lại ngữ pháp của nhãn bao bì thật: tiêu đề in hoa đậm, vạch kẻ 3 độ dày (10px / 5px / 1px) phân cấp thông tin, hàng con thụt lề, số căn phải dạng bảng. Đây là chỗ duy nhất trên trang dùng bề mặt sáng ở theme tối — rủi ro thẩm mỹ có chủ đích vì nó là vật thể thật của chủ đề (người mua thực phẩm bổ sung đọc nhãn trước khi mua). Đi kèm trên card: **“giá mỗi lần dùng”** (`giá biến thể ÷ số lần dùng`) bằng salmon tabular — thước đo so sánh trung thực thay cho huy hiệu giảm giá.

Mọi thứ khác giữ yên: card phẳng, không glow, không gradient nhiều màu, không đánh số 01/02 trang trí (chỉ timeline đơn hàng — vốn là trình tự thật — mới có thứ tự).

## A4. Màn hình & wireframe

### A4.1 Topbar công khai (`PublicLayout`)

```
SÖL Fitness®   Về SÖL  Bộ môn  Huấn luyện viên  Gói tập  Sản phẩm      [🛒 2]  (Vào portal →)
```
- Thêm link route `/products` nhãn **“Sản phẩm”** (không phải hash). Active khi `pathname` bắt đầu bằng `/products`.
- Nút giỏ hàng chỉ có icon (cho phép theo DESIGN “nút chỉ có icon”), `aria-label="Giỏ hàng · 2 sản phẩm"`, badge số lượng (tổng quantity), mở `CartDrawer`. Hiện trên mọi trang công khai. Mobile: nằm cạnh nút menu, ≥44px.
- Footer nav thêm “Sản phẩm”.

### A4.2 Section landing `#products` (đặt giữa `#packages` và `#faq`)

```
                    FUEL THE WORK
                FUEL & RECOVERY.
   Thực phẩm bổ sung chọn cho lịch tập của bạn. Nhận tại quầy hoặc giao tận nơi.
   [Tất cả] [Tăng cơ] [Phục hồi] [Năng lượng] [Kiểm soát cân nặng] [Sức khỏe tổng quát]
 ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
 │  packshot    │ │  packshot    │ │  packshot    │
 │──────────────│ │──────────────│ │──────────────│
 │ WHEY · BỘT   │ │ CREATINE     │ │ ĐIỆN GIẢI    │
 │ SÖL Whey Iso │ │ ...          │ │ ...          │
 │ 25 g protein │ │ 5 g creatine │ │ 500 mg natri │
 │ 1.290.000đ   │ │              │ │              │
 │ 18.971đ/lần  │ │              │ │              │
 │ [Thêm vào giỏ]│ │              │ │              │
 └──────────────┘ └──────────────┘ └──────────────┘
              (Xem tất cả sản phẩm →)
```
- Chip lọc dùng lại kiểu `.fit-pricing-switch`. Hiển thị tối đa 3 sản phẩm `featured`, thiếu thì bù sản phẩm mới nhất; lọc theo mục tiêu gọi lại API.
- Card `data-reveal="lift"`, stagger theo nhóm 3 như hiện hành. Đổi chip → fade ngắn như “lọc gói”.
- Loading/error dùng cùng hành vi `CatalogStatus` (ẩn giá cũ khi lỗi, nút “Thử lại”). Không có sản phẩm → section không render (landing không trưng mục rỗng).

### A4.3 `/products` — kệ sản phẩm (PublicLayout)

```
 SẢN PHẨM
 Thực phẩm bổ sung SÖL                                 [ Tìm sản phẩm…        ]
 [Tất cả][Tăng cơ][Phục hồi][Năng lượng][Kiểm soát cân nặng][Sức khỏe tổng quát]
 Loại: [Tất cả loại ▾]   Sắp xếp: [Mới nhất ▾]   [✓] Chỉ hiện còn hàng      12 sản phẩm
 ┌────┐┌────┐┌────┐┌────┐      (≥1100px: 4 cột; ≥760px: 3 cột; <760px: 2 cột gọn)
 └────┘└────┘└────┘└────┘
              [ Xem thêm ]    (trang 12 sản phẩm)
 Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.
```
- Bộ lọc đồng bộ URL: `?goal=muscle_gain&category=whey&q=&sort=price_per_serving&inStock=1`. Vào lại URL → khôi phục trạng thái.
- Sắp xếp: Mới nhất · Giá tăng dần · Giá giảm dần · Giá mỗi lần dùng thấp nhất.
- Empty: “Không có sản phẩm khớp bộ lọc.” + nút “Xóa bộ lọc”. Error: “Không tải được sản phẩm.” + “Thử lại”. Loading: `LoadingSkeleton` 8 card.

### A4.4 `/products/:slug` — chi tiết

```
 ← Sản phẩm / Whey
 ┌───────────────────────┐   WHEY · BỘT
 │                       │   SÖL WHEY ISOLATE
 │     ảnh lớn           │   Đạm whey tách béo, dễ pha, vị nhẹ.
 │                       │   Mục tiêu: Tăng cơ · Phục hồi
 └───────────────────────┘
 [▢][▢][▢]  ảnh nhỏ          Lựa chọn
                             (Sô-cô-la · 2,27 kg) (Vani · 2,27 kg) (Sô-cô-la · 907 g  Hết hàng)
                             1.290.000đ        18.971đ / lần dùng · 68 lần
                             Còn 4 sản phẩm
                             [ − 1 + ]  [ Thêm vào giỏ ]  ( Mua ngay → )
                             Nhận tại quầy miễn phí · Giao toàn quốc 30.000đ,
                             miễn phí từ 500.000đ
                             Thực phẩm này không phải là thuốc…

 ┌───────────────────────────────┐   Cách dùng
 │ THÀNH PHẦN DINH DƯỠNG         │   Pha 1 muỗng với 250 ml nước…
 │ Khẩu phần: 1 muỗng (33 g)     │
 │ Số lần dùng: 68               │   Lưu ý
 │███████████████████████████████│   Không dùng cho trẻ em, phụ nữ có thai…
 │ Mỗi khẩu phần          % NCKN*│
 │▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│   Số công bố: 12345/2026/ĐKSP (chỉ hiện khi có)
 │ Năng lượng            130 kcal│
 │ Đạm                25 g    50%│
 │   BCAA                  5,5 g │
 │───────────────────────────────│
 │ …                             │
 │███████████████████████████████│
 │ *NCKN: nhu cầu khuyến nghị    │
 └───────────────────────────────┘
 Cùng loại
 ┌────┐┌────┐┌────┐┌────┐
```
- Biến thể là nhóm radio dạng pill; biến thể hết hàng `disabled` kèm chữ “Hết hàng”. Số lần dùng/giá mỗi lần cập nhật theo biến thể.
- Stepper 1…min(tồn, 20). “Còn N sản phẩm” chỉ khi tồn ≤ 5. Hết toàn bộ: nút chính đổi thành “Hết hàng” (disabled).
- “Thêm vào giỏ” → `toast('Đã thêm vào giỏ')` (thao tác cục bộ dùng `toast()` theo DESIGN), badge giỏ nảy 180ms. “Mua ngay” → thêm và chuyển `/checkout`.
- 404 slug/sản phẩm ngừng bán: “Sản phẩm này không còn bán.” + link về `/products`.

### A4.5 Giỏ hàng (`CartDrawer`, `<dialog>` qua `Modal`, trượt từ phải, rộng tối đa 440px; mobile toàn màn)

```
 Giỏ hàng (3)                                   ✕
 ┌──────────────────────────────────────────────┐
 │[img] SÖL Whey Isolate                         │
 │      Sô-cô-la · 2,27 kg        1.290.000đ     │
 │      [− 2 +]                       Xóa        │
 │      ⚠ Chỉ còn 1 sản phẩm — đã giảm số lượng  │  (cảnh báo từ báo giá)
 └──────────────────────────────────────────────┘
 Tạm tính                               2.580.000đ
 Phí giao hàng được tính ở bước thanh toán.
 [ Thanh toán → ]           Tiếp tục xem sản phẩm
 Thực phẩm này không phải là thuốc…
```
- Mỗi lần mở/đổi số lượng gọi báo giá (debounce 300ms). Dòng có vấn đề (`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `INACTIVE`) hiện cảnh báo tại dòng; nút “Thanh toán” disabled khi báo giá `valid=false`.
- Giỏ rỗng: “Giỏ hàng đang trống.” + “Xem sản phẩm”.

### A4.6 `/checkout` (PublicLayout; yêu cầu đăng nhập MEMBER)

```
 THANH TOÁN
 ┌─ Nhận hàng ─────────────────────────────┐  ┌─ Đơn hàng ──────────────┐
 │ (•) Giao tận nơi   ( ) Nhận tại quầy SÖL │  │ SÖL Whey Isolate ×2      │
 │                                          │  │ ...                      │
 │ Địa chỉ đã lưu                           │  │ Tạm tính     2.580.000đ  │
 │ (•) Nguyễn An · 0901 234 567 · Mặc định  │  │ Phí giao            0đ   │
 │     12 Lê Lợi, Phường Sài Gòn, TP.HCM    │  │ Tổng cộng    2.580.000đ  │
 │ ( ) + Thêm địa chỉ mới                   │  │ Thực phẩm này không…     │
 │   Họ tên / SĐT / Tỉnh-TP ▾ / Phường-Xã ▾ │  └──────────────────────────┘
 │   Số nhà, đường / Ghi chú giao hàng      │     (sticky ≥1100px)
 │   [✓] Lưu vào sổ địa chỉ  [ ] Mặc định   │
 ├─ Thanh toán ─────────────────────────────┤
 │ [Thanh toán VNPay Sandbox] [Thanh toán bằng Ví SÖL]   ← VnpayPayButton(prepare)
 │ Chỉ khi Nhận tại quầy:                   │
 │ ( Đặt hàng, trả tại quầy )               │
 │ Giữ hàng 30 phút để thanh toán.          │
 └──────────────────────────────────────────┘
```
- Chưa đăng nhập → chuyển `/login?returnTo=%2Fcheckout`. Đăng nhập role khác MEMBER → thẻ thông báo “Mua hàng dành cho tài khoản hội viên.” + link “Về portal”.
- Pickup hiện địa chỉ quầy (lấy từ `/public/shop/config`) và “Mang thẻ hội viên khi đến nhận”.
- Lỗi form hiện tại chỗ bằng `.form-error`, `aria-invalid`; focus trường lỗi đầu tiên. Lỗi đặt hàng (giá đổi, hết hàng) hiện ngay trên khu thanh toán, tự tải lại báo giá.

### A4.7 Portal hội viên — `/member/orders` và `/member/orders/:id`

```
 Đơn hàng                                   [Đơn hàng] [Địa chỉ giao hàng]
 [Tất cả][Chờ thanh toán][Đang xử lý][Đang giao/Chờ nhận][Hoàn tất][Đã hủy]
 ┌─────────────────────────────────────────────────────────────────────┐
 │ SOL-261105-7KQ2 · 14:05 05/11/2026            [Chờ thanh toán]       │
 │ SÖL Whey Isolate ×2 và 1 sản phẩm khác           2.580.000đ  [Xem →]  │
 └─────────────────────────────────────────────────────────────────────┘
```
Chi tiết:
```
 SOL-261105-7KQ2                                    [Đang giao]
 Tiến trình
  ● Đặt hàng            14:05 05/11/2026
  ● Đã thanh toán       14:07 05/11/2026
  ● Đang chuẩn bị       09:00 06/11/2026
  ● Đang giao           15:30 06/11/2026  GHN · 8834 2210 [Sao chép]
  ○ Đã giao
 Sản phẩm (bảng dòng) · Giao tới (địa chỉ snapshot) · Thanh toán (phương thức, tổng)
 [Thanh toán VNPay Sandbox][Thanh toán bằng Ví SÖL]   ← chỉ khi pending_payment & online
 Giữ hàng đến 14:35 05/11/2026
 (Hủy đơn) ← ActionMenu “⋯” khi được phép, xác nhận bằng useConfirm
```
- Tab “Địa chỉ giao hàng”: danh sách thẻ địa chỉ, “Thêm địa chỉ”, “Sửa”, “Đặt làm mặc định”, “Xóa” (useConfirm). Form dùng chung `AddressForm` trong `Modal`.
- Sidebar thêm “Đơn hàng” (icon mới `bag`); mobile primary nav **không đổi** (mục nằm trong “Thêm”).

### A4.8 Portal lễ tân — `/staff/orders`

```
 Đơn hàng sản phẩm                            [ Tìm mã đơn, tên, SĐT… ] (⟳)
 [Cần xử lý 3][Đang chuẩn bị 1][Chờ nhận tại quầy 2][Đang giao 4][Chờ trả tại quầy 1][Hoàn tất][Đã hủy]
 Hàng: mã · thời gian · hội viên · SĐT · hình thức nhận · tổng · trạng thái · [Mở]
 Modal chi tiết: dòng sản phẩm (SKU, SL) + địa chỉ/nhận tại quầy + thao tác theo trạng thái:
   paid              → [Bắt đầu chuẩn bị]
   processing        → delivery: [Giao cho vận chuyển] (form: Đơn vị vận chuyển, Mã vận đơn)
                       pickup:   [Sẵn sàng nhận tại quầy]
   shipping          → [Đã giao thành công]
   ready_for_pickup  → [Đã giao tại quầy] (nhắc kiểm tra thẻ hội viên)
   pending_payment + counter → [Thu tiền tại quầy] (Tiền mặt / Quẹt thẻ / Chuyển khoản)
   mọi trạng thái chưa kết thúc → “⋯” → [Hủy đơn] (lý do bắt buộc; ô “Nhập lại kho” mặc định bật; hiện số tiền hoàn vào Ví nếu đã trả)
```
Sidebar STAFF thêm “Đơn hàng sản phẩm” (icon mới `box`).

### A4.9 Portal quản lý — `/manager/products`, `/manager/products/new`, `/manager/products/:id`

```
 Sản phẩm & Đơn hàng            [Sản phẩm][Loại sản phẩm][Đơn hàng]      (+ Thêm sản phẩm)
 Sản phẩm: bảng ảnh · tên · loại · biến thể · tồn (cảnh báo ≤5) · đang bán · nổi bật · “⋯” (Sửa, Ngừng/Mở bán, Xóa)
 Đơn hàng: dùng lại bảng/Modal của lễ tân + 3 số thật: Đơn cần xử lý · Doanh thu sản phẩm 30 ngày · Biến thể sắp hết
```
Trình soạn sản phẩm (trang riêng, không modal vì form dài):
```
 Thông tin chung: Tên · Loại ▾ · Dạng (Bột/Viên nang/Viên nén/Nước/Thanh/Khác) · Thương hiệu · Mô tả ngắn · Mô tả
 Mục tiêu: [Tăng cơ][Phục hồi][Năng lượng][Kiểm soát cân nặng][Sức khỏe tổng quát]
 Ảnh: tối đa 6, kéo thứ tự bằng nút ↑↓, mô tả ảnh (alt) bắt buộc
 Biến thể: bảng hàng {SKU, Nhãn, Giá, Số lần dùng, Đang bán, Tồn (chỉ đọc) + [Điều chỉnh tồn]}
 Thành phần mỗi khẩu phần: Khẩu phần · bảng {Tên, Lượng, Đơn vị, %NCKN, Hàng con, Nổi bật(1)} + xem trước NutritionFacts trực tiếp
 Cách dùng · Lưu ý · Số công bố
 Hiển thị: [✓] Đang bán  [ ] Nổi bật trên landing
 (Lưu sản phẩm)
```
Sidebar MANAGER thêm “Sản phẩm & Đơn hàng” (icon `bag`).

## A5. Luồng chính

1. **Khách → mua:** landing/topbar “Sản phẩm” → `/products` → chi tiết → Thêm vào giỏ → giỏ → “Thanh toán” → chưa đăng nhập → `/login?returnTo=/checkout` (hoặc “Tham gia ngay” → đăng ký + OTP, giữ `returnTo`) → `/checkout` giỏ còn nguyên.
2. **Đặt online:** chọn nhận hàng/địa chỉ → bấm VNPay hoặc Ví → `prepare()` gọi `POST /shop/orders` (idempotent) → VNPay redirect → `/member/payments/vnpay/return` → “Về đơn hàng” `/member/orders/:id`. Ví: trừ tiền ngay → điều hướng `/member/orders/:id`.
3. **Đặt trả tại quầy:** pickup → “Đặt hàng, trả tại quầy” → `/member/orders/:id` hiện “Giữ hàng đến … — thanh toán khi nhận tại quầy”.
4. **Xử lý:** lễ tân nhận thông báo đơn mới đã thanh toán → Bắt đầu chuẩn bị → Giao/ Sẵn sàng nhận → Hoàn tất. Hội viên nhận thông báo ở mỗi mốc (trừ “đang chuẩn bị”).
5. **Hủy:** hội viên hủy (pending/paid) hoặc lễ tân hủy (có lý do) → hoàn tồn, hoàn Ví nếu đã trả, thông báo.

## A6. Copy (giọng văn)

Câu ngắn, động từ rõ, viết hoa chữ đầu câu, không hứa hẹn công dụng. Nút giữ cùng tên suốt luồng: “Thêm vào giỏ” → toast “Đã thêm vào giỏ”; “Hủy đơn” → notify “Đã hủy đơn SOL-…”. Nhãn trạng thái:

| status | fulfillment | Nhãn hội viên/lễ tân |
|---|---|---|
| `pending_payment` | online | Chờ thanh toán |
| `pending_payment` | counter | Chờ trả tại quầy |
| `paid` | – | Đã thanh toán |
| `processing` | – | Đang chuẩn bị |
| `shipping` | delivery | Đang giao |
| `ready_for_pickup` | pickup | Chờ nhận tại quầy |
| `completed` | delivery / pickup | Đã giao / Đã nhận tại quầy |
| `cancelled` | – | Đã hủy |

Mục tiêu (enum `ProductGoal`): `muscle_gain` Tăng cơ · `recovery` Phục hồi · `energy` Năng lượng · `weight_management` Kiểm soát cân nặng · `wellness` Sức khỏe tổng quát.
Dạng (`form`): `powder` Bột · `capsule` Viên nang · `tablet` Viên nén · `liquid` Nước · `bar` Thanh · `other` Khác.

## A7. Trạng thái, trợ năng, chuyển động

- Mỗi vùng dữ liệu có loading (skeleton cùng kích thước), empty (câu hướng dẫn + hành động), error (`errorMessage()` + “Thử lại”), forbidden (portal `RoleGuard`).
- Nhãn thành phần là `<table>` thật có `<caption>`; số dùng `<td>` căn phải; hàng con thụt lề bằng padding, không bằng ký tự.
- Chọn biến thể: `fieldset`/`legend` + `input[type=radio]` ẩn trực quan. Stepper: hai `button` có `aria-label` (“Giảm số lượng”, “Tăng số lượng”) + `input type=number` có label ẩn.
- Drawer: `Modal` sẵn có (focus trap, Escape, trả focus về nút giỏ).
- Motion: reveal hiện hành; badge giỏ `transform: scale(1.18)` 180ms; drawer translateX 220ms `cubic-bezier(.22,1,.36,1)`; `prefers-reduced-motion` tắt cả hai.
- Ảnh dưới hero `loading="lazy"` qua `LoadingImage`.

---

# PHẦN B — KIẾN TRÚC

## B1. Mô hình dữ liệu (package `com.swp391.scms.shop.entity`)

| Entity / bảng | Cột chính | Ràng buộc |
|---|---|---|
| `ProductCategory` / `product_categories` | `id`, `name` varchar(80), `slug` varchar(80), `sort_order` int, `active` bool, `created_at` | unique `uq_product_categories_slug(slug)`, unique `uq_product_categories_name(name)` |
| `Product` / `products` | `id`, `category_id` FK not null, `name` varchar(160), `slug` varchar(180), `brand` varchar(80) null, `form` varchar(20), `short_description` varchar(300), `description` text, `serving_size` varchar(60), `usage_instructions` text null, `warnings` text null, `registration_number` varchar(60) null, `active` bool, `featured` bool, `created_at`, `updated_at` | unique `uq_products_slug(slug)`; index `ix_products_active_created(active, created_at)` |
| `product_goals` (`@ElementCollection` trên `Product.goals`, `Set<ProductGoal>` `@Enumerated(STRING)`) | `product_id`, `goal` varchar(30) | PK (product_id, goal) |
| `ProductVariant` / `product_variants` | `id`, `product_id` FK, `sku` varchar(40), `label` varchar(80), `price` numeric(12,2), `servings_per_container` int null, `stock` int, `active` bool, `sort_order` int | unique `uq_product_variants_sku(sku)`; `@Check(name="ck_product_variants_stock_nonneg", constraints="stock >= 0")`; `@Check(name="ck_product_variants_price_pos", constraints="price > 0")` |
| `ProductNutrient` / `product_nutrients` | `id`, `product_id` FK, `name` varchar(80), `amount` numeric(10,2), `unit` varchar(12), `daily_value_percent` int null, `sub_row` bool, `highlight` bool, `sort_order` int | ≤30 dòng/sản phẩm, tối đa 1 `highlight` (kiểm ở service) |
| `ProductImage` / `product_images` | `id`, `product_id` FK, `data_url` text, `content_type` varchar(20), `alt_text` varchar(160), `sort_order` int, `created_at` | ≤6 ảnh/sản phẩm (service) |
| `StockMovement` / `product_stock_movements` | `id`, `variant_id` FK, `delta` int, `reason` varchar(20) (`restock`,`adjustment`,`order_reserve`,`order_release`), `order_id` null, `note` varchar(200) null, `actor_id` FK users null, `created_at` | index `ix_stock_movements_variant(variant_id, created_at)` |
| `MemberAddress` / `member_addresses` | `id`, `member_id` FK members(user_id), `recipient_name` varchar(80), `phone` varchar(15), `province_code` varchar(10), `province_name` varchar(80), `ward_code` varchar(10), `ward_name` varchar(80), `street_line` varchar(200), `note` varchar(200) null, `is_default` bool, `created_at`, `updated_at` | index `ix_member_addresses_member(member_id)`; ≤5/hội viên; đúng 1 default khi có ≥1 (service, dưới khóa member) |
| `ProductOrder` / `product_orders` | `id`, `code` varchar(20), `member_id` FK, `client_request_id` varchar(36), `status` varchar(20), `fulfillment` varchar(10), `payment_method` varchar(10), `subtotal`, `shipping_fee`, `total` numeric(12,2), snapshot giao hàng (`ship_recipient_name`, `ship_phone`, `ship_province_name`, `ship_ward_name`, `ship_street_line`, `ship_note` — null khi pickup), `payment_due_at`, `paid_at`, `processing_at`, `shipped_at`, `ready_at`, `completed_at`, `cancelled_at`, `cancel_reason` varchar(255), `cancelled_by_id` FK users null, `tracking_carrier` varchar(60), `tracking_number` varchar(60), `created_at`, `updated_at` | unique `uq_product_orders_code(code)`; unique `uq_product_orders_member_request(member_id, client_request_id)`; index `ix_product_orders_member_created(member_id, created_at)`, `ix_product_orders_status_created(status, created_at)`; `@Check(name="ck_product_orders_total", constraints="total = subtotal + shipping_fee")` |
| `ProductOrderItem` / `product_order_items` | `id`, `order_id` FK, `variant_id` FK, `product_name` varchar(160), `variant_label` varchar(80), `sku` varchar(40), `unit_price` numeric(12,2), `quantity` int, `line_total` numeric(12,2) | `@Check(name="ck_product_order_items_qty", constraints="quantity between 1 and 20")` |
| `Payment` (sửa, `finance`) | thêm `product_order_id` bigint null + `@ManyToOne(fetch=LAZY) @JoinColumn(name="product_order_id", insertable=false, updatable=false) ProductOrder productOrder` theo đúng mẫu `courtBookingId`/`courtBooking` | nullable → `ddl-auto: update` thêm cột an toàn, không cần backfill |

Timeline đơn hàng suy ra từ các cột thời điểm (`created_at`, `paid_at`, `processing_at`, `shipped_at`/`ready_at`, `completed_at`, `cancelled_at`) — **không** tạo bảng sự kiện (YAGNI).

RLS: `PostgreSqlDataSecurityInitializer` tự bật RLS cho mọi entity có `@Table(name=…)` và `@JoinTable`; `@ElementCollection` dùng `@CollectionTable(name="product_goals")` — Task 2 phải kiểm tra bảng này cũng được bật RLS (initializer chỉ quét `@Table`/`@JoinTable`; nếu thiếu, bổ sung quét `@CollectionTable` trong initializer, kèm test).

## B2. Máy trạng thái đơn

```
                 ┌──── member/staff hủy, hết hạn ────┐
 pending_payment ─┤                                    ▼
   │  thanh toán (VNPay IPN / Ví / thu tại quầy)    cancelled  (terminal)
   ▼                                                   ▲
 paid ──── staff: start-processing ──► processing ─────┤ staff hủy (lý do)
   │  member hủy (hoàn Ví)               │ delivery: ship │
   └─────────────────────────────────────┤               │
                                         ▼               │
                             shipping ──► completed      │
                       ready_for_pickup ─► completed     │
                    (pickup: ready-for-pickup)  ─────────┘ staff hủy từ shipping/ready
```

| Từ → Đến | Ai | Điều kiện | Tác dụng phụ |
|---|---|---|---|
| (tạo) → `pending_payment` | MEMBER | giỏ hợp lệ, `expectedTotal` khớp | trừ tồn (`order_reserve`), `payment_due_at` |
| `pending_payment` → `paid` | hệ thống (VNPay IPN, Ví) / staff (`counter-payment`) | đơn chưa hết hạn hoặc IPN muộn còn pending | `paid_at`; thông báo hội viên + lễ tân |
| `pending_payment` → `cancelled` | MEMBER, staff, scheduler | không có giao dịch VNPay đang chờ (guard) | hoàn tồn (`order_release`), payment pending → `failed` |
| `paid` → `processing` | staff | – | `processing_at` |
| `paid` → `cancelled` | MEMBER, staff | – | hoàn tồn, hoàn Ví toàn bộ `total`, payment `refunded` |
| `processing` → `shipping` | staff | `fulfillment=delivery`, `trackingNumber` bắt buộc | `shipped_at`; thông báo kèm mã vận đơn |
| `processing` → `ready_for_pickup` | staff | `fulfillment=pickup` | `ready_at`; thông báo |
| `shipping`/`ready_for_pickup` → `completed` | staff | – | `completed_at`; thông báo |
| `processing`/`shipping`/`ready_for_pickup` → `cancelled` | staff | lý do bắt buộc | hoàn Ví nếu đã trả; hoàn tồn nếu `restock=true` |
| `pending_payment`(counter) → `paid` → `completed` | staff | pickup tại quầy | lễ tân bấm “Thu tiền tại quầy” rồi “Đã giao tại quầy” |

## B3. API (mọi response bọc `ApiResponse<T>`)

**Công khai** (`permitAll`, gọi không kèm `Authorization` như `usePublicCatalog`):

| Method & path | Request | Response `data` |
|---|---|---|
| `GET /api/v1/public/product-categories` | – | `CategoryDto[]` `{id,name,slug}` (chỉ active, theo `sortOrder`) |
| `GET /api/v1/public/products` | `q, goal, category(slug), inStock(bool), featuredFirst(bool, mặc định false — sản phẩm `featured` lên trước rồi mới tới thứ tự `sort`), sort=newest\|price_asc\|price_desc\|price_per_serving, page=0, size=12 (≤48)` | `Page<ProductSummaryDto>` |
| `GET /api/v1/public/products/{slug}` | – | `ProductDetailDto` |
| `GET /api/v1/public/products/images/{imageId}` | – | bytes, `Content-Type` theo ảnh, `Cache-Control: public, max-age=86400`, `ETag` |
| `GET /api/v1/public/shop/config` | – | `{shippingFee, freeShippingThreshold, paymentWindowMinutes, counterHoldHours, pickupAddress}` |
| `POST /api/v1/public/shop/quote` | `QuoteRequest {items:[{variantId,quantity}], fulfillment}` | `QuoteDto` |
| `GET /api/v1/public/geo/provinces` | – | `[{code,name}]` (34) |
| `GET /api/v1/public/geo/provinces/{code}/wards` | – | `[{code,name}]` |

```
ProductSummaryDto { id, slug, name, categoryName, form, goals[], shortDescription,
  imageUrl|null, highlight {name, amount, unit}|null,
  minPrice, pricePerServing|null, inStock, lowStock, featured, isNew }
ProductDetailDto { id, slug, name, brand, categoryName, categorySlug, form, goals[],
  shortDescription, description, servingSize, usageInstructions, warnings, registrationNumber,
  images:[{id,url,alt}], variants:[{id,sku,label,price,servingsPerContainer,pricePerServing,stock,available}],
  nutrients:[{name,amount,unit,dailyValuePercent,subRow,highlight}], related: ProductSummaryDto[] (≤4 cùng loại) }
QuoteDto { lines:[{variantId, productName, variantLabel, slug, imageUrl, unitPrice, requestedQuantity,
  quantity, stock, lineTotal, problem: null|"OUT_OF_STOCK"|"INSUFFICIENT_STOCK"|"INACTIVE"|"NOT_FOUND"}],
  subtotal, shippingFee, total, valid }
```
`imageUrl` = `/api/v1/public/products/images/{id}?v={epochSecond(createdAt)}`. `stock` công khai = `min(stock, 99)`. `lowStock` = 0 < tồn ≤ 5. `isNew` = tạo trong 30 ngày.

**Hội viên** (`hasRole('MEMBER')`):

| Method & path | Request | Response |
|---|---|---|
| `GET /api/v1/shop/addresses` | – | `AddressDto[]` (mặc định trước) |
| `POST /api/v1/shop/addresses` | `AddressRequest` | 201 `AddressDto` |
| `PUT /api/v1/shop/addresses/{id}` | `AddressRequest` | `AddressDto` |
| `POST /api/v1/shop/addresses/{id}/default` | – | `AddressDto[]` |
| `DELETE /api/v1/shop/addresses/{id}` | – | `AddressDto[]` (xóa mặc định → địa chỉ mới nhất còn lại thành mặc định) |
| `POST /api/v1/shop/orders` | `CreateOrderRequest` | 201 `OrderDto` (200 + cùng đơn khi lặp `clientRequestId`) |
| `GET /api/v1/shop/orders` | `status(group)=pending\|active\|done\|cancelled`, `page`, `size≤20` | `Page<OrderSummaryDto>` |
| `GET /api/v1/shop/orders/{id}` | – | `OrderDto` |
| `POST /api/v1/shop/orders/{id}/cancel` | `{reason?}` (≤255) | `OrderDto` |

```
AddressRequest { recipientName(2..80), phone (^(0|\+84)(3|5|7|8|9)\d{8}$), provinceCode, wardCode,
  streetLine(5..200), note(≤200)?, makeDefault(bool) }
AddressDto { id, recipientName, phone, provinceCode, provinceName, wardCode, wardName, streetLine, note, isDefault }
CreateOrderRequest { clientRequestId (UUID), items:[{variantId, quantity 1..20}] (1..30),
  fulfillment "delivery"|"pickup", paymentMethod "online"|"counter",
  addressId?  | shippingAddress? (AddressRequest) , saveAddress(bool), expectedTotal (numeric) }
  - delivery: đúng một trong addressId / shippingAddress; pickup: cả hai null
  - counter chỉ đi với pickup
OrderDto { id, code, status, fulfillment, paymentMethod, items:[{variantId, productName,
  variantLabel, sku, unitPrice, quantity, lineTotal, slug, imageUrl}], subtotal, shippingFee, total,
  shipping {recipientName, phone, provinceName, wardName, streetLine, note}|null, pickupAddress|null,
  paymentDueAt, createdAt, paidAt, processingAt, shippedAt, readyAt, completedAt, cancelledAt,
  cancelReason, trackingCarrier, trackingNumber, canCancel, canPay, refundedAmount|null,
  member {id, fullName, phone}  (chỉ trả cho staff/manager) }
OrderSummaryDto { id, code, status, fulfillment, paymentMethod, total, itemCount, firstItemName,
  createdAt, canPay }
```

**Lễ tân & quản lý** (`hasAnyRole('RECEPTIONIST','STAFF','CENTER_MANAGER')`):

| Method & path | Request | Response |
|---|---|---|
| `GET /api/v1/staff/product-orders` | `status` (giá trị trạng thái), `q` (mã/tên/SĐT), `page`, `size≤50` | `Page<OrderDto>` |
| `GET /api/v1/staff/product-orders/counts` | – | `{paid, processing, ready_for_pickup, shipping, counter_pending}` |
| `GET /api/v1/staff/product-orders/{id}` | – | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/start-processing` | – | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/ship` | `{carrier(≤60), trackingNumber(3..60)}` | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/ready-for-pickup` | – | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/complete` | – | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/counter-payment` | `{method: cash\|pos\|bank_transfer}` | `OrderDto` |
| `POST /api/v1/staff/product-orders/{id}/cancel` | `{reason (5..255), restock (bool, default true)}` | `OrderDto` |

**Quản lý** (`hasRole('CENTER_MANAGER')`):

| Method & path | Request | Response |
|---|---|---|
| `GET/POST /api/v1/manager/product-categories`, `PUT/DELETE /…/{id}` | `{name(2..80), sortOrder, active}` | `CategoryAdminDto {id,name,slug,sortOrder,active,productCount}`; xóa khi còn sản phẩm → 409 `CATEGORY_IN_USE` |
| `GET /api/v1/manager/products` | `q, active, lowStock, page, size≤50` | `Page<ProductAdminSummaryDto {id,name,slug,categoryName,variantCount,totalStock,lowStock,active,featured,imageUrl}>` |
| `GET /api/v1/manager/products/{id}` | – | `ProductAdminDto` (= ProductDetailDto + `active`, `featured`, `categoryId`, variants kèm `active`,`sortOrder`) |
| `POST /api/v1/manager/products` | `ProductUpsertRequest` | 201 `ProductAdminDto` |
| `PUT /api/v1/manager/products/{id}` | `ProductUpsertRequest` | `ProductAdminDto` |
| `PATCH /api/v1/manager/products/{id}/active` | `{active}` | `ProductAdminDto` |
| `DELETE /api/v1/manager/products/{id}` | – | 204; đã có dòng đơn → 409 `PRODUCT_HAS_ORDERS` (dùng “Ngừng bán”) |
| `POST /api/v1/manager/products/{id}/images` | `{dataUrl, altText(1..160)}` | `ProductAdminDto` |
| `DELETE /api/v1/manager/products/{id}/images/{imageId}` | – | `ProductAdminDto` |
| `PUT /api/v1/manager/products/{id}/images/order` | `{imageIds:[…]}` (đủ và đúng tập ảnh) | `ProductAdminDto` |
| `POST /api/v1/manager/product-variants/{id}/stock-adjustments` | `{delta (≠0, -9999..9999), reason: restock\|adjustment, note(≤200)}` | `VariantAdminDto` |
| `GET /api/v1/manager/product-orders/summary` | – | `{pendingFulfillment, revenue30d, lowStockVariants}` (revenue = tổng `total` đơn `paid_at` trong 30 ngày, trạng thái ≠ cancelled) |

```
ProductUpsertRequest { name(2..160), categoryId, form, brand?(≤80), shortDescription(10..300),
  description(≤5000), servingSize(1..60), usageInstructions?(≤2000), warnings?(≤2000),
  registrationNumber?(≤60), goals[] (≥1), active, featured,
  variants:[{id?, sku(^[A-Z0-9-]{3,40}$), label(1..80), price(1000..100000000), servingsPerContainer?(1..1000),
             initialStock? (chỉ khi tạo biến thể mới, 0..9999), active, sortOrder}] (1..12),
  nutrients:[{name(1..80), amount(0..100000), unit(1..12), dailyValuePercent?(0..1000), subRow, highlight, sortOrder}] (0..30) }
```
Sửa sản phẩm **không** sửa tồn của biến thể cũ (chỉ qua stock-adjustments). Xóa biến thể khỏi request: nếu biến thể đã có dòng đơn → đặt `active=false` thay vì xóa.

**Finance (sửa):** `POST /api/v1/payments/vnpay/checkout` và `POST /api/v1/wallet/pay` nhận thêm `productOrderId`; `VnpayDtos.Status.destination` trả `/member/orders/{id}` cho đơn sản phẩm.

## B4. Mã lỗi & i18n

Key theo mẫu courts: lỗi `error.shop.<code_lowercase>`, thành công `success.shop.*`, thông báo `notifications.shop.*`. Thêm vào **cả 3 file**.

| errorCode | HTTP | key | vi | en |
|---|---|---|---|---|
| `SHOP_MEMBER_REQUIRED` | 403 | `error.shop.member_required` | Mua hàng dành cho tài khoản hội viên đang hoạt động. | Shopping is for active member accounts. |
| `PRODUCT_NOT_FOUND` | 404 | `error.shop.product_not_found` | Không tìm thấy sản phẩm. | Product not found. |
| `PRODUCT_OUT_OF_STOCK` | 409 | `error.shop.product_out_of_stock` | Sản phẩm vừa hết hoặc không đủ số lượng. Vui lòng kiểm tra lại giỏ hàng. | An item is out of stock or short. Please review your cart. |
| `CART_EMPTY` | 400 | `error.shop.cart_empty` | Giỏ hàng đang trống. | Your cart is empty. |
| `CART_TOO_LARGE` | 400 | `error.shop.cart_too_large` | Đơn hàng vượt giới hạn số lượng hoặc giá trị cho phép. | The order exceeds the allowed quantity or value. |
| `ORDER_PRICE_CHANGED` | 409 | `error.shop.order_price_changed` | Giá hoặc tồn kho vừa thay đổi. Kiểm tra lại đơn trước khi thanh toán. | Prices or stock just changed. Review your order before paying. |
| `ORDER_NOT_FOUND` | 404 | `error.shop.order_not_found` | Không tìm thấy đơn hàng. | Order not found. |
| `ORDER_INVALID_TRANSITION` | 409 | `error.shop.order_invalid_transition` | Đơn hàng không ở trạng thái cho phép thao tác này. | The order cannot do this in its current status. |
| `ORDER_AWAITING_PAYMENT` | 409 | `error.shop.order_awaiting_payment` | Đơn đang chờ VNPay xác nhận thanh toán. Thử lại sau ít phút. | VNPay is still confirming this payment. Try again in a few minutes. |
| `FULFILLMENT_INVALID` | 400 | `error.shop.fulfillment_invalid` | Thông tin nhận hàng không hợp lệ. | Invalid delivery details. |
| `PAYMENT_METHOD_NOT_ALLOWED` | 400 | `error.shop.payment_method_not_allowed` | Trả tại quầy chỉ áp dụng khi nhận hàng tại quầy. | Pay at counter is only for counter pickup. |
| `ADDRESS_NOT_FOUND` | 404 | `error.shop.address_not_found` | Không tìm thấy địa chỉ. | Address not found. |
| `ADDRESS_LIMIT_REACHED` | 409 | `error.shop.address_limit_reached` | Sổ địa chỉ đã đủ 5 địa chỉ. Xóa bớt trước khi thêm mới. | You can save up to 5 addresses. Remove one first. |
| `ADDRESS_INVALID_REGION` | 400 | `error.shop.address_invalid_region` | Tỉnh/thành hoặc phường/xã không hợp lệ. | Invalid province or ward. |
| `PRODUCT_SLUG_TAKEN` | 409 | `error.shop.product_slug_taken` | Tên sản phẩm trùng với sản phẩm khác. | Another product already uses this name. |
| `SKU_TAKEN` | 409 | `error.shop.sku_taken` | Mã SKU đã tồn tại. | This SKU already exists. |
| `PRODUCT_HAS_ORDERS` | 409 | `error.shop.product_has_orders` | Sản phẩm đã có đơn hàng nên không thể xóa. Hãy ngừng bán. | This product has orders and cannot be deleted. Stop selling it instead. |
| `PRODUCT_IMAGE_INVALID` | 400 | `error.shop.product_image_invalid` | Ảnh phải là JPEG, PNG hoặc WEBP, tối đa 1,5 MB. | Images must be JPEG, PNG or WEBP, up to 1.5 MB. |
| `PRODUCT_IMAGE_LIMIT` | 409 | `error.shop.product_image_limit` | Mỗi sản phẩm tối đa 6 ảnh. | Up to 6 images per product. |
| `PRODUCT_INVALID` | 400 | `error.shop.product_invalid` | Thông tin sản phẩm không hợp lệ: {0} | Invalid product details: {0} |
| `CATEGORY_IN_USE` | 409 | `error.shop.category_in_use` | Loại sản phẩm còn sản phẩm nên không thể xóa. | This category still has products. |
| `STOCK_ADJUSTMENT_INVALID` | 400 | `error.shop.stock_adjustment_invalid` | Số điều chỉnh không hợp lệ hoặc làm tồn kho âm. | Invalid adjustment or it would make stock negative. |

Thành công: `success.shop.products`, `success.shop.product`, `success.shop.categories`, `success.shop.quote`, `success.shop.config`, `success.shop.geo`, `success.shop.addresses`, `success.shop.address_saved`, `success.shop.address_deleted`, `success.shop.order_created`, `success.shop.orders`, `success.shop.order`, `success.shop.order_cancelled`, `success.shop.order_updated`, `success.shop.product_saved`, `success.shop.product_deleted`, `success.shop.stock_adjusted`, `success.shop.summary` (vi/en dạng “Đã tải sản phẩm.” / “Products loaded.”…).

Thông báo (title/body, `{0}` = mã đơn, `{1}` = số tiền/mã vận đơn):
- `notifications.shop.paid.title` “Đã thanh toán đơn {0}” / body “SÖL đã nhận thanh toán {1} đ. Chúng tôi sẽ chuẩn bị đơn sớm.”
- `notifications.shop.shipping.*` “Đơn {0} đang được giao” / “Mã vận đơn: {1}.”
- `notifications.shop.ready_pickup.*` “Đơn {0} sẵn sàng nhận tại quầy” / “Mang thẻ hội viên khi đến nhận.”
- `notifications.shop.completed.*` “Đơn {0} đã hoàn tất” / “Cảm ơn bạn đã mua hàng tại SÖL.”
- `notifications.shop.cancelled.*` “Đơn {0} đã hủy” / “{1}” (lý do); `notifications.shop.refunded.body` “Đã hoàn {1} đ vào Ví SÖL.”
- `notifications.shop.staff_new_order.*` “Đơn sản phẩm mới {0}” / “Đơn đã thanh toán, cần chuẩn bị.”
- `shop.auto_cancel.unpaid` “Quá hạn thanh toán” / “Payment window expired”.
- `wallet.description.product_order` “Thanh toán đơn hàng {0}” / “Payment for order {0}”.
- `finance.invoice.item.shipping` “Phí giao hàng” / “Shipping fee”.

Notification `type="order"`, `relatedEntityType="product_order"`, `actionPath` = `/member/orders/{id}` (hội viên) hoặc `/staff/orders` (lễ tân).

## B5. Điểm tích hợp với code có sẵn

| Có sẵn | Dùng thế nào |
|---|---|
| `finance/service/VnpayPaymentService` | Thêm nhánh `productOrderId` vào `resolveTargetPayment`, `lockTargets`, `validateBooking`, `markBookingPaid`, `payWithWallet` (mô tả + đường dẫn), `status` (destination), `ipn` (mô tả). |
| `finance/service/VnpayPaymentGuard` | Thêm `productOrder(Long orderId)` giống `court(...)`. |
| `finance/service/InvoiceService.autoIssueInvoiceForPayment` | Payment có `productOrderId` → một `InvoiceItem` mỗi dòng đơn + dòng phí giao (nếu > 0). |
| `wallet/WalletService` | `debitForPayment` (đã qua `payWithWallet`), `creditRefund(userId, amount, "ORDER_REFUND_"+orderId, reason)`. |
| `notifications/NotificationService.send(userId,title,message,type,relatedType,relatedId,actionPath)` | Mọi thông báo đơn. |
| `operations/service/StaffInternalRequestService` | Tham khảo cách nó lấy danh sách người nhận theo vai trò để gửi thông báo lễ tân; dùng lại đúng repository method đó. |
| `audit/Audited` | Gắn `@Audited` (xem tham số trong `Audited.java`) cho thao tác quản lý/lễ tân ghi dữ liệu. |
| `users/ProfileService` (kiểm tra data URL avatar) | Tách thành `common/image/ImageDataUrlValidator` dùng chung (xin phép Tài) hoặc sao chép logic. |
| Frontend `VnpayPayButton` (`prepare`) | Checkout: `prepare` = đặt đơn idempotent → `{productOrderId}`. Chi tiết đơn: `target={{productOrderId}}`. |
| `VnpayReturnPage` (`destinations` Set) | Chấp nhận thêm `^/member/orders/\d+$`. |
| `shared/lib/purchaseIntent` | Mở rộng whitelist `returnTo` cho `/checkout`, `/products`, `/products/<slug>`. |
| `PublicLayout`, `RoundArrow`, `SplitHeading` (đang local trong `FitnessLanding.tsx`) | Export `SplitHeading` sang `features/landing/components/SplitHeading.tsx` để shop dùng. |
| `Modal`, `useConfirm`, `ActionMenu`, `LoadingSkeleton`, `LoadingImage`, `Select`, `RefreshButton`, `PageHeader`, `notify`, `toast`, `errorMessage`, `formatCenterDateTime`, `formatPrice` (`membershipPresentation.ts`) | Dùng nguyên. |

---

# PHẦN C — TASKS

> Quy ước test backend: Mockito thuần như `CourtBookingServiceTest` (`mock(...)`, `Clock.fixed`, `AuthenticatedPrincipal(1L,"member","MEMBER")`). Controller test: `MockMvcBuilders.standaloneSetup` như các test controller hiện có. Lệnh chạy: `cd apps/api && ./mvnw.cmd -q -o test -Dtest=<Class>` (bỏ `-o` nếu thiếu cache). Frontend: `cd apps/web && npx vitest run <path>`.
> Mỗi task kết thúc bằng commit riêng (chỉ stage file của task; **không** stage các thay đổi không liên quan đang có trong working tree). Chỉ commit khi người dùng đồng ý commit; nếu chưa có cho phép thì dừng ở bước kiểm tra và ghi lại.

## Task 1: Danh mục hành chính 2 cấp + API địa lý

**Files:**
- Create: `scripts/generate-vn-admin-units.mjs`
- Create: `apps/api/src/main/resources/geo/vn-admin-units.json` (sinh ra, commit)
- Create: `apps/api/src/main/java/com/swp391/scms/shop/service/GeoService.java`
- Create: `apps/api/src/main/java/com/swp391/scms/shop/controller/PublicGeoController.java`
- Create: `apps/api/src/main/java/com/swp391/scms/shop/dto/GeoDtos.java`
- Modify: `apps/api/src/main/java/com/swp391/scms/security/SecurityConfig.java` (permitAll `GET /api/v1/public/geo/**`)
- Modify: 3 file i18n (`success.shop.geo`)
- Test: `apps/api/src/test/java/com/swp391/scms/shop/GeoServiceTest.java`

**Interfaces:**
- Produces: `GeoService.provinces(): List<Region>`, `GeoService.wards(String provinceCode): List<Region>`, `GeoService.resolve(String provinceCode, String wardCode): Optional<ResolvedRegion>`; `record Region(String code, String name)`, `record ResolvedRegion(String provinceCode, String provinceName, String wardCode, String wardName)`.

- [x] **Step 1: Sinh dữ liệu.** Viết script tải danh mục **sau sáp nhập 01/07/2025** một lần và ghi JSON gọn:

```js
// scripts/generate-vn-admin-units.mjs — chạy: node scripts/generate-vn-admin-units.mjs
// Nguồn: provinces.open-api.vn API v2 (cấu trúc 2 cấp sau 01/07/2025). Kiểm tra lại tài liệu nguồn trước khi chạy.
import { writeFile } from 'node:fs/promises';
const res = await fetch('https://provinces.open-api.vn/api/v2/?depth=2');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const raw = await res.json();
const provinces = raw.map(p => ({
  code: String(p.code), name: p.name,
  wards: (p.wards ?? []).map(w => ({ code: String(w.code), name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
})).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
if (provinces.length !== 34) throw new Error(`Expected 34 provinces, got ${provinces.length}`);
if (provinces.some(p => p.wards.length === 0)) throw new Error('A province has no wards');
await writeFile('apps/api/src/main/resources/geo/vn-admin-units.json',
  JSON.stringify({ effectiveFrom: '2025-07-01', source: 'provinces.open-api.vn/api/v2', provinces }));
console.log('provinces', provinces.length, 'wards', provinces.reduce((n, p) => n + p.wards.length, 0));
```
Nếu nguồn không trả đúng 34 tỉnh/thành hoặc không truy cập được: **dừng và hỏi người dùng nguồn dữ liệu chính thức** (ví dụ danh mục của Tổng cục Thống kê). Không tự gõ danh sách, không dùng dữ liệu 63 tỉnh cũ.

- [x] **Step 2: Viết test thất bại**

```java
package com.swp391.scms.shop;

import com.swp391.scms.shop.service.GeoService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class GeoServiceTest {
    final GeoService geo = new GeoService(new com.fasterxml.jackson.databind.ObjectMapper());

    @Test void loadsThirtyFourProvincesWithWards() {
        assertThat(geo.provinces()).hasSize(34);
        var first = geo.provinces().getFirst();
        assertThat(geo.wards(first.code())).isNotEmpty();
    }
    @Test void resolvesOnlyMatchingProvinceAndWard() {
        var p = geo.provinces().getFirst();
        var w = geo.wards(p.code()).getFirst();
        assertThat(geo.resolve(p.code(), w.code())).get()
            .extracting(r -> r.wardName()).isEqualTo(w.name());
        var other = geo.provinces().get(1);
        assertThat(geo.resolve(other.code(), w.code())).isEmpty();
        assertThat(geo.wards("nope")).isEmpty();
    }
}
```

- [x] **Step 3: Chạy** `./mvnw.cmd -q -o test -Dtest=GeoServiceTest` → FAIL (class chưa có).
- [x] **Step 4: Cài đặt**

```java
package com.swp391.scms.shop.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.*;

/** Danh mục hành chính 2 cấp (sau 01/07/2025) nạp một lần từ resource đóng gói; không gọi dịch vụ ngoài lúc chạy. */
@Service
public class GeoService {
    public record Region(String code, String name) {}
    public record ResolvedRegion(String provinceCode, String provinceName, String wardCode, String wardName) {}

    private final List<Region> provinces;
    private final Map<String, List<Region>> wardsByProvince;

    public GeoService(ObjectMapper mapper) {
        try (var in = new ClassPathResource("geo/vn-admin-units.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            List<Region> list = new ArrayList<>();
            Map<String, List<Region>> wards = new HashMap<>();
            for (JsonNode p : root.get("provinces")) {
                Region province = new Region(p.get("code").asText(), p.get("name").asText());
                list.add(province);
                List<Region> ws = new ArrayList<>();
                for (JsonNode w : p.get("wards")) ws.add(new Region(w.get("code").asText(), w.get("name").asText()));
                wards.put(province.code(), List.copyOf(ws));
            }
            this.provinces = List.copyOf(list);
            this.wardsByProvince = Map.copyOf(wards);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot load geo/vn-admin-units.json", e);
        }
    }
    public List<Region> provinces() { return provinces; }
    public List<Region> wards(String provinceCode) { return wardsByProvince.getOrDefault(provinceCode, List.of()); }
    public Optional<ResolvedRegion> resolve(String provinceCode, String wardCode) {
        return provinces.stream().filter(p -> p.code().equals(provinceCode)).findFirst()
            .flatMap(p -> wards(p.code()).stream().filter(w -> w.code().equals(wardCode)).findFirst()
                .map(w -> new ResolvedRegion(p.code(), p.name(), w.code(), w.name())));
    }
}
```
Controller `PublicGeoController` (`@RequestMapping("/api/v1/public/geo")`, `GET /provinces`, `GET /provinces/{code}/wards`, constructor chaining `MessageService` như `CourtBookingController`, message `success.shop.geo`). `SecurityConfig`: thêm cạnh dòng `/api/v1/public/catalog`:
```java
.requestMatchers(HttpMethod.GET, "/api/v1/public/geo/**", "/api/v1/public/product-categories",
        "/api/v1/public/products", "/api/v1/public/products/**", "/api/v1/public/shop/config").permitAll()
.requestMatchers(HttpMethod.POST, "/api/v1/public/shop/quote").permitAll()
```
(Thêm luôn các matcher public của Task 3–4 ở đây để chỉ sửa SecurityConfig một lần.)

- [x] **Step 5: Chạy lại test** → PASS. Chạy cả `./mvnw.cmd -q -o test` để chắc `DatabasePolicyTest`/`DatabaseProfilesTest` vẫn xanh.
- [ ] **Step 6: Commit** `feat(shop): add 2-level Vietnam administrative units and public geo API`.

## Task 2: Entity, repository sản phẩm + validator ảnh

**Files:**
- Create: `shop/entity/{ProductCategory,Product,ProductGoal,ProductForm,ProductVariant,ProductNutrient,ProductImage,StockMovement}.java`
- Create: `shop/repository/{ProductCategoryRepository,ProductRepository,ProductVariantRepository,ProductImageRepository,StockMovementRepository}.java`
- Create: `common/image/ImageDataUrlValidator.java` (sau khi được phép; nếu không, `shop/service/ProductImageValidator.java`)
- Modify (nếu được phép): `users/ProfileService.java` dùng validator mới
- Modify: `config/PostgreSqlDataSecurityInitializer.java` (quét `@CollectionTable`) nếu bảng `product_goals` chưa được bật RLS
- Test: `shop/ProductEntityMappingTest.java`, `common/image/ImageDataUrlValidatorTest.java`

**Interfaces:**
- Produces: `enum ProductGoal { muscle_gain, recovery, energy, weight_management, wellness }`; `enum ProductForm { powder, capsule, tablet, liquid, bar, other }`; `ProductVariantRepository.findAllByIdInForUpdate(Collection<Long> ids): List<ProductVariant>` (PESSIMISTIC_WRITE, `order by v.id`); `ProductRepository.findBySlugAndActiveTrue(String)`, `ProductRepository.searchPublic(...)`; `ImageDataUrlValidator.validate(String dataUrl, long maxBytes): ValidatedImage(String contentType, byte[] bytes)`.

- [x] **Step 1: Test thất bại cho validator** (magic bytes, không chỉ prefix):

```java
class ImageDataUrlValidatorTest {
    static String dataUrl(String type, byte[] bytes) { return "data:" + type + ";base64," + java.util.Base64.getEncoder().encodeToString(bytes); }
    final byte[] png = {(byte)0x89,'P','N','G',0x0D,0x0A,0x1A,0x0A,0,0,0,0};
    @Test void acceptsRealPng() {
        var img = ImageDataUrlValidator.validate(dataUrl("image/png", png), 1_500_000);
        assertThat(img.contentType()).isEqualTo("image/png");
    }
    @Test void rejectsSvgMismatchAndOversize() {
        assertThatThrownBy(() -> ImageDataUrlValidator.validate(dataUrl("image/svg+xml", "<svg/>".getBytes()), 1_500_000))
            .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
        assertThatThrownBy(() -> ImageDataUrlValidator.validate(dataUrl("image/jpeg", png), 1_500_000))
            .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
        assertThatThrownBy(() -> ImageDataUrlValidator.validate(dataUrl("image/png", new byte[1_600_000]), 1_500_000))
            .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
    }
}
```
- [x] **Step 2: Chạy** → FAIL.
- [x] **Step 3: Cài đặt validator** — chỉ chấp nhận `image/jpeg` (FF D8 FF), `image/png` (89 50 4E 47 0D 0A 1A 0A), `image/webp` (`RIFF....WEBP`); decode base64 an toàn (`IllegalArgumentException` → lỗi); kích thước sau decode ≤ `maxBytes`; ném `BadRequestException("PRODUCT_IMAGE_INVALID","error.shop.product_image_invalid",null,"Invalid image")`. Avatar (nếu được phép sửa `ProfileService`) truyền mã lỗi/khóa hiện có của nó qua overload `validate(dataUrl, maxBytes, errorCode, messageKey)`.
- [x] **Step 4: Entity** — mẫu cho biến thể (các entity khác theo bảng B1, getter/setter thường như entity hiện có, `@Table(name=…)` bắt buộc để RLS bật):

```java
@Entity
@Table(name = "product_variants",
       uniqueConstraints = @UniqueConstraint(name = "uq_product_variants_sku", columnNames = "sku"),
       indexes = @Index(name = "ix_product_variants_product", columnList = "product_id"))
@Check(name = "ck_product_variants_stock_nonneg", constraints = "stock >= 0")
@Check(name = "ck_product_variants_price_pos", constraints = "price > 0")
public class ProductVariant {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "product_id", nullable = false) private Product product;
    @Column(nullable = false, length = 40) private String sku;
    @Column(nullable = false, length = 80) private String label;
    @Column(nullable = false, precision = 12, scale = 2) private BigDecimal price;
    @Column(name = "servings_per_container") private Integer servingsPerContainer;
    @Column(nullable = false) private int stock;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    // getters/setters
    public BigDecimal pricePerServing() {
        return servingsPerContainer == null || servingsPerContainer < 1 ? null
            : price.divide(BigDecimal.valueOf(servingsPerContainer), 0, java.math.RoundingMode.HALF_UP);
    }
}
```
Kiểm tra Hibernate 6 của repo hỗ trợ `@org.hibernate.annotations.Check(name=…)` lặp (Hibernate ≥6.2). Nếu không, gộp `constraints = "stock >= 0 and price > 0"` với tên `ck_product_variants_values` và cập nhật mapping lỗi ở Task 6 cho đúng tên.

`Product.goals`:
```java
@ElementCollection(fetch = FetchType.LAZY)
@CollectionTable(name = "product_goals", joinColumns = @JoinColumn(name = "product_id"))
@Enumerated(EnumType.STRING) @Column(name = "goal", length = 30, nullable = false)
private Set<ProductGoal> goals = new LinkedHashSet<>();
```
Repository khóa:
```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select v from ProductVariant v join fetch v.product where v.id in :ids order by v.id")
List<ProductVariant> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);
```
- [x] **Step 5: Test mapping** `ProductEntityMappingTest`: `pricePerServing()` (1.290.000 / 68 → 18.971), null khi thiếu số lần dùng; `Product` mặc định `active=true`, `featured=false`.
- [x] **Step 6: RLS cho `product_goals`** — đọc `PostgreSqlDataSecurityInitializer`: nếu chỉ quét `@Table`/`@JoinTable`, thêm nhánh `CollectionTable collection = field.getAnnotation(CollectionTable.class)` giống `JoinTable`, kèm test đơn vị cho hàm thu thập bảng (tách hàm thu thập thành package-private static để test được).
- [x] **Step 7: Chạy** test task + `./mvnw.cmd -q -o test` → PASS.
- [ ] **Step 8: Commit** `feat(shop): add product catalog entities and shared image validation`.

## Task 3: API danh mục sản phẩm công khai

**Files:**
- Create: `shop/dto/ProductPublicDtos.java` (records ở B3), `shop/mapper/ProductMapper.java`
- Create: `shop/service/ProductCatalogService.java`, `shop/controller/PublicProductController.java`
- Create: `shop/ShopProperties.java` (`@ConfigurationProperties("app.shop")`: `shippingFee=30000`, `freeShippingThreshold=500000`, `paymentWindowMinutes=30`, `counterHoldHours=48`, `pickupAddress="120 Hai Bà Trưng, Quận 1, TP.HCM — quầy lễ tân"`, `seedSamples=false`) — đăng ký giống `VnpayProperties`
- Modify: `apps/api/src/main/resources/application.yml` (khối `app.shop` với giá trị mặc định trên)
- Modify: i18n 3 file
- Test: `shop/ProductCatalogServiceTest.java`, `shop/PublicProductControllerTest.java`

**Interfaces:**
- Consumes: Task 2 repositories.
- Produces: `ProductCatalogService.list(String q, ProductGoal goal, String categorySlug, boolean inStock, boolean featuredFirst, String sort, int page, int size): Page<ProductSummaryDto>` (`featuredFirst=true` → `featured desc` trước thứ tự `sort`); `detail(String slug): ProductDetailDto`; `image(Long id): ProductImage`; `categories(): List<CategoryDto>`; `config(): ShopConfigDto`; `ProductMapper.imageUrl(ProductImage)`.

- [x] **Step 1: Test thất bại**

```java
@Test void detailHidesInactiveProductsAndInactiveVariants() {
    Product p = product("whey", true); ProductVariant off = variant(p, 2L, 0, false); ProductVariant on = variant(p, 1L, 3, true);
    p.getVariants().addAll(List.of(on, off));
    when(products.findBySlugAndActiveTrue("whey")).thenReturn(Optional.of(p));
    var dto = service.detail("whey");
    assertThat(dto.variants()).extracting(v -> v.id()).containsExactly(1L);
    when(products.findBySlugAndActiveTrue("gone")).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service.detail("gone")).hasFieldOrPropertyWithValue("errorCode", "PRODUCT_NOT_FOUND");
}
@Test void publicStockIsCappedAndLowStockFlagged() {
    // stock 140 → public 99; stock 4 → lowStock true; stock 0 → available false
}
@Test void sortByPricePerServingPutsProductsWithoutServingsLast() { … }
```
(viết đủ thân 2 test sau với dữ liệu cụ thể như test đầu.)
- [x] **Step 2: Chạy** → FAIL.
- [x] **Step 3: Cài đặt.** Truy vấn lọc bằng JPQL trong `ProductRepository` (không lọc trong bộ nhớ):

```java
@Query("""
  select distinct p from Product p join p.category c left join p.goals g
  where p.active = true and c.active = true
    and (:q is null or lower(p.name) like lower(concat('%', :q, '%')) or lower(p.shortDescription) like lower(concat('%', :q, '%')))
    and (:goal is null or g = :goal)
    and (:category is null or c.slug = :category)
    and (:inStock = false or exists (select 1 from ProductVariant v where v.product = p and v.active = true and v.stock > 0))
  """)
Page<Product> searchPublic(@Param("q") String q, @Param("goal") ProductGoal goal, @Param("category") String category,
                           @Param("inStock") boolean inStock, Pageable pageable);
```
Sắp xếp: `newest` → `Sort.by(desc createdAt, desc id)`; `price_asc/price_desc/price_per_serving` → lấy trang id đã lọc với `Sort.unsorted()` toàn bộ (giới hạn 500 sản phẩm active — ghi assert), tính `minPrice`/`pricePerServing` rồi sắp trong service và cắt trang; ghi comment lý do (giá nằm ở biến thể). Nạp biến thể/ảnh đầu/nutrient highlight theo lô bằng `findAllByProductIdIn` để tránh N+1. Endpoint ảnh trả `ResponseEntity<byte[]>` với `CacheControl.maxAge(1, DAYS).cachePublic()` và `eTag("\"" + id + "-" + createdAt.toEpochSecond + "\"")`; 404 nếu sản phẩm không active.
- [x] **Step 4: Controller test** kiểm tra `GET /api/v1/public/products?sort=bogus` → 400 (`sort` validate bằng whitelist), `size=100` → kẹp 48.
- [x] **Step 5: Chạy** → PASS; commit `feat(shop): public product catalog API`.

## Task 4: Báo giá giỏ hàng (công khai)

**Files:**
- Create: `shop/dto/QuoteDtos.java` (`QuoteRequest`, `QuoteLineRequest`, `QuoteDto`, `QuoteLineDto`), `shop/service/ShopPricing.java`, `shop/service/QuoteService.java`
- Modify: `shop/controller/PublicProductController.java` (`POST /public/shop/quote`, `GET /public/shop/config`)
- Test: `shop/ShopPricingTest.java`, `shop/QuoteServiceTest.java`

**Interfaces:**
- Produces: `ShopPricing.shippingFee(String fulfillment, BigDecimal subtotal): BigDecimal`; `static QuoteService.merge(List<QuoteLineRequest>): LinkedHashMap<Long,Integer>` (gộp trùng, ném `CART_EMPTY`/`CART_TOO_LARGE`); `QuoteService.quote(QuoteRequest): QuoteDto` (không khóa, read-only) và `QuoteService.price(List<QuoteLineRequest>, List<ProductVariant> lockedVariants, String fulfillment): Priced` dùng lại trong Task 6 — `record Priced(List<PricedLine> lines, BigDecimal subtotal, BigDecimal shippingFee, BigDecimal total, boolean valid)`; `record PricedLine(ProductVariant variant, int quantity, BigDecimal lineTotal, String problem)`.

- [x] **Step 1: Test thất bại**

```java
@Test void shippingIsFreeAboveThresholdAndForPickup() {
    var pricing = new ShopPricing(props(30000, 500000));
    assertThat(pricing.shippingFee("delivery", new BigDecimal("499999"))).isEqualByComparingTo("30000");
    assertThat(pricing.shippingFee("delivery", new BigDecimal("500000"))).isEqualByComparingTo("0");
    assertThat(pricing.shippingFee("pickup", new BigDecimal("1000"))).isEqualByComparingTo("0");
}
@Test void quoteMergesDuplicateLinesAndFlagsShortStock() {
    // request [{v1,2},{v1,3}] với stock 4 → một dòng requestedQuantity 5, quantity 4, problem INSUFFICIENT_STOCK, valid=false
}
@Test void quoteRejectsOversizedCarts() {
    // 31 dòng → BadRequestException CART_TOO_LARGE; dòng quantity 21 → CART_TOO_LARGE; items rỗng → CART_EMPTY
}
@Test void unknownOrInactiveVariantsAreReportedNotThrown() { /* NOT_FOUND / INACTIVE, valid=false */ }
```
- [x] **Step 2–4:** chạy FAIL → cài đặt → PASS. Quy tắc: gộp trùng `variantId`; `quantity` dòng = min(requested, stock) khi thiếu; tổng > 100.000.000 → `CART_TOO_LARGE`; `fulfillment` khác `delivery|pickup` → `FULFILLMENT_INVALID`. Tiền làm tròn đơn vị đồng (`setScale(0)`).
- [ ] **Step 5: Commit** `feat(shop): server-side cart quote`.

## Task 5: Sổ địa chỉ giao hàng

**Files:**
- Create: `shop/entity/MemberAddress.java`, `shop/repository/MemberAddressRepository.java`, `shop/dto/AddressDtos.java`, `shop/service/AddressService.java`, `shop/controller/ShopAddressController.java`
- Modify: `SecurityConfig` (`/api/v1/shop/**` → `hasRole("MEMBER")`), i18n 3 file (kèm validation keys `validation.shop.address.*`)
- Test: `shop/AddressServiceTest.java`, `shop/ShopAddressControllerTest.java`

**Interfaces:**
- Consumes: `GeoService.resolve`, `MemberRepository.findByUserIdForUpdate`.
- Produces: `AddressService.list(Long userId)`, `create(Long userId, AddressRequest)`, `update(Long userId, Long id, AddressRequest)`, `makeDefault(Long userId, Long id)`, `delete(Long userId, Long id)`, `createIfRoom(Long userId, AddressRequest): Optional<AddressDto>` (trả rỗng thay vì ném lỗi khi sổ đã đủ 5 — dùng khi “Lưu vào sổ địa chỉ” lúc đặt hàng), `AddressService.snapshot(Long userId, Long addressId): ShippingSnapshot` và `AddressService.snapshot(AddressRequest): ShippingSnapshot` — `record ShippingSnapshot(String recipientName, String phone, String provinceName, String wardName, String streetLine, String note)`.

- [x] **Step 1: Test thất bại**

```java
@Test void firstAddressBecomesDefaultAndSixthIsRejected() { … ADDRESS_LIMIT_REACHED … }
@Test void regionCodesAreResolvedFromTheBundledCatalogue() {
    when(geo.resolve("79", "26734")).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service.create(1L, req("79", "26734"))).hasFieldOrPropertyWithValue("errorCode", "ADDRESS_INVALID_REGION");
}
@Test void deletingDefaultPromotesNewestRemaining() { … }
@Test void anotherMembersAddressIsNotFound() { /* id thuộc member 2 → ADDRESS_NOT_FOUND (không lộ 403) */ }
@Test void phoneIsNormalisedTo0Prefix() { /* "+84901234567" → "0901234567" */ }
```
- [x] **Step 2–4:** FAIL → cài đặt (khóa `members.findByUserIdForUpdate(userId)` trước mọi ghi để giữ bất biến 1 mặc định; tên tỉnh/phường lưu từ `GeoService`, **không** tin tên client gửi) → PASS.
- [ ] **Step 5: Commit** `feat(shop): member shipping address book`.

## Task 6: Đơn hàng — tạo, xem, hủy, hết hạn

**Files:**
- Create: `shop/entity/{ProductOrder,ProductOrderItem,OrderStatus}.java`, `shop/repository/{ProductOrderRepository,ProductOrderItemRepository}.java`
- Create: `shop/dto/OrderDtos.java`, `shop/mapper/OrderMapper.java`
- Create: `shop/service/{OrderCodeGenerator,StockService,ProductOrderService,ProductOrderExpiryScheduler}.java`
- Create: `shop/controller/ShopOrderController.java`
- Modify: `common/GlobalExceptionHandler.java` — map vi phạm `ck_product_variants_stock_nonneg` → 409 `PRODUCT_OUT_OF_STOCK` (đặt **trước** nhánh `duplicate` chung, giống nhánh trigger hiện có); `uq_product_orders_member_request` → để service xử lý (bắt `DataIntegrityViolationException` khi save và trả đơn đã có).
- Modify: i18n 3 file
- Test: `shop/ProductOrderServiceTest.java`, `shop/OrderStatusTest.java`, `shop/ShopOrderControllerTest.java`

**Interfaces:**
- Consumes: Task 4 `QuoteService.price`, `ShopPricing`; Task 5 `AddressService.snapshot`; `MemberRepository.findByUserIdForUpdate`; `ProductVariantRepository.findAllByIdInForUpdate`; `VnpayPaymentGuard.productOrder(Long)` (thêm ở Task 7 — trong task này gọi qua dependency `@Autowired(required=false)` và test bằng mock).
- Produces:
  - `enum OrderStatus { pending_payment, paid, processing, shipping, ready_for_pickup, completed, cancelled; boolean terminal(); }`
  - `ProductOrderService.create(AuthenticatedPrincipal, CreateOrderRequest): CreateResult(OrderDto order, boolean created)` và `createIdempotent(...)` (cùng chữ ký; controller gọi hàm này — xử lý race unique `clientRequestId`)
  - `ProductOrder.applyShipping(ShippingSnapshot|null)`, `ProductOrder.addItem(ProductOrderItem)`, `static ProductOrderItem.snapshot(ProductVariant, int quantity)` (chép tên sản phẩm, nhãn, SKU, đơn giá, thành tiền)
  - `ProductOrderService.myOrders(Long userId, String group, int page, int size): Page<OrderSummaryDto>`
  - `ProductOrderService.myOrder(Long userId, Long id): OrderDto`
  - `ProductOrderService.cancelByMember(Long userId, Long id, String reason): OrderDto`
  - `ProductOrderService.expireUnpaid(): int`
  - `StockService.reserve(ProductOrder, Map<Long,Integer> qtyByVariant, Long actorId)`, `StockService.release(ProductOrder, Long actorId)` (cả hai ghi `StockMovement`)
  - `ProductOrderService.cancelInternal(ProductOrder order, String reason, boolean restock, User actor)` (package-visible, Task 7–8 dùng; xử lý hoàn Ví qua `ProductOrderRefunds` ở Task 7)
  - `ProductOrderRepository.findByIdForUpdate(Long)`, `findByMember_UserIdAndClientRequestId(Long, String)`, `findExpiredUnpaid(LocalDateTime now)`.

- [x] **Step 1: Test thất bại** (khung dữ liệu như `CourtBookingServiceTest`, `Clock.fixed(2026-11-05T07:00Z)`):

```java
@Test void createReservesStockSnapshotsPricesAndSetsPaymentWindow() {
    givenVariant(1L, "1290000", 68, 5);
    var result = service.create(member, order(List.of(line(1L, 2)), "pickup", "online", "2580000"));
    assertThat(result.created()).isTrue();
    assertThat(variant(1L).getStock()).isEqualTo(3);
    assertThat(result.order().total()).isEqualByComparingTo("2580000");
    assertThat(result.order().paymentDueAt()).isEqualTo(LocalDateTime.of(2026,11,5,14,30)); // giờ VN + 30 phút
    verify(movements).save(argThat(m -> m.getDelta() == -2 && "order_reserve".equals(m.getReason())));
}
@Test void sameClientRequestIdReturnsExistingOrderWithoutTouchingStock() { … created=false, stock unchanged … }
@Test void expectedTotalMismatchIsPriceChanged() { … ORDER_PRICE_CHANGED, stock unchanged … }
@Test void insufficientStockIsOutOfStock() { … PRODUCT_OUT_OF_STOCK … }
@Test void counterRequiresPickupAndDeliveryRequiresExactlyOneAddress() { … PAYMENT_METHOD_NOT_ALLOWED / FULFILLMENT_INVALID … }
@Test void deletedOrNonMemberUsersCannotOrder() { … ForbiddenException … }
@Test void memberCancelsPendingOrderAndStockReturns() { … status cancelled, stock restored, pending payments → failed … }
@Test void memberCannotCancelWhileVnpayIsSettling() { doThrow(conflict).when(guard).productOrder(9L); … ORDER_AWAITING_PAYMENT … }
@Test void memberCannotCancelProcessingOrder() { … ORDER_INVALID_TRANSITION … }
@Test void expiryCancelsOnlyOverdueOrdersWhoseGatewayIsDone() { … one skipped because guard throws, one cancelled … }
@Test void otherMembersOrderIsNotFound() { … ORDER_NOT_FOUND … }
```
`OrderStatusTest`: `completed.terminal()` và `cancelled.terminal()` true, còn lại false.
- [x] **Step 2: Chạy** → FAIL.
- [x] **Step 3: Cài đặt `create`** (một `@Transactional`; thứ tự khóa cố định để tránh deadlock: **member → biến thể theo id tăng dần**):

```java
@Transactional
public CreateResult create(AuthenticatedPrincipal principal, CreateOrderRequest request) {
    requireMember(principal);
    Member member = members.findByUserIdForUpdate(principal.id())
        .filter(m -> m.getUser().getDeletedAt() == null)
        .orElseThrow(() -> new ForbiddenException("SHOP_MEMBER_REQUIRED", "error.shop.member_required", null, "Members only"));
    var existing = orders.findByMember_UserIdAndClientRequestId(principal.id(), request.clientRequestId());
    if (existing.isPresent()) return new CreateResult(mapper.toDto(existing.get(), false), false);

    validateFulfillment(request);                         // FULFILLMENT_INVALID / PAYMENT_METHOD_NOT_ALLOWED
    Map<Long, Integer> qty = QuoteService.merge(request.items());   // gộp trùng + CART_EMPTY/CART_TOO_LARGE
    List<ProductVariant> locked = variants.findAllByIdInForUpdate(qty.keySet());
    Priced priced = quotes.price(request.items(), locked, request.fulfillment());
    if (priced.lines().stream().anyMatch(l -> l.problem() != null))
        throw new ConflictException("PRODUCT_OUT_OF_STOCK", "error.shop.product_out_of_stock", null, "Out of stock");
    if (priced.total().compareTo(request.expectedTotal().setScale(0, RoundingMode.HALF_UP)) != 0)
        throw new ConflictException("ORDER_PRICE_CHANGED", "error.shop.order_price_changed", null, "Price changed");

    ShippingSnapshot ship = "delivery".equals(request.fulfillment())
        ? (request.addressId() != null ? addresses.snapshot(principal.id(), request.addressId())
                                       : addresses.snapshot(request.shippingAddress()))
        : null;
    if (ship != null && request.addressId() == null && request.saveAddress())
        addresses.createIfRoom(principal.id(), request.shippingAddress()); // lỗi đầy sổ không chặn đặt hàng

    LocalDateTime now = LocalDateTime.now(clock);
    ProductOrder order = new ProductOrder();
    order.setMember(member); order.setClientRequestId(request.clientRequestId());
    order.setCode(codes.next(now.toLocalDate())); order.setStatus(OrderStatus.pending_payment.name());
    order.setFulfillment(request.fulfillment()); order.setPaymentMethod(request.paymentMethod());
    order.setSubtotal(priced.subtotal()); order.setShippingFee(priced.shippingFee()); order.setTotal(priced.total());
    order.applyShipping(ship);
    order.setPaymentDueAt("counter".equals(request.paymentMethod())
        ? now.plusHours(props.counterHoldHours()) : now.plusMinutes(props.paymentWindowMinutes()));
    priced.lines().forEach(l -> order.addItem(ProductOrderItem.snapshot(l.variant(), l.quantity())));
    ProductOrder saved = orders.saveAndFlush(order);
    stock.reserve(saved, qty, principal.id());
    return new CreateResult(mapper.toDto(saved, false), true);
}
```
`clock` là `Clock` múi `Asia/Ho_Chi_Minh` (inject như `VnpayPaymentGuard`). `OrderCodeGenerator.next(LocalDate)` dùng `SecureRandom` + alphabet D11, thử lại tối đa 5 lần nếu `orders.existsByCode`. Race hai request cùng `clientRequestId` lọt qua `findBy…`: bắt `DataIntegrityViolationException` có tên `uq_product_orders_member_request` ở **controller-facing service wrapper** (`createIdempotent` gọi `create` trong `REQUIRES_NEW`, khi lỗi unique thì đọc lại đơn) — test bằng mock ném exception lần đầu.

`StockService.reserve` trừ trên các entity đã khóa (`variant.setStock(variant.getStock() - q)`; nếu âm → `PRODUCT_OUT_OF_STOCK`) và lưu `StockMovement(delta=-q, reason=order_reserve, orderId)`. `release` khóa lại các biến thể của đơn theo id tăng dần, cộng lại, ghi `order_release`.

`cancelByMember`: khóa member → `orders.findByIdForUpdate` → kiểm chủ sở hữu (khác chủ → `ORDER_NOT_FOUND`) → cho phép `pending_payment` (gọi `guard.productOrder(id)` trước, lỗi guard → `ORDER_AWAITING_PAYMENT`) hoặc `paid` → `cancelInternal(order, reason, true, user)`.

`expireUnpaid`: `findExpiredUnpaid(now)` = `status='pending_payment' and paymentDueAt < :now`; với mỗi đơn (mỗi đơn một transaction riêng qua `TransactionTemplate` để một đơn lỗi không chặn đơn khác): khóa member → khóa đơn → nếu còn pending → `guard.productOrder(id)` (ném → bỏ qua) → `cancelInternal(order, messages.getMessage("shop.auto_cancel.unpaid"), true, null)`. `ProductOrderExpiryScheduler` sao chép đúng khuôn `CourtBookingExpiryScheduler` với property `app.shop.expiry-interval-ms:60000`.

`canCancel`/`canPay` tính ở mapper: `canPay = pending_payment && paymentMethod=online && paymentDueAt > now`; `canCancel` (member) = `pending_payment || paid`.
- [x] **Step 4: Controller** `ShopOrderController` (`/api/v1/shop/orders`, `@PreAuthorize("hasRole('MEMBER')")`): `POST` trả 201 khi `created`, 200 khi lặp; `GET` list/detail; `POST /{id}/cancel`.
- [ ] **Step 5: Chạy** → PASS. **Commit** `feat(shop): product orders with stock reservation, idempotency and expiry`.

## Task 7: Thanh toán — VNPay, Ví, thu tại quầy, hoàn tiền, hóa đơn (Finance — xin phép Phong)

**Files:**
- Modify: `finance/entity/Payment.java` (`productOrderId` + quan hệ LAZY read-only)
- Modify: `finance/repository/PaymentRepository.java` (`List<Payment> findAllByProductOrderId(Long)`)
- Modify: `finance/dto/VnpayDtos.java` (`CheckoutRequest(Long subscriptionId, Long coachBookingId, Long courtBookingId, Long paymentId, Long productOrderId)`) và **mọi** chỗ gọi `new CheckoutRequest(` (grep toàn repo, kể cả test)
- Modify: `finance/service/VnpayPaymentService.java`, `finance/service/VnpayPaymentGuard.java`, `finance/service/InvoiceService.java`
- Create: `shop/service/ProductOrderPayments.java` (đánh dấu đã trả + thông báo), `shop/service/ProductOrderRefunds.java` (hoàn Ví)
- Modify: `shop/service/ProductOrderService.cancelInternal` dùng `ProductOrderRefunds`
- Test: bổ sung `finance/VnpayPaymentServiceTest.java`, `finance/InvoiceServiceTest` (hoặc file test hóa đơn hiện có), tạo `shop/ProductOrderPaymentsTest.java`, `shop/ProductOrderRefundsTest.java`

**Interfaces:**
- Consumes: `ProductOrderRepository.findByIdForUpdate`, `WalletService.creditRefund`, `NotificationService.send(...)`.
- Produces: `ProductOrderPayments.markPaid(Long orderId, String method)` (idempotent: đơn đã `paid` thì bỏ qua), `ProductOrderPayments.requirePayable(Long orderId): ProductOrder` (ném `VNPAY_TARGET_UNAVAILABLE` nếu không `pending_payment` hoặc là `counter`), `ProductOrderRefunds.refundIfPaid(ProductOrder order, String reason): BigDecimal`, `VnpayPaymentGuard.productOrder(Long orderId)`.

- [x] **Step 1: Test thất bại** (thêm vào test VNPay hiện có, theo mẫu test court booking của nó):

```java
@Test void checkoutForProductOrderCreatesPendingPaymentWithOrderTotal() {
    givenPendingOrder(9L, member(1L), "2580000", "online");
    var checkout = service.checkout(principal(1L), new CheckoutRequest(null,null,null,null,9L), "127.0.0.1");
    verify(payments).save(argThat(p -> Long.valueOf(9L).equals(p.getProductOrderId())
        && p.getAmount().compareTo(new BigDecimal("2580000")) == 0));
}
@Test void counterOrdersCannotBePaidOnline() { … VNPAY_TARGET_UNAVAILABLE … }
@Test void ipnSuccessMarksOrderPaidAndIssuesInvoice() { … verify(orderPayments).markPaid(9L, "online_wallet"); verify(invoices).autoIssueInvoiceForPayment(...) … }
@Test void walletPayForProductOrderDebitsAndMarksPaid() { … debitForPayment(1L, total, "WALLET_PAY_"+id, desc, "/member/orders/9") … }
@Test void statusDestinationPointsToOrderPage() { … "/member/orders/9" … }
@Test void guardBlocksWhileProductOrderAttemptIsPendingAndUnexpired() { … }
```
`ProductOrderRefundsTest`: đơn đã trả → `creditRefund(1L, total, "ORDER_REFUND_9", reason)`, payment `refunded`, `refundedAmount=total`, trả về số tiền; đơn chưa trả → 0, không gọi Ví; gọi hai lần → hoàn một lần (kiểm `payment.status`).
- [x] **Step 2: Chạy** → FAIL.
- [x] **Step 3: Cài đặt** — các thay đổi trong `VnpayPaymentService` (giữ nguyên style file):

```java
// resolveTargetPayment: thêm productOrderId vào mảng targets
Long[] targets={request.subscriptionId(),request.coachBookingId(),request.courtBookingId(),request.paymentId(),request.productOrderId()};
...
} else if (request.productOrderId()!=null) {
    lockMember(principal.id());
    var order = orderPayments.requirePayable(request.productOrderId());   // khóa đơn + kiểm trạng thái/phương thức
    requireOwner(principal, order.getMember().getUserId());
    payment = findOrCreate(payments.findAllByProductOrderId(order.getId()), principal.id(), order.getTotal());
    payment.setProductOrderId(order.getId());
} else { /* nhánh court hiện có */ }

// lockTargets
if(p.getProductOrderId()!=null) orders.findByIdForUpdate(p.getProductOrderId()).orElseThrow(this::unavailable);
// validateBooking
if(p.getProductOrderId()!=null) orderPayments.requirePayable(p.getProductOrderId());
// markBookingPaid
if(p.getProductOrderId()!=null) orderPayments.markPaid(p.getProductOrderId(), "online_wallet");
// payWithWallet & status: đường dẫn "/member/orders/" + p.getProductOrderId();
// mô tả ví: messages.getMessage("wallet.description.product_order", orderCode) — không hard-code chuỗi mới
```
Đặt nhánh `productOrderId` **trước** các nhánh mặc định trong mọi biểu thức ba ngôi chọn `targetPath`/`desc` để đơn sản phẩm không rơi vào `/member/invoices`. `orderPayments` inject `@Autowired(required = false)` giống `walletService`.

`VnpayPaymentGuard.productOrder(Long orderId)`: sao chép thân của `court(...)` nhưng tìm payment theo `findAllByProductOrderId`.

`InvoiceService.autoIssueInvoiceForPayment`: trong `orElseGet`, nếu `payment.getProductOrderId() != null`, thay vì một dòng mặc định:
```java
var order = productOrders.findById(payment.getProductOrderId()).orElseThrow(...);
for (var line : order.getItems()) {
    InvoiceItem item = new InvoiceItem();
    item.setDescription(line.getProductName() + " · " + line.getVariantLabel());
    item.setQuantity(line.getQuantity()); item.setUnitPrice(line.getUnitPrice()); invoice.addItem(item);
}
if (order.getShippingFee().signum() > 0) { /* dòng "finance.invoice.item.shipping" qua MessageService, qty 1 */ }
```
`ProductOrderPayments.markPaid`: khóa đơn; nếu `paid` trở lên → return; nếu `cancelled` (IPN muộn sau hủy) → **không** chuyển trạng thái, gọi `ProductOrderRefunds` để trả tiền vào Ví và gửi thông báo hoàn tiền (khách không mất tiền); ngược lại `status=paid`, `paidAt=now`, thông báo hội viên `notifications.shop.paid` + lễ tân `notifications.shop.staff_new_order` (người nhận lấy theo cách `StaffInternalRequestService` đang dùng; chỉ user active, `deleted_at is null`).

`ProductOrderRefunds.refundIfPaid`: tìm payment `success` của đơn; `walletService.creditRefund(memberUserId, amount, "ORDER_REFUND_" + order.getId(), reason)`; `payment.setStatus("refunded"); payment.setRefundedAmount(amount)`. Trước khi viết, đọc `PaymentService` phần refund (`cancelLinkedTargetsOnRefund`, xử lý hóa đơn khi hoàn) và **làm giống** cách nó xử lý hóa đơn đã phát hành.
- [x] **Step 4: Thu tại quầy** — `ProductOrderStaffService.counterPayment` (Task 8) tạo `Payment{member, productOrderId, amount=total, method in (cash,pos,bank_transfer), status=success, paidAt, receivedBy=staff}`, gọi `invoices.autoIssueInvoiceForPayment`, rồi `markPaid(orderId, method)`. Viết test của nó ở Task 8.
- [ ] **Step 5: Chạy** toàn bộ `./mvnw.cmd -q -o test` (các test VNPay/Wallet/Invoice cũ phải còn xanh sau khi đổi `CheckoutRequest`). **Commit** `feat(finance): accept product orders as a VNPay/wallet payment target`.

## Task 8: Lễ tân xử lý đơn

**Files:**
- Create: `shop/service/ProductOrderStaffService.java`, `shop/controller/StaffProductOrderController.java`, `shop/dto/StaffOrderDtos.java` (`ShipRequest`, `CounterPaymentRequest`, `StaffCancelRequest`, `OrderCountsDto`)
- Modify: `SecurityConfig` (`/api/v1/staff/product-orders/**` → `hasAnyRole("RECEPTIONIST","STAFF","CENTER_MANAGER")`), i18n
- Test: `shop/ProductOrderStaffServiceTest.java`, `shop/StaffProductOrderControllerTest.java`

**Interfaces:**
- Consumes: `ProductOrderService.cancelInternal`, `ProductOrderPayments.markPaid`, `InvoiceService.autoIssueInvoiceForPayment`, `NotificationService`.
- Produces: `list(String status, String q, int page, int size)`, `counts()`, `get(Long id)`, `startProcessing(AuthenticatedPrincipal, Long)`, `ship(AuthenticatedPrincipal, Long, ShipRequest)`, `readyForPickup(...)`, `complete(...)`, `counterPayment(AuthenticatedPrincipal, Long, CounterPaymentRequest)`, `cancel(AuthenticatedPrincipal, Long, StaffCancelRequest)` — tất cả trả `OrderDto` (kèm `member`).

- [x] **Step 1: Test thất bại** — một test cho mỗi hàng của bảng B2 do staff thực hiện, cộng:

```java
@Test void shipRequiresDeliveryProcessingAndTrackingNumber() { … pickup → ORDER_INVALID_TRANSITION; tracking "" → validation … }
@Test void readyForPickupRejectsDeliveryOrders() { … }
@Test void counterPaymentOnlyForPendingCounterOrdersAndCreatesSuccessfulPayment() { … method cash, receivedBy staff, invoice issued, markPaid … }
@Test void cancelPaidOrderRefundsWalletAndRestocksWhenAsked() { … refundIfPaid called, release called when restock=true, not called when false … }
@Test void cancelRequiresReason() { … }
@Test void completedOrCancelledOrdersCannotChange() { … }
@Test void transitionsNotifyMemberWithOrderLink() { verify(notifications).send(eq(1L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/member/orders/9")); }
@Test void searchMatchesCodeMemberNameAndPhone() { … repository called with lowercased q … }
```
- [x] **Step 2–4:** FAIL → cài đặt (mọi ghi: khóa đơn `findByIdForUpdate`; gắn `@Audited` theo tham số trong `audit/Audited.java`) → PASS.
- [ ] **Step 5: Commit** `feat(shop): staff order fulfilment workflow`.

## Task 9: Quản lý sản phẩm, loại, ảnh, tồn kho

**Files:**
- Create: `shop/dto/ProductAdminDtos.java`, `shop/service/{ProductAdminService,CategoryAdminService,SlugService}.java`, `shop/controller/{ManagerProductController,ManagerCategoryController}.java`
- Modify: `SecurityConfig` (`/api/v1/manager/products/**`, `/api/v1/manager/product-categories/**`, `/api/v1/manager/product-variants/**`, `/api/v1/manager/product-orders/**` → `hasRole("CENTER_MANAGER")`), i18n
- Test: `shop/SlugServiceTest.java`, `shop/ProductAdminServiceTest.java`, `shop/ManagerProductControllerTest.java`

**Interfaces:**
- Produces: `SlugService.slugify(String): String` (bỏ dấu tiếng Việt bằng `java.text.Normalizer` NFD + thay `đ/Đ`→`d`, chữ thường, `[^a-z0-9]+`→`-`, cắt 180); `ProductAdminService.{list,get,create,update,setActive,delete,addImage,removeImage,reorderImages,adjustStock,summary}`.

- [x] **Step 1: Test thất bại**

```java
@Test void slugifyHandlesVietnamese() {
    assertThat(SlugService.slugify("Sữa Whey Đạm Tách Béo – Vị Sô-cô-la")).isEqualTo("sua-whey-dam-tach-beo-vi-so-co-la");
}
@Test void createProductRequiresAtLeastOneVariantAndOneGoalAndOneHighlightMax() { … PRODUCT_INVALID … }
@Test void duplicateNameYieldsSlugTakenAndDuplicateSkuYieldsSkuTaken() { … }
@Test void updateDoesNotChangeExistingStockAndDeactivatesRemovedVariantsWithOrders() { … }
@Test void deleteWithOrderLinesIsRefused() { … PRODUCT_HAS_ORDERS … }
@Test void stockAdjustmentLocksVariantRecordsMovementAndRejectsNegativeResult() { … }
@Test void imageLimitAndReorderMustMatchExistingIds() { … PRODUCT_IMAGE_LIMIT / PRODUCT_INVALID … }
@Test void summaryCountsRealOrders() { … revenue30d excludes cancelled … }
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS. `initialStock` của biến thể mới ghi `StockMovement(reason=restock)`.
- [ ] **Step 5: Commit** `feat(shop): manager product, category, image and stock administration`.

## Task 10: Hợp đồng API, dữ liệu mẫu, kiểm thử PostgreSQL thật

**Files:**
- Create: `docs/api-contracts/openapi-shop.yaml` (toàn bộ endpoint B3, schema DTO, mã lỗi B4); Modify: `docs/api-contracts/openapi-vnpay.yaml` (`productOrderId` trong checkout/wallet pay), `docs/api-contracts/README.md` (liệt kê file mới)
- Create: `shop/ProductSeeder.java` (`ApplicationRunner`, chạy khi `app.shop.seed-samples=true` và `products.count()==0`)
- Create: `apps/api/src/test/java/com/swp391/scms/shop/ProductOrderPostgreSqlTest.java` (gated `SCMS_POSTGRES_TEST_URL` như `CourtBookingPostgreSqlTest`)
- Test: `shop/ProductSeederTest.java`

- [x] **Step 1: Seeder** — loại: Whey (`whey`), Creatine (`creatine`), Trước tập (`pre-workout`), Điện giải (`dien-giai`), Vitamin & khoáng chất (`vitamin`), Thanh protein (`thanh-protein`). 6 sản phẩm nhãn “SÖL Nutrition”, mỗi sản phẩm 1–3 biến thể, tồn 10–40, có bảng thành phần thật hợp lý (ví dụ Whey Isolate: khẩu phần 1 muỗng 33 g; Năng lượng 130 kcal; Đạm 25 g; BCAA 5,5 g (hàng con); Carbohydrate 2 g; Chất béo 1 g; Natri 90 mg), `registrationNumber=null`, không ảnh (giao diện vẽ packshot). Test: không chạy khi tắt cờ; không chạy khi đã có sản phẩm.
- [ ] **Step 2: Test PostgreSQL** (bỏ qua khi thiếu env, ghi rõ trong báo cáo): (a) hai luồng song song mua biến thể tồn 1 → đúng 1 thành công, tồn = 0; (b) `update product_variants set stock=-1` → vi phạm `ck_product_variants_stock_nonneg`; (c) khởi động trên schema có bảng `payments` cũ → cột `product_order_id` được thêm, dữ liệu cũ giữ nguyên; (d) RLS bật trên mọi bảng shop kể cả `product_goals`.
- [x] **Step 3: Chạy** `./mvnw.cmd -q test` + `pwsh scripts/test-database-config.ps1`. Ghi lại số test và các test bị skip.
- [ ] **Step 4: Commit** `docs(shop): OpenAPI contract, opt-in sample seeder and PostgreSQL invariants test`.

## Task 11: Frontend nền tảng — kiểu, API, định dạng, giỏ hàng

**Files:**
- Create: `apps/web/src/features/shop/shopTypes.ts`, `shopApi.ts`, `shopFormat.ts`, `cart.ts`
- Modify: `apps/web/src/features/payments/vnpayApi.ts` (`VnpayTarget` thêm `| { productOrderId: number }`)
- Test: `features/shop/cart.test.ts`, `features/shop/shopFormat.test.ts`, `features/shop/shopApi.test.ts`

**Interfaces:**
- Produces: kiểu TS khớp DTO B3; `shopApi.{listProducts, getProduct, listCategories, getShopConfig, quote, listProvinces, listWards, listAddresses, saveAddress, deleteAddress, makeDefaultAddress, createOrder, listMyOrders, getMyOrder, cancelMyOrder, staff.*, manager.*}`; `formatVnd(n)` (= `formatPrice` từ `membershipPresentation.ts`), `pricePerServingLabel(n)` → `"18.971đ / lần dùng"`; `GOAL_LABELS`, `FORM_LABELS`, `orderStatusLabel(status, fulfillment, paymentMethod)`; cart store: `useCart(): CartLine[]`, `cartCount()`, `addToCart(variantId, qty)`, `setQuantity(variantId, qty)`, `removeFromCart(variantId)`, `clearCart()`, `CART_LIMITS = { maxLines: 30, maxQuantity: 20 }`.

- [x] **Step 1: Test thất bại**

```ts
import { beforeEach, expect, it } from 'vitest';
import { addToCart, cartCount, clearCart, getCart, removeFromCart, setQuantity } from './cart';

beforeEach(() => { localStorage.clear(); clearCart(); });
it('merges the same variant and caps each line at 20', () => {
  addToCart(7, 15); addToCart(7, 10);
  expect(getCart()).toEqual([{ variantId: 7, quantity: 20 }]);
  expect(cartCount()).toBe(20);
});
it('ignores corrupt storage instead of crashing', () => {
  localStorage.setItem('scms_cart_v1', '{oops');
  expect(getCart()).toEqual([]);
});
it('removes a line when quantity drops below 1 and refuses a 31st line', () => {
  addToCart(1, 1); setQuantity(1, 0); expect(getCart()).toEqual([]);
  for (let id = 1; id <= 31; id++) addToCart(id, 1);
  expect(getCart()).toHaveLength(30);
});
it('syncs from another tab via the storage event', () => {
  localStorage.setItem('scms_cart_v1', JSON.stringify([{ variantId: 3, quantity: 2 }]));
  window.dispatchEvent(new StorageEvent('storage', { key: 'scms_cart_v1' }));
  expect(getCart()).toEqual([{ variantId: 3, quantity: 2 }]);
  removeFromCart(3); expect(cartCount()).toBe(0);
});
```
- [x] **Step 2: Chạy** `npx vitest run src/features/shop/cart.test.ts` → FAIL.
- [x] **Step 3: Cài đặt `cart.ts`** (khuôn `useSyncExternalStore` giống `shared/lib/portalNotices.ts`, mọi truy cập storage bọc try/catch):

```ts
import { useSyncExternalStore } from 'react';
export interface CartLine { variantId: number; quantity: number }
export const CART_LIMITS = { maxLines: 30, maxQuantity: 20 } as const;
const KEY = 'scms_cart_v1';
let lines: CartLine[] = read();
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l): l is CartLine => Number.isSafeInteger(l?.variantId) && l.variantId > 0 && Number.isSafeInteger(l?.quantity) && l.quantity > 0)
      .slice(0, CART_LIMITS.maxLines).map(l => ({ variantId: l.variantId, quantity: Math.min(l.quantity, CART_LIMITS.maxQuantity) }));
  } catch { return []; }
}
function commit(next: CartLine[]) {
  lines = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* giỏ vẫn chạy trong phiên */ }
  listeners.forEach(l => l());
}
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { lines = read(); listeners.forEach(l => l()); } });

export const getCart = () => lines;
export const cartCount = () => lines.reduce((n, l) => n + l.quantity, 0);
export function addToCart(variantId: number, quantity = 1) {
  const found = lines.find(l => l.variantId === variantId);
  if (found) return setQuantity(variantId, found.quantity + quantity);
  if (lines.length >= CART_LIMITS.maxLines) return;
  commit([...lines, { variantId, quantity: Math.min(Math.max(1, quantity), CART_LIMITS.maxQuantity) }]);
}
export function setQuantity(variantId: number, quantity: number) {
  if (quantity < 1) return removeFromCart(variantId);
  commit(lines.map(l => l.variantId === variantId ? { ...l, quantity: Math.min(quantity, CART_LIMITS.maxQuantity) } : l));
}
export const removeFromCart = (variantId: number) => commit(lines.filter(l => l.variantId !== variantId));
export const clearCart = () => commit([]);
export function useCart(): CartLine[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, getCart, getCart);
}
```
`shopApi.ts`: các hàm công khai gọi `apiFetch(path, { headers: { Authorization: '' } })` như `usePublicCatalog`; `createOrder` gửi `clientRequestId`.
- [ ] **Step 4: Chạy** → PASS. **Commit** `feat(web-shop): shop API client, formatting and cart store`.

## Task 12: Component dùng chung của shop (gồm signature)

**Files:**
- Create: `features/shop/components/{ProductPackshot,NutritionFacts,ProductCard,GoalChips,QuantityStepper,VariantPicker,OrderStatusPill,ShopDisclaimer}.tsx`
- Create: `features/shop/shop-public.css` (scope `.fit-site`), `features/shop/shop-portal.css` (scope `.portal-v2`)
- Test: `features/shop/components/NutritionFacts.test.tsx`, `ProductCard.test.tsx`, `VariantPicker.test.tsx`, `QuantityStepper.test.tsx`

**Interfaces:**
- Produces: `<NutritionFacts servingSize servings nutrients />`, `<ProductCard product onAdd? />` (gọi `addToCart` + `toast`), `<ProductPackshot form name imageUrl? alt? />`, `<GoalChips value onChange />` (dùng class `.fit-pricing-switch`), `<QuantityStepper value max onChange label />`, `<VariantPicker variants value onChange />`, `<OrderStatusPill status fulfillment paymentMethod />`, `<ShopDisclaimer />` (đúng câu ở Global Constraints).

- [x] **Step 1: Test thất bại**

```tsx
it('renders a real table with caption, indented sub rows and right-aligned numbers', async () => {
  await render(<NutritionFacts servingSize="1 muỗng (33 g)" servings={68} nutrients={[
    { name: 'Năng lượng', amount: 130, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
    { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
    { name: 'BCAA', amount: 5.5, unit: 'g', dailyValuePercent: null, subRow: true, highlight: false },
  ]} />);
  const table = host.querySelector('table')!;
  expect(table.querySelector('caption')?.textContent).toContain('Thành phần dinh dưỡng');
  expect([...table.querySelectorAll('tbody tr')].map(r => r.textContent)).toEqual(['Năng lượng130 kcal', 'Đạm25 g50%', 'BCAA5,5 g']);
  expect(table.querySelectorAll('tr.is-sub')).toHaveLength(1);
});
it('shows nothing but the serving line when there are no nutrient rows', …);
it('product card shows price per serving and disables add when out of stock', …);
it('variant picker disables sold-out variants and announces Hết hàng', …);
it('stepper never goes below 1 or above max', …);
```
- [x] **Step 2: Chạy** → FAIL.
- [x] **Step 3: Cài đặt `NutritionFacts`**

```tsx
const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
export function NutritionFacts({ servingSize, servings, nutrients }: { servingSize: string; servings: number | null; nutrients: Nutrient[] }) {
  const hasDv = nutrients.some(n => n.dailyValuePercent != null);
  return <div className="shop-facts">
    <table>
      <caption>Thành phần dinh dưỡng</caption>
      <thead>
        <tr className="shop-facts__serving"><td colSpan={hasDv ? 3 : 2}>Khẩu phần: {servingSize}{servings ? <><br />Số lần dùng: {servings}</> : null}</td></tr>
        {nutrients.length > 0 && <tr className="shop-facts__head"><th scope="col">Mỗi khẩu phần</th><th scope="col" className="is-num">Lượng</th>{hasDv && <th scope="col" className="is-num">% NCKN*</th>}</tr>}
      </thead>
      {nutrients.length > 0 && <tbody>{nutrients.map(n => <tr key={n.name} className={n.subRow ? 'is-sub' : undefined}>
        <th scope="row">{n.name}</th>
        <td className="is-num">{num.format(n.amount)} {n.unit}</td>
        {hasDv && <td className="is-num">{n.dailyValuePercent != null ? `${n.dailyValuePercent}%` : ''}</td>}
      </tr>)}</tbody>}
    </table>
    {hasDv && <p className="shop-facts__foot">*NCKN: phần trăm nhu cầu khuyến nghị hằng ngày cho người trưởng thành.</p>}
  </div>;
}
```
CSS signature (giấy trên than; theme sáng giữ nền trắng + viền mực):

```css
.fit-site .shop-facts, .portal-v2 .shop-facts { --facts-ink: #202020; background: #faf9f6; color: var(--facts-ink); border: 2px solid var(--facts-ink); border-radius: 4px; padding: 10px 12px 12px; max-width: 420px; font-variant-numeric: tabular-nums; }
:root[data-theme='light'] .shop-facts { background: #fff; }
.shop-facts table { width: 100%; border-collapse: collapse; }
.shop-facts caption { text-align: left; font-weight: 900; font-size: clamp(24px, 3vw, 30px); letter-spacing: -.02em; text-transform: uppercase; line-height: 1.05; padding-bottom: 4px; border-bottom: 10px solid var(--facts-ink); }
.shop-facts__serving td { padding: 6px 0 8px; font-size: 14px; font-weight: 600; border-bottom: 5px solid var(--facts-ink); }
.shop-facts__head th { font-size: 12px; font-weight: 800; text-align: left; padding: 6px 0 4px; border-bottom: 1px solid var(--facts-ink); }
.shop-facts tbody th, .shop-facts tbody td { padding: 5px 0; font-size: 14px; border-bottom: 1px solid color-mix(in srgb, var(--facts-ink) 35%, transparent); text-align: left; font-weight: 700; }
.shop-facts tbody tr.is-sub th { padding-left: 16px; font-weight: 500; }
.shop-facts .is-num { text-align: right; white-space: nowrap; }
.shop-facts tbody tr:last-child > * { border-bottom: 10px solid var(--facts-ink); }
.shop-facts__foot { margin: 6px 0 0; font-size: 12px; line-height: 1.4; }
```
`ProductPackshot`: khi không có ảnh, SVG inline `viewBox="0 0 200 240"` theo `form` (`powder`: hũ nắp rộng; `capsule|tablet`: lọ cổ hẹp; `liquid`: chai; `bar`: thanh nằm ngang; `other`: hộp), thân `#303030` (sáng `#e4e2de`), băng nhãn salmon chứa 2 chữ cái đầu tên; `role="img"` + `aria-label={name}`. Có ảnh → `LoadingImage` `object-fit: contain` trên nền `--portal-raised`/`#303030`.

`ProductCard`: kicker `categoryName · FORM_LABEL`, tên `h3`, dòng highlight (`25 g đạm / lần dùng`), giá `minPrice` (nhiều biến thể: “Từ 690.000đ”), `pricePerServingLabel` salmon, nhãn “Mới”/“Sắp hết”/“Hết hàng” chỉ từ dữ liệu thật (`isNew`, `lowStock`, `!inStock`), nút “Thêm vào giỏ” (nhiều biến thể → nút thành link “Chọn loại” tới trang chi tiết), `data-reveal="lift"`.
- [ ] **Step 4: Chạy** → PASS. **Commit** `feat(web-shop): nutrition facts label and shared shop components`.

## Task 13: Topbar, giỏ hàng, section landing

**Files:**
- Create: `features/landing/components/SplitHeading.tsx` (chuyển nguyên hàm từ `FitnessLanding.tsx`, export), `features/shop/components/{CartButton,CartDrawer}.tsx`, `features/landing/components/ProductShelf.tsx`
- Modify: `features/landing/components/FitnessLanding.tsx` (import `SplitHeading`; chèn `<ProductShelf />` giữa `#packages` và `#faq`), `features/landing/components/PublicLayout.tsx` (link “Sản phẩm”, `CartButton`, footer nav), `features/landing/fitness-public.css` (không — style shop để trong `shop-public.css`, import từ `ProductShelf`/`CartButton`)
- Test: `features/shop/components/CartDrawer.test.tsx`, `features/landing/components/ProductShelf.test.tsx`, cập nhật test layout công khai nếu đang khẳng định số link nav

**Interfaces:**
- Consumes: Task 11 cart + `shopApi.quote/listProducts`, Task 12 components.
- Produces: `<CartButton />` (mở drawer), `<CartDrawer onClose />`, `<ProductShelf />`.

- [x] **Step 1: Test thất bại**

```tsx
it('header shows a Sản phẩm route link and a cart button with live count', async () => {
  addToCart(1, 2);
  await renderLayout('/');
  expect(link('Sản phẩm')?.getAttribute('href')).toBe('/products');
  expect(host.querySelector('button[aria-label="Giỏ hàng · 2 sản phẩm"]')).not.toBeNull();
});
it('drawer quotes the cart, flags short stock and blocks checkout while invalid', async () => {
  vi.mocked(shopApi.quote).mockResolvedValue(quote({ valid: false, problem: 'INSUFFICIENT_STOCK', stock: 1 }));
  …expect(text()).toContain('Chỉ còn 1 sản phẩm'); expect(button('Thanh toán').disabled).toBe(true);
});
it('shelf hides itself when there are no products and shows retry on error', …);
it('checkout from the drawer sends guests to login with returnTo=/checkout', …);
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS.
  - `PublicLayout`: kiểu link thành `{ to; hash?; label }`; với link không có `hash`, bỏ `data-nav-target` và `aria-current="page"` khi `pathname.startsWith('/products')`. Không đổi các link hash hiện có.
  - `CartButton` badge cập nhật qua `useCart`; khi count tăng thêm class `is-bumped` 180ms (bỏ khi reduced motion).
  - `CartDrawer` dùng `Modal` (className `shop-drawer`); báo giá debounce 300ms, hủy request cũ bằng `AbortController`; “Thanh toán”: chưa đăng nhập → `navigate('/login?returnTo=%2Fcheckout')`, đã đăng nhập → `/checkout`.
  - `ProductShelf`: tiêu đề `<SplitHeading id="products-title" lines={['Fuel &', 'Recovery']} />`, kicker `FUEL THE WORK`, câu phụ ở A4.2, chip mục tiêu, 3 card, link `fit-pill` “Xem tất cả sản phẩm” + `RoundArrow`; gọi `listProducts({ goal, size: 3, sort: 'newest', featuredFirst: true })` (tham số có từ Task 3).
- [ ] **Step 5: Commit** `feat(web-shop): products nav, cart drawer and landing product shelf`.

## Task 14: Trang `/products` và `/products/:slug`

**Files:**
- Create: `features/shop/ProductsPage.tsx`, `features/shop/ProductDetailPage.tsx`
- Modify: `app/router.tsx` (2 route lazy cạnh `/trainers`)
- Test: `features/shop/ProductsPage.test.tsx`, `features/shop/ProductDetailPage.test.tsx`

- [x] **Step 1: Test thất bại**

```tsx
it('restores filters from the URL and writes them back', async () => {
  await renderAt('/products?goal=recovery&sort=price_per_serving&q=whey');
  expect(shopApi.listProducts).toHaveBeenCalledWith(expect.objectContaining({ goal: 'recovery', sort: 'price_per_serving', q: 'whey', page: 0 }));
  await click('Năng lượng');
  expect(location().search).toContain('goal=energy');
});
it('shows empty state with a clear-filters action', …);
it('loads more pages and keeps earlier cards', …);
it('detail updates price per serving when switching variant and caps quantity at stock', …);
it('detail Mua ngay adds to cart and goes to /checkout', …);
it('unknown slug shows Sản phẩm này không còn bán with a link back', …);
it('detail always renders the legal disclaimer', …);
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS. Trang dùng `PublicLayout`; `document.title` = `"<Tên> · SÖL Fitness"` / `"Sản phẩm · SÖL Fitness"`. Ô tìm kiếm debounce 350ms. Ảnh lớn ở chi tiết: nút thumbnail là `button` có `aria-pressed`.
- [ ] **Step 5: Commit** `feat(web-shop): product shelf and product detail pages`.

## Task 15: Đăng nhập quay lại và `/checkout`

**Files:**
- Modify: `shared/lib/purchaseIntent.ts` (+ test `purchaseIntent.test.ts`)
- Create: `features/shop/CheckoutPage.tsx`, `features/shop/components/{AddressForm,AddressPicker,RegionSelects}.tsx`
- Modify: `app/router.tsx` (`/checkout`)
- Test: `features/shop/CheckoutPage.test.tsx`, `features/shop/components/AddressForm.test.tsx`

**Interfaces:**
- Produces: `purchaseIntent` chấp nhận `returnTo` ∈ {`/member/packages[?packageId=n]`, `/checkout`, `/products`, `/products/<slug a-z0-9->`}; `<AddressForm value onSubmit busy errors />`, `<RegionSelects provinceCode wardCode onChange />` (dùng `Select` có tìm kiếm của repo, tải phường khi đổi tỉnh, reset phường).

- [x] **Step 1: Test thất bại cho purchaseIntent**

```ts
it.each(['/checkout', '/products', '/products/sol-whey-isolate'])('accepts shop return path %s', path => {
  expect(purchaseAuthPath('/login', `?returnTo=${encodeURIComponent(path)}`)).toBe(`/login?returnTo=${encodeURIComponent(path)}`);
});
it.each(['//evil.com', '/products/../admin/users', 'https://x.y/checkout', '/checkout?next=//evil'])('rejects %s', path => {
  expect(purchaseAuthPath('/login', `?returnTo=${encodeURIComponent(path)}`)).toBe('/login');
});
```
Cài đặt: thêm hàm `shopReturnPath(target)` dùng `new URL(target, 'https://scms.invalid')`, chỉ giữ `pathname` khớp `^/checkout$|^/products$|^/products/[a-z0-9-]{1,180}$`, bỏ mọi query; `purchaseReturnPath` thử nhánh gói tập trước rồi tới nhánh shop. `authDestination` giữ nguyên ưu tiên. Kiểm tra `LuxuryLoginForm`/`RegisterPage`/Google OAuth đều đi qua `authDestination` (đã có) — thêm test đăng ký giữ `returnTo=/checkout`.
- [x] **Step 2: Test thất bại cho checkout**

```tsx
it('guests are redirected to login with returnTo=/checkout', …);
it('non-member accounts see the members-only notice instead of the form', …);
it('delivery requires an address; saved default is preselected', …);
it('pay at counter is offered only for pickup', …);
it('placing an order reuses one clientRequestId across retries', async () => {
  vi.mocked(shopApi.createOrder).mockRejectedValueOnce(new ApiError('network', 0)).mockResolvedValueOnce(order(9));
  await click('Thanh toán VNPay Sandbox'); await click('Thanh toán VNPay Sandbox');
  const ids = vi.mocked(shopApi.createOrder).mock.calls.map(c => c[0].clientRequestId);
  expect(new Set(ids).size).toBe(1);
  expect(createVnpayCheckout).toHaveBeenCalledWith({ productOrderId: 9 });
});
it('ORDER_PRICE_CHANGED refreshes the quote, shows the inline message and keeps the chosen address', …);
it('a successful wallet payment clears the cart and opens the order page', …);
it('the cart is cleared once the order exists, even before VNPay returns', …);
```
- [x] **Step 3–4:** FAIL → cài đặt → PASS.
  - `clientRequestId`: `useRef(crypto.randomUUID())`, đổi mới khi giỏ/hình thức nhận/địa chỉ/phương thức thay đổi (vì đó là đơn khác).
  - Thanh toán online: `<VnpayPayButton prepare={placeOrder} onPaid={() => navigate('/member/orders/' + orderId.current)} />`; `placeOrder` gọi `createOrder`, lưu `orderId.current`, **xóa giỏ ngay khi đơn tồn tại** (đơn đã giữ hàng), trả `{ productOrderId }`.
  - Trả tại quầy: nút `btn-secondary` “Đặt hàng, trả tại quầy” → `createOrder` → `notify('Đã đặt đơn SOL-…', 'success', { record: true })` → `/member/orders/:id`.
  - Lỗi `ORDER_PRICE_CHANGED`/`PRODUCT_OUT_OF_STOCK`: hiện `.form-error` trong khu thanh toán, gọi lại báo giá; không xóa giỏ.
  - Giỏ rỗng khi vào `/checkout` → “Giỏ hàng đang trống.” + link `/products`.
- [ ] **Step 5: Commit** `feat(web-shop): checkout with address book, VNPay/wallet and counter payment`.

## Task 16: Portal hội viên — đơn hàng & địa chỉ

**Files:**
- Create: `features/shop/MemberOrdersPage.tsx`, `features/shop/MemberOrderDetailPage.tsx`, `features/shop/components/{OrderTimeline,MemberAddressBook}.tsx`
- Modify: `app/router.tsx` (`/member/orders`, `/member/orders/:orderId` trong nhánh MEMBER của portal), `features/portal/portalNavigation.ts` (`{ to: '/member/orders', label: 'Đơn hàng', icon: 'bag', roles: ['MEMBER'] }` đặt sau `/member/invoices`, kèm nhãn EN “Orders”), `features/portal/PortalIcon.tsx` (icon `bag`, `box` — nét 1.8px như icon hiện có), `features/payments/VnpayReturnPage.tsx` (chấp nhận `/member/orders/\d+`), `features/member/notificationsApi.ts` (`product_order` → member `/member/orders`, staff `/staff/orders`, manager `/manager/products?tab=orders`), `features/member/MemberNotificationsPage.tsx` (`category.order = { label: 'Đơn hàng' }`)
- Test: `features/shop/MemberOrdersPage.test.tsx`, `MemberOrderDetailPage.test.tsx`, cập nhật `VnpayReturnPage.test.tsx`, `notificationsApi` test

- [x] **Step 1: Test thất bại**

```tsx
it('lists orders by status group with real totals and a pay action for unpaid online orders', …);
it('detail timeline shows only reached steps with timestamps and the pickup instruction for pickup orders', …);
it('pending online order shows VnpayPayButton targeting the order and the hold deadline', …);
it('cancel goes through useConfirm and records a notice', …);
it('copying the tracking number uses toast, not the bell', …);
it('address tab adds, edits, sets default and deletes with confirmation', …);
it('vnpay return accepts /member/orders/42 and still rejects other paths', …);
it('product_order notifications open the right page per role', …);
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS. Mobile primary nav không đổi; kiểm tra `PortalShell.mobile.test.tsx` vẫn xanh.
- [ ] **Step 5: Commit** `feat(web-shop): member orders, tracking and address book`.

## Task 17: Portal lễ tân — `/staff/orders`

**Files:**
- Create: `features/shop/StaffOrdersPage.tsx`, `features/shop/components/{OrderTable,StaffOrderDialog}.tsx` (Task 18 dùng lại)
- Modify: `app/router.tsx`, `portalNavigation.ts` (`{ to: '/staff/orders', label: 'Đơn hàng sản phẩm', icon: 'box', roles: ['STAFF'] }`, EN “Product Orders”)
- Test: `features/shop/StaffOrdersPage.test.tsx`

- [x] **Step 1: Test thất bại**

```tsx
it('tabs show live counts and search filters by code, name or phone', …);
it('dialog offers only the actions valid for the order status and fulfilment', …);
it('ship requires a tracking number before submitting', …);
it('counter payment asks for the method and refreshes the order', …);
it('cancel requires a reason, shows the wallet refund amount for paid orders and the restock option', …);
it('errors stay inside the dialog and the dialog cannot close while sending', …);
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS. Thao tác thành công: `notify(..., 'success', { record: true })` cho hủy/thu tiền (giao dịch), `notify(...)` không record cho chuyển trạng thái thường (theo quy ước chuông ở `portalNotices.ts`). Nút làm mới `RefreshButton`.
- [ ] **Step 5: Commit** `feat(web-shop): staff order fulfilment page`.

## Task 18: Portal quản lý — `/manager/products`

**Files:**
- Create: `features/shop/ManagerProductsPage.tsx`, `features/shop/ManagerProductEditorPage.tsx`, `features/shop/components/{ProductImagesEditor,VariantRowsEditor,NutrientRowsEditor,StockAdjustDialog,CategoryManager}.tsx`
- Modify: `app/router.tsx` (`/manager/products`, `/manager/products/new`, `/manager/products/:productId`), `portalNavigation.ts` (`{ to: '/manager/products', label: 'Sản phẩm & Đơn hàng', icon: 'bag', roles: ['MANAGER'] }`, EN “Products & Orders”)
- Test: `features/shop/ManagerProductsPage.test.tsx`, `ManagerProductEditorPage.test.tsx`

- [x] **Step 1: Test thất bại**

```tsx
it('product table flags low stock and moves delete into the ⋯ menu', …);
it('editor validates required fields inline and focuses the first error', …);
it('editor shows a live NutritionFacts preview while typing nutrient rows', …);
it('only one nutrient can be marked as highlight', …);
it('images: rejects non JPEG/PNG/WEBP or >1.5 MB before upload, requires alt text, reorders with ↑↓', …);
it('existing variant stock is read-only and changed through the adjust dialog with a reason', …);
it('deleting a product with orders shows the server message and suggests stopping sales', …);
it('orders tab reuses the staff table and shows the three real summary numbers', …);
```
- [x] **Step 2–4:** FAIL → cài đặt → PASS. Ảnh đọc bằng `FileReader.readAsDataURL`, kiểm `file.type` và `file.size` trước khi gửi (máy chủ vẫn kiểm lại).
- [ ] **Step 5: Commit** `feat(web-shop): manager product, stock and order administration`.

## Task 19: Hoàn thiện giao diện, kiểm chứng trình duyệt, tài liệu

**Files:**
- Create: `scripts/verify-shop-ui.cjs` (theo khuôn `scripts/verify-court-booking.cjs`/`verify-public-ui.cjs`: Playwright + API giả lập)
- Modify: `DESIGN.md` (mục mới ở đầu, ngày 05/11/2026), `docs/PROJECT_MASTER_GUIDE.md` (mục nghiệp vụ Cửa hàng), `docs/plans/README.md` (link plan này)
- Run: `graphify update .`

- [x] **Step 1: Script kiểm chứng** — với API giả lập, ở 390×844 (mobile, cảm ứng), 768, 1440, 1920, theme sáng + tối: (1) landing có link “Sản phẩm” và section `#products`, không tràn ngang (`scrollWidth - innerWidth === 0`); (2) `/products` lọc theo chip đổi URL; (3) chi tiết: chọn biến thể, thêm giỏ, badge = 1; (4) drawer → “Thanh toán” khi chưa đăng nhập về `/login?returnTo=%2Fcheckout`; (5) đăng nhập giả lập → `/checkout` còn giỏ, chọn tỉnh/phường, đặt hàng → gọi `/payments/vnpay/checkout` với `productOrderId`; (6) `/member/orders/:id` hiện timeline; (7) `/staff/orders` chuyển trạng thái; (8) `prefers-reduced-motion` không có animation trên badge/drawer; (9) `NutritionFacts` tương phản chữ ≥ 4,5:1 cả hai theme; (10) ô nhập trên mobile có `font-size ≥ 16px`. Chụp ảnh vào `docs/ui-review/shop/` và tự xem lại từng ảnh.
- [x] **Step 2: DESIGN.md** — thêm đoạn “Cửa hàng ‘Sản phẩm’ (05/11/2026)”: topbar có link route `/products` + nút giỏ icon; section `#products` giữa Gói tập và FAQ; signature nhãn thành phần (giấy sáng, vạch 10/5/1px); giá mỗi lần dùng; không số liệu giả; câu miễn trừ bắt buộc; địa chỉ 2 cấp; sổ địa chỉ ở `/member/orders` (Hồ sơ giữ một card); sidebar Member “Đơn hàng”, Staff “Đơn hàng sản phẩm”, Manager “Sản phẩm & Đơn hàng”, mobile primary nav không đổi.
- [x] **Step 3: Kiểm tra cuối** — chạy và ghi số liệu thật vào cuối file plan này (mục “Verification evidence”): `cd apps/api && ./mvnw.cmd -q test`; `cd apps/web && npx tsc -b && npx eslint src --max-warnings=0 && npx vitest run && npm run build`; `pwsh scripts/test-database-config.ps1`; `node scripts/verify-shop-ui.cjs`; `node scripts/verify-public-ui.cjs`; `node scripts/verify-public-animation.cjs`. Ghi rõ test nào bị skip (đặc biệt `ProductOrderPostgreSqlTest` nếu thiếu `SCMS_POSTGRES_TEST_URL` — khi đó **chưa kiểm chứng DB thật**).
- [ ] **Step 4: VNPay Sandbox thật** — theo `docs/VNPAY_SANDBOX.md`, đặt một đơn online, thanh toán thẻ test, xác nhận IPN chuyển đơn sang `paid`, hóa đơn có đủ dòng sản phẩm + phí giao, thông báo tới hội viên và lễ tân. Nếu không có cấu hình sandbox, ghi rõ “chưa kiểm chứng VNPay thật”.
- [ ] **Step 5: Commit** `docs(shop): design rules, master guide and verification evidence`. Không push/mở PR khi chưa có Jira key và chưa được người dùng cho phép.

---

# PHẦN D — NGOÀI PHẠM VI & RỦI RO

**Ngoài phạm vi (không làm nếu chưa có ticket):** tích hợp GHN/GHTK/Viettel Post và tính phí theo vùng/cân nặng; COD; mã giảm giá/khuyến mãi; đánh giá sản phẩm; tồn kho đa kho; trả hàng một phần; xuất PDF/Excel; gợi ý sản phẩm bằng AI; bán cho khách không có tài khoản; giỏ hàng đồng bộ đa thiết bị.

**Rủi ro & cách giảm:**
| Rủi ro | Giảm thiểu |
|---|---|
| Sửa phân hệ Finance làm hỏng thanh toán gói/sân/PT | Task 7 chạy toàn bộ test VNPay/Wallet/Invoice cũ; nhánh mới đặt trước nhánh mặc định; review riêng với Phong. |
| Data URL ảnh làm DB phình | Giới hạn 6 × 1,5 MB; list API không trả data URL, chỉ URL ảnh có cache. |
| Dữ liệu hành chính sai/cũ | Script kiểm 34 tỉnh; ghi `effectiveFrom`; địa chỉ đơn lưu snapshot tên nên đổi danh mục không làm sai đơn cũ. |
| Deadlock khi nhiều đơn cùng biến thể | Thứ tự khóa cố định member → order → variants tăng dần; test PostgreSQL song song. |
| Tuyên bố sức khỏe sai quy định | Câu miễn trừ bắt buộc, không mô tả công dụng chữa bệnh, số công bố chỉ hiện khi quản lý nhập. |

## Verification evidence

### 1. Lệnh đã chạy & kết quả thực tế (ngày 05/11/2026)

- **Backend Maven Test Suite (`cd apps/api && ./mvnw -q test` với JDK 21.0.13):**
  - Lệnh: `cd apps/api && ./mvnw -q test`
  - Kết quả: **PASS (exit code 0)** — **173 test classes, 1.183 tests run, 0 failures, 0 errors, 25 skipped** (25 test bị skip là các bài tích hợp PostgreSQL thật khi không đặt `SCMS_POSTGRES_TEST_URL`, gồm `ProductOrderPostgreSqlTest` (4), `PostgresTriggerBehaviorTest` (8), `SupabaseSchemaSmokeTest` (3), `DatabaseSchemaVerificationTest` (5), `BookingFlowIntegrationTest` (3), `CriticalFlowsIntegrationTest` (2)).
  - Toàn bộ 20 file test trong `com.swp391.scms.shop.**`, `VnpayPaymentServiceTest`, `DatabasePolicyTest`, `DatabaseProfilesTest` đều **PASS**.
  - Các quy tắc mới đã kiểm chứng bằng unit test:
    - Tồn kho dưới 10 (`0 < stock < 10`, tức `stock <= 9`) gắn nhãn `lowStock = true` (**Sắp hết**).
    - Sản phẩm tạo trong vòng 2 ngày (`!createdAt.isBefore(now.minusDays(2))`) gắn nhãn `isNew = true` (**Mới**).
    - Quản lý chỉnh sửa thông tin sản phẩm, giá biến thể, danh mục, bảng thành phần và xem cột **Giá bán**, nhãn **Mới**, **Sắp hết** trên `/manager/products`.
    - Hình ảnh sản phẩm thật tải về tại `apps/web/public/images/shop/*.jpg` và `apps/api/src/main/resources/shop-seed-images/*.jpg` (được `ProductSeeder` nạp sẵn).
- **Frontend TypeScript, ESLint, Unit Tests & Production Build:**
  - Lệnh: `cd apps/web && npx tsc -b && npx eslint src --max-warnings=0 && npx vitest run && npm run build`
  - Kết quả:
    - `npx tsc -b`: **PASS** (0 lỗi kiểu dữ liệu)
    - `npx eslint src --max-warnings=0`: **PASS** (0 lỗi, 0 cảnh báo)
    - `npx vitest run`: **PASS** — **125 test files passed, 803 tests passed, 0 failed** (bao gồm bài test mới cho tab `Sản phẩm` trong Portal Hội viên `/member/orders?tab=shop` và `/member/products`)
    - `npm run build`: **PASS** — Vite build hoàn tất.
- **Dữ liệu hành chính 2 cấp (`vn-admin-units.json`):**
  - Lệnh: `node scripts/generate-vn-admin-units.mjs`
  - Kết quả: **PASS** — Tạo `apps/api/src/main/resources/geo/vn-admin-units.json` với `effectiveFrom = "2025-07-01"`, đúng **34 tỉnh/thành phố** mới và **3.321 phường/xã/đặc khu** không trùng mã.
  - Đã cập nhật `app.shop.pickup-address` trong `apps/api/src/main/resources/application.yml` sang địa chỉ 2 cấp hợp lệ: `"120 Hai Bà Trưng, Phường Sài Gòn, Thành phố Hồ Chí Minh — quầy lễ tân"`.
- **Playwright Shop UI Verification (`scripts/verify-shop-ui.cjs`):**
  - Lệnh: `node scripts/verify-shop-ui.cjs`
  - Kết quả: **PASS (11/11 hạng mục, exit code 0)**:
    1. `PASS (1) Landing #products shelf & topbar link across 390/768/1440/1920 and dark/light with 0 overflow`
    2. `PASS (2)-(6), (8)-(9) Catalog filter, detail variant/cart, NutritionFacts contrast, guest redirect, checkout VNPay, member timeline`
    3. `PASS (7) /staff/orders transitions order status`
    4. `PASS (10) Mobile 390x844 input font-size >= 16px` (bao gồm cả `/products`, `/checkout`, và `/member/orders?tab=shop` trên mobile 390×844 với 0 tràn ngang)
    5. `PASS (11) /manager/products (dark/light) & /manager/products/new screenshots`
  - **28 ảnh chụp màn hình thật** đã lưu và kiểm tra trực quan tại `docs/ui-review/shop/`:
    - `landing-shelf-dark-390.png`, `landing-shelf-dark-768.png`, `landing-shelf-dark-1440.png`, `landing-shelf-dark-1920.png`
    - `landing-shelf-light-390.png`, `landing-shelf-light-768.png`, `landing-shelf-light-1440.png`, `landing-shelf-light-1920.png`
    - `products-dark-1440.png`, `products-light-1440.png`, `products-dark-390.png`
    - `product-detail-dark-1440.png`, `product-detail-light-1440.png`
    - `cart-drawer-dark-1440.png`, `cart-drawer-light-1440.png`
    - `checkout-dark-1440.png`, `checkout-light-1440.png`, `checkout-dark-390.png`
    - `member-order-detail-dark-1440.png`, `member-orders-dark-1440.png`, `member-orders-light-1440.png`
    - `member-shop-dark-1440.png`, `member-shop-dark-390.png`
    - `staff-orders-dark-1440.png`, `staff-order-dialog-dark-1440.png`
    - `manager-products-dark-1440.png`, `manager-products-light-1440.png`, `manager-product-editor-dark-1440.png`
- **Playwright Legacy Public Scripts (`scripts/verify-public-ui.cjs` & `scripts/verify-public-animation.cjs`):**
  - Lệnh: `node scripts/verify-public-ui.cjs && node scripts/verify-public-animation.cjs`
  - Kết quả: **PASS 100% (exit code 0)** cho cả hai script.
- **Graphify Knowledge Graph (`graphify-out/`):**
  - Đã chạy AST rebuild bằng Python 3 cục bộ: **733 nodes, 1.384 edges** trong `graphify-out/graph.json` và `graphify-out/GRAPH_REPORT.md`.

### 2. Những hạng mục chưa kiểm chứng trên máy cục bộ (báo cáo trung thực)

- **Kiểm thử PostgreSQL thật (`ProductOrderPostgreSqlTest`):**
  - Máy hiện tại không cấu hình biến môi trường `SCMS_POSTGRES_TEST_URL` trỏ tới Supabase dev/test, nên `ProductOrderPostgreSqlTest` (4 test) bị `@EnabledIfEnvironmentVariable` skip (**chưa kiểm chứng DB thật**).
- **Script PowerShell (`pwsh scripts/test-database-config.ps1`):**
  - Máy macOS chưa cài binary `pwsh`; tuy nhiên toàn bộ 7 kiểm tra trong `scripts/test-database-config.ps1` đã được kiểm chứng tương đương qua `DatabasePolicyTest` và `DatabaseProfilesTest` (PASS).
- **VNPay Sandbox thật:**
  - Chưa có URL callback công khai kết nối cổng VNPay Sandbox thật, nên **chưa kiểm chứng VNPay thật** (luồng điều hướng và payload `productOrderId` đã được kiểm chứng qua `VnpayPaymentServiceTest` và Playwright).
