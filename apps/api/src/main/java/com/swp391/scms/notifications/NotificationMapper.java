package com.swp391.scms.notifications;

import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.entity.Notification;
import org.springframework.stereotype.Component;

@Component
public class NotificationMapper {
    public NotificationDto toDto(Notification entity) {
        if (entity == null) return null;
        return new NotificationDto(
            entity.getId(),
            NotificationLocalizer.localizeTitle(entity.getTitle()),
            NotificationLocalizer.localizeMessage(entity.getMessage()),
            entity.getType(),
            entity.getRelatedEntityType(),
            entity.getRelatedEntityId(),
            entity.isRead(),
            entity.getCreatedAt(),
            entity.getActionPath()
        );
    }
}
