package com.swp391.scms.notifications.port;

/** Marker: dispatch durably joins the caller's transaction and must run before commit. */
public interface TransactionalNotificationDispatcher extends NotificationDispatcher { }
