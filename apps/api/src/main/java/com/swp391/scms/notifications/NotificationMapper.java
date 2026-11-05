package com.swp391.scms.notifications;

import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.entity.Notification;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

@Component
public class NotificationMapper {
    private final NotificationLocalizer localizer;

    public NotificationMapper(NotificationLocalizer localizer) {
        this.localizer = localizer;
    }

    public NotificationDto toDto(Notification entity) {
        if (entity == null) return null;
        boolean vietnamese = "vi".equals(LocaleContextHolder.getLocale().getLanguage());
        return new NotificationDto(
            entity.getId(),
            vietnamese ? localizer.localizeTitle(entity.getTitle()) : entity.getTitle(),
            vietnamese ? localizer.localizeMessage(entity.getMessage()) : entity.getMessage(),
            entity.getType(),
            entity.getRelatedEntityType(),
            entity.getRelatedEntityId(),
            entity.isRead(),
            entity.getCreatedAt(),
            entity.getActionPath()
        );
    }
}
