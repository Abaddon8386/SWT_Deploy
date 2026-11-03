# Redis catalog cache và Kafka notification outbox

Phạm vi: cải thiện tải đọc catalog và thay hàng đợi thông báo trong RAM bằng transport bền vững. Liên quan SCRUM-60/66 (catalog/profile), SCRUM-67/107/108 (notifications); chưa có Jira key mới được cung cấp cho phần hạ tầng này.

## Dữ liệu đi đâu?

- PostgreSQL Supabase vẫn là nguồn dữ liệu nghiệp vụ chính, với transaction, role và trigger sức chứa/trùng lịch hiện hành.
- Redis chỉ lưu DTO công khai của **gói active và HLV công khai**. Không lưu session, số chỗ, hồ sơ cá nhân, quyền truy cập, JWT, OTP hoặc giá dùng để tạo thanh toán. Chưa chuyển OTP/rate limiting sang Redis trong phạm vi này.
- Kafka chỉ mang UUID của công việc thông báo. Nội dung, người nhận và channel nằm trong `notification_outbox` của PostgreSQL. Kafka không thay transport Supabase Realtime cho chat.
- Các adapter email/push/webhook hiện có vẫn là **mock**. Kafka không tự biến chúng thành dịch vụ gửi thật.

## Redis

`PublicCatalogService.getCatalog()` dùng `PublicCatalogCache` cho packages/coaches và tiếp tục truy vấn sessions cùng booked counts mỗi lần gọi. Một cache hit bỏ qua hai truy vấn repository catalog; vẫn có các truy vấn lịch/đặt chỗ và chi phí mạng Redis. Chưa có số đo latency thực tế.

Redis dùng String JSON với kiểu DTO cố định, không bật polymorphic default typing hoặc Java serialization. TTL mặc định 60 giây, tối đa 5 phút. Namespace phải khác nhau cho từng môi trường **và từng database/schema**.

Cache invalidation chạy sau commit khi PackageService, UserService hoặc ProfileService ghi dữ liệu; rollback không invalidation. Startup xóa thế hệ cache sau khi các seeder hoàn tất. Read model được gọi bên trong write transaction sẽ bỏ qua shared cache để không công khai dữ liệu chưa commit.

Mỗi thế hệ cache có UUID trong key. Một request cũ hoàn tất sau invalidation chỉ ghi vào thế hệ cũ, không thể làm bẩn thế hệ mới. Nếu Redis xóa key generation vì eviction/restart, thế hệ mới được tạo với UUID khác.

Redis lỗi: API đọc DB; read circuit tạm bỏ qua Redis trong 5 giây để tránh request nào cũng chờ timeout. Connect timeout mặc định 300ms, command timeout 200ms. Invalidation vẫn được thử khi read circuit đang mở. Nếu invalidation thất bại, instance khác có thể thấy snapshot cũ tới khi TTL hết; TTL là giới hạn trễ, không phải bảo đảm nhất quán tức thời. Booking/payment luôn dùng DB nên không dựa vào snapshot này để quyết định quyền, giá hoặc sức chứa.

## Kafka và outbox

1. `NotificationService.send()` vẫn ghi thông báo in-app ngay trong transaction nghiệp vụ.
2. Khi bật Kafka, cùng transaction ghi một outbox job cho EMAIL và một cho PUSH. Enqueue lỗi làm rollback, không nuốt lỗi sau commit.
3. `dispatchMultiChannel()` ghi job theo các channel yêu cầu, bao gồm IN_APP khi cần; consumer xử lý IN_APP cùng transaction hoàn tất job.
4. Relay đọc các job tới hạn theo batch (25), claim bằng row lock và đặt thời điểm retry. Claim commit trước khi gửi Kafka; không giữ transaction DB để chờ broker.
5. Producer gửi key/value là cùng UUID với `acks=all` và idempotence. Broker lỗi hoặc process chết vẫn còn job trong PostgreSQL. Sau 60 giây, lease tới hạn và có thể publish lại.
6. Consumer khóa job, bỏ qua job đã hoàn tất, kiểm tra user chưa soft-delete, gọi adapter đồng bộ rồi đánh dấu hoàn tất. Adapter lỗi làm rollback và kích hoạt retry. Sau các retry tại consumer, outbox vẫn chưa hoàn tất và relay sẽ publish lại.
7. Dọn job **đã hoàn tất** sau 7 ngày; không dọn job đang lỗi. Kafka ID cũ trỏ tới job đã được dọn sẽ được bỏ qua an toàn.

Đây là at-least-once. IN_APP và receipt dùng cùng PostgreSQL transaction, nên nhận trùng không sinh thêm thông báo in-app. Với một provider email/push thật, có thể gửi thành công rồi process chết trước khi lưu receipt; worker truyền job UUID qua `NotificationChannelAdapter.send(payload, deliveryKey)`; provider phải dùng key này trong API idempotency của mình nếu muốn chống gửi trùng xuyên qua ranh giới đó. Các mock hiện tại không có side effect bên ngoài. Không tuyên bố exactly-once cho email.

Relay có scheduler riêng; các business jobs vẫn dùng scheduler riêng của chúng. Kafka outage không chặn request để chờ broker và không chiếm pool scheduler nghiệp vụ. So với async RAM hiện tại, Kafka tăng durability/khả năng chia worker, **không mặc định làm một request nhanh hơn** và có thêm chi phí ghi outbox.

Bảng outbox được tạo bằng Hibernate Entity, không có migration DDL mới. `PostgreSqlDataSecurityInitializer` hiện hành tự bật RLS cho Entity mới; không có policy cấp quyền Data API công khai. Không grant `anon`/`authenticated` quyền đọc outbox. Schema được tạo khi API khởi động dù cờ transport đang tắt.

## Chạy local

Cần Java 21, Docker Compose và kết nối Supabase PostgreSQL đã cấu hình theo README. Compose chỉ chạy Redis/Kafka, không chạy database thay thế. File compose SQL Server cũ đã được thay vì không còn phù hợp chính sách repository.

```sh
docker compose --profile performance up -d
# Xem healthcheck của cả hai dịch vụ trước khi bật API:
docker compose --profile performance ps
```

Trong `.env` local được API nạp, hoặc trong biến môi trường của tiến trình API:

```dotenv
APP_CATALOG_CACHE_ENABLED=true
APP_CATALOG_CACHE_NAMESPACE=scms:local:public-catalog
APP_CATALOG_CACHE_TTL=60s
REDIS_HOST=localhost
REDIS_PORT=6379
APP_NOTIFICATIONS_KAFKA_ENABLED=true
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
APP_NOTIFICATIONS_KAFKA_TOPIC=scms.local.notification-delivery.v1
APP_NOTIFICATIONS_KAFKA_GROUP_ID=scms-local-notification-delivery-v1
APP_NOTIFICATIONS_KAFKA_CREATE_TOPIC=true
```

Khởi động API bằng lệnh dự án đang dùng. Nếu chạy Maven từ `apps/api`, đảm bảo các biến đã được export vào môi trường hoặc file `.env` mà tiến trình đó nạp; `.env` ở root không tự export cho shell/JUnit.

```sh
cd apps/api
./mvnw spring-boot:run
```

Compose chỉ bind cổng vào loopback của máy. Kafka dùng named volume; Redis là cache có thể bỏ đi. Không dùng `docker compose down -v` khi cần giữ lịch sử Kafka local.

## Production

Hai tính năng **mặc định tắt** để deployment hiện hành vẫn chạy khi chưa được cấp Redis/Kafka. Phải cấp và bật từng dịch vụ để hưởng tác dụng.

- Redis: dùng endpoint riêng, credentials từ secret manager, `REDIS_SSL_ENABLED=true` theo provider, namespace riêng cho từng DB/schema. Không cache response có xác thực.
- Kafka: dùng broker được quản lý, topic/group riêng cho môi trường; cấu hình `KAFKA_SECURITY_PROTOCOL=SASL_SSL`, mechanism và JAAS theo provider, không đưa secret vào Git. Nếu provider dùng TLS client cert, dùng các biến cấu hình `SPRING_KAFKA_SSL_*` chuẩn của Spring Boot.
- Pre-provision topic (gợi ý 3 partitions, replication factor phù hợp cluster); để `APP_NOTIFICATIONS_KAFKA_CREATE_TOPIC=false`. Nếu cho app tạo topic, đặt `APP_NOTIFICATIONS_KAFKA_TOPIC_REPLICAS` phù hợp cluster. Một broker local/replica=1 không mô phỏng khả năng chịu lỗi production.
- Cùng một nhóm worker dùng cùng topic/group và cùng DB. Không cho một app của DB khác dùng chung topic: consumer không tìm thấy UUID sẽ bỏ qua.
- Theo dõi job chưa hoàn tất, độ tuổi job lâu nhất, attempts tăng, consumer lag và log lỗi relay. Không log nội dung payload.

Ví dụ truy vấn **chỉ đọc** trong schema ứng dụng để quan sát backlog:

```sql
select count(*) as pending, min(created_at) as oldest, max(attempts) as max_attempts
from notification_outbox where completed_at is null;
```

Không đổi quyền truy cập API; không có endpoint quản trị hạ tầng công khai mới.

## Tắt / rollback

Redis có thể tắt bằng `APP_CATALOG_CACHE_ENABLED=false` rồi restart; API trở về đọc DB.

Với Kafka, đợi backlog về 0 trước khi tắt `APP_NOTIFICATIONS_KAFKA_ENABLED`, sau đó restart để trở về async dispatcher cũ. Nếu phải tắt trong sự cố, giữ bảng/outbox và broker data; job đang chờ chưa mất nhưng sẽ **chưa được xử lý** cho tới khi bật lại. Không drop bảng hoặc xóa volume như một bước rollback.

## Kiểm thử chuẩn bị sẵn

Theo yêu cầu người dùng, **chưa chạy test** khi bàn giao. Maven `-DskipTests package` vẫn biên dịch mã test; không coi đây là test pass. Kế hoạch ở `docs/qa/kafka-redis-test-plan.md`.

Unit/contract tests không cần Redis/Kafka/DB:

```sh
cd apps/api
./mvnw -Dtest=RedisPublicCatalogCacheTest,CatalogCacheInvalidationTest,PublicCatalogCacheBoundaryTest,KafkaNotificationDispatcherTest,NotificationDeliveryWorkerTest,NotificationOutboxStoreTest,NotificationOutboxRelayTest,NotificationServiceTest,CodeFirstSchemaTest,DatabasePolicyTest,DatabaseProfilesTest test
```

Integration: export `SCMS_POSTGRES_TEST_URL`, `SCMS_POSTGRES_TEST_USERNAME`, `SCMS_POSTGRES_TEST_PASSWORD` của **Supabase dev/test** và TLS settings. Suite tạo schema UUID riêng, Hibernate tạo tables và xóa schema đó khi hoàn tất; không reset `public`. Kafka test dùng broker KRaft thật nhúng trong JVM, không cần broker compose cho bài test này. Redis test cần một Redis test thật:

```sh
# Có thể dùng Redis local từ compose; suite dùng namespace ngẫu nhiên, không FLUSHDB.
export SCMS_PERFORMANCE_INTEGRATION=true
export SCMS_REDIS_TEST_HOST=localhost
export SCMS_REDIS_TEST_PORT=6379
# Tùy chọn: SCMS_REDIS_TEST_USERNAME, SCMS_REDIS_TEST_PASSWORD, SCMS_REDIS_TEST_SSL
cd apps/api
./mvnw -Dtest=RedisCatalogIntegrationTest,KafkaRedisPerformanceIntegrationTest test
```

Sau đó chạy toàn bộ backend `./mvnw test`, gồm các policy checks bắt buộc và script `scripts/test-database-config.ps1` trên máy có PowerShell.

## Đo hiệu năng

Dùng hai instance API cùng revision/cấu hình/test dataset: cổng 8080 cache off, 8081 cache on. Bật cache trên instance thứ hai, giữ Kafka giống nhau để chỉ so sánh Redis. Không có tác vụ ghi trong lúc đo; đo trên môi trường dev/test.

```sh
python3 scripts/benchmark-public-catalog.py \
  --baseline-url http://localhost:8080 \
  --cached-url http://localhost:8081 \
  --samples 200 --workers 8
```

Script chỉ GET endpoint public, warm up rồi xuất p50/p95, mean, throughput. Kết quả gồm cả chi phí HTTP/DB/network và phải được đo trước khi tuyên bố phần trăm cải thiện. Chạy lại với thứ tự instance đảo để giảm sai lệch do warmup DB. Các số này không đo được durability hay throughput notification Kafka; cần kiểm tra backlog/consumer lag dưới tải thông báo riêng.

## Tài liệu nền

- [Spring Kafka — xử lý lỗi](https://docs.spring.io/spring-kafka/reference/3.3/kafka/annotation-error-handling.html)
- [Spring Kafka — embedded broker testing](https://docs.spring.io/spring-kafka/reference/3.3/testing.html)
- [Apache Kafka — Docker](https://kafka.apache.org/39/getting-started/docker/)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
