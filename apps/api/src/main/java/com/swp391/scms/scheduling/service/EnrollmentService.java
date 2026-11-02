package com.swp391.scms.scheduling.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.dto.EnrollmentResponses.EnrollmentDto;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.ClassWaitlist;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.event.WaitlistPromotedEvent;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.stream.Stream;
import java.util.Objects;

/**
 * SCRUM-73 & SCRUM-132: member class booking, time-overlap guard, and cancellation.
 *
 * <p>Invariant triggers are owned by the database and are never bypassed:
 * Trigger P2 ({@code trg_enrollments_check_capacity}) rejects a full class and
 * Trigger P4 ({@code trg_enrollments_check_membership}) rejects an inactive/expired
 * membership. Both are mirrored as a pre-check so the API returns a precise error
 * instead of a raw constraint violation.
 */
@Service
public class EnrollmentService {

    public static final int WAITLIST_RESERVATION_HOURS = 24;
    private static final String BOOKED = "booked";
    private static final String CANCELLED = "cancelled";
    private static final String WAITING = "waiting";

    private static final String ROLE_CENTER_MANAGER = "CENTER_MANAGER";
    private static final String ROLE_MANAGER = "MANAGER";
    private static final String ROLE_STAFF = "STAFF";
    private static final String ROLE_RECEPTIONIST = "RECEPTIONIST";

    private final ClassEnrollmentRepository enrollments;
    private final ClassSessionRepository sessions;
    private final ClassWaitlistRepository waitlists;
    private final GymClassRepository gymClasses;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final NotificationService notifications;
    private final MessageService messageService;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public EnrollmentService(ClassEnrollmentRepository enrollments,
                             ClassSessionRepository sessions,
                             ClassWaitlistRepository waitlists,
                             GymClassRepository gymClasses,
                             MembershipSubscriptionRepository subscriptions,
                             MemberRepository members,
                             NotificationService notifications,
                             MessageService messageService,
                             Clock clock) {
        this(enrollments, sessions, waitlists, gymClasses, subscriptions, members, notifications,
                messageService, clock, null);
    }

    @Autowired
    public EnrollmentService(ClassEnrollmentRepository enrollments,
                             ClassSessionRepository sessions,
                             ClassWaitlistRepository waitlists,
                             GymClassRepository gymClasses,
                             MembershipSubscriptionRepository subscriptions,
                             MemberRepository members,
                             NotificationService notifications,
                             MessageService messageService,
                             Clock clock,
                             ApplicationEventPublisher events) {
        this.enrollments = enrollments;
        this.sessions = sessions;
        this.waitlists = waitlists;
        this.gymClasses = gymClasses;
        this.subscriptions = subscriptions;
        this.members = members;
        this.notifications = notifications;
        this.messageService = messageService;
        this.clock = clock;
        this.events = events;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    /**
     * SCRUM-73 & SCRUM-132 AC: a member books a seat in a class session.
     * Rejects overlapping bookings across different classes in the same time slot.
     */
    @Transactional
    public EnrollmentDto enroll(AuthenticatedPrincipal principal, Long sessionId) {
        return enroll(principal, sessionId, null);
    }

    @Transactional
    public EnrollmentDto enroll(AuthenticatedPrincipal principal, Long sessionId, Long waitlistId) {
        if (waitlistId != null && waitlistId <= 0) {
            throw new BadRequestException("SCHEDULING_WAITLIST_ID_INVALID",
                    "error.scheduling.waitlist_id_invalid", null, null);
        }
        Member member = lockMember(principal.id());
        ClassSession session = findSession(sessionId);
        Long classId = session.getGymClass().getId();
        GymClass gymClass = gymClasses.findByIdForUpdate(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));
        if (gymClass.getStatus() != null && !"active".equalsIgnoreCase(gymClass.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_CLASS_INACTIVE",
                    "error.scheduling.class_inactive",
                    null,
                    "Class is currently inactive");
        }
        SessionEligibility.ensureBookable(session, clock);
        SessionEligibility.ensureMembershipCoversSession(subscriptions, member.getUserId(), session.getSessionDate(), clock);

        if (enrollments.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), member.getUserId(), BOOKED)
                .isPresent()) {
            throw new ConflictException(
                    "SCHEDULING_ALREADY_ENROLLED",
                    "error.scheduling.already_enrolled",
                    null,
                    "Member already has an active booking for this class");
        }

        // SCRUM-132: Chặn Hội viên đặt các lịch học đè/chồng chéo giờ lên nhau
        ensureNoMemberScheduleOverlap(member.getUserId(), session, gymClass.getId());

        LocalDateTime now = LocalDateTime.now(clock);
        var offer = waitlistId == null
                ? waitlists.findByGymClassIdAndMemberUserIdAndStatus(classId, member.getUserId(), "notified")
                : waitlists.findClaimOfferForUpdate(waitlistId, classId, member.getUserId());
        if (waitlistId != null) {
            var claimed = offer.orElseThrow(() -> new ResourceNotFoundException("resource.class_waitlist", waitlistId));
            if (!"notified".equals(claimed.getStatus())) {
                throw new ConflictException("SCHEDULING_WAITLIST_OFFER_NOT_ACTIVE",
                        "error.scheduling.waitlist_offer_not_active", null, null);
            }
        }
        if (offer.isPresent() && isExpired(offer.get(), now)) {
            throw new ConflictException("SCHEDULING_WAITLIST_OFFER_EXPIRED",
                    "error.scheduling.waitlist_offer_expired", null, null);
        }
        processExpiredReservationsLocked(gymClass, now);
        // Cleanup may have promoted this caller while the class lock is held.
        if (waitlistId == null) {
            offer = waitlists.findByGymClassIdAndMemberUserIdAndStatus(classId, member.getUserId(), "notified");
        }
        boolean isHoldingReservation = offer.isPresent();

        long booked = enrollments.countByGymClassIdAndStatus(gymClass.getId(), BOOKED);
        long activeReservations = waitlists.countLiveOffers(classId, now, now.minusHours(WAITLIST_RESERVATION_HOURS));

        // Khóa chống cướp chỗ, tính cả các suất đang được giữ cho hàng chờ.
        if (booked + Math.max(0, activeReservations - (isHoldingReservation ? 1 : 0)) >= gymClass.getCapacity()) {
            throw new ConflictException(
                    "SCHEDULING_CLASS_FULL",
                    "error.scheduling.class_full",
                    null,
                    "Class is full; consider joining the waitlist");
        }

        ClassEnrollment enrollment = new ClassEnrollment();
        enrollment.setGymClass(gymClass);
        enrollment.setMember(member);
        enrollment.setStatus(BOOKED);
        enrollment.setEnrolledAt(now);

        ClassEnrollment saved = enrollments.saveAndFlush(enrollment);

        waitlists.findByGymClassIdAndMemberUserIdAndStatus(classId, member.getUserId(), WAITING)
                .ifPresent(waiting -> {
                    waiting.setStatus("expired");
                    waitlists.save(waiting);
                });
        offer.ifPresent(claimed -> {
            claimed.setStatus("expired");
            waitlists.save(claimed);
        });

        notifications.send(member.getUserId(),
                msg("notifications.booking.enrolled.title"),
                msg("notifications.booking.enrolled.body", gymClass.getName(), session.getSessionDate().toString()),
                "system",
                "class_enrollment",
                saved.getId());

        return toDto(saved, session);
    }

    /**
     * SCRUM-132: Rejects booking or waitlist registration if the member already holds an active
     * booking or active waitlist entry in another class whose scheduled session overlaps in time.
     */
    public void ensureNoMemberScheduleOverlap(Long memberId, ClassSession targetSession, Long excludeClassId) {
        if (memberId == null || targetSession == null
                || targetSession.getSessionDate() == null
                || targetSession.getStartTime() == null
                || targetSession.getEndTime() == null) {
            return;
        }
        LocalDate targetDate = targetSession.getSessionDate();
        LocalTime targetStart = targetSession.getStartTime();
        LocalTime targetEnd = targetSession.getEndTime();

        List<ClassEnrollment> memberEnrollments = enrollments.findByMemberUserId(memberId);
        if (memberEnrollments != null) {
            for (ClassEnrollment existing : memberEnrollments) {
                if (existing == null || !BOOKED.equalsIgnoreCase(existing.getStatus())) {
                    continue;
                }
                GymClass bookedClass = existing.getGymClass();
                if (bookedClass == null || bookedClass.getId() == null
                        || Objects.equals(bookedClass.getId(), excludeClassId)) {
                    continue;
                }
                List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(bookedClass.getId());
                if (classSessions == null) {
                    continue;
                }
                for (ClassSession s : classSessions) {
                    if (s == null || "cancelled".equalsIgnoreCase(s.getStatus())) {
                        continue;
                    }
                    if (targetDate.equals(s.getSessionDate())
                            && s.getStartTime() != null
                            && s.getEndTime() != null
                            && targetStart.isBefore(s.getEndTime())
                            && targetEnd.isAfter(s.getStartTime())) {
                        String rangeStart = formatTime(s.getStartTime());
                        String rangeEnd = formatTime(s.getEndTime());
                        throw new ConflictException(
                                "SCHEDULING_MEMBER_TIME_OVERLAP",
                                "error.scheduling.member_time_overlap",
                                new Object[]{bookedClass.getName(), targetDate.toString(), rangeStart, rangeEnd},
                                "Member already has an overlapping booking for class " + bookedClass.getName()
                                        + " on " + targetDate + " (" + rangeStart + " - " + rangeEnd + ")");
                    }
                }
            }
        }

        if (waitlists != null) {
            List<ClassWaitlist> memberWaitlists = waitlists.findByMemberUserIdOrderByRequestedAtAsc(memberId);
            if (memberWaitlists != null) {
                for (ClassWaitlist wl : memberWaitlists) {
                    if (wl == null || (!WAITING.equalsIgnoreCase(wl.getStatus())
                            && !"notified".equalsIgnoreCase(wl.getStatus()))) {
                        continue;
                    }
                    GymClass waitlistedClass = wl.getGymClass();
                    if (waitlistedClass == null || waitlistedClass.getId() == null
                            || Objects.equals(waitlistedClass.getId(), excludeClassId)) {
                        continue;
                    }
                    List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(waitlistedClass.getId());
                    if (classSessions == null) {
                        continue;
                    }
                    for (ClassSession s : classSessions) {
                        if (s == null || "cancelled".equalsIgnoreCase(s.getStatus())) {
                            continue;
                        }
                        if (targetDate.equals(s.getSessionDate())
                                && s.getStartTime() != null
                                && s.getEndTime() != null
                                && targetStart.isBefore(s.getEndTime())
                                && targetEnd.isAfter(s.getStartTime())) {
                            String rangeStart = formatTime(s.getStartTime());
                            String rangeEnd = formatTime(s.getEndTime());
                            throw new ConflictException(
                                    "SCHEDULING_MEMBER_TIME_OVERLAP",
                                    "error.scheduling.member_waitlist_time_overlap",
                                    new Object[]{waitlistedClass.getName(), targetDate.toString(), rangeStart, rangeEnd},
                                    "Member already has an overlapping waitlist entry for class " + waitlistedClass.getName()
                                            + " on " + targetDate + " (" + rangeStart + " - " + rangeEnd + ")");
                        }
                    }
                }
            }
        }
    }

    private static String formatTime(LocalTime time) {
        if (time == null) return "";
        String raw = time.toString();
        return raw.length() >= 5 ? raw.substring(0, 5) : raw;
    }

    /**
     * SCRUM-73 BR-05: cancel a booking. Soft delete, releases the seat immediately.
     * Only the owner or Staff/Manager may cancel.
     */
    @Transactional
    public EnrollmentDto cancel(AuthenticatedPrincipal principal, Long enrollmentId) {
        Long classId = enrollments.findClassIdById(enrollmentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_enrollment", enrollmentId));
        lockClass(classId);
        ClassEnrollment enrollment = enrollments.findByIdForUpdate(enrollmentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_enrollment", enrollmentId));

        boolean isStaff = isStaffRole(principal.role());
        boolean isOwner = enrollment.getMember() != null
                && enrollment.getMember().getUserId().equals(principal.id());
        if (!isStaff && !isOwner) {
            throw new ForbiddenException(
                    "SCHEDULING_ENROLLMENT_NOT_OWNER",
                    "error.scheduling.enrollment_not_owner",
                    null,
                    "Only the owner or staff may cancel this enrollment");
        }

        if (!BOOKED.equalsIgnoreCase(enrollment.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_ENROLLMENT_NOT_BOOKED",
                    "error.scheduling.enrollment_not_booked",
                    null,
                    "Only a booked enrollment can be cancelled");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        enrollment.setStatus(CANCELLED);
        enrollment.setCancelledAt(now);
        enrollment.setCancelReason(msg("scheduling.enrollment.cancelled_by_role", principal.role()));

        ClassEnrollment saved = enrollments.saveAndFlush(enrollment);

        notifications.send(enrollment.getMember().getUserId(),
                msg("notifications.booking.cancelled.title"),
                msg("notifications.booking.cancelled.body"),
                "system",
                "class_enrollment",
                saved.getId());

        // Đôn người tiếp theo trong hàng chờ và giữ chỗ 24 giờ.
        if (enrollment.getGymClass() != null && enrollment.getGymClass().getId() != null) {
            promoteNextWaitlistEntry(enrollment.getGymClass().getId(), now);
        }

        return toDto(saved, resolveSessionForClass(enrollment.getGymClass()));
    }

    /**
     * Hủy toàn bộ các lịch lớp học đã đặt trong tương lai của hội viên khi gói tập được bảo lưu.
     * Đồng thời giải phóng chỗ trống và đôn hàng chờ (waitlist) cho từng lớp bị ảnh hưởng.
     */
    @Transactional
    public int cancelFutureEnrollmentsForMember(Long memberId, String cancelReason) {
        if (memberId == null || enrollments == null) {
            return 0;
        }
        String resolvedReason = (cancelReason != null && !cancelReason.isBlank())
                ? cancelReason
                : msg("scheduling.enrollment.cancelled_by_hold");

        // Membership hold/cancellation already owns this lock; standalone callers use it too.
        lockMember(memberId);
        List<Long> classIds = Stream.concat(enrollments.findBookedClassIdsByMemberId(memberId).stream(),
                        waitlists.findActiveClassIdsByMemberId(memberId).stream())
                .distinct().sorted().toList();
        // Lock classes in ascending order before loading mutable enrollment/waitlist state.
        List<GymClass> lockedClasses = classIds.stream().map(this::lockClass).toList();
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalTime nowTime = now.toLocalTime();
        int cancelledCount = 0;
        for (GymClass gymClass : lockedClasses) {
            int released = 0;
            for (String state : List.of(WAITING, "notified")) {
                var item = waitlists.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), memberId, state);
                if (item.isPresent()) {
                    ClassWaitlist waiting = item.get();
                    if ("notified".equals(waiting.getStatus())) released++;
                    waiting.setStatus("expired");
                    waitlists.saveAndFlush(waiting);
                }
            }
            var booking = enrollments.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), memberId, BOOKED);
            if (booking.isPresent() && hasUpcomingOrActiveSession(gymClass, today, nowTime)) {
                ClassEnrollment enrollment = booking.get();
                enrollment.setStatus(CANCELLED);
                enrollment.setCancelledAt(now);
                enrollment.setCancelReason(resolvedReason);
                ClassEnrollment saved = enrollments.saveAndFlush(enrollment);
                cancelledCount++;
                released++;
                notifications.send(memberId, msg("notifications.booking.cancelled.title"),
                        msg("notifications.booking.cancelled.body"), "system", "class_enrollment", saved.getId());
            }
            for (int seat = 0; seat < released; seat++) promoteNextWaitlistEntryLocked(gymClass, now);
        }

        return cancelledCount;
    }

    private boolean hasUpcomingOrActiveSession(GymClass gymClass, LocalDate today, LocalTime nowTime) {
        if (gymClass == null || gymClass.getId() == null || sessions == null) {
            return true;
        }
        List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(gymClass.getId());
        if (classSessions == null || classSessions.isEmpty()) {
            return true;
        }
        return classSessions.stream()
                .filter(s -> !"cancelled".equalsIgnoreCase(s.getStatus())
                        && !"completed".equalsIgnoreCase(s.getStatus()))
                .anyMatch(s -> s.getSessionDate() == null
                        || s.getSessionDate().isAfter(today)
                        || (s.getSessionDate().isEqual(today)
                            && (s.getEndTime() == null || !s.getEndTime().isBefore(nowTime))));
    }

    /**
     * Đôn người đầu tiên trong waitlist lên trạng thái 'notified' và giữ chỗ 24 giờ.
     */
    @Transactional
    public int promoteNextWaitlistEntry(Long classId, LocalDateTime ignoredCallerTime) {
        if (classId == null) return 0;
        GymClass gymClass = lockClass(classId);
        return promoteNextWaitlistEntryLocked(gymClass, LocalDateTime.now(clock));
    }

    private int promoteNextWaitlistEntryLocked(GymClass gymClass, LocalDateTime now) {
        long occupied = enrollments.countByGymClassIdAndStatus(gymClass.getId(), BOOKED)
                + waitlists.countLiveOffers(gymClass.getId(), now, now.minusHours(WAITLIST_RESERVATION_HOURS));
        if (occupied >= gymClass.getCapacity()) return 0;
        var candidate = waitlists.findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(gymClass.getId(), WAITING);
        if (candidate.isEmpty()) return 0;
        ClassWaitlist next = candidate.get();
        next.setStatus("notified");
        next.setNotifiedAt(now);
        next.setReservationExpiresAt(now.plusHours(WAITLIST_RESERVATION_HOURS));
        waitlists.saveAndFlush(next);
        Long memberId = next.getMember() != null ? next.getMember().getUserId() : null;
        if (memberId != null) {
            notifications.send(memberId, msg("notifications.waitlist.notified.title"),
                    msg("notifications.waitlist.notified.body_window", gymClass.getName(), WAITLIST_RESERVATION_HOURS),
                    "schedule_change", "class_session", next.getId());
        }
        if (events != null) {
            var event = new WaitlistPromotedEvent(next.getId(), gymClass.getId(), gymClass.getName(),
                    memberId, now, next.getReservationExpiresAt());
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCommit() { events.publishEvent(event); }
                });
            } else {
                events.publishEvent(event);
            }
        }
        return 1;
    }

    /** Each scheduler class is processed in its own transaction, reading state after its lock. */
    @Transactional
    public int processExpiredWaitlistReservations(Long classId, LocalDateTime ignoredCallerTime) {
        if (classId == null) return 0;
        GymClass gymClass = lockClass(classId);
        return processExpiredReservationsLocked(gymClass, LocalDateTime.now(clock));
    }

    private int processExpiredReservationsLocked(GymClass gymClass, LocalDateTime now) {
        List<ClassWaitlist> expired = waitlists.findExpiredOffers(gymClass.getId(), now,
                now.minusHours(WAITLIST_RESERVATION_HOURS));
        int changed = 0;
        for (ClassWaitlist item : expired) {
            if (!"notified".equals(item.getStatus()) || !isExpired(item, now)) continue;
            item.setStatus("expired");
            waitlists.saveAndFlush(item);
            changed++;
            if (item.getMember() != null && item.getMember().getUserId() != null) {
                notifications.send(item.getMember().getUserId(), msg("notifications.waitlist.expired.title"),
                        msg("notifications.waitlist.expired.body", gymClass.getName()),
                        "schedule_change", "class_session", item.getId());
            }
        }
        for (int seat = 0; seat < changed; seat++) promoteNextWaitlistEntryLocked(gymClass, now);
        return changed;
    }

    static boolean isExpired(ClassWaitlist offer, LocalDateTime now) {
        return (offer.getReservationExpiresAt() == null && offer.getNotifiedAt() == null)
                || (offer.getReservationExpiresAt() != null && !offer.getReservationExpiresAt().isAfter(now))
                || (offer.getNotifiedAt() != null
                    && !offer.getNotifiedAt().plusHours(WAITLIST_RESERVATION_HOURS).isAfter(now));
    }

    private GymClass lockClass(Long classId) {
        return gymClasses.findByIdForUpdate(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));
    }

    private Member lockMember(Long memberId) {
        return members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
    }

    @Transactional(readOnly = true)
    public List<EnrollmentDto> myEnrollments(AuthenticatedPrincipal principal) {
        return myEnrollments(principal, null);
    }

    @Transactional(readOnly = true)
    public List<EnrollmentDto> myEnrollments(AuthenticatedPrincipal principal, String status) {
        findMember(principal.id());
        String normalizedStatus = status != null && !status.isBlank() ? status.trim() : null;
        return enrollments.findByMemberUserId(principal.id()).stream()
                .filter(enrollment -> normalizedStatus == null
                        || normalizedStatus.equalsIgnoreCase(enrollment.getStatus()))
                .map(enrollment -> toDto(enrollment, resolveSessionForClass(enrollment.getGymClass())))
                .toList();
    }

    private ClassSession resolveSessionForClass(GymClass gymClass) {
        if (gymClass == null || gymClass.getId() == null || sessions == null) {
            return null;
        }
        List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(gymClass.getId());
        if (classSessions == null || classSessions.isEmpty()) {
            return null;
        }
        LocalDate today = LocalDate.now(clock);
        return classSessions.stream()
                .filter(s -> s.getSessionDate() != null && !s.getSessionDate().isBefore(today)
                        && !"cancelled".equalsIgnoreCase(s.getStatus()))
                .findFirst()
                .orElse(classSessions.get(0));
    }

    private boolean isStaffRole(String role) {
        return ROLE_CENTER_MANAGER.equals(role)
                || ROLE_MANAGER.equals(role)
                || ROLE_STAFF.equals(role)
                || ROLE_RECEPTIONIST.equals(role);
    }

    private ClassSession findSession(Long sessionId) {
        return sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));
    }

    private Member findMember(Long userId) {
        return members.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", userId));
    }

    private EnrollmentDto toDto(ClassEnrollment enrollment, ClassSession session) {
        GymClass gymClass = enrollment.getGymClass();
        return new EnrollmentDto(
                enrollment.getId(),
                gymClass != null ? gymClass.getId() : null,
                gymClass != null ? gymClass.getName() : null,
                enrollment.getMember() != null ? enrollment.getMember().getUserId() : null,
                session != null ? session.getId() : null,
                session != null ? session.getSessionDate() : null,
                session != null ? session.getStartTime() : null,
                session != null ? session.getEndTime() : null,
                enrollment.getStatus(),
                enrollment.getEnrolledAt(),
                enrollment.getCancelledAt(),
                enrollment.getCancelReason()
        );
    }
}
