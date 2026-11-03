package com.swp391.scms.catalog.cache;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Validated
@ConfigurationProperties("app.performance.catalog-cache")
public record CatalogCacheProperties(@NotBlank String namespace, @NotNull Duration ttl,
                                     @NotNull Duration failureBackoff) {
    public CatalogCacheProperties {
        if (ttl != null && (ttl.isNegative() || ttl.isZero() || ttl.compareTo(Duration.ofMinutes(5)) > 0)) {
            throw new IllegalArgumentException("Catalog cache TTL must be between zero and five minutes");
        }
        if (failureBackoff != null && (failureBackoff.isNegative() || failureBackoff.isZero())) {
            throw new IllegalArgumentException("Catalog cache failure backoff must be positive");
        }
    }
}
