package com.swp391.scms.catalog.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration(proxyBeanMethods = false)
public class CatalogCacheConfiguration {
    @Bean
    @ConditionalOnProperty(name = "app.performance.catalog-cache.enabled", havingValue = "false", matchIfMissing = true)
    PublicCatalogCache uncachedPublicCatalog() { return PublicCatalogCache.disabled(); }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = "app.performance.catalog-cache.enabled", havingValue = "true")
    @EnableConfigurationProperties(CatalogCacheProperties.class)
    static class EnabledCache {
        @Bean
        PublicCatalogCache redisPublicCatalog(StringRedisTemplate redis, ObjectMapper json,
                                               CatalogCacheProperties properties, Clock clock) {
            return new RedisPublicCatalogCache(redis, json, properties, clock);
        }
    }
}
