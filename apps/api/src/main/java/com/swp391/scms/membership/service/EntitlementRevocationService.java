package com.swp391.scms.membership.service;

import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.service.EnrollmentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.function.Predicate;

/**
 * Releases what a member booked once their membership no longer covers it (hold, cancellation, refund).
 * Classes, 1:1 coach sessions and courts all require an active membership on the day they take place,
 * so each upcoming booking is kept only while some active period still covers its date.
 */
@Service
public class EntitlementRevocationService {

    private final MembershipSubscriptionRepository subscriptions;
    private final EnrollmentService enrollmentService;
    private final CoachBookingRepository coachBookings;
    private final CourtBookingRepository courtBookings;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.notifications.NotificationService notificationService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.common.i18n.MessageService messageService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.ClassEnrollmentRepository classEnrollments;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;

    public EntitlementRevocationService(MembershipSubscriptionRepository subscriptions,
                                        EnrollmentService enrollmentService,
                                        CoachBookingRepository coachBookings,
                                        CourtBookingRepository courtBookings,
                                        Clock clock) {
        this.subscriptions = subscriptions;
        this.enrollmentService = enrollmentService;
        this.coachBookings = coachBookings;
        this.courtBookings = courtBookings;
        this.clock = clock;
    }

    /** Cancels upcoming bookings whose date no active period covers; returns how many were cancelled. */
    @Transactional
    public int revokeUncoveredBookings(Long memberId, String reason) {
        if (memberId == null) return 0;
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalTime nowTime = now.toLocalTime();
        String cancelReason = reason == null || reason.isBlank() ? null
                : reason.length() > 255 ? reason.substring(0, 255) : reason;
        Predicate<LocalDate> covered = date -> subscriptions.hasActiveMembership(memberId, date);

        int cancelled = enrollmentService.cancelFutureEnrollmentsForMember(memberId, cancelReason, covered);
        for (CoachBooking booking : coachBookings.findFutureConfirmedByMember(memberId, today)) {
            if (started(booking.getBookingDate(), booking.getStartTime(), today, nowTime)
                    || covered.test(booking.getBookingDate())) continue;
            booking.setStatus("cancelled");
            booking.setCancelledAt(now);
            booking.setCancelReason(cancelReason);
            cancelled++;
            notifyReleased(memberId, "notifications.membership.pt_released.body", booking.getId(),
                    booking.getBookingDate(), booking.getStartTime());
            if (booking.getCoach() != null) {
                notify(booking.getCoach().getUserId(), "notifications.coaching.booking.cancelled.title",
                        msg("notifications.coaching.booking.cancelled.body",
                                booking.getMember() != null && booking.getMember().getUser() != null
                                        ? booking.getMember().getUser().getFullName() : "",
                                booking.getBookingDate(), hhmm(booking.getStartTime()), hhmm(booking.getEndTime())),
                        booking.getId());
            }
        }
        for (CourtBooking booking : courtBookings.findUpcomingBookedByMember(memberId, today)) {
            if (started(booking.getBookingDate(), booking.getStartTime(), today, nowTime)
                    || covered.test(booking.getBookingDate())) continue;
            booking.setStatus("cancelled");
            booking.setCancelledAt(now);
            booking.setCancelReason(cancelReason);
            cancelled++;
            notifyReleased(memberId, "notifications.membership.court_released.body", booking.getId(),
                    booking.getBookingDate(), booking.getStartTime());
        }
        return cancelled;
    }

    /** Members holding a class booking, an upcoming 1:1 session or an upcoming court; the daily sweep checks each. */
    @Transactional(readOnly = true)
    public java.util.Set<Long> membersWithUpcomingBookings() {
        LocalDate today = LocalDate.now(clock);
        java.util.Set<Long> ids = new java.util.TreeSet<>();
        if (classEnrollments != null) ids.addAll(classEnrollments.findMemberIdsWithBookedEnrollments());
        if (sessionBookings != null) ids.addAll(sessionBookings.findMemberIdsWithBooked());
        ids.addAll(coachBookings.findMemberIdsWithUpcomingSessions(today));
        ids.addAll(courtBookings.findMemberIdsWithUpcomingBookings(today));
        ids.remove(null);
        return ids;
    }

    private void notifyReleased(Long memberId, String bodyKey, Long bookingId, LocalDate date, LocalTime start) {
        notify(memberId, "notifications.membership.booking_released.title", msg(bodyKey, date, hhmm(start)), bookingId);
    }

    private void notify(Long userId, String titleKey, String body, Long bookingId) {
        if (notificationService == null || userId == null) return;
        notificationService.send(userId, msg(titleKey), body, "system", null, bookingId);
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    private static String hhmm(LocalTime time) {
        return time == null ? "" : time.toString().substring(0, 5);
    }

    private static boolean started(LocalDate date, LocalTime start, LocalDate today, LocalTime nowTime) {
        return date.isBefore(today) || (date.isEqual(today) && start != null && !start.isAfter(nowTime));
    }
}
