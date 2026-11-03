package com.swp391.scms.catalog.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.catalog.PublicCatalogService.CoachDto;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RedisPublicCatalogCacheTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-03T07:00:00Z"), ZoneOffset.UTC);
    private final CatalogCacheProperties properties = new CatalogCacheProperties("test:catalog", Duration.ofSeconds(60), Duration.ofSeconds(5));
    private RedisPublicCatalogCache cache;

    @BeforeEach void setup() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("test:catalog:generation")).thenReturn("first");
        cache = new RedisPublicCatalogCache(redis, json, properties, clock);
    }

    private PublicCatalogCache.Snapshot snapshot() {
        return new PublicCatalogCache.Snapshot(List.of(new PackageDto(1L, "Silver", "Gym", new BigDecimal("549000"), 30, 8, "active")),
                List.of(new CoachDto(2L, "Coach", "Yoga", "Bio", "Certification", null)));
    }

    @Test void hitRoundTripsTypedPublicDtosWithoutQueryingDatabase() throws Exception {
        when(values.get("test:catalog:v1:first")).thenReturn(json.writeValueAsString(snapshot()));
        @SuppressWarnings("unchecked") Supplier<PublicCatalogCache.Snapshot> loader = mock(Supplier.class);
        assertThat(cache.getOrLoad(loader)).isEqualTo(snapshot());
        verifyNoInteractions(loader);
    }

    @Test void createsNewGenerationAfterRedisEvictionOrRestart() {
        when(values.get("test:catalog:generation")).thenReturn(null, "new-generation");
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
        verify(values).setIfAbsent(eq("test:catalog:generation"), anyString());
        verify(values).get("test:catalog:v1:new-generation");
    }

    @Test void missLoadsOnceAndUsesBoundedTtl() throws Exception {
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
        verify(values).set("test:catalog:v1:first", json.writeValueAsString(snapshot()), Duration.ofSeconds(60));
    }

    @Test void concurrentInvalidationMakesAnOldInFlightFillUnreachable() throws Exception {
        var old = snapshot();
        cache.getOrLoad(() -> { cache.invalidate(); return old; });
        var generation = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(values).set(eq("test:catalog:generation"), generation.capture());
        when(values.get("test:catalog:generation")).thenReturn(generation.getValue());
        var refreshed = new PublicCatalogCache.Snapshot(List.of(), List.of());
        assertThat(cache.getOrLoad(() -> refreshed)).isEqualTo(refreshed);
        verify(values).get("test:catalog:v1:" + generation.getValue());
        // An old loader can finish, but cannot fill the new generation.
        verify(values).set("test:catalog:v1:first", json.writeValueAsString(old), properties.ttl());
    }

    @Test void outageFallsBackAndBackoffAvoidsRepeatedNetworkWaits() {
        when(values.get("test:catalog:generation")).thenThrow(new IllegalStateException("disconnected"));
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
        verify(values, times(1)).get("test:catalog:generation");
    }

    @Test void corruptJsonFallsBackWithoutBreakingPublicEndpoint() {
        when(values.get("test:catalog:v1:first")).thenReturn("broken-json");
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
    }

    @Test void cacheWriteFailureDoesNotFailSuccessfulDatabaseRead() {
        doThrow(new IllegalStateException("redis down")).when(values).set(anyString(), anyString(), any(Duration.class));
        assertThat(cache.getOrLoad(this::snapshot)).isEqualTo(snapshot());
    }

    @Test void databaseFailuresPropagateAndAreNeverCachedOrRetriedAsCacheFailures() {
        assertThatThrownBy(() -> cache.getOrLoad(() -> { throw new IllegalStateException("DB down"); }))
                .hasMessage("DB down");
        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }
}
