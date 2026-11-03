package com.swp391.scms.membership;

import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.membership.service.EntitlementRevocationService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EntitlementRevocationServiceTest {

    @Mock private MembershipSubscriptionRepository subscriptions;
    @Mock private EnrollmentService enrollmentService;
    @Mock private CoachBookingRepository coachBookings;
    @Mock private CourtBookingRepository courtBookings;

    @Test
    void releasesOnlyBookingsOnDatesNoActiveMembershipCovers() {
        Clock clock = Clock.fixed(Instant.parse("2026-10-11T10:00:00Z"), ZoneOffset.UTC);
        var service = new EntitlementRevocationService(subscriptions, enrollmentService, coachBookings, courtBookings, clock);
        LocalDate today = LocalDate.of(2026, 10, 11);
        LocalDate covered = LocalDate.of(2026, 10, 20);
        LocalDate gap = LocalDate.of(2026, 11, 5);
        CoachBooking keep = pt(covered);
        CoachBooking release = pt(gap);
        CourtBooking court = new CourtBooking();
        court.setBookingDate(gap);
        court.setStartTime(LocalTime.of(14, 0));
        when(subscriptions.hasActiveMembership(10L, covered)).thenReturn(true);
        when(subscriptions.hasActiveMembership(10L, gap)).thenReturn(false);
        when(enrollmentService.cancelFutureEnrollmentsForMember(eq(10L), any(), any())).thenReturn(1);
        when(coachBookings.findFutureConfirmedByMember(10L, today)).thenReturn(List.of(keep, release));
        when(courtBookings.findUpcomingBookedByMember(10L, today)).thenReturn(List.of(court));

        assertEquals(3, service.revokeUncoveredBookings(10L, "Hết hạn"));
        assertEquals("confirmed", keep.getStatus());
        assertEquals("cancelled", release.getStatus());
        assertEquals("cancelled", court.getStatus());
    }

    private static CoachBooking pt(LocalDate date) {
        CoachBooking booking = new CoachBooking();
        booking.setBookingDate(date);
        booking.setStartTime(LocalTime.of(9, 0));
        booking.setEndTime(LocalTime.of(10, 0));
        booking.setStatus("confirmed");
        return booking;
    }
}
