package com.swp391.scms.config;

import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.notifications.kafka.*;
import com.swp391.scms.notifications.port.*;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.core.*;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static com.swp391.scms.config.SupabaseTestDatabase.credential;

/** Real Supabase test schema + real embedded KRaft broker. Disabled unless explicitly requested. */
@SpringBootTest(properties = {
        "app.notifications.kafka.enabled=true", "app.notifications.kafka.topic=scms.performance.test.delivery",
        "app.notifications.kafka.group-id=scms-performance-test-delivery", "app.notifications.kafka.create-topic=false",
        "app.notifications.kafka.poll-delay=3600000", "app.notifications.kafka.cleanup-delay=3600000",
        "spring.kafka.admin.auto-create=false", "app.performance.catalog-cache.enabled=false",
        "app.scheduler.package-expiry.cron=-", "app.scheduler.class-reminder.cron=-",
        "app.membership.lifecycle.cron=-", "app.users.cleanup.cron=-", "app.attendance.auto-checkout.cron=-"
})
@ActiveProfiles("supabase")
@EnabledIfEnvironmentVariable(named = "SCMS_PERFORMANCE_INTEGRATION", matches = "true")
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
@EmbeddedKafka(partitions = 1, topics = "scms.performance.test.delivery", kraft = true,
        bootstrapServersProperty = "spring.kafka.bootstrap-servers")
@DirtiesContext
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class KafkaRedisPerformanceIntegrationTest {
    private static final String SCHEMA = "performance_test_" + UUID.randomUUID().toString().replace("-", "");
    @Autowired JdbcTemplate jdbc;
    @Autowired NotificationService notifications;
    @Autowired KafkaNotificationDispatcher dispatcher;
    @Autowired NotificationOutboxRelay relay;
    @Autowired NotificationOutboxStore store;
    @Autowired NotificationDeliveryWorker worker;
    @Autowired NotificationOutboxRepository outbox;
    @Autowired PlatformTransactionManager transactions;
    @Autowired KafkaTemplate<String, String> kafka;
    @Autowired KafkaListenerEndpointRegistry listeners;
    @Autowired ThreadPoolTaskScheduler notificationRelayScheduler;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        try (var connection = SupabaseTestDatabase.connect(); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + SCHEMA + "\"");
        }
        properties.add("spring.datasource.url", () -> credential("SCMS_POSTGRES_TEST_URL"));
        properties.add("spring.datasource.username", () -> credential("SCMS_POSTGRES_TEST_USERNAME"));
        properties.add("spring.datasource.password", () -> credential("SCMS_POSTGRES_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.schema", () -> SCHEMA);
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "update");
        properties.add("app.jwt.secret", () -> "cGVyZm9ybWFuY2VfdGVzdF9zaWduaW5nX2tleV9mb3JfaW50ZWdyYXRpb25fb25seQ==");
        properties.add("app.bootstrap.admin.email", () -> "");
        properties.add("app.bootstrap.admin.password", () -> "");
    }

    private long user() {
        return jdbc.queryForObject("""
                insert into users (role_id,full_name,email,password_hash,status,created_at,updated_at)
                values ((select id from roles where code='MEMBER'),'Performance Test',?,'unused','active',now(),now()) returning id
                """, Long.class, UUID.randomUUID() + "@example.invalid");
    }

    private long count(long userId) {
        return jdbc.queryForObject("select count(*) from notifications where user_id=?", Long.class, userId);
    }

    @Test void rollbackRemovesBothNotificationAndDurableDelivery() {
        long user = user();
        long before = outbox.count();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            notifications.send(user, "Test", "Rollback", "system", null, null);
            assertThat(count(user)).isEqualTo(1);
            assertThat(outbox.count()).isEqualTo(before + 2);
            status.setRollbackOnly();
        });
        assertThat(count(user)).isZero();
        assertThat(outbox.count()).isEqualTo(before);
    }

    @Test void realKafkaDeliversOnceAndDuplicateRecordsCannotDuplicateInAppNotification() {
        long user = user();
        dispatcher.dispatch(user, "Test", "Delivery", "system", null, null, Set.of(NotificationChannel.IN_APP));
        UUID id = store.due().getFirst();
        relay.publishDue();
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(outbox.findById(id).orElseThrow().getCompletedAt()).isNotNull();
            assertThat(count(user)).isEqualTo(1);
        });
        for (int i = 0; i < 3; i++) kafka.send("scms.performance.test.delivery", id.toString(), id.toString()).join();
        await().during(Duration.ofSeconds(1)).atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(count(user)).isEqualTo(1));
    }

    @Test void brokerOutageKeepsDurableJobAndRecoveryEventuallyDelivers() {
        long user = user();
        dispatcher.dispatch(user, "Test", "Recovery", "system", null, null, Set.of(NotificationChannel.IN_APP));
        UUID id = store.due().getFirst();
        var settings = new HashMap<String, Object>();
        settings.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "127.0.0.1:1");
        settings.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        settings.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        settings.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 300);
        settings.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 500);
        settings.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 1000);
        var factory = new DefaultKafkaProducerFactory<String, String>(settings);
        var unreachable = new KafkaTemplate<String, String>(factory);
        try {
            var properties = new NotificationKafkaProperties("scms.performance.test.delivery", "test", 25,
                    Duration.ofSeconds(60), Duration.ofSeconds(2), Duration.ofDays(7));
            new NotificationOutboxRelay(store, unreachable, properties).publishDue();
        } finally { unreachable.destroy(); factory.destroy(); }
        assertThat(outbox.findById(id).orElseThrow().getCompletedAt()).isNull();
        assertThat(count(user)).isZero();
        jdbc.update("update notification_outbox set next_attempt_at=? where id=?", java.sql.Timestamp.from(Instant.now().minusSeconds(1)), id);
        relay.publishDue();
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(count(user)).isEqualTo(1));
    }

    @Test void concurrentConsumersSerializeOnPostgresReceiptLock() throws Exception {
        long user = user();
        dispatcher.dispatch(user, "Test", "Concurrent", "system", null, null, Set.of(NotificationChannel.IN_APP));
        UUID id = store.due().getFirst();
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { gate.await(); worker.deliver(id); return true; });
            var second = pool.submit(() -> { gate.await(); worker.deliver(id); return true; });
            gate.countDown(); first.get(20, TimeUnit.SECONDS); second.get(20, TimeUnit.SECONDS);
        }
        assertThat(count(user)).isEqualTo(1);
    }

    @Test void outboxIsNotExposedThroughSupabaseDataApi() {
        assertThat(jdbc.queryForObject("select relrowsecurity from pg_class where oid=?::regclass", Boolean.class,
                SCHEMA + ".notification_outbox")).isTrue();
    }

    @AfterAll void cleanup() throws Exception {
        listeners.stop();
        notificationRelayScheduler.shutdown();
        assertThat(SCHEMA).matches("performance_test_[a-f0-9]{32}");
        try (var connection = SupabaseTestDatabase.connect(); var statement = connection.createStatement()) {
            statement.execute("drop schema if exists \"" + SCHEMA + "\" cascade");
        }
    }
}
