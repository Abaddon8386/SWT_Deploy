package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.*;
import com.swp391.scms.scheduling.repository.*;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BookingDateEligibilityTest {
    private static final ZoneId CENTER = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 1);
    private final AuthenticatedPrincipal actor = new AuthenticatedPrincipal(12L, "member", "MEMBER");
    private final ClassEnrollmentRepository enrollments = mock(ClassEnrollmentRepository.class);
    private final ClassSessionRepository sessions = mock(ClassSessionRepository.class);
    private final GymClassRepository classes = mock(GymClassRepository.class);
    private final MembershipSubscriptionRepository memberships = mock(MembershipSubscriptionRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ClassSession session = new ClassSession();
    private EnrollmentService enrollment;

    private void setup(String instant, LocalDate starts, LocalDate ends, String status) {
        Clock clock = Clock.fixed(Instant.parse(instant), ZoneOffset.UTC);
        var member = new Member();
        member.setUserId(actor.id());
        var gymClass = new GymClass();
        ReflectionTestUtils.setField(gymClass, "id", 5L);
        gymClass.setName("Yoga");
        gymClass.setStatus("active");
        gymClass.setCapacity(1);
        ReflectionTestUtils.setField(session, "id", 9L);
        session.setGymClass(gymClass);
        session.setSessionDate(TODAY.plusDays(1));
        session.setStartTime(LocalTime.of(10, 0));
        session.setEndTime(LocalTime.of(11, 0));
        when(members.findByUserIdForUpdate(actor.id())).thenReturn(Optional.of(member));
        when(sessions.findById(9L)).thenReturn(Optional.of(session));
        when(classes.findByIdForUpdate(5L)).thenReturn(Optional.of(gymClass));
        when(enrollments.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(memberships.hasActiveMembership(eq(actor.id()), any())).thenAnswer(call ->
                activeOn(status, starts, ends, call.getArgument(1)));
        when(memberships.hasActiveMembershipCoveringSession(eq(actor.id()), any(), any())).thenAnswer(call ->
                activeOn(status, starts, ends, call.getArgument(1)) && activeOn(status, starts, ends, call.getArgument(2)));
        enrollment = new EnrollmentService(enrollments, sessions, classes, memberships, members, notifications, null, clock);
    }

    private static boolean activeOn(String status, LocalDate starts, LocalDate ends, LocalDate date) {
        return "active".equals(status) && !date.isBefore(starts) && !date.isAfter(ends);
    }

    private void perform() {
        enrollment.enroll(actor, 9L);
    }

    @Test
    void allowsLastInclusiveMembershipDay() {
        setup("2026-11-01T03:00:00Z", TODAY.minusDays(10), TODAY.plusDays(1), "active");
        assertDoesNotThrow(() -> perform());
    }

    @Test
    void rejectsSessionOneDayAfterExpiryBeforeAnyWrite() {
        setup("2026-11-01T03:00:00Z", TODAY.minusDays(10), TODAY, "active");
        var error = assertThrows(ForbiddenException.class, () -> perform());
        assertEquals("SCHEDULING_MEMBERSHIP_NOT_COVERING_SESSION", error.getErrorCode());
        assertEquals("error.scheduling.membership_session_not_covered", error.getMessageKey());
        verify(enrollments, never()).saveAndFlush(any());
        verifyNoInteractions(notifications);
    }

    @ParameterizedTest
    @ValueSource(strings = {"frozen", "expired", "cancelled", "pending_payment"})
    void rejectsInactiveMembership(String status) {
        setup("2026-11-01T03:00:00Z", TODAY.minusDays(10), TODAY.plusDays(20), status);
        var error = assertThrows(ForbiddenException.class, () -> perform());
        assertEquals("SCHEDULING_MEMBERSHIP_INVALID", error.getErrorCode());
        verify(enrollments, never()).saveAndFlush(any());
    }

    @Test
    void futurePeriodCannotGrantCurrentBookingRights() {
        setup("2026-11-01T03:00:00Z", TODAY.plusDays(1), TODAY.plusDays(30), "active");
        assertThrows(ForbiddenException.class, () -> perform());
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-10-31T17:00:00Z", "2026-10-31T23:59:00Z", "2026-11-01T00:00:00Z"})
    void usesVietnamMembershipDateAtMidnight0659And0700(String instant) {
        setup(instant, TODAY, TODAY.plusDays(2), "active");
        assertEquals(TODAY, Instant.parse(instant).atZone(CENTER).toLocalDate());
        assertDoesNotThrow(() -> perform());
        verify(memberships).hasActiveMembership(actor.id(), TODAY);
        verify(memberships).hasActiveMembershipCoveringSession(actor.id(), TODAY, TODAY.plusDays(1));
    }

    @ParameterizedTest
    @CsvSource({"2026-11-01T03:00:00Z,10:00", "2026-11-01T03:00:01Z,10:00", "2026-10-31T17:00:00Z,00:00",
            "2026-10-31T23:59:00Z,06:59", "2026-11-01T00:00:00Z,07:00"})
    void rejectsStartedSessionUsingCenterWallTime(String instant, String localStart) {
        setup(instant, TODAY.minusDays(1), TODAY.plusDays(5), "active");
        session.setSessionDate(TODAY);
        session.setStartTime(LocalTime.parse(localStart));
        assertThrows(BadRequestException.class, () -> perform());
        verify(enrollments, never()).saveAndFlush(any());
    }

    @Test
    void permitsFutureLocalTimeDespiteDifferentInjectedClockZone() {
        setup("2026-10-31T23:59:00Z", TODAY, TODAY.plusDays(5), "active");
        session.setSessionDate(TODAY);
        session.setStartTime(LocalTime.of(7, 0));
        assertDoesNotThrow(() -> perform());
    }
}
