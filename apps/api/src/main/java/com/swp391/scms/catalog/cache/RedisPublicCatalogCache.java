package com.swp391.scms.catalog.cache;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/** Versioned keys prevent an in-flight old read from refilling the current cache after eviction. */
public class RedisPublicCatalogCache implements PublicCatalogCache {
    private static final Logger log = LoggerFactory.getLogger(RedisPublicCatalogCache.class);
    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    private final CatalogCacheProperties properties;
    private final Clock clock;
    private volatile Instant retryAfter = Instant.MIN;

    public RedisPublicCatalogCache(StringRedisTemplate redis, ObjectMapper json,
                                   CatalogCacheProperties properties, Clock clock) {
        this.redis = redis;
        this.json = json;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public Snapshot getOrLoad(Supplier<Snapshot> loader) {
        if (clock.instant().isBefore(retryAfter)) return loader.get();
        String key = null;
        try {
            String generationKey = properties.namespace() + ":generation";
            String generation = redis.opsForValue().get(generationKey);
            if (generation == null) {
                redis.opsForValue().setIfAbsent(generationKey, UUID.randomUUID().toString());
                generation = redis.opsForValue().get(generationKey);
            }
            // A cache service that could not establish a generation must not write an unversioned entry.
            if (generation != null) {
                key = properties.namespace() + ":v1:" + generation;
                String cached = redis.opsForValue().get(key);
                if (cached != null) return json.readValue(cached, Snapshot.class);
            }
        } catch (RuntimeException | JsonProcessingException e) {
            unavailable(e);
            return loader.get();
        }
        // Do not catch database exceptions or cache a failed query/partially populated response.
        Snapshot value = loader.get();
        if (key == null) return value;
        try {
            redis.opsForValue().set(key, json.writeValueAsString(value), properties.ttl());
        } catch (RuntimeException | JsonProcessingException e) {
            unavailable(e);
        }
        return value;
    }

    @Override
    public void invalidate() {
        try {
            // Always attempt invalidation even during the read circuit's backoff.
            redis.opsForValue().set(properties.namespace() + ":generation", UUID.randomUUID().toString());
            retryAfter = Instant.MIN;
        } catch (RuntimeException e) {
            unavailable(e);
        }
    }

    private void unavailable(Exception e) {
        retryAfter = clock.instant().plus(properties.failureBackoff());
        // Never log cached values, user data, credentials or Redis URLs.
        log.warn("Public catalog cache unavailable ({}); reading database", e.getClass().getSimpleName());
    }
}
