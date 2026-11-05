package com.swp391.scms.notifications;

import com.swp391.scms.common.i18n.MessageService;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Vietnamese presentation of recognized legacy English notification templates.
 * Stored content and outbound payloads retain the sender's resolved language.
 */
@Component
public final class NotificationLocalizer {

    private final MessageService messageService;

    public NotificationLocalizer(MessageService messageService) {
        this.messageService = messageService;
    }

    private static final Pattern CLASS_REMINDER_BODY =
            Pattern.compile("Your class \"([^\"]+)\" is starting at ([0-9:]+) on ([0-9/\\-]+)\\. Get ready!", Pattern.CASE_INSENSITIVE);

    private static final Pattern PACKAGE_EXPIRY_BODY_1 =
            Pattern.compile("Your membership package \"([^\"]+)\" will expire on ([0-9/\\-]+)(?: \\(in (\\d+) days\\))?\\. Please renew to continue using our services\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PACKAGE_EXPIRY_BODY_2 =
            Pattern.compile("Your membership package (.+?) will expire in (\\d+) day\\(s\\) \\(([^)]+)\\)\\. Please renew to avoid workout interruption\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SUPPORT_STATUS_BODY =
            Pattern.compile("Your support request \"([^\"]+)\" has been updated to status ([^.]+)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SUPPORT_NEW_MSG_BODY =
            Pattern.compile("You have a new message from (.+?) in support request \"([^\"]+)\"\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern ENROLLED_BODY =
            Pattern.compile("You have enrolled in class (.+?) on ([0-9/\\-]+)", Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_BOOKED_BODY =
            Pattern.compile("You booked class (.+?) on ([0-9/\\-]+) \\(([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern BULK_BOOKED_BODY =
            Pattern.compile("You booked (\\d+) class sessions\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_CANCELLED_BODY =
            Pattern.compile("Your seat in class (.+?) on ([0-9/\\-]+) was cancelled\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern BULK_CANCELLED_BODY =
            Pattern.compile("(\\d+) of your class sessions were cancelled\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_COACH_BODY =
            Pattern.compile("Member (.+?) booked a PT session on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_MEMBER_BODY =
            Pattern.compile("You booked a PT session with (.+?) on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_CANCELLED_BODY =
            Pattern.compile("Member (.+?) cancelled the PT session on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern REVIEW_BODY =
            Pattern.compile("(.+) submitted a (\\d+)-star review for you\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern VNPAY_BODY =
            Pattern.compile("Received ([0-9,.]+) VND for transaction (.+)\\.", Pattern.CASE_INSENSITIVE);

    public String localizeTitle(String title) {
        if (title == null || title.isBlank()) {
            return title;
        }
        String trimmed = title.trim();
        switch (trimmed) {
            case "Upcoming class reminder":
                return messageService.getMessage("notifications.class_reminder.title");
            case "Membership package expiring soon":
                return messageService.getMessage("notifications.package_expiry.title");
            case "Class Session Cancelled":
            case "Class session cancelled":
                return messageService.getMessage("notifications.session.cancelled.title");
            case "Support request updated":
                return messageService.getMessage("notifications.support.status_updated.title");
            case "New message in support request":
                return messageService.getMessage("notifications.support.new_message.title");
            case "New member complaint":
                return messageService.getMessage("notifications.support.new_request.title");
            case "Complaint needs a manager":
                return messageService.getMessage("notifications.support.escalated_manager.title");
            case "Your complaint is with a manager":
                return messageService.getMessage("notifications.support.escalated_member.title");
            case "Class enrollment successful":
                return messageService.getMessage("notifications.booking.enrolled.title");
            case "Class enrollment cancelled":
                return messageService.getMessage("notifications.booking.cancelled.title");
            case "Class session booked":
                return messageService.getMessage("notifications.booking.session_booked.title");
            case "Bulk booking successful":
                return messageService.getMessage("notifications.booking.bulk_booked.title");
            case "Class session booking cancelled":
                return messageService.getMessage("notifications.booking.session_cancelled.title");
            case "Several class sessions cancelled":
                return messageService.getMessage("notifications.booking.bulk_cancelled.title");
            case "New PT booking":
                return messageService.getMessage("notifications.coaching.booking.coach.title");
            case "PT session booked":
                return messageService.getMessage("notifications.coaching.booking.member.title");
            case "PT session cancelled":
                return messageService.getMessage("notifications.coaching.booking.cancelled.title");
            case "New member review":
                return messageService.getMessage("notifications.coaching.review.title");
            case "New progress evaluation":
                return messageService.getMessage("notifications.evaluation.title");
            case "VNPay payment successful":
                return messageService.getMessage("notifications.payment.vnpay_success.title");
            case "New internal request awaiting review":
                return messageService.getMessage("notifications.operations.created.title");
            case "Your request was approved":
                return messageService.getMessage("notifications.operations.approved.title");
            case "Your request was rejected":
                return messageService.getMessage("notifications.operations.rejected.title");
            case "Membership hold request approved":
                return messageService.getMessage("notifications.membership.hold_approved.title");
            case "Membership hold request rejected":
                return messageService.getMessage("notifications.membership.hold_rejected.title");
            case "Membership resumed after hold":
                return messageService.getMessage("notifications.membership.hold_auto_resumed.title");
            case "Booking released by membership":
                return messageService.getMessage("notifications.membership.booking_released.title");
            default:
                return title;
        }
    }

    public String localizeMessage(String message) {
        if (message == null || message.isBlank()) {
            return message;
        }

        Matcher m = CLASS_REMINDER_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.class_reminder.body", m.group(1), m.group(2), m.group(3));
        }

        m = PACKAGE_EXPIRY_BODY_1.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.legacy.package_expiry.body", m.group(1), m.group(2));
        }

        m = PACKAGE_EXPIRY_BODY_2.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.legacy.package_expiry_days.body", m.group(1), m.group(2), m.group(3));
        }

        m = SUPPORT_STATUS_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.support.status_updated.body", m.group(1), m.group(2));
        }

        m = SUPPORT_NEW_MSG_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.support.new_message.body", m.group(1), m.group(2));
        }

        m = ENROLLED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.booking.enrolled.body", m.group(1), m.group(2));
        }

        m = SESSION_BOOKED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.booking.session_booked.body", m.group(1), m.group(2), m.group(3));
        }

        m = BULK_BOOKED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.booking.bulk_booked.body", m.group(1));
        }

        m = SESSION_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.booking.session_cancelled.body", m.group(1), m.group(2));
        }

        m = BULK_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.booking.bulk_cancelled.body", m.group(1));
        }

        m = PT_BOOKING_COACH_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.coaching.booking.coach.body", m.group(1), m.group(2), m.group(3), m.group(4));
        }

        m = PT_BOOKING_MEMBER_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.coaching.booking.member.body", m.group(1), m.group(2), m.group(3), m.group(4));
        }

        m = PT_BOOKING_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.coaching.booking.cancelled.body", m.group(1), m.group(2), m.group(3), m.group(4));
        }

        m = REVIEW_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.coaching.review.body", m.group(1), m.group(2));
        }

        m = VNPAY_BODY.matcher(message);
        if (m.matches()) {
            return messageService.getMessage("notifications.payment.vnpay_success.body", m.group(1), m.group(2));
        }

        if (message.equalsIgnoreCase("Your class enrollment has been cancelled successfully")) {
            return messageService.getMessage("notifications.booking.cancelled.body");
        }

        if (message.equalsIgnoreCase("Your coach has sent a progress evaluation. Open it to view your score and feedback.")) {
            return messageService.getMessage("notifications.evaluation.body");
        }

        return message;
    }
}

