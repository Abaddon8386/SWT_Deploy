package com.swp391.scms.notifications.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.notifications.entity.NotificationOutbox;
import com.swp391.scms.notifications.port.*;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import java.time.Clock;
import java.util.Objects;
import java.util.Set;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Enqueue only. No Kafka network call, async thread or after-commit gap on the request path. */
@Service
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
@Transactional
public class KafkaNotificationDispatcher implements TransactionalNotificationDispatcher {
    private final NotificationOutboxRepository outbox;
    private final ObjectMapper json;
    private final Clock clock;

    public KafkaNotificationDispatcher(NotificationOutboxRepository outbox, ObjectMapper json, Clock clock) {
        this.outbox = outbox;
        this.json = json;
        this.clock = clock;
    }

    @Override
    public void dispatch(NotificationPayload payload) {
        Objects.requireNonNull(payload, "Notification payload is required");
        Objects.requireNonNull(payload.userId(), "Notification user is required");
        try {
            String serialized = json.writeValueAsString(payload);
            for (NotificationChannel channel : payload.channels()) {
                outbox.save(new NotificationOutbox(channel, serialized, clock.instant()));
            }
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize notification delivery", e);
        }
    }

    @Override
    public void dispatch(Long userId, String title, String message, String type, String entityType, Long entityId) {
        dispatch(userId, title, message, type, entityType, entityId,
                Set.of(NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH));
    }

    @Override
    public void dispatch(Long userId, String title, String message, String type, String entityType, Long entityId,
                         Set<NotificationChannel> channels) {
        dispatch(NotificationPayload.builder().userId(userId).title(title).message(message).type(type)
                .relatedEntityType(entityType).relatedEntityId(entityId).channels(channels).build());
    }
}
