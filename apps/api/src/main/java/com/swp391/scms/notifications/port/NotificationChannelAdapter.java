package com.swp391.scms.notifications.port;

/**
 * Adapter interface for individual notification channels (SCRUM-108).
 * Implementations handle specific delivery channels (e.g. IN_APP, EMAIL, PUSH, WEBHOOK).
 */
public interface NotificationChannelAdapter {

    /**
     * The notification channel supported by this adapter.
     */
    NotificationChannel getChannel();

    /**
     * Deliver the notification payload via this adapter's channel.
     */
    void send(NotificationPayload payload);

    /** Durable transport supplies a stable key. Real providers should use it for their idempotency API. */
    default void send(NotificationPayload payload, String deliveryKey) {
        send(payload);
    }
}

