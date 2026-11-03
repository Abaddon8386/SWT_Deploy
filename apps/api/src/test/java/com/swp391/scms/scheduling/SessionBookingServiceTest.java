package com.swp391.scms.scheduling;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.entity.SessionBooking;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import com.swp391.scms.scheduling.service.SessionBookingService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SessionBookingServiceTest {

    final SessionBookingRepository bookings = mock(SessionBookingRepository.class);
    final ClassSessionRepository sessions = mock(ClassSessionRepository.class);
    final ClassEnrollmentRepository enrollments = mock(ClassEnrollmentRepository.class);
    final GymClassRepository gymClasses = mock(GymClassRepository.class);
    final MembershipSubscriptionRepository subscriptions = mock(MembershipSubscriptionRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final NotificationService notifications = mock(NotificationService.class);
    // 2026-11-03 10:00 in the center's timezone
    final Clock clock = Clock.fixed(Instant.parse("2026-11-03T03:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
    final LocalDate today = LocalDate.of(2026, 11, 3);
    final AuthenticatedPrincipal owner = new AuthenticatedPrincipal(5L, "member", "MEMBER");

    SessionBookingService service;
    GymClass gymClass;
    Member member;
    long nextBookingId = 100;

    @BeforeEach
    void setUp() {
        service = new SessionBookingService(bookings, sessions, enrollments, gymClasses, subscriptions, members,
                notifications, null, clock);
        gymClass = new GymClass();
        gymClass.setId(1L);
        gymClass.setName("Pilates");
        gymClass.setCapacity(2);
        gymClass.setStatus("active");
        member = new Member();
        member.setUserId(5L);
        when(members.findByUserIdForUpdate(5L)).thenReturn(Optional.of(member));
        when(members.findById(5L)).thenReturn(Optional.of(member));
        when(gymClasses.findByIdForUpdate(1L)).thenReturn(Optional.of(gymClass));
        when(subscriptions.hasActiveMembership(eq(5L), any())).thenReturn(true);
        when(subscriptions.hasActiveMembershipCoveringSession(eq(5L), any(), any())).thenReturn(true);
        when(enrollments.findByGymClassIdAndMemberUserIdAndStatus(anyLong(), anyLong(), any())).thenReturn(Optional.empty());
        when(sessions.findActiveByMemberAndDate(anyLong(), any())).thenReturn(List.of());
        when(bookings.saveAndFlush(any(SessionBooking.class))).thenAnswer(call -> {
            SessionBooking b = call.getArgument(0);
            b.setId(nextBookingId++);
            return b;
        });
    }

    ClassSession session(long id, LocalDate date, int startHour) {
        ClassSession s = new ClassSession();
        s.setId(id);
        s.setGymClass(gymClass);
        s.setSessionDate(date);
        s.setStartTime(LocalTime.of(startHour, 0));
        s.setEndTime(LocalTime.of(startHour + 1, 0));
        s.setStatus("scheduled");
        when(sessions.findById(id)).thenReturn(Optional.of(s));
        return s;
    }

    void error(String code, Runnable action) {
        assertEquals(code, assertThrows(AppException.class, action::run).getErrorCode());
    }

    SessionBooking booked(long id, ClassSession session, Long memberId) {
        Member m = new Member();
        m.setUserId(memberId);
        SessionBooking b = new SessionBooking();
        b.setId(id);
        b.setSession(session);
        b.setMember(m);
        b.setStatus("booked");
        return b;
    }

    // ---------------------------------------------------------------- single booking

    @Test void booksOneSessionAndNotifiesTheMember() {
        session(11, today.plusDays(1), 7);
        var dto = service.book(owner, 11L);
        assertEquals(11L, dto.sessionId());
        assertEquals("booked", dto.status());
        assertNull(dto.batchId());
        verify(notifications).send(eq(5L), any(), any(), eq("system"), eq("class_session"), eq(11L));
    }

    @Test void rejectsSessionsThatCannotBeBooked() {
        session(12, today.minusDays(1), 7);
        error("SCHEDULING_PAST_SESSION", () -> service.book(owner, 12L));
        ClassSession cancelled = session(13, today.plusDays(1), 7);
        cancelled.setStatus("cancelled");
        error("SCHEDULING_SESSION_CANCELLED", () -> service.book(owner, 13L));
        gymClass.setStatus("inactive");
        session(14, today.plusDays(1), 8);
        error("SCHEDULING_CLASS_INACTIVE", () -> service.book(owner, 14L));
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test void membershipMustCoverTheSessionDate() {
        session(15, today.plusDays(40), 7);
        when(subscriptions.hasActiveMembershipCoveringSession(5L, today, today.plusDays(40))).thenReturn(false);
        error("SCHEDULING_MEMBERSHIP_NOT_COVERING_SESSION", () -> service.book(owner, 15L));
        when(subscriptions.hasActiveMembership(eq(5L), any())).thenReturn(false);
        error("SCHEDULING_MEMBERSHIP_INVALID", () -> service.book(owner, 15L));
    }

    @Test void rejectsDoubleBookingAndClassWideEnrollment() {
        session(16, today.plusDays(1), 7);
        when(bookings.existsBySessionIdAndMemberUserIdAndStatus(16L, 5L, "booked")).thenReturn(true);
        error("SCHEDULING_SESSION_ALREADY_BOOKED", () -> service.book(owner, 16L));
        when(bookings.existsBySessionIdAndMemberUserIdAndStatus(16L, 5L, "booked")).thenReturn(false);
        when(enrollments.findByGymClassIdAndMemberUserIdAndStatus(1L, 5L, "booked")).thenReturn(Optional.of(new ClassEnrollment()));
        error("SCHEDULING_ALREADY_ENROLLED", () -> service.book(owner, 16L));
    }

    @Test void rejectsTimeOverlapWithAnotherBooking() {
        session(17, today.plusDays(1), 7);
        ClassSession other = new ClassSession();
        other.setId(99L);
        other.setGymClass(gymClass);
        other.setSessionDate(today.plusDays(1));
        other.setStartTime(LocalTime.of(7, 30));
        other.setEndTime(LocalTime.of(8, 30));
        when(sessions.findActiveByMemberAndDate(5L, today.plusDays(1))).thenReturn(List.of(other));
        error("SCHEDULING_MEMBER_TIME_OVERLAP", () -> service.book(owner, 17L));
    }

    @Test void seatsAreCountedPerSessionIncludingClassWideEnrollments() {
        session(18, today.plusDays(1), 7);
        when(bookings.countBySessionIdAndStatus(18L, "booked")).thenReturn(1L);
        when(enrollments.countByGymClassIdAndStatus(1L, "booked")).thenReturn(1L);
        error("SCHEDULING_SESSION_FULL", () -> service.book(owner, 18L));
        when(enrollments.countByGymClassIdAndStatus(1L, "booked")).thenReturn(0L);
        assertEquals("booked", service.book(owner, 18L).status());
    }

    // ---------------------------------------------------------------- bulk booking

    @Test void bulkBooksWhatItCanAndReportsTheRest() {
        session(21, today.plusDays(1), 7);
        session(22, today.plusDays(3), 7);
        session(23, today.plusDays(5), 7);
        when(bookings.countBySessionIdAndStatus(22L, "booked")).thenReturn(2L); // full
        when(sessions.findById(404L)).thenReturn(Optional.empty());

        var result = service.bookMany(owner, List.of(23L, 21L, 22L, 404L, 21L));

        assertEquals(List.of(21L, 23L), result.booked().stream().map(b -> b.sessionId()).toList());
        assertEquals(2, result.skipped().size());
        assertTrue(result.skipped().stream().anyMatch(s -> s.id() == 22L && "SCHEDULING_SESSION_FULL".equals(s.code())));
        assertTrue(result.skipped().stream().anyMatch(s -> s.id() == 404L && "NOT_FOUND".equals(s.code())));
        assertNotNull(result.booked().get(0).batchId());
        assertEquals(result.booked().get(0).batchId(), result.booked().get(1).batchId());
        verify(notifications, times(1)).send(eq(5L), any(), any(), eq("system"), eq("class_session"), eq(21L));
    }

    @Test void bulkRejectsEmptyAndOversizedRequests() {
        error("SCHEDULING_BULK_EMPTY", () -> service.bookMany(owner, List.of()));
        error("SCHEDULING_BULK_EMPTY", () -> service.bookMany(owner, null));
        List<Long> many = new ArrayList<>();
        for (long i = 1; i <= 63; i++) many.add(i);
        error("SCHEDULING_BULK_TOO_MANY", () -> service.bookMany(owner, many));
    }

    @Test void bulkWithNothingBookableReturnsOnlySkippedAndSendsNoNotification() {
        session(31, today.minusDays(2), 7);
        var result = service.bookMany(owner, List.of(31L));
        assertTrue(result.booked().isEmpty());
        assertEquals("SCHEDULING_PAST_SESSION", result.skipped().get(0).code());
        verify(notifications, never()).send(any(), any(), any(), any(), any(), any());
    }

    // ---------------------------------------------------------------- cancelling

    void lockBooking(SessionBooking booking) {
        when(bookings.findClassIdById(booking.getId())).thenReturn(Optional.of(1L));
        when(bookings.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
    }

    @Test void ownerCancelsAFutureBooking() {
        SessionBooking b = booked(50, session(41, today.plusDays(2), 7), 5L);
        lockBooking(b);
        var dto = service.cancel(owner, 50L);
        assertEquals("cancelled", dto.status());
        assertNotNull(b.getCancelledAt());
        verify(notifications).send(eq(5L), any(), any(), eq("system"), eq("class_session"), eq(41L));
    }

    @Test void staffMayCancelButAnotherMemberMayNot() {
        SessionBooking b = booked(51, session(42, today.plusDays(2), 7), 5L);
        lockBooking(b);
        error("SCHEDULING_BOOKING_NOT_OWNER", () -> service.cancel(new AuthenticatedPrincipal(9L, "other", "MEMBER"), 51L));
        assertEquals("cancelled", service.cancel(new AuthenticatedPrincipal(2L, "desk", "RECEPTIONIST"), 51L).status());
    }

    @Test void cannotCancelTwiceOrAfterTheSessionStarted() {
        SessionBooking done = booked(52, session(43, today.plusDays(2), 7), 5L);
        done.setStatus("cancelled");
        lockBooking(done);
        error("SCHEDULING_BOOKING_NOT_BOOKED", () -> service.cancel(owner, 52L));
        SessionBooking started = booked(53, session(44, today, 9), 5L); // 09:00 already started at 10:00
        lockBooking(started);
        error("SCHEDULING_BOOKING_TOO_LATE", () -> service.cancel(owner, 53L));
        when(bookings.findClassIdById(999L)).thenReturn(Optional.empty());
        error("NOT_FOUND", () -> service.cancel(owner, 999L));
    }

    @Test void bulkCancelReportsPerBooking() {
        SessionBooking ok = booked(60, session(45, today.plusDays(2), 7), 5L);
        SessionBooking late = booked(61, session(46, today, 9), 5L);
        lockBooking(ok);
        lockBooking(late);
        var result = service.cancelMany(owner, List.of(60L, 61L));
        assertEquals(1, result.cancelled().size());
        assertEquals(1, result.skipped().size());
        assertEquals(61L, result.skipped().get(0).id());
        verify(notifications).send(eq(5L), any(), any(), eq("system"), eq("class_session"), eq(45L));
    }

    @Test void bulkCancellationNotifiesWithAClassSessionReference() {
        lockBooking(booked(60, session(45, today.plusDays(2), 7), 5L));
        lockBooking(booked(62, session(46, today.plusDays(3), 7), 5L));

        var result = service.cancelMany(owner, List.of(60L, 62L));

        assertEquals(2, result.cancelled().size());
        verify(notifications).send(eq(5L), any(), any(), eq("system"), eq("class_session"), eq(45L));
    }

    @Test void holdOrExpiryCancelsOnlyUncoveredUpcomingBookings() {
        SessionBooking covered = booked(70, session(47, today.plusDays(2), 7), 5L);
        SessionBooking uncovered = booked(71, session(48, today.plusDays(20), 7), 5L);
        when(bookings.findUpcomingBookedForMember(5L, today)).thenReturn(List.of(covered, uncovered));
        int cancelled = service.cancelFutureForMember(5L, "Gói tập hết hạn", date -> date.isBefore(today.plusDays(10)));
        assertEquals(1, cancelled);
        assertEquals("booked", covered.getStatus());
        assertEquals("cancelled", uncovered.getStatus());
        assertEquals("Gói tập hết hạn", uncovered.getCancelReason());
        verify(notifications).send(eq(5L), any(), any(), eq("system"), eq("class_session"), isNull());
    }

    @Test void listsOnlyTheMembersOwnBookings() {
        ClassSession s = session(49, today.plusDays(1), 7);
        when(bookings.findForMember(5L, "booked", today, today.plusDays(7))).thenReturn(List.of(booked(80, s, 5L)));
        var list = service.myBookings(owner, "BOOKED", today, today.plusDays(7));
        assertEquals(1, list.size());
        assertEquals(5L, list.get(0).memberId());
    }
}
