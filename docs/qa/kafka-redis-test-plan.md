# Kế hoạch kiểm thử Kafka và Redis

Trạng thái lúc bàn giao: đã chuẩn bị mã kiểm thử; **chưa thực thi** theo yêu cầu người dùng. Mã ứng dụng và mã test đã được biên dịch/đóng JAR bằng `./mvnw -DskipTests package` (BUILD SUCCESS). YAML cấu hình đã được parse với kiểm tra key trùng, script benchmark đã kiểm tra cú pháp Python. Không có số đo tăng tốc thực tế. Không có thay đổi cấu hình cloud/production.

| Tệp / bài kiểm tra | Nội dung phải chứng minh | Trạng thái |
|---|---|---|
| RedisPublicCatalogCacheTest | Typed DTO cache hit, TTL, invalidation giữa lúc fill, corrupt JSON, read/write outage, DB error không bị nuốt | Chưa chạy |
| CatalogCacheInvalidationTest | Aspect đi qua proxy transaction thật, sau commit mới invalidation, rollback/read-only không invalidation | Chưa chạy |
| PublicCatalogCacheBoundaryTest | Cache hit giảm hai truy vấn catalog; session/count vẫn thay đổi; write transaction không fill shared cache | Chưa chạy |
| KafkaNotificationDispatcherTest | Một job/channel, không gọi broker trong request, default IN_APP chỉ một job | Chưa chạy |
| NotificationServiceTest | Durable enqueue trước commit, lỗi propagate; transport cũ vẫn afterCommit | Chưa chạy |
| NotificationDeliveryWorkerTest | Duplicate không gọi adapter lại, lỗi có thể retry, tài khoản xóa bị bỏ qua, ID cũ an toàn | Chưa chạy |
| NotificationOutboxStoreTest | Lease claim/retry, job complete không publish, retention chỉ xóa completed | Chưa chạy |
| NotificationOutboxRelayTest | Broker lỗi giữ job; hồi phục chỉ publish UUID; instance khác đã claim thì bỏ qua | Chưa chạy |
| RedisCatalogIntegrationTest | Redis thật: 100 cache hit chỉ load một lần, TTL expiry, invalidation, namespace riêng | Chưa chạy; cần Redis test |
| KafkaRedisPerformanceIntegrationTest | Supabase schema riêng + broker KRaft thật: rollback, delivery, duplicate, broker outage/recovery, concurrent receipt lock, outbox RLS | Chưa chạy; cần Supabase dev/test |
| CodeFirstSchemaTest | Hibernate generate outbox/index và compile JPQL mà không cần DB | Chưa chạy |
| DatabasePolicyTest / DatabaseProfilesTest / test-database-config.ps1 | Giữ database policy Supabase PostgreSQL/TLS/Code-First | Chưa chạy |
| benchmark-public-catalog.py | So sánh p50/p95/throughput của hai API cache off/on cùng dữ liệu | Chưa đo |

Các integration tests chỉ được bật khi `SCMS_PERFORMANCE_INTEGRATION=true`. Supabase test còn yêu cầu SCMS_POSTGRES_TEST_*; không lấy database production làm mặc định. Test Redis không dùng FLUSHDB. Hướng dẫn lệnh ở `docs/setup/kafka-redis.md`.

Trước production: chạy suite và policy checks, chạy smoke endpoint catalog/booking/payment/notification với các role; kiểm tra Redis outage không làm API lỗi, broker outage làm backlog tăng nhưng booking vẫn commit, phục hồi drain backlog. Với email/push provider thật, kiểm tra idempotency key của provider vì receipt DB không đảm bảo exactly-once cho side effect bên ngoài.
