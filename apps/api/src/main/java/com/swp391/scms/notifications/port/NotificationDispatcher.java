package com.swp391.scms.notifications.port;

import java.util.Set;

/**
 * Port interface for multi-channel notification dispatching (SCRUM-108).
 * Submits in-app, simulated email, push and webhook delivery to the selected transport.
 * The Kafka adapter durably enqueues in the caller transaction; the legacy adapter schedules in RAM.
 */
public interface NotificationDispatcher {

    /**
     * Dispatches notification across channels specified in the payload.
     * Delivery is asynchronous; a durable adapter returns only after the job has been persisted.
     */
    void dispatch(NotificationPayload payload);

    /**
     * Dispatches notification to all standard channels (IN_APP, EMAIL, PUSH).
     */
    void dispatch(Long userId, String title, String message, String type, String relatedEntityType, Long relatedEntityId);

    /**
     * Dispatches notification with explicitly selected channels.
     */
    void dispatch(Long userId, String title, String message, String type, String relatedEntityType, Long relatedEntityId, Set<NotificationChannel> channels);
}

