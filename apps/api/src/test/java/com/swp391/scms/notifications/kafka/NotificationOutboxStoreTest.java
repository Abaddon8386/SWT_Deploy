package com.swp391.scms.notifications.kafka;

import com.swp391.scms.notifications.entity.NotificationOutbox;
import com.swp391.scms.notifications.port.NotificationChannel;
import com.swp391.scms.notifications.repository.NotificationOutboxRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class NotificationOutboxStoreTest {
    private final Instant now = Instant.parse("2026-11-03T07:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final NotificationKafkaProperties properties = new NotificationKafkaProperties("test", "test", 25,
            Duration.ofSeconds(60), Duration.ofSeconds(5), Duration.ofDays(7));

    @Test void expiredLeaseCanRetryAndLiveLeaseCannotBeClaimedAgain() {
        var repo = mock(NotificationOutboxRepository.class);
        var job = new NotificationOutbox(NotificationChannel.PUSH, "{}", now.minusSeconds(1));
        when(repo.lockById(job.getId())).thenReturn(Optional.of(job));
        var store = new NotificationOutboxStore(repo, properties, clock);
        assertThat(store.claim(job.getId())).isTrue();
        assertThat(job.getNextAttemptAt()).isEqualTo(now.plusSeconds(60));
        assertThat(store.claim(job.getId())).isFalse();
        assertThat(job.getAttempts()).isEqualTo(1);
        var later = new NotificationOutboxStore(repo, properties, Clock.offset(clock, Duration.ofSeconds(61)));
        assertThat(later.claim(job.getId())).isTrue();
        assertThat(job.getAttempts()).isEqualTo(2);
    }

    @Test void completedJobsAreNotPublishedAgainAndRetentionOnlyTouchesCompletedRows() {
        var repo = mock(NotificationOutboxRepository.class);
        var job = new NotificationOutbox(NotificationChannel.PUSH, "{}", now);
        job.complete(now);
        when(repo.lockById(job.getId())).thenReturn(Optional.of(job));
        var store = new NotificationOutboxStore(repo, properties, clock);
        assertThat(store.claim(job.getId())).isFalse();
        store.cleanup(); verify(repo).deleteCompletedBefore(now.minus(Duration.ofDays(7)));
    }
}
