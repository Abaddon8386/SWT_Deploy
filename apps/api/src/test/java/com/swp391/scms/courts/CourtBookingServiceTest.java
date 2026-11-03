package com.swp391.scms.courts;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.courts.dto.CourtBookingRequests.BookRequest;
import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.scheduling.entity.ClassSession;
import org.springframework.data.domain.PageImpl;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class CourtBookingServiceTest {
    final CourtBookingRepository bookings = mock(CourtBookingRepository.class);
    final RoomRepository rooms = mock(RoomRepository.class);
    final MembershipSubscriptionRepository subscriptions = mock(MembershipSubscriptionRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-11-02T03:00:00Z"), ZoneOffset.UTC);
    final AuthenticatedPrincipal member = new AuthenticatedPrincipal(1L, "member", "MEMBER");
    final LocalDate date = LocalDate.of(2026, 11, 2);
    final PaymentRepository payments = mock(PaymentRepository.class);
    CourtBookingService service;
    Room room;
    User user;

    @BeforeEach void setup() {
        service = new CourtBookingService(bookings, rooms, subscriptions, members, clock);
        room = new Room(); room.setId(10L); room.setName("Court A");
        Discipline discipline = new Discipline(); discipline.setName("Tennis"); room.setDiscipline(discipline);
        room.setOpenTime(LocalTime.of(6, 0)); room.setCloseTime(LocalTime.of(22, 0));
        user = new User(); user.setId(1L); user.setFullName("Member");
        Member profile = new Member(); profile.setUser(user);
        lenient().when(members.findByUserIdForUpdate(1L)).thenReturn(Optional.of(profile));
        lenient().when(rooms.findById(10L)).thenReturn(Optional.of(room));
        lenient().when(subscriptions.hasActiveMembershipCoveringSession(1L, date, date)).thenReturn(true);
        lenient().when(bookings.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
        plan("SILVER");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "payments", payments);
    }

    void plan(String name) {
        MembershipPackage pkg = new MembershipPackage(); pkg.setName(name);
        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg); sub.setStatus("active"); sub.setStartDate(date.minusDays(10)); sub.setEndDate(date.plusDays(60));
        lenient().when(subscriptions.findByMemberUserIdAndStatus(1L, "active")).thenReturn(List.of(sub));
    }
    /** Pretends {@code n} bookings of the month were already covered by the plan, then counts the ones made since. */
    void used(long n) {
        long[] extra = {0};
        lenient().when(bookings.countQuotaUsage(eq(1L), any(), any(), eq("package_quota"))).thenAnswer(i -> n + extra[0]);
        lenient().doAnswer(i -> {
            CourtBooking saved = i.getArgument(0);
            if ("package_quota".equals(saved.getPaymentMethod())) extra[0]++;
            return saved;
        }).when(bookings).saveAndFlush(any());
    }
    BookRequest paid(LocalTime time, String method) { return new BookRequest(10L, date, time, method); }

    BookRequest request(LocalDate day, LocalTime time) { return new BookRequest(10L, day, time); }
    void error(String code, Runnable action) { assertEquals(code, assertThrows(AppException.class, action::run).getErrorCode()); }

    @Test void booksOneHourWithinOpeningHours() {
        var result = service.book(member, request(date, LocalTime.of(12, 0)));
        assertEquals(LocalTime.of(13, 0), result.endTime());
        assertEquals("booked", result.status());
        assertTrue(result.canCancel());
    }
    @Test void rejectsPastStart() { error("COURT_BOOKING_PAST_SLOT", () -> service.book(member, request(date, LocalTime.of(10, 0)))); }
    @Test void rejectsMoreThanSevenDays() { error("COURT_BOOKING_TOO_FAR", () -> service.book(member, request(date.plusDays(8), LocalTime.NOON))); }
    @Test void rejectsNonWholeHourAndSeconds() { error("COURT_BOOKING_INVALID_SLOT", () -> service.book(member, request(date, LocalTime.of(12, 0, 1)))); }
    @Test void rejectsEndOutsideHours() { error("COURT_BOOKING_INVALID_SLOT", () -> service.book(member, request(date, LocalTime.of(22, 0)))); }
    @Test void rejectsMissingMembership() {
        when(subscriptions.hasActiveMembershipCoveringSession(1L, date, date)).thenReturn(false);
        error("COURT_BOOKING_MEMBERSHIP_INVALID", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void rejectsRoomMaintenance() {
        room.setStatus("maintenance"); error("COURT_BOOKING_COURT_UNAVAILABLE", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void rejectsOverlapAndDailyLimit() {
        when(bookings.existsRoomOverlap(10L, date, LocalTime.NOON, LocalTime.of(13, 0))).thenReturn(true);
        error("COURT_BOOKING_SLOT_TAKEN", () -> service.book(member, request(date, LocalTime.NOON)));
        when(bookings.existsRoomOverlap(anyLong(), any(), any(), any())).thenReturn(false);
        when(bookings.countByMemberIdAndBookingDateAndStatus(1L, date, "booked")).thenReturn(4L);
        error("COURT_BOOKING_LIMIT_REACHED", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void firstBookingIsCoveredByTheSilverPlanAndFree() {
        var result = service.book(member, request(date, LocalTime.NOON));
        assertEquals(0, BigDecimal.ZERO.compareTo(result.price()));
        assertEquals("package_quota", result.paymentMethod()); assertEquals("covered", result.paymentStatus());
        verify(payments, never()).save(any());
    }
    @Test void bookingBeyondTheSilverQuotaNeedsPayment() {
        used(1);
        error("COURT_BOOKING_PAYMENT_REQUIRED", () -> service.book(member, request(date, LocalTime.NOON)));
        verify(bookings, never()).saveAndFlush(any());
    }
    @Test void vnpayBookingRemainsUnpaidUntilTheSignedCallback() {
        used(1);
        var result = service.book(member, paid(LocalTime.NOON, "vnpay"));
        assertEquals("pending", result.paymentStatus());
        var captor = org.mockito.ArgumentCaptor.forClass(Payment.class);
        verify(payments).save(captor.capture());
        assertEquals("pending", captor.getValue().getStatus());
        assertNull(captor.getValue().getPaidAt());
        assertEquals(result.id(), captor.getValue().getCourtBookingId());
    }
    @Test void cancellingAnUnpaidCourtClearsTheUnstartedPayment() {
        existing(LocalTime.NOON);
        var payment = new Payment(); payment.setStatus("pending");
        when(payments.findAllByCourtBookingId(8L)).thenReturn(List.of(payment));
        assertEquals("cancelled", service.cancel(member, 8L, null).status());
        assertEquals("failed", payment.getStatus());
    }
    @Test void paidDaytimeBookingCosts100kAndWritesAPayment() {
        used(1);
        var result = service.book(member, paid(LocalTime.NOON, "online_wallet"));
        assertEquals(0, new BigDecimal("100000").compareTo(result.price()));
        assertEquals("online_wallet", result.paymentMethod()); assertEquals("paid", result.paymentStatus());
        var captor = org.mockito.ArgumentCaptor.forClass(Payment.class);
        verify(payments).save(captor.capture());
        assertEquals(0, new BigDecimal("100000").compareTo(captor.getValue().getAmount()));
        assertEquals("success", captor.getValue().getStatus());
    }
    @Test void paidBookingStartingAtSixPmCosts125k() {
        used(1);
        assertEquals(0, new BigDecimal("125000").compareTo(service.book(member, paid(LocalTime.of(18, 0), "bank_transfer")).price()));
        assertEquals(0, new BigDecimal("100000").compareTo(service.book(member, paid(LocalTime.of(17, 0), "bank_transfer")).price()));
    }
    @Test void goldGetsTwoAndPlatinumThreeIncludedBookings() {
        plan("GOLD"); used(1);
        assertEquals("package_quota", service.book(member, request(date, LocalTime.NOON)).paymentMethod());
        error("COURT_BOOKING_PAYMENT_REQUIRED", () -> service.book(member, request(date, LocalTime.of(14, 0))));
        plan("PLATINUM"); used(2);
        assertEquals("package_quota", service.book(member, request(date, LocalTime.NOON)).paymentMethod());
        error("COURT_BOOKING_PAYMENT_REQUIRED", () -> service.book(member, request(date, LocalTime.of(14, 0))));
    }
    @Test void paymentIsNotChargedWhileTheQuotaStillCoversTheSlot() {
        var result = service.book(member, paid(LocalTime.NOON, "online_wallet"));
        assertEquals("package_quota", result.paymentMethod());
        verify(payments, never()).save(any());
    }
    @Test void rejectsUnknownPaymentMethod() {
        used(1); error("COURT_BOOKING_INVALID_PAYMENT_METHOD", () -> service.book(member, paid(LocalTime.NOON, "cash")));
    }
    @Test void standingBookingUsesTheQuotaFirstThenSkipsUnpaidDays() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenReturn(true);
        used(0);
        var result = service.bookRecurring(member, recurring(date, "week", List.of(1, 3, 5)));
        assertEquals(1, result.booked().size());
        assertEquals(2, result.skipped().size());
        assertTrue(result.skipped().stream().allMatch(s -> "COURT_BOOKING_PAYMENT_REQUIRED".equals(s.code())), result.skipped().toString());
    }
    @Test void quotaReportsPlanUsageAndRemaining() {
        used(1); plan("GOLD");
        var quota = service.quota(member, date);
        assertEquals(2, quota.monthlyQuota()); assertEquals(1, quota.used()); assertEquals(1, quota.remaining());
    }
    CourtBooking existing(LocalTime start) {
        CourtBooking booking = new CourtBooking(); booking.setId(8L); booking.setRoom(room); booking.setMember(user);
        booking.setBookingDate(date); booking.setStartTime(start); booking.setEndTime(start.plusHours(1));
        when(bookings.findByIdForUpdate(8L)).thenReturn(Optional.of(booking)); return booking;
    }
    @Test void cancellationAtTwoHoursAllowed() {
        existing(LocalTime.NOON); assertEquals("cancelled", service.cancel(member, 8L, null).status());
    }
    @Test void cancellationInsideTwoHoursRejected() {
        existing(LocalTime.of(11, 0)); error("COURT_BOOKING_CANCEL_TOO_LATE", () -> service.cancel(member, 8L, null));
    }
    @Test void cannotCancelAnotherMembersBooking() {
        existing(LocalTime.NOON); error("COURT_BOOKING_FORBIDDEN", () -> service.cancel(new AuthenticatedPrincipal(2L, "other", "MEMBER"), 8L, null));
    }
    @Test void staffCanCancelInsideTwoHours() {
        existing(LocalTime.of(11, 0)); assertEquals("cancelled", service.cancel(new AuthenticatedPrincipal(3L, "staff", "RECEPTIONIST"), 8L, "Reason").status());
    }
    @Test void cancelledBookingCannotLeakToOtherMembers() {
        existing(LocalTime.NOON).setStatus("cancelled"); error("COURT_BOOKING_FORBIDDEN", () -> service.cancel(new AuthenticatedPrincipal(2L, "other", "MEMBER"), 8L, null));
    }
    @Test void rejectsClassOrMemberOverlap() {
        when(bookings.existsClassOverlap(anyLong(), any(), any(), any())).thenReturn(true);
        error("COURT_BOOKING_SLOT_TAKEN", () -> service.book(member, request(date, LocalTime.NOON)));
        when(bookings.existsClassOverlap(anyLong(), any(), any(), any())).thenReturn(false);
        when(bookings.existsMemberOverlap(anyLong(), any(), any(), any())).thenReturn(true);
        error("COURT_BOOKING_SLOT_TAKEN", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void acceptsSeventhDayButSubscriptionMustCoverIt() {
        when(subscriptions.hasActiveMembershipCoveringSession(1L, date, date.plusDays(7))).thenReturn(true);
        assertEquals(date.plusDays(7), service.book(member, request(date.plusDays(7), LocalTime.NOON)).date());
        when(subscriptions.hasActiveMembershipCoveringSession(1L, date, date.plusDays(7))).thenReturn(false);
        error("COURT_BOOKING_MEMBERSHIP_INVALID", () -> service.book(member, request(date.plusDays(7), LocalTime.NOON)));
    }
    @Test void deletedOrInactiveMembersCannotBook() {
        user.setDeletedAt(date.atStartOfDay());
        error("COURT_BOOKING_MEMBERSHIP_INVALID", () -> service.book(member, request(date, LocalTime.NOON)));
        user.setDeletedAt(null); user.setStatus("locked");
        error("COURT_BOOKING_MEMBERSHIP_INVALID", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void rejectsMissingCourtConfigurationAndBoxingRooms() {
        room.setOpenTime(null);
        error("COURT_BOOKING_INVALID_COURT", () -> service.book(member, request(date, LocalTime.NOON)));
        room.setOpenTime(LocalTime.of(6, 0)); room.getDiscipline().setName("Boxing");
        error("COURT_BOOKING_INVALID_COURT", () -> service.book(member, request(date, LocalTime.NOON)));
    }
    @Test void unknownBookingIsNotFound() { error("COURT_BOOKING_NOT_FOUND", () -> service.cancel(member, 99L, null)); }
    @Test void staffCannotCancelStartedBooking() {
        existing(LocalTime.of(10, 0)); error("COURT_BOOKING_CANCEL_TOO_LATE", () -> service.cancel(new AuthenticatedPrincipal(3L, "staff", "STAFF"), 8L, null));
    }
    @Test void repeatedCancellationIsIdempotent() {
        CourtBooking booking = existing(LocalTime.NOON); booking.setStatus("cancelled");
        assertEquals("cancelled", service.cancel(member, 8L, null).status()); verify(bookings, never()).saveAndFlush(any());
    }
    @Test void availabilityUsesClassBookedPastAndFreeWithoutMemberDetails() {
        CourtBooking booked = new CourtBooking(); booked.setStartTime(LocalTime.of(12, 0)); booked.setEndTime(LocalTime.of(13, 0));
        ClassSession session = new ClassSession(); session.setStartTime(LocalTime.of(11, 0)); session.setEndTime(LocalTime.NOON);
        when(bookings.findRoomBookings(10L, date)).thenReturn(List.of(booked));
        when(bookings.findRoomClasses(10L, date)).thenReturn(List.of(session));
        var slots = service.availability(10L, date);
        assertEquals(16, slots.size()); assertEquals("past", slots.get(4).status());
        assertEquals("class", slots.get(5).status()); assertEquals("booked", slots.get(6).status()); assertEquals("free", slots.get(7).status());
    }
    @Test void listBookingsIsPaginatedAndDailyListIsStaffOnly() {
        CourtBooking booking = existing(LocalTime.NOON);
        when(bookings.findByMemberIdOrderByBookingDateDescStartTimeDescIdDesc(eq(1L), any())).thenReturn(new PageImpl<>(List.of(booking)));
        assertEquals(1, service.my(member, 0, 20).getTotalElements());
        error("COURT_BOOKING_INVALID_SLOT", () -> service.my(member, -1, 20));
        error("COURT_BOOKING_INVALID_SLOT", () -> service.my(member, 0, 101));
        error("COURT_BOOKING_FORBIDDEN", () -> service.daily(member, date, null, 0, 20));
    }
    @Test void staffDailyListUsesRoomFilterOnlyWhenGiven() {
        var staff = new AuthenticatedPrincipal(2L, "staff", "RECEPTIONIST");
        CourtBooking booking = existing(LocalTime.NOON);
        when(bookings.findDaily(eq(date), any())).thenReturn(new PageImpl<>(List.of(booking)));
        when(bookings.findDailyByRoom(eq(date), eq(10L), any())).thenReturn(new PageImpl<>(List.of(booking, booking)));
        assertEquals(1, service.daily(staff, date, null, 0, 20).getTotalElements());
        assertEquals(2, service.daily(staff, date, 10L, 0, 20).getTotalElements());
        verify(bookings, never()).findDailyByRoom(eq(date), isNull(), any());
    }

    com.swp391.scms.courts.dto.CourtBookingRequests.RecurringBookRequest recurring(LocalDate start, String period, List<Integer> days) {
        return new com.swp391.scms.courts.dto.CourtBookingRequests.RecurringBookRequest(10L, start, LocalTime.NOON, period, days);
    }

    @Test void weeklyStandingBookingCreatesEveryChosenDay() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenReturn(true);
        var result = service.bookRecurring(member, recurring(date, "week", List.of(1, 3, 5)));
        assertEquals(3, result.booked().size());
        assertTrue(result.skipped().isEmpty());
        assertEquals(List.of(date, date.plusDays(2), date.plusDays(4)), result.booked().stream().map(b -> b.date()).toList());
        verify(bookings, times(3)).saveAndFlush(any());
    }

    @Test void takenDayIsSkippedWithReasonWhileOthersAreKept() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenReturn(true);
        when(bookings.existsRoomOverlap(10L, date.plusDays(2), LocalTime.NOON, LocalTime.of(13, 0))).thenReturn(true);
        var result = service.bookRecurring(member, recurring(date, "week", List.of(1, 3, 5)));
        assertEquals(2, result.booked().size());
        assertEquals(1, result.skipped().size());
        assertEquals(date.plusDays(2), result.skipped().get(0).date());
        assertEquals("COURT_BOOKING_SLOT_TAKEN", result.skipped().get(0).code());
    }

    @Test void monthlyStandingBookingReachesPastTheSevenDayWindow() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenReturn(true);
        var result = service.bookRecurring(member, recurring(date, "month", null));
        assertEquals(5, result.booked().size());
        assertEquals(date.plusDays(28), result.booked().get(4).date());
    }

    @Test void standingBookingStopsAtOneMonthAhead() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenReturn(true);
        var result = service.bookRecurring(member, recurring(date.plusDays(30), "month", null));
        assertEquals(1, result.booked().size());
        assertEquals(4, result.skipped().size());
        assertTrue(result.skipped().stream().allMatch(s -> "COURT_BOOKING_TOO_FAR".equals(s.code())));
    }

    @Test void membershipThatEndsMidRangeSkipsLaterDays() {
        when(subscriptions.hasActiveMembershipCoveringSession(eq(1L), eq(date), any())).thenAnswer(i -> !((LocalDate) i.getArgument(2)).isAfter(date.plusDays(3)));
        var result = service.bookRecurring(member, recurring(date, "week", List.of(1, 3, 5)));
        assertEquals(2, result.booked().size());
        assertEquals("COURT_BOOKING_MEMBERSHIP_INVALID", result.skipped().get(0).code());
    }

    @Test void standingBookingFailsFastWhenCourtIsUnavailableOrCallerIsNotAMember() {
        room.setStatus("maintenance");
        error("COURT_BOOKING_COURT_UNAVAILABLE", () -> service.bookRecurring(member, recurring(date, "week", null)));
        verify(bookings, never()).saveAndFlush(any());
        error("COURT_BOOKING_FORBIDDEN", () -> service.bookRecurring(new AuthenticatedPrincipal(2L, "desk", "RECEPTIONIST"), recurring(date, "week", null)));
    }
}
