package com.swp391.scms.notifications;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationLocalizerTest {

    @Test
    @DisplayName("Localizes English upcoming class reminder title and body")
    void testLocalizeClassReminder() {
        String title = "Upcoming class reminder";
        String body = "Your class \"Lớp boxing\" is starting at 09:00 on 04/11/2026. Get ready!";

        assertThat(NotificationLocalizer.localizeTitle(title))
                .isEqualTo("Nhắc nhở lịch học sắp diễn ra");
        assertThat(NotificationLocalizer.localizeMessage(body))
                .isEqualTo("Lớp học \"Lớp boxing\" của bạn sẽ bắt đầu lúc 09:00 ngày 04/11/2026. Hãy chuẩn bị sẵn sàng!");
    }

    @Test
    @DisplayName("Localizes English membership package expiry title and body")
    void testLocalizePackageExpiry() {
        String title = "Membership package expiring soon";
        String body1 = "Your membership package \"Gold 1 Month\" will expire on 10/11/2026 (in 7 days). Please renew to continue using our services.";
        String body2 = "Your membership package Gold will expire in 3 day(s) (10/11/2026). Please renew to avoid workout interruption.";

        assertThat(NotificationLocalizer.localizeTitle(title))
                .isEqualTo("Gói tập sắp hết hạn");
        assertThat(NotificationLocalizer.localizeMessage(body1))
                .isEqualTo("Gói tập \"Gold 1 Month\" của bạn sẽ hết hạn vào ngày 10/11/2026. Vui lòng gia hạn để tiếp tục sử dụng dịch vụ.");
        assertThat(NotificationLocalizer.localizeMessage(body2))
                .isEqualTo("Gói tập Gold của bạn sẽ hết hạn sau 3 ngày (10/11/2026). Vui lòng gia hạn để không gián đoạn tập luyện.");
    }

    @Test
    @DisplayName("Preserves already Vietnamese notifications intact")
    void testPreservesVietnamese() {
        String title = "Đặt chỗ buổi học thành công";
        String body = "Bạn đã đặt chỗ lớp Sunrise Yoga Cuối Tuần ngày 2026-11-14 (07:00-08:30).";

        assertThat(NotificationLocalizer.localizeTitle(title)).isEqualTo(title);
        assertThat(NotificationLocalizer.localizeMessage(body)).isEqualTo(body);
    }
}

