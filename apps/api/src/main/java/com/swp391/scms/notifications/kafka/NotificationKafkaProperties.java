package com.swp391.scms.notifications.kafka;

import jakarta.validation.constraints.*;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.notifications.kafka")
public record NotificationKafkaProperties(@NotBlank String topic, @NotBlank String groupId,
        @Min(1) @Max(100) int batchSize, @NotNull Duration retryDelay,
        @NotNull Duration sendTimeout, @NotNull Duration retention) {
    public NotificationKafkaProperties {
        if (sendTimeout != null && (sendTimeout.isNegative() || sendTimeout.isZero())) {
            throw new IllegalArgumentException("Kafka send timeout must be positive");
        }
        if (retryDelay != null && sendTimeout != null && retryDelay.compareTo(sendTimeout) <= 0) {
            throw new IllegalArgumentException("Outbox retry delay must exceed Kafka send timeout");
        }
        if (retention != null && retention.compareTo(Duration.ofDays(1)) < 0) {
            throw new IllegalArgumentException("Completed notification retention must be at least one day");
        }
    }
}
