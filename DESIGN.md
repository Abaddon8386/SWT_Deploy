# Quy chuẩn thiết kế chính — SÖL

Cập nhật: **22/10/2026**, theo các quyết định trực tiếp của người dùng trong lần làm lại UI công khai. Đây là nguồn quy chuẩn UI hiện hành cho contributor và coding agent. Đọc cùng [AGENTS.md](AGENTS.md) trước khi thiết kế hoặc sửa frontend.

## Phạm vi

Member Classes — SCRUM-88 (31/10/2026): card còn chỗ dùng nút `+` tròn 52px để đặt chỗ qua API hiện có, có nhãn truy cập theo tên lớp; không tạo lớp mới. Danh sách lọc trước rồi hiển thị theo nhóm 6 buổi bằng “Xem thêm”, reset khi đổi bộ môn/ngày/tuần. Giữ skeleton, waitlist và xác nhận hủy. Khi lịch cá nhân chưa tải được, báo lỗi/thử lại và tạm khóa thao tác đặt chỗ; không hiển thị trạng thái rỗng hoặc badge chưa xác minh. Dùng token portal Light/Dark và cuộn native.

Support — SCRUM-128 (31/10/2026): giữ popup tạo ticket, native `Modal`, Escape/focus, draft riêng và bảo vệ response cũ của giai đoạn 1. Giai đoạn 2 dùng chung transport private Broadcast của Direct Messages nhưng có JWT giới hạn theo ticket và inbox nhân viên; sự kiện chỉ kích hoạt tải lại API đã xác thực. `/staff/support` là hộp thư lễ tân/quản lý, tách khỏi POS và `/messages`. Hiển thị trạng thái kết nối/kết nối lại, gửi/đã gửi/lỗi; không tự retry POST. Light/Dark dùng token portal, mobile cuộn native. Reconnect tải bù lịch sử và trạng thái từ API; khi chưa cấu hình realtime vẫn có làm mới thủ công. Code không đồng nghĩa đã kiểm chứng Supabase E2E; schema, trigger và RLS cần được review/triển khai trong môi trường được cấp quyền.

Hiệu năng tải trang (29/10/2026): tải module theo route, có trạng thái tải và lỗi theo theme sáng/tối charcoal–salmon. PWA cache sẵn shell, dependency khởi động và CSS; module của trang đã truy cập được cache khi tải thành công. Trang chưa mở cần mạng cho lần tải đầu. Giữ nguyên phân quyền, tổ chức portal, thứ tự nội dung và thao tác chủ động cập nhật PWA; API và dữ liệu xác thực tiếp tục nằm ngoài cache.

Portal PWA Android/iOS (29/10/2026, người dùng đã duyệt): cài lên màn hình chính và mở thẳng `/portal`, chuyển đúng role sau xác thực. Desktop giữ sidebar icon, dashboard và tổ chức nội dung hiện hành. Mobile <=767px có thanh điều hướng dưới gồm ba tác vụ theo role và “Thêm”: Member Tổng quan/Lịch học/Quét QR; Staff Lễ tân/Lớp học/Check-in; Coach Lịch dạy/Điểm danh/Giáo án; Manager Lễ tân/Báo cáo/Tài khoản. “Thêm” mở toàn bộ màn hình được phép, hồ sơ và đăng xuất. Chừa safe-area cho iOS và khoảng đáy cho nội dung/chatbot, vùng chạm tối thiểu 44px, input mobile 16px. Dialog giữ focus/Escape và cuộn được khi bàn phím mở; bảng chỉ cuộn trong vùng riêng. Giữ theme sáng/tối, charcoal–salmon, thứ tự card và cuộn native.

Member dùng `/member/check-in` để bật camera và quét QR cổng hiển thị tại màn hình lễ tân. Tại `/staff/reception`, hiển thị sẵn QR cổng A1 (sảnh chính) ngay dưới tiêu đề, trước phần tra cứu; không cần chọn hội viên. Tái sử dụng `GateQrPanel` của `/staff/check-in`, nơi staff vẫn chọn được cổng. Camera chỉ mở khi người dùng bấm, ưu tiên camera sau; dừng khi đọc được mã, rời trang hoặc ẩn app. QR cổng có chữ ký và thời hạn ngắn, ẩn khi hết hạn; kết quả check-in phải do API xác nhận. Giữ thẻ hội viên và luồng staff quét thẻ hiện có. UI có trạng thái xin quyền/từ chối quyền/không có camera/mất mạng/thử lại/thành công/từ chối. PWA hướng dẫn cài phù hợp Android/iOS, báo offline và cho người dùng chủ động cập nhật; không cache API hoặc đưa check-in vào hàng chờ offline. Xem [đặc tả PWA](docs/superpowers/specs/2026-10-29-portal-pwa-design.md).

Chat riêng (29/10/2026 — mở rộng SCRUM-106/SCRUM-128): `/messages` cho Member, Receptionist và Coach. Inbox bên trái, hội thoại bên phải trong portal hiện hành; mobile chuyển giữa danh sách và hội thoại bằng nút quay lại, giữ cuộn native. Dùng token Light/Dark và charcoal–salmon; bubble người gửi salmon với chữ charcoal, nội dung text thuần. Hiển thị trạng thái kết nối cập nhật tin nhắn, không suy đoán trạng thái online của người nhận. Không tự cuộn khi đang đọc tin cũ; tải thêm giữ vị trí. Gửi lỗi giữ bản nháp theo hội thoại và cho retry; chỉ hai người tham gia được đọc/gửi qua API.

Member Packages — SCRUM-86 (29/10/2026, quyết định mới nhất): giữ nguyên phong cách, bố cục, token Light/Dark, thẻ và popup của contributor. Giá ba gói thấp → cao là **299.000đ / 499.000đ / 999.000đ**, do catalog backend quản lý; FE chỉ hiển thị dữ liệu API, không ghi đè giá/thời hạn/quyền lợi. Thanh toán cập nhật qua **Supabase Realtime Broadcast**, không polling định kỳ: trigger sau thay đổi gửi tín hiệu không chứa dữ liệu tài chính vào kênh UUID của hội viên, FE đọc lại API đã xác thực. Đồng bộ bổ sung khi focus/online/quay lại tab. Nút mua/gia hạn/nâng cấp vẫn bấm được khi chưa đủ điều kiện nghiệp vụ, bấm mới mở popup giải thích; chỉ tạm disable lúc đang tải/gửi. Skeleton tĩnh. Native dialog giữ focus/Escape; chỉ báo thanh toán thành công từ API, phân biệt kích hoạt và kỳ tương lai. Xem [kiểm chứng cập nhật](docs/qa/SCRUM-86-realtime-prices.md).

| Khu vực | Quy chuẩn hiện hành | Nguồn triển khai |
| --- | --- | --- |
| Landing `/`, đăng nhập `/login`, đăng ký `/register`, OTP và trang công khai mới | **SÖL Fitness: charcoal–salmon, full width, animation xuất hiện từng component** | `features/landing/fitness-public.css`, `components/PublicLayout.tsx`, `components/FitnessLanding.tsx` |
| Portal `/portal`, `/member/*`, `/staff/*`, `/manager/*` | **Charcoal–salmon, full viewport; giữ nguyên tổ chức component** | `features/portal/portal-shell.css`, `features/member/member-board.css`, `shared/ui/portal.css` |

Theo yêu cầu mới nhất ngày 22/10/2026, portal đồng bộ màu với landing: nền than `#202020`, bề mặt `#292929` / `#303030`, chữ `#faf9f6`, chữ phụ `#bcb8b5`, nút chính và điểm nhấn salmon `#ce9180`, hover `#e1aa98`. Portal rộng `100%`, không max-width, không padding/viền/bo góc khung ngoài và cao tối thiểu `100dvh` trên desktop/mobile.

Giữ nguyên tổ chức component: dashboard bốn cột, sidebar icon, ảnh/thẻ, thứ tự nội dung, khoảng cách bên trong, cỡ chữ và hiệu ứng. Không đổi sang dashboard hai cột hay sidebar có nhãn thường trực. “Full trang” áp dụng cho khung ngoài; giữ cuộn dọc native, không fixed toàn bộ nội dung hoặc khóa cuộn.

Nội dung portal được rút gọn theo tác vụ; không dùng khẩu hiệu, quyền lợi gói tự suy đoán, độ tin cậy AI giả hoặc phản hồi “đã lưu” khi chỉ là dữ liệu minh họa tại máy. Thay câu chữ không đồng nghĩa với thay vị trí hay loại bỏ component.

## Nhận diện và màu

### Chế độ sáng tùy chọn — 23/10/2026

Trang công khai, auth và portal có nút chuyển sáng/tối trên header, dùng chung lựa chọn lưu tại `localStorage.scms_theme` và `html[data-theme]`. Mặc định là sáng (cập nhật 23/10/2026); chỉ dùng tối khi người dùng đã lưu lựa chọn `dark`. Khi không đọc được localStorage, vẫn dùng sáng. Tải lại hoặc chuyển trang giữ lựa chọn. Chế độ sáng dùng nền `#F5F5F3`, card trắng `#FFFFFF`, bề mặt phụ `#EEEFEC`, chữ `#202020`, chữ phụ `#68645F`, viền `#E4E2DE`. Nút chính vẫn salmon `#CE9180` với chữ charcoal; điểm nhấn dạng chữ dùng salmon đậm `#A35B49` để đọc rõ trên nền sáng. Ảnh có overlay tối giữ caption sáng. Không đổi font, bố cục, animation hoặc biến theme sáng thành phong cách serif/Quiet Luxury. CSS bổ sung nằm tại `shared/ui/theme.css`.

Giữ thương hiệu **SÖL**; wordmark công khai là **SÖL Fitness**. Ảnh tham chiếu ban đầu dùng nhãn khác, nhưng không đổi tên sản phẩm để khớp ảnh.

| Token / vai trò | Giá trị | Cách dùng |
| --- | --- | --- |
| `--fit-ink` | `#202020` | Nền chính, nền trang và track scrollbar |
| `--fit-salmon` | `#ce9180` | Thẻ dịch vụ, gói nổi bật, CTA, mũi tên, điểm nhấn và thumb scrollbar |
| `--fit-paper` | `#faf9f6` | Chữ chính trên nền tối, nút trắng |
| `--fit-muted` | `#bcb8b5` | Mô tả và thông tin phụ trên nền tối |
| `--color-bg-card` trong `.fit-site` | `#292929` | Bề mặt tối dùng chung |
| Bề mặt form / gói thường | `#2b2b2b` / `#303030` | Phân lớp với nền chính |
| Salmon hover | `#e1aa98` | Phản hồi nhẹ trên nút |

Dùng cùng bảng màu trong `fitness-public.css` và token `--portal-*` của `portal-shell.css`. Token dùng chung như `--color-text-main` được ghi đè trong phạm vi `.fit-site` hoặc `.portal-v2`. Màu trạng thái thành công/lỗi phục vụ nghĩa của thông báo; không dùng chúng làm một theme mới.

## Bố cục

- Trang công khai phủ kín chiều rộng viewport: `.fit-site` không có padding ngoài, `.fit-canvas` rộng `100%` và cao tối thiểu `100dvh`.
- Không thêm lại viền salmon quanh website, bóng đổ khung mockup hoặc giới hạn canvas `1500px`. Hai tấm website đặt chồng trong ảnh nguồn là cách trình bày tham chiếu, không phải layout ứng dụng.
- Vẫn giữ khoảng đệm **bên trong** từng section. `.fit-section` có chiều rộng `83%`, max-width `1160px`; cụm dịch vụ max-width `1000px`. Full width không có nghĩa là ép chữ và form sát mép màn hình.
- Header, hero, CTA cuối và footer chạy trên bề mặt toàn trang. Mobile dùng menu thu gọn, nội dung xếp dọc; các card không được gây cuộn ngang.
- Dùng cuộn dọc native của document. Thumb salmon trên track than cho `.fit-site` và `.portal-backdrop`.
- Breakpoint hiện có: `760px` và `1100px`. Kiểm chứng thêm màn hình rộng `1920px` và `2560px`, không chỉ mobile và 1440px.

## Chữ và component

Typography landing (23/10/2026, thử theo ảnh “Bạn nhận được gì khi có gói”): dùng cùng họ **Plus Jakarta Sans** cho toàn bộ landing. Tiêu đề H1/H2 đồng bộ kiểu mục Quyền lợi thành viên: đậm `900`, in hoa, tracking `-.035em`; H3–H6 đậm `800`, tracking `-.025em`, giữ cách viết thường/hoa của nội dung. Menu và CTA đậm `700`, tracking nhẹ `-.015em`; kicker in hoa, đậm `700`, tracking `.14em`. Nội dung mô tả dùng độ đậm đọc được, không áp dụng kiểu chữ display đậm/in hoa cho cả đoạn văn. Chỉ áp dụng qua `.fit-site--landing` tại `/`; auth, trang bộ môn/HLV và portal giữ typography hiện hành. Bảng màu, bố cục và animation giữ nguyên; kiểm tra lại xuống dòng tiếng Việt và bố cục bộ môn sau thay đổi chữ.

Bộ môn theo cuộn (26/10/2026, quyết định mới nhất): thay toàn bộ stack tại `#multisport` bằng bố cục kể chuyện của mục “Cách hoạt động” trên sports-center-management.vercel.app (hai ảnh tham chiếu bước 01 và 05). Tiêu đề và hướng dẫn nằm trên, căn trái. Desktop trên 1024px có hai cột tỷ lệ 1:1.15, gap 72px: nội dung đánh số 01–04 cuộn tự nhiên bên trái, rail dọc có mốc di chuyển; khung ảnh salmon bên phải sticky dưới header. Không ghim tiêu đề, không co deck, không xoay/chồng thẻ. Giữ bốn bộ môn, ảnh và CTA lịch học; nội dung rút gọn theo quy định câu chữ bên dưới; tiếp tục Plus Jakarta Sans, theme sáng/tối và nhận diện SÖL.

Câu chữ bộ môn (26/10/2026, cập nhật mới nhất): tiêu đề “Các bộ môn”; mỗi môn chỉ có tên, một câu giới thiệu ngắn, ba ý tập luyện và nút “Xem lịch học”. Bỏ khẩu hiệu, nhãn tiếng Anh lặp tên môn, nhóm từ khóa, đoạn “Dành cho” và ghi chú portal. Không mô tả thêm dưới từng ý tập luyện hoặc tự thêm quyền lợi. Giữ nguyên bố cục hai cột, ảnh và animation.

Cỡ chữ bộ môn (26/10/2026, cập nhật theo trang gốc): riêng `#multisport` dùng H2 `clamp(38px, 5.4vw, 74px)`, đậm 800, line-height 1, tracking −.005em; nhãn đầu mục 15px/600, line-height 1.5, tracking .12em; số thứ tự 64px/800 trên cả desktop/mobile, tracking normal; tên môn `clamp(28px, 3vw, 40px)`/700, line-height 1.08, tracking normal; mô tả 17px/400, line-height 1.6; gạch đầu dòng 15px/500, line-height 1.5, gap 8px; hướng dẫn cuộn 18px/400, line-height 1.55; CTA 14px/600, line-height 1.5. Đây là ngoại lệ typography cục bộ theo yêu cầu mới nhất; giữ font Plus Jakarta Sans, nội dung ngắn, theme và animation.

Dấu tiếng Việt trong tiêu đề (26/10/2026): khung `.fit-word` của SplitHeading phải chừa phần dấu phía trên và dưới bằng padding .18em/.16em, bù bằng margin âm tương ứng để giữ nhịp dòng. Giữ overflow hidden cho reveal; không để khung line-height 1 cắt dấu khi dùng chữ lớn. Kiểm tra cả animation bật và reduced motion, không giảm cỡ chữ để né lỗi.

Chuyển cảnh bộ môn (26/10/2026): bước đi qua dải giữa viewport (45%–55%) được chọn, hỗ trợ cả cuộn xuống, cuộn ngược, kéo scrollbar và focus bàn phím. Bước chưa chọn opacity 0.3; số dịch trái 6px và opacity 0.35; đổi trong 500ms. Rail đổi vị trí trong 600ms. Hình cũ thoát trước: opacity 1→0, y 0→−30px, scale 1→0.98, blur 0→6px trong 500ms; hình mới vào sau: opacity 0→1, y 40→0px, scale 0.96→1, blur 8→0px trong 500ms. Cuộn nhanh lấy bước mới nhất, hủy timer cũ. Có bốn vạch chỉ báo theo bộ môn. Không bắt wheel/touch/keyboard, không tạo vùng cuộn bên trong.

Responsive bộ môn (26/10/2026): từ 1024px trở xuống bỏ rail và khung sticky, mỗi bộ môn có ảnh ngay dưới nội dung; không thu nhỏ chữ hoặc cắt nội dung để vừa viewport. Reduced motion (kể cả thay đổi khi trang đang mở) dùng cùng danh sách tĩnh đủ ảnh, nội dung và CTA, không opacity mờ/animation/sticky. Không có IntersectionObserver vẫn đọc được toàn bộ nội dung và ảnh. Kiểm chứng bằng `scripts/verify-sport-story.cjs`; các script tên sport-stack được giữ làm lệnh tương thích cho kiểm chứng mới.

- Bộ môn landing là ngoại lệ sticky cục bộ cho khung ảnh; các section khác tiếp tục reveal component hiện hành. Không tự suy đoán lịch, giá, số sân hoặc quyền lợi.
- Thẻ “Kỳ đã thanh toán tiếp theo” trong portal (23/10/2026): hiển thị danh sách hàng phẳng, ngăn cách bằng đường kẻ mảnh; tên gói đi cùng icon lịch salmon, ngày bắt đầu/kết thúc có nhãn riêng và chữ sáng trên nền than. Header có số kỳ; mobile đưa hai mốc ngày xuống dưới tên gói. Dùng `.membership-periods`, không xếp các kỳ thành đoạn `.row-card__meta` rời rạc hoặc thêm thẻ lồng nhau.
- Card portal (23/10/2026): giữ bề mặt charcoal, bo góc và cỡ chữ hiện hành. Card trong `.stack` dùng `gap` của danh sách, không cộng thêm margin dưới mỗi card. Meta có nhiều trường dùng `.row-card__meta--inline`, từng trường trong `span` riêng để wrap theo cụm; ngày/phòng/HLV có thể dùng `PortalIcon` salmon, giờ học nhấn bằng `strong`. Giữ meta mô tả dài ở dạng văn bản thường; không áp dụng flex cho mọi `.row-card__meta`.
- Topbar công khai (23/10/2026): menu `15px`, đậm `600`; CTA `14px`; wordmark header `26px` (mobile `24px`). Dùng menu thu gọn từ `1100px` trở xuống để chữ lớn không chen chúc; giữ font Plus Jakarta Sans và màu charcoal–salmon.
- Font công khai: **Plus Jakarta Sans**, sans-serif. Tiêu đề đậm, hình học; hero dùng chữ in hoa tách hai vế trên desktop, xuống dòng trên mobile.
- Không phục hồi Cormorant/Playfair, chữ serif nghiêng hoặc nền kem như phong cách chính của phần công khai. Các font và token cũ có thể còn tồn tại để phục vụ mã lịch sử hoặc phạm vi khác.
- Nút chính có dạng pill, thường đi cùng mũi tên nằm trong vòng tròn salmon. Header dùng phiên bản nhỏ hơn; trạng thái hover/pressed và focus phải rõ.
- Bản đồ nhóm cơ tương tác tại Hero (`.fit-hero-anatomy-stage`, `svg.fit-hero-anatomy`, `.fit-muscle-pointer` và `aside.fit-muscle-callout`): đặt khớp trực tiếp trên ảnh vận động viên tách nền (`viewBox="0 0 1024 1536"`), phân biệt 6 vùng cơ chính (`Cơ ngực`, `Vai & Cầu vai`, `Bắp tay`, `Bụng & Core`, `Cẳng tay`, `Đùi & Bắp chân`). Mặc định ẩn hoàn toàn khung chọn và mũi tên để không gây rối mắt; chỉ khi người dùng di chuột hoặc focus vào từng vùng cơ, vùng cơ đó mới sáng lên qua lớp mask mờ (`#fit-active-muscle-mask`) đồng thời vẽ đường mũi tên mảnh (`.fit-muscle-pointer`) chỉ ra thẻ gợi ý luyện tập cơ bản (`.fit-muscle-callout`) và nút CTA (`Xem chi tiết & Mua gói tập`) điều hướng khách sang `/login` (hoặc `/member/packages` khi đã đăng nhập hội viên).
- Thẻ dịch vụ: ba silhouette bo góc lớn, thu ở đáy; thẻ giữa rộng/cao hơn, mép trên hai thẻ ngoài xiên, **chữ giữ ngang**. Icon SVG có màu kem/hồng và nét nâu; tiêu đề trắng, đường kẻ mảnh, mô tả căn giữa.
- Chỉ số câu lạc bộ (`.fit-metrics`): bốn thẻ tối `#292929` bo góc `26px`, kicker salmon, con số đậm `tabular-nums` và mô tả ngắn.
- Câu chuyện: ảnh tối, overlay ở chân ảnh, tên/sao và phần trích dẫn ngắn. Trainer: portrait bo lớn, kích thước lệch nhẹ, gradient salmon ở đáy.
- Lịch lớp tiêu biểu (`#schedule`): switch lọc bộ môn cùng kiểu `.fit-pricing-switch`, lưới 3 cột (`.fit-schedule-card` nền `#2b2b2b`), hiển thị khung giờ salmon, badge chỗ trống, tên lớp, phòng tập/HLV và link đặt lịch.
- Hành trình tuần đầu & Tính nhanh BMI (`#journey`): bố cục 2 cột gồm 3 bước onboarding có badge tròn salmon (`01`–`03`) bên trái và thẻ tính nhanh BMI + gợi ý lộ trình (`.fit-bmi-card`) bên phải.
- Pricing: thẻ thường tối, thẻ nổi bật salmon; nhãn thời hạn trắng, giá đậm, checklist và CTA ở cuối. Form: bề mặt tối, input tối, nút salmon, thông báo lỗi rõ.
- Câu hỏi thường gặp (`#faq`): danh sách accordion tối (`.fit-faq-item`), nút mở/đóng tròn (`+` / `−`) chuyển sang nền salmon khi mở.
- Dùng lại `PublicLayout`, `AuthLayout`, `RoundArrow` và các class `.fit-*`. Giữ page ở vai trò compose feature. Không thay stack hoặc thêm thư viện animation/UI chỉ để thực hiện các hiệu ứng đã có bằng CSS.

## Luồng mua gói và xác thực — 26/10/2026

- Hiệu năng xác thực (29/10/2026): khi API xác nhận đăng nhập thường/Google hoặc OTP thành công, điều hướng ngay tới trang đúng role/bước đăng nhập tiếp theo. Giữ ý định mua gói và view transition hiện có; animation không được thêm thời gian chờ trước điều hướng.
- Gói đã chọn ở landing được giữ qua đăng ký, OTP, đăng nhập thường/Google và đăng nhập lại khi hết phiên. Sau xác thực, hội viên quay về danh mục và thấy gói được đánh dấu; không tự tạo yêu cầu mua. Đường quay lại chỉ cho phép trang gói hội viên và ID gói hợp lệ, không mở redirect ra ngoài hoặc sang màn hình của vai trò khác.
- Form auth dùng Zod để kiểm tra và chuẩn hóa dữ liệu: trim tên đăng nhập/email, bỏ khoảng trắng định dạng số điện thoại, giữ nguyên mật khẩu. Lỗi có nội dung ngay cạnh trường, liên kết trợ năng và focus trường lỗi đầu tiên. Nút auth giữ chữ charcoal cả khi hover ở hai theme.
- Khi tài khoản đã tạo, lỗi gửi OTP hoặc refresh tiếp tục ở bước xác thực; gửi lại mã không đăng ký tài khoản lần nữa. Browser chỉ lưu username, email và mốc thời gian phục hồi trong sessionStorage, không lưu mật khẩu/OTP. Thông tin tài khoản pending hiển thị rõ thay vì giả vờ chỉnh sửa tài khoản đã tạo; có lựa chọn bắt đầu tài khoản khác nếu email nhập sai, giải thích rằng tài khoản cũ vẫn còn trên hệ thống.
- Các hộp thoại mua, hủy và bảo lưu gói dùng `Modal` native `<dialog>`, giới hạn chiều cao theo viewport và cho cuộn nội dung. Không chồng hộp thoại kết quả và xác nhận hủy. Lỗi thao tác hiển thị trong hộp thoại đang mở; khóa đóng khi đang gửi. Tab/Shift+Tab ở trong hộp thoại, Escape đóng khi có thể, và focus trở về vùng yêu cầu/danh mục hợp lý nếu nút mở đã bị vô hiệu hóa.
- Giữ thanh toán tại quầy và thông báo yêu cầu chờ xác nhận; kiểm thử thao tác ghi dùng dữ liệu giả lập. Không thêm payment gateway thật trong phạm vi sửa UX này.

## Chuyển động đã chốt

Hiệu năng bộ môn (26/10/2026): dùng IntersectionObserver chọn bước, CSS cho chuyển cảnh, không có vòng lặp scroll cập nhật React hoặc geometry mỗi frame. Chỉ đo header khi resize, dọn observer/timer khi unmount. Blur giới hạn trong khung ảnh của một chuyển cảnh, không áp dụng toàn trang. Giữ thanh tiến độ landing và hook reveal hiện hành. Kết quả headless không bảo đảm FPS trên mọi thiết bị.

**Quyết định mới nhất: tập trung vào animation xuất hiện của component, lặp lại khi cuộn xuống và cuộn ngược lên; không làm slide trang ngang–dọc.**

| Thành phần | Hiệu ứng hiện hành |
| --- | --- |
| Hero | Hai vế tiêu đề vào lệch nhịp; ảnh vận động viên & bản đồ cơ bắp fade + nâng nhẹ + scale; mô tả, CTA và thẻ gợi ý vùng cơ xuất hiện sau |
| Tiêu đề section / nội dung ngắn | Fade + nâng khoảng 20px |
| Dịch vụ / chỉ số CLB / đánh giá / HLV / lịch lớp / bước tham gia / gói / FAQ | Fade + nâng khoảng 34px; stagger từng thẻ 100ms, tối đa 300ms; danh sách dài chia nhịp theo nhóm ba thẻ |
| Ảnh không gian tập | Reveal với scale nhẹ; fade khi đổi ảnh |
| Đổi nhóm HLV / lọc gói / lọc lịch lớp | Fade ngắn cho nội dung vừa đổi; thẻ mới được đăng ký reveal tự động |
| BMI / mở FAQ | BMI reveal cùng nhóm hành trình, phản hồi nhẹ khi chọn mục tiêu; câu trả lời FAQ fade + nâng trong 320ms mỗi lần mở |
| Hover | Nâng nhẹ card/nút, ảnh HLV scale tối đa khoảng 1.04 |
| Đăng nhập / đăng ký | Phần nội dung và form xuất hiện lệch nhịp; vẫn nhập liệu được bình thường |

Triển khai bằng CSS keyframes/transitions và [useComponentReveal](apps/web/src/features/landing/hooks/useComponentReveal.ts). Đánh dấu mục cần reveal bằng `data-reveal="soft"`, `"lift"` hoặc `"image"`, kể cả component mới. Hook dùng IntersectionObserver: component được chuẩn bị lại khi đã rời hoàn toàn viewport và phát lại hiệu ứng mỗi lần quay vào, ở cả hai chiều cuộn. Cuộn xuống dùng nâng nhẹ từ dưới; cuộn ngược lên dùng hạ nhẹ từ trên. Component còn thấy một phần trên màn hình vẫn giữ trạng thái hiển thị để tránh nhấp nháy. MutationObserver đăng ký các component mới khi đổi bộ lọc hoặc carousel và dọn observer của các thẻ đã bị gỡ.

Các nguyên tắc bắt buộc:

- Không pin cả màn hình, không tạo horizontal scroll track, không chiếm sự kiện wheel/touch/keyboard để đổi trang. Không phục hồi `FullpageScrollManager` hoặc `useSlideController` chỉ vì chúng còn trong repository.
- Không khóa cuộn trong lúc chờ animation. Menu anchor, kéo scrollbar, focus bàn phím, form, gallery và carousel phải hoạt động tự nhiên.
- Không ẩn nội dung nếu không có IntersectionObserver. Focus vào một component phải làm nội dung nhìn thấy ngay.
- Tôn trọng `prefers-reduced-motion`, kể cả khi người dùng đổi cài đặt lúc trang đang mở: nội dung hiện đầy đủ, không còn keyframe/transition tạo chuyển động.
- Ưu tiên opacity, translate và scale; tránh animation làm thay đổi kích thước, reflow hoặc tăng chiều rộng document.
- Thời lượng hiện có: hover 180–220ms; fade khi đổi nội dung 450–650ms; reveal 700–900ms; hero tối đa 1100ms. Không thêm lặp vô hạn hoặc chuyển động lớn vào mọi phần tử.

## Ảnh và nội dung

Ảnh hiện hành nằm tại `apps/web/public/images/fitness/`; dùng lại ảnh studio có sẵn khi phù hợp. Ảnh hero được tách nền, ảnh HLV cùng ánh sáng. Giữ tỷ lệ và crop có chủ đích; dùng lazy loading cho ảnh dưới hero.

Ảnh/câu chuyện minh họa phải tiếp tục được nhận diện là minh họa. Không biến sao đánh giá hoặc hình stock thành nhận xét/HLV thật. Khi HLV chưa có ảnh đại diện, dùng ảnh minh họa theo bộ môn và hiển thị nhãn “Ảnh minh họa”.

Đồng bộ landing–portal (23/10/2026): bảng giá, thời hạn, mô tả/quyền lợi gói tập, lịch lớp và HLV công khai lấy từ `GET /api/v1/public/catalog`, dùng cùng Entity với portal. Chỉ công khai gói active, HLV active có tài khoản active chưa xóa và buổi học scheduled còn trong tương lai trong 7 ngày tới. Không lấy giá, tên HLV hay lịch cố định từ dữ liệu minh họa; không suy đoán quyền vào hồ bơi/Tennis từ thời hạn gói. Dùng chung `membershipPresentation.ts` để định dạng tiền/quyền lợi với portal. Tải lại khi quay về tab và mỗi 60 giây; khi lỗi phải ẩn giá/lịch cũ, hiện thông báo và nút thử lại. Trang HLV dùng ID thực tế; ảnh bộ môn mới dùng chung qua `coachIllustration.ts`.

## Nguồn hiện hành và nguồn lịch sử

Thứ tự tra cứu khi làm UI: yêu cầu mới nhất của người dùng → `AGENTS.md` và tài liệu này → component/CSS đang được route sử dụng → ảnh chụp kiểm chứng mới.

- [Báo cáo và ảnh hiện hành](docs/ui-review/fitness-reference/README.md).
- [Hero hiện hành](docs/ui-review/fitness-reference/hero-desktop.png), [mobile](docs/ui-review/fitness-reference/hero-mobile.png), [login](docs/ui-review/fitness-reference/login-desktop.png).
- `docs/qa/portal-redesign-2026-10-18.md` và `docs/qa/portal-redesign/` là hồ sơ thiết kế trước đây. Phần portal còn là tham chiếu đúng phạm vi; hình landing/login cũ không còn là chuẩn công khai.
- `landing.css`, các section Quiet Luxury, `IntroCurtain`, `CustomCursor` và các controller slide cũ là mã lịch sử khi không còn được route hiện tại dùng. Không lấy sự tồn tại của chúng làm lý do quay về phong cách cũ.
- Knowledge graph và tài liệu sinh trước lần redesign có thể mô tả luồng cũ; kiểm tra lại route và tài liệu này trước khi áp dụng.

## Kiểm chứng trước khi hoàn tất UI

1. Chạy build/lint phù hợp và test frontend khi thay logic/hook.
2. Chạy `scripts/verify-public-ui.cjs`: full width, scrollbar, responsive, điều hướng và trạng thái form/OTP. Script dùng API giả lập cho auth.
3. Chạy `scripts/verify-public-animation.cjs`: animation bật, replay khi cuộn xuống và cuộn ngược, không reset component còn thấy một phần, đăng ký component mới sau khi lọc, nhập BMI, đóng/mở FAQ, nhập liệu, mobile và reduced motion.
4. Kiểm tra portal khi thay selector/token dùng chung: full viewport tại 390/768/1440/1920/2560px, màu nút, bảng, form và dialog; giữ nguyên dashboard/sidebar và không tràn document trên mobile. Dùng `scripts/verify-ux-consistency.cjs` với API giả lập.
5. Commit thay đổi UI và quy chuẩn theo phần, ghi rõ phần có thể hoàn tác. Cập nhật tài liệu này khi người dùng đổi quyết định thiết kế.
