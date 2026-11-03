package com.swp391.scms.notifications.kafka;

import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short DB transactions. The relay waits for Kafka acknowledgements outside these methods. */
@Service
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
public class NotificationOutboxStore {
    private final NotificationOutboxRepository outbox;
    private final NotificationKafkaProperties properties;
    private final Clock clock;

    public NotificationOutboxStore(NotificationOutboxRepository outbox, NotificationKafkaProperties properties, Clock clock) {
        this.outbox = outbox;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<UUID> due() {
        return outbox.findDueIds(clock.instant(), PageRequest.of(0, properties.batchSize()));
    }

    @Transactional
    public boolean claim(UUID id) {
        var entry = outbox.lockById(id).orElse(null);
        var now = clock.instant();
        if (entry == null || entry.getCompletedAt() != null || entry.getNextAttemptAt().isAfter(now)) return false;
        entry.claim(now.plus(properties.retryDelay()));
        return true;
    }

    @Transactional
    public void published(UUID id) {
        outbox.lockById(id).ifPresent(entry -> entry.published(clock.instant()));
    }

    @Transactional
    public int cleanup() {
        // Undelivered jobs are never removed, even after many failed attempts.
        return outbox.deleteCompletedBefore(clock.instant().minus(properties.retention()));
    }
}
