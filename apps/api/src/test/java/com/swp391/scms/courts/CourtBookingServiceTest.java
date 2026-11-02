package com.swp391.scms.courts;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.courts.dto.CourtBookingRequests.BookRequest;
import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.scheduling.entity.ClassSession;
import org.springframework.data.domain.PageImpl;
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
    }

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
        when(bookings.countByMemberIdAndBookingDateAndStatus(1L, date, "booked")).thenReturn(2L);
        error("COURT_BOOKING_LIMIT_REACHED", () -> service.book(member, request(date, LocalTime.NOON)));
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
}
