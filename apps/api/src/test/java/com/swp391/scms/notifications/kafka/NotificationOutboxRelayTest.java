package com.swp391.scms.notifications.kafka;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import static org.mockito.Mockito.*;

class NotificationOutboxRelayTest {
    @Test void brokerOutageRetainsWorkAndRecoveryPublishesOnlyOpaqueIds() {
        var store = mock(NotificationOutboxStore.class);
        @SuppressWarnings("unchecked") KafkaTemplate<String, String> kafka = mock(KafkaTemplate.class);
        var properties = new NotificationKafkaProperties("test-delivery", "test-group", 25,
                Duration.ofSeconds(60), Duration.ofSeconds(5), Duration.ofDays(7));
        var id = UUID.randomUUID();
        when(store.due()).thenReturn(List.of(id));
        when(store.claim(id)).thenReturn(true);
        when(kafka.send("test-delivery", id.toString(), id.toString()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("offline")))
                .thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        var relay = new NotificationOutboxRelay(store, kafka, properties);
        relay.publishDue(); verify(store, never()).published(id);
        relay.publishDue(); verify(store).published(id);
        verify(kafka, times(2)).send("test-delivery", id.toString(), id.toString());
    }

    @Test void otherInstanceClaimSkipsDuplicatePublication() {
        var store = mock(NotificationOutboxStore.class);
        @SuppressWarnings("unchecked") KafkaTemplate<String, String> kafka = mock(KafkaTemplate.class);
        when(store.due()).thenReturn(List.of(UUID.randomUUID()));
        var properties = new NotificationKafkaProperties("test-delivery", "test-group", 25,
                Duration.ofSeconds(60), Duration.ofSeconds(5), Duration.ofDays(7));
        new NotificationOutboxRelay(store, kafka, properties).publishDue();
        verifyNoInteractions(kafka);
    }
}
