package com.swp391.scms.notifications.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.notifications.port.*;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import com.swp391.scms.users.UserRepository;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The outbox row lock serializes duplicate deliveries across consumers and API instances. */
@Service
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
public class NotificationDeliveryWorker {
    private final NotificationOutboxRepository outbox;
    private final UserRepository users;
    private final Map<NotificationChannel, NotificationChannelAdapter> adapters;
    private final ObjectMapper json;
    private final Clock clock;

    public NotificationDeliveryWorker(NotificationOutboxRepository outbox, UserRepository users,
            List<NotificationChannelAdapter> adapters, ObjectMapper json, Clock clock) {
        this.outbox = outbox;
        this.users = users;
        this.adapters = adapters.stream().collect(Collectors.toUnmodifiableMap(NotificationChannelAdapter::getChannel, Function.identity()));
        this.json = json;
        this.clock = clock;
    }

    @Transactional
    public void deliver(UUID id) {
        var entry = outbox.lockById(id).orElse(null);
        if (entry == null || entry.getCompletedAt() != null) return;
        try {
            NotificationPayload payload = json.readValue(entry.getPayload(), NotificationPayload.class);
            // Account deletion between enqueue and delivery must not send messages to the former owner.
            if (users.findByIdAndDeletedAtIsNull(payload.userId()).isPresent()) {
                var adapter = adapters.get(entry.getChannel());
                if (adapter == null) throw new IllegalStateException("Notification channel has no adapter");
                // Intentionally synchronous: failures roll back the receipt and reach Kafka's error handler.
                adapter.send(payload, id.toString());
            }
            entry.complete(clock.instant());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot decode notification event " + id);
        }
    }
}
