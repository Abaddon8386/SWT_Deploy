package com.swp391.scms.notifications.kafka;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.notifications.kafka.enabled", havingValue = "true")
public class NotificationKafkaConsumer {
    private static final Logger log = LoggerFactory.getLogger(NotificationKafkaConsumer.class);
    private final NotificationDeliveryWorker worker;

    public NotificationKafkaConsumer(NotificationDeliveryWorker worker) { this.worker = worker; }

    @KafkaListener(topics = "${app.notifications.kafka.topic}", groupId = "${app.notifications.kafka.group-id}",
            containerFactory = "notificationKafkaListenerContainerFactory")
    public void receive(String eventId) {
        UUID id;
        try { id = UUID.fromString(eventId); }
        catch (IllegalArgumentException | NullPointerException e) {
            // Malformed IDs cannot correspond to a job; never log the untrusted payload.
            log.warn("Ignoring malformed notification event ID");
            return;
        }
        worker.deliver(id);
    }
}
