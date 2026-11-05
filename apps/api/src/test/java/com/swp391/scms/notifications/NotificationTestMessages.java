package com.swp391.scms.notifications;

import com.swp391.scms.common.i18n.MessageService;
import org.springframework.context.support.ResourceBundleMessageSource;

final class NotificationTestMessages {
    private NotificationTestMessages() {}

    static NotificationLocalizer localizer() {
        var source = new ResourceBundleMessageSource();
        source.setBasename("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return new NotificationLocalizer(new MessageService(source));
    }
}
