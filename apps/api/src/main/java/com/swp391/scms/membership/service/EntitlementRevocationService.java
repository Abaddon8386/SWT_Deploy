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
        }
        for (CourtBooking booking : courtBookings.findUpcomingBookedByMember(memberId, today)) {
            if (started(booking.getBookingDate(), booking.getStartTime(), today, nowTime)
                    || covered.test(booking.getBookingDate())) continue;
            booking.setStatus("cancelled");
            booking.setCancelledAt(now);
            booking.setCancelReason(cancelReason);
            cancelled++;
        }
        return cancelled;
    }

    private static boolean started(LocalDate date, LocalTime start, LocalDate today, LocalTime nowTime) {
        return date.isBefore(today) || (date.isEqual(today) && start != null && !start.isAfter(nowTime));
    }
}
