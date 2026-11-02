# Hướng dẫn sửa lỗi hiệu năng production (2026-11-03)

Nguồn: audit tĩnh code trên nhánh `review-pr-81` (commit `5bbee838`) và `vite build`. Chưa đo trên production thật; mức độ là ước lượng từ code. Mỗi mục gồm: vị trí, vì sao chậm, cách sửa, cách kiểm chứng.

Thứ tự đề xuất: **PR 1 (mục 1–3, backend, cùng gốc giữ connection)** → **PR 2 (mục 4, ảnh)** → **PR 3 (mục 5–8, N+1)** → **PR 4 (mục 9–12, dọn nhẹ)**.

Bối cảnh chung: Hikari pool chỉ có **5** connection (`DB_POOL_MAX_SIZE:5` trong `application-supabase.yml`). Mọi thao tác giữ connection lâu đều làm cả API chờ `connection-timeout` 30 s.

---

## 🔴 PR 1 — Không giữ connection DB khi gọi dịch vụ ngoài

### 1. Gọi AI trong transaction

**Vị trí**

- `apps/api/.../ai/service/AiRecommendationService.java:34` — `@Transactional` cấp class, `aiClient.generate(...)` (read timeout 30 s) ở dòng 81 và 134.
- `apps/api/.../ai/service/AiChatService.java:118` (`sendQuickMessage`) và `:155` (`sendMessage`) — gọi provider (timeout 15 s) bên trong `@Transactional`.

**Cách sửa**: chia ba pha — đọc (transaction ngắn, read-only) → gọi AI (không transaction) → ghi (transaction ngắn).

1. Bỏ `@Transactional` cấp class ở `AiRecommendationService`; đặt annotation cho từng method chỉ thao tác DB.
2. Inject `TransactionTemplate` (Spring tự cung cấp bean khi có `PlatformTransactionManager`).
3. Chỉ truyền dữ liệu thuần (String, id, DTO) qua pha gọi AI — không truyền entity lazy ra ngoài transaction.

```java
public String generateRecommendation(Long memberId, String healthContext) {
    // Pha 1: đọc
    String membershipCode = readOnlyTx.execute(status -> memberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId))
            .getMembershipCode());

    // Pha 2: gọi AI, KHÔNG giữ connection
    String userMessage = "Tạo gợi ý bài tập cho hội viên " + membershipCode + ": " + healthContext;
    String response = aiClient.generate(SYSTEM_PROMPT, userMessage);

    // Pha 3: ghi
    writeTx.executeWithoutResult(status -> {
        AiRecommendationLog log = new AiRecommendationLog();
        log.setMember(memberRepository.getReferenceById(memberId));
        log.setInputContext(healthContext != null ? healthContext : "{}");
        log.setRecommendedContent(response);
        log.setModelName(aiClient.getModelName());
        log.setApplied(false);
        log.setCreatedAt(LocalDateTime.now(clock));
        recommendationLogRepository.save(log);
    });
    return response;
}
```

Khởi tạo template trong constructor:

```java
this.writeTx = new TransactionTemplate(txManager);
this.readOnlyTx = new TransactionTemplate(txManager);
this.readOnlyTx.setReadOnly(true);
```

Làm tương tự với `generateWorkoutPlan`, `AiChatService.sendQuickMessage` và `sendMessage`. Với chat: pha 1 kiểm tra quyền sở hữu session, lưu tin nhắn người dùng, dựng RAG context (`AiRagContextService.buildRagContext`) thành String; pha 2 gọi provider; pha 3 lưu tin trả lời.

**Lưu ý**

- Không gọi method `@Transactional` của cùng bean qua `this.` (proxy không áp dụng) — vì vậy dùng `TransactionTemplate`.
- Nếu pha 3 lỗi sau khi AI đã trả lời: chấp nhận mất log, hoặc retry; không rollback được lời gọi AI.
- Giữ nguyên message key i18n hiện có; nếu thêm lỗi mới phải thêm vào cả `messages_vi.properties` và `messages_en.properties`.

**Kiểm chứng**: unit test mock `AiClient` chặn 2 s và assert trong lúc đó `TransactionSynchronizationManager.isActualTransactionActive()` là `false`; hoặc chạy 10 request AI song song rồi gọi `/api/v1/health` — phải trả về ngay.

### 2. Gửi OTP qua SMTP trong transaction

**Vị trí**: `apps/api/.../auth/AuthService.java:360` `issueAndSendOtp` → `otpDeliveryPort.send` (`SmtpOtpDeliveryAdapter.java:47`, `mailSender.send` đồng bộ). Được gọi từ `requestGoogleOtp` và `authenticateGoogle` (đều `@Transactional`).

**Cách sửa** (chọn một):

- **A — gửi sau commit (khuyến nghị)**: trong transaction chỉ sinh OTP, rồi đăng ký gửi sau commit:

  ```java
  private String issueAndSendOtp(String normalizedTarget) {
      String code = otpService.generateOtp(normalizedTarget);
      if (!debugOtpEnabled) {
          runAfterCommit(() -> {
              try {
                  otpDeliveryPort.send(normalizedTarget, code);
              } catch (RuntimeException deliveryFailure) {
                  otpService.invalidate(normalizedTarget);
                  log.warn("OTP delivery failed for {}", maskEmail(normalizedTarget), deliveryFailure);
              }
          });
      }
      return code;
  }

  private void runAfterCommit(Runnable action) {
      if (TransactionSynchronizationManager.isSynchronizationActive()) {
          TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
              @Override public void afterCommit() { action.run(); }
          });
      } else {
          action.run();
      }
  }
  ```

  Đánh đổi: lỗi SMTP không còn trả về HTTP lỗi cho client. Nếu UX cần báo lỗi gửi mail, dùng phương án B.

- **B — giữ đồng bộ nhưng ngoài transaction**: tách controller gọi hai bước: `authService.prepareOtp(...)` (`@Transactional`) rồi `otpDeliveryPort.send(...)` (không transaction), invalidate OTP nếu gửi lỗi.

Đồng thời đặt timeout SMTP để không treo vô hạn (thêm vào `application.yml` dưới `spring.mail.properties`):

```yaml
      mail.smtp.connectiontimeout: 5000
      mail.smtp.timeout: 5000
      mail.smtp.writetimeout: 5000
```

**Kiểm chứng**: test hiện có của `AuthService` vẫn qua; thêm test với `OtpDeliveryPort` giả chậm/lỗi để xác nhận OTP bị invalidate và transaction không bị giữ.

### 3. Tắt Open Session In View

**Vị trí**: không có `spring.jpa.open-in-view` → mặc định `true`, mỗi request giữ connection đến hết serialize JSON.

**Cách sửa**: thêm vào `apps/api/src/main/resources/application.yml`:

```yaml
spring:
  jpa:
    open-in-view: false
```

**Rủi ro**: nơi nào map entity → DTO **ngoài** service transaction sẽ ném `LazyInitializationException`. Quy tắc dự án đã yêu cầu service trả DTO, nên số chỗ phải sửa dự kiến ít.

**Kiểm chứng**: `mvn test` toàn bộ, rồi bấm qua các màn hình chính của 4 role (member, coach, receptionist, manager) theo `docs/qa/role-flow-audit-2026-11-02`. Mọi lỗi lazy → chuyển phần mapping vào trong method `@Transactional(readOnly = true)` của service.

---

## 🔴 PR 2 — Ảnh landing

### 4. Ảnh LCP 2 MB và ảnh PNG nặng

**Vị trí**: `apps/web/src/features/landing/components/FitnessLanding.tsx:427` (`hero-athlete.png`, 2,0 MB, `fetchPriority="high"`) và preload ở dòng 448. Ngoài ra trong `apps/web/public/images`:

| Ảnh | Dung lượng |
|---|---|
| `fitness/badminton-court.png` | 2,5 MB |
| `fitness/basketball-court.png` | 2,0 MB |
| `fitness/coach-strength.png` | 2,0 MB |
| `fitness/hero-athlete.png` | 2,0 MB |
| `fitness/coach-movement.png` | 1,9 MB |
| `hero-options/*.jpg`, `about-*.jpg`, `yoga-*.jpg`, `fitness/*.jpg` | 0,3–1 MB mỗi ảnh |

**Cách sửa**

1. Xuất WebP (hoặc AVIF) ở 2 kích thước, mục tiêu ≤ 250 KB cho hero, ≤ 150 KB cho thẻ:

   ```bash
   npx sharp-cli -i public/images/fitness/hero-athlete.png -o public/images/fitness/hero-athlete-1600.webp resize 1600 -- webp --quality 72
   npx sharp-cli -i public/images/fitness/hero-athlete.png -o public/images/fitness/hero-athlete-800.webp resize 800 -- webp --quality 72
   ```

2. Dùng `srcset`/`sizes` trong `LoadingImage` (hoặc `<picture>`), và đổi `href` preload sang bản WebP với `imagesrcset` tương ứng.
3. Cập nhật đường dẫn trong `FitnessLanding.tsx` (danh sách coach dòng ~160) và `apps/web/src/shared/lib/coachIllustration.ts`.
4. Xóa `public/images/hero-options/*` nếu không còn được tham chiếu (`grep -rn "hero-options" apps/web/src`).
5. Không đổi bố cục hay màu — chỉ đổi định dạng ảnh, giữ đúng `DESIGN.md`.

**Kiểm chứng**: Lighthouse mobile cho `/` trước/sau, lưu JSON vào thư mục này (giống `sport-stack-performance-after.json`); mục tiêu LCP < 2,5 s.

---

## 🟠 PR 3 — N+1 và tải toàn bảng

### 5. Báo cáo sử dụng lớp học

**Vị trí**: `apps/api/.../reports/service/RevenueReportService.java:216` `getClassUtilization` — `gymClassRepository.findAll()`, rồi mỗi lớp tải toàn bộ enrollment (`countActiveEnrollments`) và attendance (`countPresentAttendances`, lazy-load `session` từng dòng) để đếm bằng stream.

**Cách sửa**: một query tổng hợp, lọc trong SQL. Thêm vào repository báo cáo (`reports/repository`):

```java
public interface ClassUtilizationRow {
    Long getClassId(); String getClassName(); Long getDisciplineId(); String getDisciplineName();
    Integer getCapacity(); Long getEnrolledCount(); Long getPresentCount();
}

@Query("""
    SELECT g.id AS classId, g.name AS className, d.id AS disciplineId, d.name AS disciplineName,
           g.capacity AS capacity,
           (SELECT COUNT(e) FROM ClassEnrollment e
             WHERE e.gymClass = g AND LOWER(e.status) IN ('booked','completed')
               AND (e.enrolledAt IS NULL OR (
                    (:start IS NULL OR e.enrolledAt >= :startTs) AND (:end IS NULL OR e.enrolledAt < :endTs)))) AS enrolledCount,
           (SELECT COUNT(a) FROM SessionAttendance a JOIN a.session s
             WHERE s.gymClass = g AND LOWER(a.status) IN ('present','late')
               AND (:start IS NULL OR s.sessionDate >= :start)
               AND (:end IS NULL OR s.sessionDate <= :end)) AS presentCount
    FROM GymClass g LEFT JOIN g.discipline d
    WHERE (:disciplineId IS NULL OR d.id = :disciplineId)
    ORDER BY g.id
    """)
List<ClassUtilizationRow> classUtilization(LocalDate start, LocalDate end,
        LocalDateTime startTs, LocalDateTime endTs, Long disciplineId);
```

Service chỉ còn tính phần trăm từ các row. Lưu ý giữ đúng ngữ nghĩa cũ: attendance không có `sessionDate` thì fallback `checkedInAt` — kiểm tra dữ liệu thật; nếu `sessionDate` luôn `NOT NULL` thì bỏ fallback.

**Kiểm chứng**: test hiện có của `RevenueReportService` phải cho kết quả giống hệt; bật `spring.jpa.show-sql` local để thấy còn 1 query.

### 6. `@OneToOne` mặc định EAGER ở bảng role

**Vị trí**: `users/entity/Member.java:15`, `Coach.java:15`, `Receptionist.java:15`, `CenterManager.java:15`.

**Cách sửa**

1. Đổi thành `@OneToOne(fetch = FetchType.LAZY)` (giữ `@MapsId`). Với `@MapsId`, khóa chính chính là `user_id` nên lazy hoạt động bình thường.
2. Những query cần user thì thêm `JOIN FETCH` hoặc `@EntityGraph(attributePaths = "user")`.
3. Sửa `ClassService.listActiveCoaches()` (`scheduling/service/ClassService.java:540`) để lọc trong DB thay vì `findAll()` rồi lọc Java:

   ```java
   @Query("""
       SELECT c FROM Coach c JOIN FETCH c.user u
       WHERE LOWER(c.employmentStatus) = 'active'
         AND u.deletedAt IS NULL AND LOWER(u.status) = 'active'
       """)
   List<Coach> findActiveWithUser();
   ```

**Kiểm chứng**: `mvn test`; vì có mục 3 (OSIV tắt) nên lỗi lazy sẽ lộ ngay trong test.

### 7. Danh sách yêu cầu hủy gói

**Vị trí**: `membership/service/MembershipCancellationService.java:91` `all()` — `findAll()`, lọc `deletedAt` trong Java, mỗi dòng lazy-load `member` và `user`.

**Cách sửa**

```java
@Query("""
    SELECT r FROM MembershipCancellationRequest r
    JOIN FETCH r.member m JOIN FETCH m.user u
    WHERE u.deletedAt IS NULL
    ORDER BY r.requestedAt DESC
    """)
List<MembershipCancellationRequest> findAllForManager();
```

Nếu `toDto` còn đọc quan hệ khác (subscription, người duyệt), thêm `JOIN FETCH`/`LEFT JOIN FETCH` tương ứng. Khi dữ liệu lớn: chuyển sang `Page<...>` + `Pageable` và cập nhật OpenAPI trong `docs/api-contracts/` cùng PR.

### 8. `Payment.invoice` — inverse `@OneToOne`

**Vị trí**: `finance/entity/Payment.java:69` `@OneToOne(mappedBy = "payment", fetch = LAZY)`. Phía inverse không lazy được nếu không bật bytecode enhancement → mỗi payment trong danh sách tốn thêm 1 query.

**Cách sửa**: trước tiên đo (bật `show-sql`, gọi API danh sách payment). Nếu đúng là N+1:

- các query danh sách dùng `LEFT JOIN FETCH p.invoice`, **hoặc**
- bỏ quan hệ inverse khỏi `Payment` và tra invoice qua `InvoiceRepository.findByPaymentId(...)` khi cần.

### Bật batch fetch toàn cục (giảm N+1 còn sót)

Thêm vào `application.yml`:

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 50
```

Hibernate gộp các lazy-load cùng loại thành `WHERE id IN (...)`. Đây là lưới an toàn, không thay cho `JOIN FETCH` ở các query nóng.

---

## 🟡 PR 4 — Dọn nhẹ

### 9. Script Google Sign-In tải trên mọi trang

**Vị trí**: `apps/web/index.html:52`.

**Cách sửa**: xóa thẻ `<script>` khỏi `index.html`; tạo helper nạp động, chỉ gọi trong các component login/register dùng Google:

```ts
let gsiPromise: Promise<void> | null = null;
export function loadGoogleIdentity(): Promise<void> {
  gsiPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { gsiPromise = null; reject(new Error('gsi_load_failed')); };
    document.head.appendChild(script);
  });
  return gsiPromise;
}
```

Nút Google phải có loading và error state khi script chưa tải xong.

### 10. `html2canvas` nạp tĩnh

**Vị trí**: `apps/web/src/features/member/MemberCardPage.tsx:3` (chunk 208 KB / 50 KB gzip).

**Cách sửa**: bỏ import tĩnh, nạp khi bấm tải ảnh:

```ts
const { default: html2canvas } = await import('html2canvas');
const canvas = await html2canvas(cardRef.current, { backgroundColor: '#202020', scale: 2 });
```

### 11. Chunk entry 426 KB (131 KB gzip)

Kiểm tra cái gì nằm trong entry:

```bash
npx vite-bundle-visualizer
```

Ứng viên: `zod` (đang ở entry), component landing bị import từ layout chung. Chuyển import sang route con nếu không cần ở mọi trang.

### 12. Dependency `"latest"`

**Vị trí**: `apps/web/package.json` — `react`, `react-dom`, `react-router-dom`, `@vitejs/plugin-react`.

**Cách sửa**: ghim phiên bản đang chạy trong lockfile:

```bash
npm ls react react-dom react-router-dom @vitejs/plugin-react --depth=0
```

rồi ghi số phiên bản cụ thể vào `package.json`. Tránh build production đổi phiên bản ngầm.

---

## Sau khi sửa

1. Đo lại pool: chạy kịch bản tải trong `2026-10-29-load-and-auth-audit.md`, kèm 5–10 request AI song song; ghi kết quả JSON vào thư mục này.
2. Chỉ cân nhắc tăng `DB_POOL_MAX_SIZE` sau khi PR 1 đã vào và vẫn thấy chờ connection — không tăng pool để che lỗi giữ connection.
3. Chạy `DatabasePolicyTest`, `DatabaseProfilesTest`, `scripts/test-database-config.ps1` (thay đổi `application.yml` phải qua các kiểm tra này).
4. Ghi Jira key vào mô tả từng PR.

## Phần đã ổn (không cần sửa)

- Mọi `@ManyToOne` đều `LAZY`; đã có `@Index` cho các bảng nóng (checkin, attendance, chat, booking, payment).
- 16 file dùng `Pageable`; notification chạy `@Async` qua executor riêng.
- Scroll listener ở frontend dùng `passive` + gộp `requestAnimationFrame`; route đã code-split; `supabase-js` và `qr-scanner` nạp lazy.
