package com.swp391.scms.notifications;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility class ensuring all notifications sent and retrieved across SCMS
 * are strictly in Vietnamese, as required by the center's branding and language policy.
 */
public final class NotificationLocalizer {

    private NotificationLocalizer() {}

    private static final Pattern CLASS_REMINDER_BODY =
            Pattern.compile("Your class \"([^\"]+)\" is starting at ([0-9:]+) on ([0-9/\\-]+)\\. Get ready!", Pattern.CASE_INSENSITIVE);

    private static final Pattern PACKAGE_EXPIRY_BODY_1 =
            Pattern.compile("Your membership package \"([^\"]+)\" will expire on ([0-9/\\-]+)(?: \\(in (\\d+) days\\))?\\. Please renew to continue using our services\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PACKAGE_EXPIRY_BODY_2 =
            Pattern.compile("Your membership package ([^ ]+) will expire in (\\d+) day\\(s\\) \\(([^)]+)\\)\\. Please renew to avoid workout interruption\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SUPPORT_STATUS_BODY =
            Pattern.compile("Your support request \"([^\"]+)\" has been updated to status ([^.]+)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SUPPORT_NEW_MSG_BODY =
            Pattern.compile("You have a new message from ([^ ]+) in support request \"([^\"]+)\"\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern ENROLLED_BODY =
            Pattern.compile("You have enrolled in class ([^ ]+) on ([0-9/\\-]+)", Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_BOOKED_BODY =
            Pattern.compile("You booked class ([^ ]+) on ([0-9/\\-]+) \\(([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern BULK_BOOKED_BODY =
            Pattern.compile("You booked (\\d+) class sessions\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_CANCELLED_BODY =
            Pattern.compile("Your seat in class ([^ ]+) on ([0-9/\\-]+) was cancelled\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern BULK_CANCELLED_BODY =
            Pattern.compile("(\\d+) of your class sessions were cancelled\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_COACH_BODY =
            Pattern.compile("Member ([^ ]+) booked a PT session on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_MEMBER_BODY =
            Pattern.compile("You booked a PT session with ([^ ]+) on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern PT_BOOKING_CANCELLED_BODY =
            Pattern.compile("Member ([^ ]+) cancelled the PT session on ([0-9/\\-]+) \\(([^ ]+) - ([^)]+)\\)\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern REVIEW_BODY =
            Pattern.compile("(.+) submitted a (\\d+)-star review for you\\.", Pattern.CASE_INSENSITIVE);

    private static final Pattern VNPAY_BODY =
            Pattern.compile("Received ([0-9,.]+) VND for transaction (.+)\\.", Pattern.CASE_INSENSITIVE);

    public static String localizeTitle(String title) {
        if (title == null || title.isBlank()) {
            return title;
        }
        String trimmed = title.trim();
        switch (trimmed) {
            case "Upcoming class reminder":
                return "Nhắc nhở lịch học sắp diễn ra";
            case "Membership package expiring soon":
                return "Gói tập sắp hết hạn";
            case "Class Session Cancelled":
            case "Class session cancelled":
                return "Thông báo hủy buổi học";
            case "Support request updated":
                return "Cập nhật yêu cầu hỗ trợ";
            case "New message in support request":
                return "Tin nhắn mới trong yêu cầu hỗ trợ";
            case "New member complaint":
                return "Khiếu nại mới từ hội viên";
            case "Complaint needs a manager":
                return "Khiếu nại cần quản lý xử lý";
            case "Your complaint is with a manager":
                return "Khiếu nại đang được quản lý xem xét";
            case "Class enrollment successful":
                return "Đăng ký lớp học thành công";
            case "Class enrollment cancelled":
                return "Hủy đăng ký lớp học";
            case "Class session booked":
                return "Đặt chỗ buổi học thành công";
            case "Bulk booking successful":
                return "Đặt lịch hàng loạt thành công";
            case "Class session booking cancelled":
                return "Đã hủy chỗ buổi học";
            case "Several class sessions cancelled":
                return "Đã hủy nhiều buổi học";
            case "New PT booking":
                return "Lịch dạy PT 1:1 mới";
            case "PT session booked":
                return "Đặt lịch HLV 1:1 thành công";
            case "PT session cancelled":
                return "Hủy lịch dạy PT 1:1";
            case "New member review":
                return "Đánh giá mới từ học viên";
            case "New progress evaluation":
                return "Đánh giá tiến độ mới";
            case "VNPay payment successful":
                return "Thanh toán VNPay thành công";
            case "New internal request awaiting review":
                return "Đơn từ nội bộ mới cần duyệt";
            case "Your request was approved":
                return "Đơn từ của bạn đã được duyệt";
            case "Your request was rejected":
                return "Đơn từ của bạn bị từ chối";
            case "Membership hold request approved":
                return "Yêu cầu bảo lưu gói tập đã được xác nhận";
            case "Membership hold request rejected":
                return "Yêu cầu bảo lưu gói tập không được duyệt";
            case "Membership resumed after hold":
                return "Gói tập đã tự mở lại sau bảo lưu";
            case "Booking released by membership":
                return "Lịch đã được hủy do gói tập";
            default:
                return title;
        }
    }

    public static String localizeMessage(String message) {
        if (message == null || message.isBlank()) {
            return message;
        }

        Matcher m = CLASS_REMINDER_BODY.matcher(message);
        if (m.matches()) {
            return "Lớp học \"" + m.group(1) + "\" của bạn sẽ bắt đầu lúc " + m.group(2) + " ngày " + m.group(3) + ". Hãy chuẩn bị sẵn sàng!";
        }

        m = PACKAGE_EXPIRY_BODY_1.matcher(message);
        if (m.matches()) {
            return "Gói tập \"" + m.group(1) + "\" của bạn sẽ hết hạn vào ngày " + m.group(2) + ". Vui lòng gia hạn để tiếp tục sử dụng dịch vụ.";
        }

        m = PACKAGE_EXPIRY_BODY_2.matcher(message);
        if (m.matches()) {
            return "Gói tập " + m.group(1) + " của bạn sẽ hết hạn sau " + m.group(2) + " ngày (" + m.group(3) + "). Vui lòng gia hạn để không gián đoạn tập luyện.";
        }

        m = SUPPORT_STATUS_BODY.matcher(message);
        if (m.matches()) {
            return "Yêu cầu hỗ trợ \"" + m.group(1) + "\" của bạn đã chuyển sang trạng thái " + m.group(2) + ".";
        }

        m = SUPPORT_NEW_MSG_BODY.matcher(message);
        if (m.matches()) {
            return "Bạn có tin nhắn mới từ " + m.group(1) + " trong yêu cầu \"" + m.group(2) + "\".";
        }

        m = ENROLLED_BODY.matcher(message);
        if (m.matches()) {
            return "Bạn đã đăng ký tham gia lớp " + m.group(1) + " vào ngày " + m.group(2);
        }

        m = SESSION_BOOKED_BODY.matcher(message);
        if (m.matches()) {
            return "Bạn đã đặt chỗ lớp " + m.group(1) + " ngày " + m.group(2) + " (" + m.group(3) + ").";
        }

        m = BULK_BOOKED_BODY.matcher(message);
        if (m.matches()) {
            return "Bạn đã đặt chỗ " + m.group(1) + " buổi học.";
        }

        m = SESSION_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return "Chỗ của bạn ở lớp " + m.group(1) + " ngày " + m.group(2) + " đã được hủy.";
        }

        m = BULK_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return m.group(1) + " buổi học của bạn đã được hủy.";
        }

        m = PT_BOOKING_COACH_BODY.matcher(message);
        if (m.matches()) {
            return "Hội viên " + m.group(1) + " đã đặt lịch tập 1:1 ngày " + m.group(2) + " (" + m.group(3) + " - " + m.group(4) + ").";
        }

        m = PT_BOOKING_MEMBER_BODY.matcher(message);
        if (m.matches()) {
            return "Bạn đã đặt lịch tập 1:1 với HLV " + m.group(1) + " ngày " + m.group(2) + " (" + m.group(3) + " - " + m.group(4) + ").";
        }

        m = PT_BOOKING_CANCELLED_BODY.matcher(message);
        if (m.matches()) {
            return "Hội viên " + m.group(1) + " đã hủy lịch tập 1:1 ngày " + m.group(2) + " (" + m.group(3) + " - " + m.group(4) + ").";
        }

        m = REVIEW_BODY.matcher(message);
        if (m.matches()) {
            return m.group(1) + " đã gửi đánh giá " + m.group(2) + " sao kèm nhận xét cho bạn.";
        }

        m = VNPAY_BODY.matcher(message);
        if (m.matches()) {
            return "Đã nhận " + m.group(1) + " VND cho giao dịch " + m.group(2) + ".";
        }

        if (message.equalsIgnoreCase("Your class enrollment has been cancelled successfully")) {
            return "Lượt đăng ký lớp học của bạn đã được hủy thành công";
        }

        if (message.equalsIgnoreCase("Your coach has sent a progress evaluation. Open it to view your score and feedback.")) {
            return "Huấn luyện viên đã gửi đánh giá tiến độ. Mở để xem điểm và nhận xét của bạn.";
        }

        return message;
    }
}
