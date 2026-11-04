package com.swp391.scms.scheduling.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.entity.ClassSession;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

final class SessionEligibility {
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private SessionEligibility() {
    }

    static void ensureBookable(ClassSession session, Clock clock) {
        if ("cancelled".equalsIgnoreCase(session.getStatus())) {
            throw new BadRequestException("SCHEDULING_SESSION_CANCELLED", "error.scheduling.session_cancelled",
                    null, "This session has been cancelled");
        }
        if (!"scheduled".equalsIgnoreCase(session.getStatus())) {
            throw new BadRequestException("SCHEDULING_SESSION_NOT_BOOKABLE", "error.scheduling.session_not_bookable",
                    null, "This session is not open for booking");
        }
        ensureFuture(session.getSessionDate(), session.getStartTime(), clock);
    }

    static void ensureFuture(LocalDate date, LocalTime start, Clock clock) {
        if (!LocalDateTime.of(date, start).atZone(CENTER_ZONE).toInstant().isAfter(clock.instant())) {
            throw new BadRequestException("SCHEDULING_PAST_SESSION", "error.scheduling.past_session",
                    null, "Session must start in the future");
        }
    }

    static void ensureMembershipCoversSession(MembershipSubscriptionRepository subscriptions,
                                             Long memberId, LocalDate sessionDate, Clock clock) {
        LocalDate today = clock.instant().atZone(CENTER_ZONE).toLocalDate();
        if (!subscriptions.hasActiveMembership(memberId, today)) {
            throw new ForbiddenException("SCHEDULING_MEMBERSHIP_INVALID",
                    "error.scheduling.membership_expired_or_inactive", null, "Bạn chưa đăng ký gói tập, gói tập chưa được kích hoạt hoặc đã hết hạn. Vui lòng đăng ký gói tập trước khi đặt lịch");
        }
        // One currently active period must cover both dates; do not combine future renewals.
        if (!subscriptions.hasActiveMembershipCoveringSession(memberId, today, sessionDate)) {
            throw new ForbiddenException("SCHEDULING_MEMBERSHIP_NOT_COVERING_SESSION",
                    "error.scheduling.membership_session_not_covered", new Object[]{sessionDate}, "Gói tập hiện tại không bao phủ ngày học " + sessionDate + ". Vui lòng chọn buổi học nằm trong thời hạn gói tập hoặc gia hạn thêm.");
        }
    }

    /** Phòng hạng PLATINUM chỉ cho phép hội viên có gói PLATINUM đang hiệu lực bao phủ ngày học. */
    static void ensurePlatinumRoomAccess(MembershipSubscriptionRepository subscriptions,
                                         Long memberId, com.swp391.scms.facilities.entity.Room room, LocalDate sessionDate) {
        if (room == null || !"PLATINUM".equalsIgnoreCase(room.getTier())) {
            return;
        }
        boolean hasPlatinum = subscriptions.findByMemberUserIdAndStatus(memberId, "active").stream()
                .anyMatch(sub -> !sub.getStartDate().isAfter(sessionDate)
                        && !sub.getEndDate().isBefore(sessionDate)
                        && sub.getMembershipPackage() != null
                        && sub.getMembershipPackage().getName() != null
                        && sub.getMembershipPackage().getName().toUpperCase(java.util.Locale.ROOT)
                                .contains(com.swp391.scms.facilities.CatalogSeeder.PLATINUM_NAME));
        if (!hasPlatinum) {
            throw new ForbiddenException("SCHEDULING_ROOM_PLATINUM_REQUIRED",
                    "error.scheduling.room_platinum_required", null,
                    "Phòng Gym VIP chỉ dành cho hội viên sở hữu gói Platinum");
        }
    }
}
