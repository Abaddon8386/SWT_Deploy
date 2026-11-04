package com.swp391.scms.notifications;

import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.entity.Notification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationMapperTest {

    private final NotificationMapper mapper = new NotificationMapper();

    @Test
    @DisplayName("Maps legacy English notification entity to localized Vietnamese DTO")
    void testToDto_LocalizesEnglishToVietnamese() {
        Notification entity = new Notification();
        entity.setId(99L);
        entity.setTitle("Upcoming class reminder");
        entity.setMessage("Your class \"Lớp boxing\" is starting at 09:00 on 04/11/2026. Get ready!");
        entity.setType("class_reminder");
        entity.setCreatedAt(LocalDateTime.now());
        entity.setRead(false);

        NotificationDto dto = mapper.toDto(entity);

        assertThat(dto).isNotNull();
        assertThat(dto.title()).isEqualTo("Nhắc nhở lịch học sắp diễn ra");
        assertThat(dto.message()).isEqualTo("Lớp học \"Lớp boxing\" của bạn sẽ bắt đầu lúc 09:00 ngày 04/11/2026. Hãy chuẩn bị sẵn sàng!");
    }
}

