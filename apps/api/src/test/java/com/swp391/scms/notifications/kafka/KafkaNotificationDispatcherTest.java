package com.swp391.scms.notifications.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.notifications.entity.NotificationOutbox;
import com.swp391.scms.notifications.port.*;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import java.time.Clock;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class KafkaNotificationDispatcherTest {
    @Test void enqueuesOneIndependentJobPerChannelWithoutCallingKafkaOrAdapters() throws Exception {
        var repo = mock(NotificationOutboxRepository.class);
        var json = new ObjectMapper().findAndRegisterModules();
        var dispatcher = new KafkaNotificationDispatcher(repo, json, Clock.systemUTC());
        dispatcher.dispatch(1L, "Title", "Message", "system", null, null, Set.of(NotificationChannel.EMAIL, NotificationChannel.PUSH));
        var captor = ArgumentCaptor.forClass(NotificationOutbox.class);
        verify(repo, times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).extracting(NotificationOutbox::getChannel)
                .containsExactlyInAnyOrder(NotificationChannel.EMAIL, NotificationChannel.PUSH);
        for (var entry : captor.getAllValues()) {
            assertThat(entry.getCompletedAt()).isNull();
            assertThat(json.readValue(entry.getPayload(), NotificationPayload.class).userId()).isEqualTo(1L);
        }
        assertThat(captor.getAllValues().get(0).getId()).isNotEqualTo(captor.getAllValues().get(1).getId());
    }

    @Test void defaultMultiChannelDispatchIncludesInAppExactlyOnce() {
        var repo = mock(NotificationOutboxRepository.class);
        new KafkaNotificationDispatcher(repo, new ObjectMapper().findAndRegisterModules(), Clock.systemUTC())
                .dispatch(1L, "Title", "Message", "system", null, null);
        verify(repo, times(3)).save(any());
    }
}
