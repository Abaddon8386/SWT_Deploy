package com.swp391.scms.notifications;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationLocalizerTest {

    private final NotificationLocalizer localizer = NotificationTestMessages.localizer();

    @BeforeEach
    void useVietnameseLocale() {
        org.springframework.context.i18n.LocaleContextHolder.setLocale(java.util.Locale.forLanguageTag("vi"));
    }

    @AfterEach
    void clearLocale() {
        org.springframework.context.i18n.LocaleContextHolder.resetLocaleContext();
    }

    @Test
    void resolvesLegacyPresentationThroughMessageService() {
        var source = new org.springframework.context.support.StaticMessageSource();
        source.addMessage("notifications.class_reminder.title", java.util.Locale.forLanguageTag("vi"), "Bundle reminder");
        source.addMessage("notifications.class_reminder.body", java.util.Locale.forLanguageTag("vi"), "Bundle class {0} at {1} on {2}");
        org.springframework.context.i18n.LocaleContextHolder.setLocale(java.util.Locale.forLanguageTag("vi"));
        try (var context = new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            context.registerBean(com.swp391.scms.common.i18n.MessageService.class,
                    () -> new com.swp391.scms.common.i18n.MessageService(source));
            context.register(NotificationLocalizer.class);
            context.refresh();
            var localizer = context.getBean(NotificationLocalizer.class);
            assertThat(localizer.localizeTitle("Upcoming class reminder")).isEqualTo("Bundle reminder");
            assertThat(localizer.localizeMessage("Your class \"Sunrise Yoga\" is starting at 07:00 on 2026-11-14. Get ready!"))
                    .isEqualTo("Bundle class Sunrise Yoga at 07:00 on 2026-11-14");
        } finally {
            org.springframework.context.i18n.LocaleContextHolder.resetLocaleContext();
        }
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "You booked class Sunrise Yoga on 2026-11-14 (07:00-08:30).|Bạn đã đặt chỗ lớp Sunrise Yoga ngày 2026-11-14 (07:00-08:30).",
            "You have enrolled in class Sunrise Yoga on 2026-11-14|Bạn đã đăng ký tham gia lớp Sunrise Yoga vào ngày 2026-11-14",
            "Your seat in class Sunrise Yoga on 2026-11-14 was cancelled.|Chỗ của bạn ở lớp Sunrise Yoga ngày 2026-11-14 đã được hủy.",
            "Member Nguyễn Văn An booked a PT session on 2026-11-14 (07:00 - 08:30).|Hội viên Nguyễn Văn An đã đặt lịch tập 1:1 ngày 2026-11-14 (07:00 - 08:30).",
            "You booked a PT session with Trần Minh Quân on 2026-11-14 (07:00 - 08:30).|Bạn đã đặt lịch tập 1:1 với HLV Trần Minh Quân ngày 2026-11-14 (07:00 - 08:30).",
            "Member Nguyễn Văn An cancelled the PT session on 2026-11-14 (07:00 - 08:30).|Hội viên Nguyễn Văn An đã hủy lịch tập 1:1 ngày 2026-11-14 (07:00 - 08:30).",
            "You have a new message from Trần Minh Quân in support request \"Booking help\".|Bạn có tin nhắn mới từ Trần Minh Quân trong yêu cầu \"Booking help\".",
            "Your membership package Gold 1 Month will expire in 3 day(s) (10/11/2026). Please renew to avoid workout interruption.|Gói tập Gold 1 Month của bạn sẽ hết hạn sau 3 ngày (10/11/2026). Vui lòng gia hạn để không gián đoạn tập luyện."
    })
    void translatesLegacyMessagesWithMultiwordNames(String original, String expected) {
        assertThat(localizer.localizeMessage(original)).isEqualTo(expected);
    }

    @Test
    @DisplayName("Localizes English upcoming class reminder title and body")
    void testLocalizeClassReminder() {
        String title = "Upcoming class reminder";
        String body = "Your class \"Lớp boxing\" is starting at 09:00 on 04/11/2026. Get ready!";

        assertThat(localizer.localizeTitle(title))
                .isEqualTo("Nhắc nhở lịch học sắp diễn ra");
        assertThat(localizer.localizeMessage(body))
                .isEqualTo("Lớp học \"Lớp boxing\" của bạn sẽ bắt đầu lúc 09:00 ngày 04/11/2026. Hãy chuẩn bị sẵn sàng!");
    }

    @Test
    @DisplayName("Localizes English membership package expiry title and body")
    void testLocalizePackageExpiry() {
        String title = "Membership package expiring soon";
        String body1 = "Your membership package \"Gold 1 Month\" will expire on 10/11/2026 (in 7 days). Please renew to continue using our services.";
        String body2 = "Your membership package Gold will expire in 3 day(s) (10/11/2026). Please renew to avoid workout interruption.";

        assertThat(localizer.localizeTitle(title))
                .isEqualTo("Gói tập sắp hết hạn");
        assertThat(localizer.localizeMessage(body1))
                .isEqualTo("Gói tập \"Gold 1 Month\" của bạn sẽ hết hạn vào ngày 10/11/2026. Vui lòng gia hạn để tiếp tục sử dụng dịch vụ.");
        assertThat(localizer.localizeMessage(body2))
                .isEqualTo("Gói tập Gold của bạn sẽ hết hạn sau 3 ngày (10/11/2026). Vui lòng gia hạn để không gián đoạn tập luyện.");
    }

    @Test
    @DisplayName("Preserves already Vietnamese notifications intact")
    void testPreservesVietnamese() {
        String title = "Đặt chỗ buổi học thành công";
        String body = "Bạn đã đặt chỗ lớp Sunrise Yoga Cuối Tuần ngày 2026-11-14 (07:00-08:30).";

        assertThat(localizer.localizeTitle(title)).isEqualTo(title);
        assertThat(localizer.localizeMessage(body)).isEqualTo(body);
    }
}

