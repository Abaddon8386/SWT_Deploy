package com.swp391.scms.scheduling.service;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.dto.SessionBookingRequests;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkBookResult;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkCancelResult;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.SessionBookingDto;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.Skipped;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.entity.SessionBooking;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Per-session class booking: a member reserves, and releases, individual sessions. A single booking, a whole week,
 * a whole month or any hand-picked set of sessions all go through {@link #bookOne}, so every session is checked on its
 * own (open and in the future, membership covering its date, no clash with another booking, free seat) and a session
 * that fails is reported back instead of failing the others.
 *
 * <p>Seats are counted per session: the booked sessions plus any class-wide {@link ClassEnrollment} of the class.
 * Database triggers repeat the capacity and membership checks and a unique index forbids booking a session twice.
 */
@Service
public class SessionBookingService {

    private static final String BOOKED = "booked";
    private static final String CANCELLED = "cancelled";
    private static final Set<String> STAFF_ROLES = Set.of("CENTER_MANAGER", "MANAGER", "STAFF", "RECEPTIONIST");

    private final SessionBookingRepository bookings;
    private final ClassSessionRepository sessions;
    private final ClassEnrollmentRepository enrollments;
    private final GymClassRepository gymClasses;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final NotificationService notifications;
    private final MessageService messageService;
    private final Clock clock;

    public SessionBookingService(SessionBookingRepository bookings, ClassSessionRepository sessions,
                                 ClassEnrollmentRepository enrollments, GymClassRepository gymClasses,
                                 MembershipSubscriptionRepository subscriptions, MemberRepository members,
                                 NotificationService notifications, MessageService messageService, Clock clock) {
        this.bookings = bookings;
        this.sessions = sessions;
        this.enrollments = enrollments;
        this.gymClasses = gymClasses;
        this.subscriptions = subscriptions;
        this.members = members;
        this.notifications = notifications;
        this.messageService = messageService;
        this.clock = clock;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    private String reason(AppException e) {
        if (messageService != null && e.getMessageKey() != null) {
            try {
                return messageService.getMessage(e.getMessageKey(),
                        e.getMessageArgs() == null ? new Object[0] : e.getMessageArgs());
            } catch (RuntimeException ignored) {
                // fall back to the error code
            }
        }
        return e.getErrorCode();
    }

    // ------------------------------------------------------------------ booking

    @Transactional
    public SessionBookingDto book(AuthenticatedPrincipal principal, Long sessionId) {
        Member member = lockMember(principal.id());
        SessionBooking booking = bookOne(member, findSession(sessionId), null);
        notifications.send(member.getUserId(), msg("notifications.booking.session_booked.title"),
                msg("notifications.booking.session_booked.body", className(booking), booking.getSession().getSessionDate().toString(),
                        timeRange(booking.getSession())),
                "system", "class_session", booking.getSession().getId());
        return toDto(booking);
    }

    /** Books every listed session that can be booked and reports the rest with the reason for each. */
    @Transactional
    public BulkBookResult bookMany(AuthenticatedPrincipal principal, List<Long> sessionIds) {
        List<Long> ids = distinctIds(sessionIds);
        Member member = lockMember(principal.id());
        List<Skipped> skipped = new ArrayList<>();
        List<ClassSession> found = new ArrayList<>();
        for (Long id : ids) {
            Optional<ClassSession> session = sessions.findById(id);
            if (session.isPresent()) {
                found.add(session.get());
            } else {
                skipped.add(new Skipped(id, null, "NOT_FOUND", msg("resource.class_session")));
            }
        }
        // Fixed order (class, then time) keeps the class row locks deadlock-free between concurrent requests.
        found.sort(Comparator.comparing((ClassSession s) -> s.getGymClass().getId())
                .thenComparing(ClassSession::getSessionDate).thenComparing(ClassSession::getStartTime));
        String batchId = found.size() > 1 ? UUID.randomUUID().toString() : null;
        List<SessionBookingDto> booked = new ArrayList<>();
        for (ClassSession session : found) {
            try {
                booked.add(toDto(bookOne(member, session, batchId)));
            } catch (AppException e) {
                skipped.add(new Skipped(session.getId(), session.getSessionDate(), e.getErrorCode(), reason(e)));
            }
        }
        booked.sort(Comparator.comparing(SessionBookingDto::sessionDate).thenComparing(SessionBookingDto::startTime));
        skipped.sort(Comparator.comparing(Skipped::date, Comparator.nullsLast(Comparator.naturalOrder())));
        if (!booked.isEmpty()) {
            notifications.send(member.getUserId(), msg("notifications.booking.bulk_booked.title"),
                    msg("notifications.booking.bulk_booked.body", booked.size()), "system", "class_session",
                    booked.get(0).sessionId());
        }
        return new BulkBookResult(booked, skipped);
    }

    private SessionBooking bookOne(Member member, ClassSession session, String batchId) {
        Long memberId = member.getUserId();
        Long classId = session.getGymClass().getId();
        GymClass gymClass = gymClasses.findByIdForUpdate(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));
        if (gymClass.getStatus() != null && !"active".equalsIgnoreCase(gymClass.getStatus())) {
            throw new BadRequestException("SCHEDULING_CLASS_INACTIVE", "error.scheduling.class_inactive", null,
                    "Class is currently inactive");
        }
        SessionEligibility.ensureBookable(session, clock);
        SessionEligibility.ensureMembershipCoversSession(subscriptions, memberId, session.getSessionDate(), clock);

        var room = gymClass.getRoom();
        if (room != null && "PLATINUM".equalsIgnoreCase(room.getTier())) {
            var sessionDate = session.getSessionDate();
            boolean hasPlatinum = subscriptions.findByMemberUserIdAndStatus(memberId, "active").stream()
                    .anyMatch(sub -> !sub.getStartDate().isAfter(sessionDate)
                            && !sub.getEndDate().isBefore(sessionDate)
                            && sub.getMembershipPackage() != null
                            && sub.getMembershipPackage().getName() != null
                            && sub.getMembershipPackage().getName().toUpperCase(java.util.Locale.ROOT).contains("PLATINUM"));
            if (!hasPlatinum) {
                throw new ForbiddenException("SCHEDULING_ROOM_PLATINUM_REQUIRED",
                        "error.scheduling.room_platinum_required", null,
                        "Phòng Gym VIP chỉ dành cho hội viên sở hữu gói Platinum");
            }
        }

        if (bookings.existsBySessionIdAndMemberUserIdAndStatus(session.getId(), memberId, BOOKED)) {
            throw new ConflictException("SCHEDULING_SESSION_ALREADY_BOOKED", "error.scheduling.session_already_booked",
                    null, "Member already booked this session");
        }
        if (enrollments.findByGymClassIdAndMemberUserIdAndStatus(classId, memberId, BOOKED).isPresent()) {
            throw new ConflictException("SCHEDULING_ALREADY_ENROLLED", "error.scheduling.already_enrolled", null,
                    "Member already has an active booking for this class");
        }
        ensureNoOverlap(memberId, session);

        long taken = enrollments.countByGymClassIdAndStatus(classId, BOOKED)
                + bookings.countBySessionIdAndStatus(session.getId(), BOOKED);
        if (taken >= gymClass.getCapacity()) {
            throw new ConflictException("SCHEDULING_SESSION_FULL", "error.scheduling.session_full", null,
                    "This session is full");
        }

        SessionBooking booking = new SessionBooking();
        booking.setSession(session);
        booking.setMember(member);
        booking.setStatus(BOOKED);
        booking.setBookedAt(LocalDateTime.now(clock));
        booking.setBatchId(batchId);
        return bookings.saveAndFlush(booking);
    }

    /** A member cannot hold two sessions that overlap in time, whether booked per session or through a class. */
    private void ensureNoOverlap(Long memberId, ClassSession target) {
        List<ClassSession> sameDay = sessions.findActiveByMemberAndDate(memberId, target.getSessionDate());
        if (sameDay == null) {
            return;
        }
        for (ClassSession other : sameDay) {
            if (other == null || other.getId() == null || other.getId().equals(target.getId())) {
                continue;
            }
            if (target.getStartTime().isBefore(other.getEndTime()) && target.getEndTime().isAfter(other.getStartTime())) {
                throw new ConflictException("SCHEDULING_MEMBER_TIME_OVERLAP", "error.scheduling.member_time_overlap",
                        new Object[]{other.getGymClass().getName(), target.getSessionDate().toString(),
                                hhmm(other.getStartTime()), hhmm(other.getEndTime())},
                        "Member already has an overlapping booking");
            }
        }
    }

    // ------------------------------------------------------------------ cancelling

    @Transactional
    public SessionBookingDto cancel(AuthenticatedPrincipal principal, Long bookingId) {
        SessionBooking booking = lockBooking(bookingId);
        SessionBookingDto dto = cancelLocked(principal, booking);
        notifications.send(booking.getMember().getUserId(), msg("notifications.booking.session_cancelled.title"),
                msg("notifications.booking.session_cancelled.body", className(booking),
                        booking.getSession().getSessionDate().toString()),
                "system", "class_session", booking.getSession().getId());
        return dto;
    }

    @Transactional
    public BulkCancelResult cancelMany(AuthenticatedPrincipal principal, List<Long> bookingIds) {
        List<Long> ids = distinctIds(bookingIds);
        List<SessionBookingDto> cancelled = new ArrayList<>();
        List<Skipped> skipped = new ArrayList<>();
        Long notifyUser = null;
        for (Long id : ids) {
            try {
                SessionBooking booking = lockBooking(id);
                cancelled.add(cancelLocked(principal, booking));
                notifyUser = booking.getMember().getUserId();
            } catch (AppException e) {
                skipped.add(new Skipped(id, null, e.getErrorCode(), reason(e)));
            }
        }
        if (!cancelled.isEmpty() && notifyUser != null && cancelled.size() > 1) {
            notifications.send(notifyUser, msg("notifications.booking.bulk_cancelled.title"),
                    msg("notifications.booking.bulk_cancelled.body", cancelled.size()), "system", "class_session",
                    cancelled.get(0).sessionId());
        } else if (cancelled.size() == 1 && notifyUser != null) {
            notifications.send(notifyUser, msg("notifications.booking.session_cancelled.title"),
                    msg("notifications.booking.session_cancelled.body", cancelled.get(0).className(),
                            cancelled.get(0).sessionDate().toString()),
                    "system", "class_session", cancelled.get(0).sessionId());
        }
        return new BulkCancelResult(cancelled, skipped);
    }

    private SessionBooking lockBooking(Long bookingId) {
        Long classId = bookings.findClassIdById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.session_booking", bookingId));
        gymClasses.findByIdForUpdate(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));
        return bookings.findByIdForUpdate(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.session_booking", bookingId));
    }

    private SessionBookingDto cancelLocked(AuthenticatedPrincipal principal, SessionBooking booking) {
        boolean staff = STAFF_ROLES.contains(principal.role());
        boolean owner = booking.getMember() != null && booking.getMember().getUserId().equals(principal.id());
        if (!staff && !owner) {
            throw new ForbiddenException("SCHEDULING_BOOKING_NOT_OWNER", "error.scheduling.booking_not_owner", null,
                    "Only the owner or staff may cancel this booking");
        }
        if (!BOOKED.equalsIgnoreCase(booking.getStatus())) {
            throw new BadRequestException("SCHEDULING_BOOKING_NOT_BOOKED", "error.scheduling.booking_not_booked", null,
                    "Only a booked session can be cancelled");
        }
        ClassSession session = booking.getSession();
        if (!LocalDateTime.of(session.getSessionDate(), session.getStartTime()).isAfter(LocalDateTime.now(clock))) {
            throw new BadRequestException("SCHEDULING_BOOKING_TOO_LATE", "error.scheduling.booking_too_late", null,
                    "A session that has started can no longer be cancelled");
        }
        booking.setStatus(CANCELLED);
        booking.setCancelledAt(LocalDateTime.now(clock));
        booking.setCancelReason(msg("scheduling.enrollment.cancelled_by_role", principal.role()));
        return toDto(bookings.saveAndFlush(booking));
    }

    /**
     * Releases a member's upcoming per-session bookings when the membership is put on hold, cancelled or expires;
     * {@code coveredOn} keeps the sessions whose date the membership still covers.
     */
    @Transactional
    public int cancelFutureForMember(Long memberId, String reason, Predicate<LocalDate> coveredOn) {
        if (memberId == null) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        int cancelled = 0;
        for (SessionBooking booking : bookings.findUpcomingBookedForMember(memberId, now.toLocalDate())) {
            ClassSession session = booking.getSession();
            if (coveredOn.test(session.getSessionDate())
                    || (session.getEndTime() != null && session.getSessionDate().equals(now.toLocalDate())
                    && session.getEndTime().isBefore(now.toLocalTime()))) {
                continue;
            }
            booking.setStatus(CANCELLED);
            booking.setCancelledAt(now);
            booking.setCancelReason(reason);
            bookings.saveAndFlush(booking);
            cancelled++;
        }
        if (cancelled > 0) {
            notifications.send(memberId, msg("notifications.booking.bulk_cancelled.title"),
                    msg("notifications.booking.bulk_cancelled.body", cancelled), "system", "class_session", null);
        }
        return cancelled;
    }

    // ------------------------------------------------------------------ reading

    @Transactional(readOnly = true)
    public List<SessionBookingDto> myBookings(AuthenticatedPrincipal principal, String status,
                                              LocalDate from, LocalDate to) {
        members.findById(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", principal.id()));
        String normalized = status != null && !status.isBlank() ? status.trim().toLowerCase() : null;
        return bookings.findForMember(principal.id(), normalized, from, to).stream().map(this::toDto).toList();
    }

    // ------------------------------------------------------------------ helpers

    private List<Long> distinctIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BadRequestException("SCHEDULING_BULK_EMPTY", "error.scheduling.bulk_empty", null, null);
        }
        Set<Long> distinct = new LinkedHashSet<>();
        for (Long id : ids) {
            if (id != null && id > 0) {
                distinct.add(id);
            }
        }
        if (distinct.isEmpty()) {
            throw new BadRequestException("SCHEDULING_BULK_EMPTY", "error.scheduling.bulk_empty", null, null);
        }
        if (distinct.size() > SessionBookingRequests.MAX_BULK) {
            throw new BadRequestException("SCHEDULING_BULK_TOO_MANY", "error.scheduling.bulk_too_many",
                    new Object[]{SessionBookingRequests.MAX_BULK}, null);
        }
        return new ArrayList<>(distinct);
    }

    private Member lockMember(Long memberId) {
        return members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
    }

    private ClassSession findSession(Long sessionId) {
        return sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));
    }

    private static String hhmm(LocalTime time) {
        String raw = time.toString();
        return raw.length() >= 5 ? raw.substring(0, 5) : raw;
    }

    private static String className(SessionBooking booking) {
        return booking.getSession().getGymClass().getName();
    }

    private static String timeRange(ClassSession session) {
        return hhmm(session.getStartTime()) + "–" + hhmm(session.getEndTime());
    }

    private SessionBookingDto toDto(SessionBooking booking) {
        ClassSession session = booking.getSession();
        GymClass gymClass = session.getGymClass();
        return new SessionBookingDto(
                booking.getId(),
                session.getId(),
                gymClass.getId(),
                gymClass.getName(),
                booking.getMember() != null ? booking.getMember().getUserId() : null,
                session.getSessionDate(),
                session.getStartTime(),
                session.getEndTime(),
                gymClass.getRoom() != null ? gymClass.getRoom().getName() : null,
                gymClass.getCoach() != null && gymClass.getCoach().getUser() != null
                        ? gymClass.getCoach().getUser().getFullName() : null,
                booking.getStatus(),
                booking.getBookedAt(),
                booking.getCancelledAt(),
                booking.getCancelReason(),
                booking.getBatchId());
    }
}
