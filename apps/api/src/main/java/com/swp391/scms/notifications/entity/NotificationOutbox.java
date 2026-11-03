package com.swp391.scms.notifications.entity;

import com.swp391.scms.notifications.port.NotificationChannel;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** One durable delivery per channel. Kafka carries only this opaque ID, never the message or email. */
@Entity
@Table(name = "notification_outbox", indexes = {
        @Index(name = "ix_notification_outbox_pending", columnList = "completed_at,next_attempt_at,created_at"),
        @Index(name = "ix_notification_outbox_retention", columnList = "completed_at")
})
public class NotificationOutbox {
    @Id private UUID id;
    @Version private Long version;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationChannel channel;
    @Column(nullable = false, length = org.hibernate.Length.LONG32)
    private String payload;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(nullable = false) private int attempts;

    protected NotificationOutbox() { }

    public NotificationOutbox(NotificationChannel channel, String payload, Instant now) {
        this.id = UUID.randomUUID();
        this.channel = channel;
        this.payload = payload;
        this.createdAt = now;
        this.nextAttemptAt = now;
    }

    public UUID getId() { return id; }
    public NotificationChannel getChannel() { return channel; }
    public String getPayload() { return payload; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public int getAttempts() { return attempts; }
    public void claim(Instant retryAt) { nextAttemptAt = retryAt; attempts++; }
    public void published(Instant now) { publishedAt = now; }
    public void complete(Instant now) { completedAt = now; }
}
