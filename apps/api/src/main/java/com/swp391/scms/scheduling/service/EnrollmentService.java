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
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    private static final String BOOKED = "booked";
    private static final String CANCELLED = "cancelled";

    private static final String ROLE_CENTER_MANAGER = "CENTER_MANAGER";
    private static final String ROLE_MANAGER = "MANAGER";
    private static final String ROLE_STAFF = "STAFF";
    private static final String ROLE_RECEPTIONIST = "RECEPTIONIST";

    private final ClassEnrollmentRepository enrollments;
    private final ClassSessionRepository sessions;
    private final GymClassRepository gymClasses;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final NotificationService notifications;
    private final MessageService messageService;
    private final Clock clock;

    @Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;

    @Autowired(required = false)
    private SessionBookingService sessionBookingService;

    @Autowired
    public EnrollmentService(ClassEnrollmentRepository enrollments,
                             ClassSessionRepository sessions,
                             GymClassRepository gymClasses,
                             MembershipSubscriptionRepository subscriptions,
                             MemberRepository members,
                             NotificationService notifications,
                             MessageService messageService,
                             Clock clock) {
        this.enrollments = enrollments;
        this.sessions = sessions;
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

    /**
     * Class-wide enrollment (legacy): holds one seat in every session of the class. New bookings are made per
     * session through {@link SessionBookingService}; this stays for existing enrollments and API clients.
     * Rejects overlapping bookings across different classes in the same time slot.
     */
    @Transactional
    public EnrollmentDto enroll(AuthenticatedPrincipal principal, Long sessionId) {
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
        if (sessionBookings != null && sessionBookings.existsBySessionGymClassIdAndMemberUserIdAndStatus(
                classId, member.getUserId(), BOOKED)) {
            throw new ConflictException(
                    "SCHEDULING_ALREADY_ENROLLED",
                    "error.scheduling.already_enrolled",
                    null,
                    "Member already has per-session bookings in this class");
        }

        // SCRUM-132: Chặn Hội viên đặt các lịch học đè/chồng chéo giờ lên nhau
        ensureNoMemberScheduleOverlap(member.getUserId(), session, gymClass.getId());

        long booked = enrollments.countByGymClassIdAndStatus(gymClass.getId(), BOOKED) + busiestSession(gymClass.getId());
        if (booked >= gymClass.getCapacity()) {
            throw new ConflictException(
                    "SCHEDULING_CLASS_FULL",
                    "error.scheduling.class_full",
                    null,
                    "Class is full");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        ClassEnrollment enrollment = new ClassEnrollment();
        enrollment.setGymClass(gymClass);
        enrollment.setMember(member);
        enrollment.setStatus(BOOKED);
        enrollment.setEnrolledAt(now);

        ClassEnrollment saved = enrollments.saveAndFlush(enrollment);

        notifications.send(member.getUserId(),
                msg("notifications.booking.enrolled.title"),
                msg("notifications.booking.enrolled.body", gymClass.getName(), session.getSessionDate().toString()),
                "system",
                "class_enrollment",
                saved.getId());

        return toDto(saved, session);
    }

    /**
     * SCRUM-132: Rejects a booking if the member already holds an active booking in another class
     * whose scheduled session overlaps in time.
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

        if (sessionBookings != null) {
            for (com.swp391.scms.scheduling.entity.SessionBooking booking : sessionBookings.findForMember(memberId, BOOKED, targetDate, targetDate)) {
                ClassSession s = booking.getSession();
                if (s == null || "cancelled".equalsIgnoreCase(s.getStatus())
                        || Objects.equals(s.getGymClass().getId(), excludeClassId)) {
                    continue;
                }
                if (targetStart.isBefore(s.getEndTime()) && targetEnd.isAfter(s.getStartTime())) {
                    throw new ConflictException(
                            "SCHEDULING_MEMBER_TIME_OVERLAP",
                            "error.scheduling.member_time_overlap",
                            new Object[]{s.getGymClass().getName(), targetDate.toString(),
                                    formatTime(s.getStartTime()), formatTime(s.getEndTime())},
                            "Member already has an overlapping per-session booking");
                }
            }
        }

    }

    /** Highest number of per-session bookings in any session of the class. */
    private long busiestSession(Long classId) {
        if (sessionBookings == null) return 0;
        return sessionBookings.countBookedGroupedBySession(classId).stream()
                .mapToLong(com.swp391.scms.scheduling.dto.SessionBookingCount::bookedCount).max().orElse(0);
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

        return toDto(saved, resolveSessionForClass(enrollment.getGymClass()));
    }

    /**
     * Hủy toàn bộ các lịch lớp học đã đặt trong tương lai của hội viên khi gói tập được bảo lưu.
     * Đồng thời giải phóng chỗ trống cho từng lớp bị ảnh hưởng.
     */
    @Transactional
    public int cancelFutureEnrollmentsForMember(Long memberId, String cancelReason) {
        return cancelFutureEnrollmentsForMember(memberId, cancelReason, date -> false);
    }

    /**
     * Cancels the member's upcoming class bookings whose next session date is not
     * {@code coveredOn}; a predicate that is always false cancels all of them (hold, cancellation).
     */
    @Transactional
    public int cancelFutureEnrollmentsForMember(Long memberId, String cancelReason,
                                                java.util.function.Predicate<LocalDate> coveredOn) {
        if (memberId == null || enrollments == null) {
            return 0;
        }
        String resolvedReason = (cancelReason != null && !cancelReason.isBlank())
                ? cancelReason
                : msg("scheduling.enrollment.cancelled_by_hold");

        // Membership hold/cancellation already owns this lock; standalone callers use it too.
        lockMember(memberId);
        List<Long> classIds = enrollments.findBookedClassIdsByMemberId(memberId).stream()
                .distinct().sorted().toList();
        // Lock classes in ascending order before loading mutable enrollment state.
        List<GymClass> lockedClasses = classIds.stream().map(this::lockClass).toList();
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalTime nowTime = now.toLocalTime();
        int cancelledCount = 0;
        for (GymClass gymClass : lockedClasses) {
            java.util.Optional<LocalDate> nextSession = nextOpenSessionDate(gymClass, today, nowTime);
            if (nextSession.isPresent() && coveredOn.test(nextSession.get())) {
                continue;
            }
            var booking = enrollments.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), memberId, BOOKED);
            if (booking.isPresent() && nextSession.isPresent()) {
                ClassEnrollment enrollment = booking.get();
                enrollment.setStatus(CANCELLED);
                enrollment.setCancelledAt(now);
                enrollment.setCancelReason(resolvedReason);
                ClassEnrollment saved = enrollments.saveAndFlush(enrollment);
                cancelledCount++;
                notifications.send(memberId, msg("notifications.booking.cancelled.title"),
                        msg("notifications.booking.cancelled.body"), "system", "class_enrollment", saved.getId());
            }
        }

        if (sessionBookingService != null) {
            cancelledCount += sessionBookingService.cancelFutureForMember(memberId, resolvedReason, coveredOn);
        }
        return cancelledCount;
    }

    /** Date of the class's next session that has not ended; today when the schedule is unknown, empty when none. */
    private java.util.Optional<LocalDate> nextOpenSessionDate(GymClass gymClass, LocalDate today, LocalTime nowTime) {
        if (gymClass == null || gymClass.getId() == null || sessions == null) {
            return java.util.Optional.of(today);
        }
        List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(gymClass.getId());
        if (classSessions == null || classSessions.isEmpty()) {
            return java.util.Optional.of(today);
        }
        return classSessions.stream()
                .filter(s -> !"cancelled".equalsIgnoreCase(s.getStatus())
                        && !"completed".equalsIgnoreCase(s.getStatus()))
                .filter(s -> s.getSessionDate() == null
                        || s.getSessionDate().isAfter(today)
                        || (s.getSessionDate().isEqual(today)
                            && (s.getEndTime() == null || !s.getEndTime().isBefore(nowTime))))
                .map(s -> s.getSessionDate() == null ? today : s.getSessionDate())
                .findFirst();
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
