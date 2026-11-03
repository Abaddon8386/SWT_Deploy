package com.swp391.scms.notifications.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.notifications.entity.NotificationOutbox;
import com.swp391.scms.notifications.port.*;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import java.time.Clock;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationDeliveryWorkerTest {
    private final NotificationOutboxRepository outbox = mock(NotificationOutboxRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final NotificationChannelAdapter adapter = mock(NotificationChannelAdapter.class);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final Clock clock = Clock.systemUTC();

    private NotificationOutbox job() throws Exception {
        when(adapter.getChannel()).thenReturn(NotificationChannel.PUSH);
        return new NotificationOutbox(NotificationChannel.PUSH, json.writeValueAsString(NotificationPayload.builder()
                .userId(1L).title("Title").message("Message").type("system").build()), clock.instant());
    }

    private NotificationDeliveryWorker worker() {
        return new NotificationDeliveryWorker(outbox, users, List.of(adapter), json, clock);
    }

    @Test void duplicateKafkaMessagesDoNotRepeatCompletedDelivery() throws Exception {
        var job = job();
        when(outbox.lockById(job.getId())).thenReturn(Optional.of(job));
        when(users.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(new User()));
        var worker = worker(); worker.deliver(job.getId()); worker.deliver(job.getId());
        verify(adapter, times(1)).send(any(), anyString());
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test void failedAdapterLeavesDeliveryIncompleteAndCanBeRetried() throws Exception {
        var job = job();
        when(outbox.lockById(job.getId())).thenReturn(Optional.of(job));
        when(users.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(new User()));
        doThrow(new IllegalStateException("provider offline")).doNothing().when(adapter).send(any(), anyString());
        var worker = worker();
        assertThatThrownBy(() -> worker.deliver(job.getId())).isInstanceOf(IllegalStateException.class);
        assertThat(job.getCompletedAt()).isNull();
        worker.deliver(job.getId());
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test void deletedAccountIsNeverDeliveredTo() throws Exception {
        var job = job();
        when(outbox.lockById(job.getId())).thenReturn(Optional.of(job));
        when(users.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.empty());
        worker().deliver(job.getId());
        verify(adapter, never()).send(any(), anyString());
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test void missingOrRetainedOldKafkaIdIsSafe() throws Exception {
        job(); // supplies the adapter's channel
        worker().deliver(UUID.randomUUID());
        verify(adapter, never()).send(any(), anyString());
    }
}
