package com.swp391.scms.notifications.kafka;

import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
public class NotificationOutboxRelay {
    private static final Logger log = LoggerFactory.getLogger(NotificationOutboxRelay.class);
    private final NotificationOutboxStore store;
    private final KafkaTemplate<String, String> kafka;
    private final NotificationKafkaProperties properties;

    public NotificationOutboxRelay(NotificationOutboxStore store, KafkaTemplate<String, String> kafka,
                                   NotificationKafkaProperties properties) {
        this.store = store;
        this.kafka = kafka;
        this.properties = properties;
    }

    @Scheduled(fixedDelayString = "${app.notifications.kafka.poll-delay:1000}", scheduler = "notificationRelayScheduler")
    public void publishDue() {
        for (var id : store.due()) {
            if (!store.claim(id)) continue;
            try {
                kafka.send(properties.topic(), id.toString(), id.toString())
                        .get(properties.sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
                store.published(id);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                log.warn("Notification relay attempt {} incomplete ({}); retained for retry", id, e.getClass().getSimpleName());
                // Do not stall the whole backlog while the broker is unavailable.
                return;
            }
        }
    }

    @Scheduled(fixedDelayString = "${app.notifications.kafka.cleanup-delay:3600000}", scheduler = "notificationRelayScheduler")
    public void cleanupCompleted() { store.cleanup(); }
}
