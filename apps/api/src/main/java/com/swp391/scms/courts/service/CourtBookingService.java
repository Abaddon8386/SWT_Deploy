package com.swp391.scms.courts.service;

import com.swp391.scms.common.exception.*;
import com.swp391.scms.common.RecurrenceDates;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.courts.dto.CourtBookingRequests.BookRequest;
import com.swp391.scms.courts.dto.CourtBookingRequests.RecurringBookRequest;
import com.swp391.scms.courts.dto.CourtBookingResponses.*;
import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CourtBookingService {
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Set<String> COURT_DISCIPLINES = Set.of("Tennis", "Cầu lông", "Bơi lội");
    private static final Set<String> STAFF_ROLES = Set.of("CENTER_MANAGER", "RECEPTIONIST", "STAFF");
    private final CourtBookingRepository bookings;
    private final RoomRepository rooms;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final Clock clock;
    private static final int RECURRING_MAX_DAYS = 31;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private MessageService messages;

    public CourtBookingService(CourtBookingRepository bookings, RoomRepository rooms,
                               MembershipSubscriptionRepository subscriptions, MemberRepository members, Clock clock) {
        this.bookings = bookings; this.rooms = rooms; this.subscriptions = subscriptions;
        this.members = members; this.clock = clock;
    }

    public static boolean isCourtDiscipline(String name) { return COURT_DISCIPLINES.contains(name); }
    private static boolean wholeHour(LocalTime time) {
        return time != null && time.getMinute() == 0 && time.getSecond() == 0 && time.getNano() == 0;
    }
    public static boolean validHours(LocalTime open, LocalTime close) {
        return wholeHour(open) && wholeHour(close) && open.isBefore(close);
    }
    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(), CENTER_ZONE); }
    private static BadRequestException invalid(String suffix) {
        return new BadRequestException("COURT_BOOKING_" + suffix.toUpperCase(Locale.ROOT), "error.courts." + suffix, null, null);
    }
    private static ConflictException conflict(String suffix) {
        return new ConflictException("COURT_BOOKING_" + suffix.toUpperCase(Locale.ROOT), "error.courts." + suffix, null, null);
    }
    private static ForbiddenException forbidden(String suffix) {
        return new ForbiddenException("COURT_BOOKING_" + suffix.toUpperCase(Locale.ROOT), "error.courts." + suffix, null, null);
    }
    private static AppException notFound() {
        return new AppException(HttpStatus.NOT_FOUND, "COURT_BOOKING_NOT_FOUND", "error.courts.not_found", null, null);
    }
    private void dateWindow(LocalDate date) { dateWindow(date, false); }
    /** One-off bookings open 7 days ahead; a standing booking may reach one month ahead. */
    private void dateWindow(LocalDate date, boolean recurring) {
        if (date == null) throw invalid("invalid_slot");
        if (date.isBefore(now().toLocalDate())) throw invalid("past_slot");
        if (date.isAfter(now().toLocalDate().plusDays(recurring ? RECURRING_MAX_DAYS : 7))) throw invalid("too_far");
    }
    private Room court(Long id) {
        if (id == null) throw invalid("invalid_court");
        Room room = rooms.findById(id).orElseThrow(CourtBookingService::notFound);
        if (!"available".equals(room.getStatus())) throw conflict("court_unavailable");
        if (room.getDiscipline() == null || !isCourtDiscipline(room.getDiscipline().getName())
                || !validHours(room.getOpenTime(), room.getCloseTime())) throw invalid("invalid_court");
        return room;
    }

    public List<CourtDto> listCourts(String discipline) {
        return rooms.findAvailableCourts(discipline == null ? "" : discipline.trim()).stream()
                .map(r -> new CourtDto(r.getId(), r.getName(), r.getLocation(), r.getDiscipline().getId(),
                        r.getDiscipline().getName(), r.getOpenTime(), r.getCloseTime())).toList();
    }

    public List<SlotDto> availability(Long roomId, LocalDate date) {
        dateWindow(date);
        Room room = court(roomId);
        var existing = bookings.findRoomBookings(roomId, date);
        var classes = bookings.findRoomClasses(roomId, date);
        LocalDateTime current = now();
        List<SlotDto> result = new ArrayList<>();
        for (LocalTime start = room.getOpenTime(); start.isBefore(room.getCloseTime()); start = start.plusHours(1)) {
            LocalTime end = start.plusHours(1);
            final LocalTime slotStart = start;
            String status = !date.atTime(start).isAfter(current) ? "past"
                    : classes.stream().anyMatch(s -> overlaps(slotStart, end, s.getStartTime(), s.getEndTime())) ? "class"
                    : existing.stream().anyMatch(b -> overlaps(slotStart, end, b.getStartTime(), b.getEndTime())) ? "booked" : "free";
            result.add(new SlotDto(start, end, status));
        }
        return result;
    }

    private static boolean overlaps(LocalTime start, LocalTime end, LocalTime otherStart, LocalTime otherEnd) {
        return start.isBefore(otherEnd) && end.isAfter(otherStart);
    }

    @Transactional
    public BookingDto book(AuthenticatedPrincipal principal, BookRequest request) {
        return bookOne(principal, request.roomId(), request.date(), request.startTime(), false);
    }

    /**
     * Books the same slot on every chosen weekday of a week or month. Each date is checked independently so a
     * full or conflicting day is reported in {@code skipped} instead of failing the whole standing booking.
     */
    @Transactional
    public RecurringResult bookRecurring(AuthenticatedPrincipal principal, RecurringBookRequest request) {
        if (principal == null || !"MEMBER".equals(principal.role())) throw forbidden("forbidden");
        List<LocalDate> dates = RecurrenceDates.expand(request.startDate(), request.period(), request.daysOfWeek());
        court(request.roomId()); // fail fast when the court itself cannot be booked
        List<BookingDto> booked = new ArrayList<>();
        List<RecurrenceDates.Skipped> skipped = new ArrayList<>();
        for (LocalDate date : dates) {
            try {
                booked.add(bookOne(principal, request.roomId(), date, request.startTime(), true));
            } catch (AppException e) {
                skipped.add(new RecurrenceDates.Skipped(date, e.getErrorCode(), reason(e)));
            }
        }
        return new RecurringResult(booked, skipped);
    }

    private String reason(AppException e) {
        if (messages != null && e.getMessageKey() != null) {
            try {
                return messages.getMessage(e.getMessageKey(), e.getMessageArgs() == null ? new Object[0] : e.getMessageArgs());
            } catch (RuntimeException ignored) {
                // fall through to the error code
            }
        }
        return e.getErrorCode();
    }

    private BookingDto bookOne(AuthenticatedPrincipal principal, Long roomId, LocalDate date, LocalTime start, boolean recurring) {
        if (principal == null || !"MEMBER".equals(principal.role())) throw forbidden("forbidden");
        dateWindow(date, recurring);
        if (!wholeHour(start)) throw invalid("invalid_slot");
        if (!date.atTime(start).isAfter(now())) throw invalid("past_slot");
        Room room = court(roomId);
        LocalTime end = start.plusHours(1);
        if (start.isBefore(room.getOpenTime()) || !end.isAfter(start) || end.isAfter(room.getCloseTime())) throw invalid("invalid_slot");
        Member member = members.findByUserIdForUpdate(principal.id()).orElseThrow(() -> forbidden("membership_invalid"));
        if (member.getUser().getDeletedAt() != null || !"active".equals(member.getUser().getStatus())
                || !subscriptions.hasActiveMembershipCoveringSession(principal.id(), now().toLocalDate(), date)) {
            throw forbidden("membership_invalid");
        }
        if (bookings.existsRoomOverlap(room.getId(), date, start, end)
                || bookings.existsClassOverlap(room.getId(), date, start, end)
                || bookings.existsMemberOverlap(principal.id(), date, start, end)) throw conflict("slot_taken");
        if (bookings.countByMemberIdAndBookingDateAndStatus(principal.id(), date, "booked") >= 2) throw conflict("limit_reached");
        CourtBooking booking = new CourtBooking(); booking.setRoom(room); booking.setMember(member.getUser());
        booking.setBookingDate(date); booking.setStartTime(start); booking.setEndTime(end); booking.setCreatedAt(now());
        return dto(bookings.saveAndFlush(booking), principal);
    }

    public Page<BookingDto> my(AuthenticatedPrincipal principal, int page, int size) {
        return bookings.findByMemberIdOrderByBookingDateDescStartTimeDescIdDesc(principal.id(), page(page, size))
                .map(b -> dto(b, principal));
    }

    public Page<BookingDto> daily(AuthenticatedPrincipal principal, LocalDate date, Long roomId, int page, int size) {
        if (!STAFF_ROLES.contains(principal.role())) throw forbidden("forbidden");
        if (date == null) throw invalid("invalid_slot");
        Pageable pageable = page(page, size);
        Page<CourtBooking> found = roomId == null ? bookings.findDaily(date, pageable) : bookings.findDailyByRoom(date, roomId, pageable);
        return found.map(b -> dto(b, principal));
    }
    private Pageable page(int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid("invalid_slot");
        return PageRequest.of(page, size);
    }

    @Transactional
    public BookingDto cancel(AuthenticatedPrincipal principal, Long id, String reason) {
        CourtBooking booking = bookings.findByIdForUpdate(id).orElseThrow(CourtBookingService::notFound);
        boolean staff = STAFF_ROLES.contains(principal.role());
        if (!staff && (!"MEMBER".equals(principal.role()) || !principal.id().equals(booking.getMember().getId()))) throw forbidden("forbidden");
        if ("cancelled".equals(booking.getStatus())) return dto(booking, principal);
        if (!canCancel(booking, principal)) throw invalid("cancel_too_late");
        if (reason != null && reason.length() > 255) throw invalid("invalid_slot");
        booking.setStatus("cancelled"); booking.setCancelledAt(now());
        booking.setCancelReason(reason == null || reason.isBlank() ? null : reason.trim());
        return dto(bookings.saveAndFlush(booking), principal);
    }

    private boolean canCancel(CourtBooking b, AuthenticatedPrincipal principal) {
        if (!"booked".equals(b.getStatus())) return false;
        LocalDateTime start = b.getBookingDate().atTime(b.getStartTime());
        if (STAFF_ROLES.contains(principal.role())) return start.isAfter(now());
        return "MEMBER".equals(principal.role()) && principal.id().equals(b.getMember().getId())
                && !start.isBefore(now().plusHours(2));
    }
    private BookingDto dto(CourtBooking b, AuthenticatedPrincipal principal) {
        return new BookingDto(b.getId(), b.getRoom().getId(), b.getRoom().getName(),
                b.getRoom().getDiscipline() == null ? null : b.getRoom().getDiscipline().getName(),
                b.getMember().getId(), b.getMember().getFullName(), b.getBookingDate(), b.getStartTime(), b.getEndTime(),
                b.getStatus(), b.getCreatedAt(), b.getCancelledAt(), b.getCancelReason(), canCancel(b, principal));
    }
}
