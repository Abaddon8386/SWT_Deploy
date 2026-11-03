package com.swp391.scms.catalog.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

/** Real Redis; unique namespace, no FLUSHDB and no application database connection. */
@EnabledIfEnvironmentVariable(named = "SCMS_PERFORMANCE_INTEGRATION", matches = "true")
class RedisCatalogIntegrationTest {
    private LettuceConnectionFactory connection;
    private StringRedisTemplate redis;
    private String namespace;
    private RedisPublicCatalogCache cache;

    @BeforeEach void connect() {
        var settings = new RedisStandaloneConfiguration(System.getenv().getOrDefault("SCMS_REDIS_TEST_HOST", "localhost"),
                Integer.parseInt(System.getenv().getOrDefault("SCMS_REDIS_TEST_PORT", "6379")));
        String username = System.getenv("SCMS_REDIS_TEST_USERNAME");
        if (username != null && !username.isBlank()) settings.setUsername(username);
        String password = System.getenv("SCMS_REDIS_TEST_PASSWORD");
        if (password != null && !password.isBlank()) settings.setPassword(password);
        var client = LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(2));
        if (Boolean.parseBoolean(System.getenv("SCMS_REDIS_TEST_SSL"))) client.useSsl();
        connection = new LettuceConnectionFactory(settings, client.build());
        connection.afterPropertiesSet(); connection.start();
        redis = new StringRedisTemplate(connection);
        namespace = "scms-test:" + UUID.randomUUID();
        cache = new RedisPublicCatalogCache(redis, new ObjectMapper().findAndRegisterModules(),
                new CatalogCacheProperties(namespace, Duration.ofSeconds(1), Duration.ofSeconds(1)), Clock.systemUTC());
    }

    @AfterEach void cleanup() {
        if (redis != null) {
            try (var cursor = redis.scan(org.springframework.data.redis.core.ScanOptions.scanOptions().match(namespace + ":*").count(100).build())) {
                while (cursor.hasNext()) redis.delete(cursor.next());
            }
        }
        if (connection != null) connection.destroy();
    }

    @Test void repeatedRequestsHitRedisThenReloadOnExpiryAndInvalidation() {
        var loads = new AtomicInteger();
        var expected = new PublicCatalogCache.Snapshot(List.of(), List.of());
        java.util.function.Supplier<PublicCatalogCache.Snapshot> loader = () -> { loads.incrementAndGet(); return expected; };
        cache.getOrLoad(loader);
        for (int i = 0; i < 100; i++) assertThat(cache.getOrLoad(loader)).isEqualTo(expected);
        assertThat(loads).hasValue(1);
        String key = namespace + ":v1:" + redis.opsForValue().get(namespace + ":generation");
        assertThat(redis.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS)).isBetween(1L, 1000L);
        await().atMost(Duration.ofSeconds(5)).until(() -> !Boolean.TRUE.equals(redis.hasKey(key)));
        cache.getOrLoad(loader); assertThat(loads).hasValue(2);
        cache.invalidate(); cache.getOrLoad(loader); assertThat(loads).hasValue(3);
    }
}
