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

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * SCRUM-73: member class booking and cancellation.
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

    @Autowired
    public EnrollmentService(ClassEnrollmentRepository enrollments,
                             ClassSessionRepository sessions,
                             ClassWaitlistRepository waitlists,
                             GymClassRepository gymClasses,
                             MembershipSubscriptionRepository subscriptions,
                             MemberRepository members,
                             NotificationService notifications,
                             MessageService messageService,
                             Clock clock) {
        this.enrollments = enrollments;
        this.sessions = sessions;
        this.waitlists = waitlists;
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
     * SCRUM-73 AC: a member books a seat in a class session.
     */
    @Transactional
    public EnrollmentDto enroll(AuthenticatedPrincipal principal, Long sessionId) {
        Member member = findMember(principal.id());
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

        LocalDateTime now = LocalDateTime.now(clock);
        processExpiredWaitlistReservations(gymClass.getId(), now);

        boolean isHoldingReservation = waitlists.findByGymClassIdAndMemberUserIdAndStatus(
                classId, member.getUserId(), "notified"
        ).isPresent();

        long booked = enrollments.countByGymClassIdAndStatus(gymClass.getId(), BOOKED);
        long activeReservations = waitlists
                .countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(gymClass.getId(), "notified", now);

        // Khóa chống cướp chỗ, tính cả các suất đang được giữ cho hàng chờ.
        if (!isHoldingReservation && (booked + activeReservations >= gymClass.getCapacity())) {
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

        for (String wlStatus : List.of(WAITING, "notified")) {
            waitlists.findByGymClassIdAndMemberUserIdAndStatus(classId, member.getUserId(), wlStatus)
                    .ifPresent(waiting -> {
                        waiting.setStatus("expired");
                        waitlists.save(waiting);
                    });
        }

        notifications.send(member.getUserId(),
                msg("notifications.booking.enrolled.title"),
                msg("notifications.booking.enrolled.body", gymClass.getName(), session.getSessionDate().toString()),
                "system",
                "class_enrollment",
                saved.getId());

        return toDto(saved, session);
    }

    /**
     * SCRUM-73 BR-05: cancel a booking. Soft delete, releases the seat immediately.
     * Only the owner or Staff/Manager may cancel.
     */
    @Transactional
    public EnrollmentDto cancel(AuthenticatedPrincipal principal, Long enrollmentId) {
        ClassEnrollment enrollment = enrollments.findById(enrollmentId)
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
        LocalDate today = LocalDate.now(clock);
        LocalDateTime now = LocalDateTime.now(clock);
        LocalTime nowTime = now.toLocalTime();
        String resolvedReason = (cancelReason != null && !cancelReason.isBlank())
                ? cancelReason
                : msg("scheduling.enrollment.cancelled_by_hold");

        if (waitlists != null) {
            List<ClassWaitlist> memberWaitlists =
                    waitlists.findByMemberUserIdOrderByRequestedAtAsc(memberId);
            if (memberWaitlists != null) {
                for (ClassWaitlist wl : memberWaitlists) {
                    if (wl == null) continue;
                    boolean wasNotified = "notified".equalsIgnoreCase(wl.getStatus());
                    if (WAITING.equalsIgnoreCase(wl.getStatus()) || wasNotified) {
                        wl.setStatus("expired");
                        waitlists.save(wl);
                        if (wasNotified && wl.getGymClass() != null && wl.getGymClass().getId() != null) {
                            promoteNextWaitlistEntry(wl.getGymClass().getId(), now);
                        }
                    }
                }
            }
        }

        int cancelledCount = 0;
        List<ClassEnrollment> memberEnrollments = enrollments.findByMemberUserId(memberId);
        if (memberEnrollments != null) {
            for (ClassEnrollment enrollment : memberEnrollments) {
                if (enrollment == null || !BOOKED.equalsIgnoreCase(enrollment.getStatus())) {
                    continue;
                }
                if (!hasUpcomingOrActiveSession(enrollment.getGymClass(), today, nowTime)) {
                    continue;
                }
                enrollment.setStatus(CANCELLED);
                enrollment.setCancelledAt(now);
                enrollment.setCancelReason(resolvedReason);
                ClassEnrollment saved = enrollments.saveAndFlush(enrollment);
                cancelledCount++;

                if (notifications != null) {
                    notifications.send(memberId,
                            msg("notifications.booking.cancelled.title"),
                            msg("notifications.booking.cancelled.body"),
                            "system",
                            "class_enrollment",
                            saved != null ? saved.getId() : enrollment.getId());
                }

                if (enrollment.getGymClass() != null && enrollment.getGymClass().getId() != null) {
                    promoteNextWaitlistEntry(enrollment.getGymClass().getId(), now);
                }
            }
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
    public void promoteNextWaitlistEntry(Long classId, LocalDateTime now) {
        if (classId == null) return;
        List<ClassWaitlist> waitingList =
                waitlists.findByGymClassIdAndStatusOrderByRequestedAtAsc(classId, WAITING);
        if (waitingList != null && !waitingList.isEmpty()) {
            ClassWaitlist nextWaiting = waitingList.get(0);
            nextWaiting.setStatus("notified");
            nextWaiting.setNotifiedAt(now);
            nextWaiting.setReservationExpiresAt(now.plusHours(WAITLIST_RESERVATION_HOURS));
            waitlists.save(nextWaiting);
            if (nextWaiting.getMember() != null && nextWaiting.getMember().getUserId() != null) {
                notifications.send(nextWaiting.getMember().getUserId(),
                        msg("notifications.waitlist.notified.title"),
                        msg("notifications.waitlist.notified.body_window",
                                nextWaiting.getGymClass() != null ? nextWaiting.getGymClass().getName() : "",
                                WAITLIST_RESERVATION_HOURS),
                        "schedule_change",
                        "class_session",
                        nextWaiting.getId());
            }
        }
    }

    /**
     * Kiểm tra các lượt giữ chỗ đã hết hạn trước khi xử lý đặt chỗ.
     */
    @Transactional
    public void processExpiredWaitlistReservations(Long classId, LocalDateTime now) {
        if (classId == null) return;
        List<ClassWaitlist> expiredList = waitlists
                .findByGymClassIdAndStatusAndReservationExpiresAtLessThan(classId, "notified", now);
        for (ClassWaitlist expired : expiredList) {
            expireReservationAndNotify(expired);
            promoteNextWaitlistEntry(classId, now);
        }
    }

    public void expireReservationAndNotify(ClassWaitlist expired) {
        expired.setStatus("expired");
        waitlists.save(expired);
        if (expired.getMember() != null && expired.getMember().getUserId() != null) {
            notifications.send(expired.getMember().getUserId(),
                    msg("notifications.waitlist.expired.title"),
                    msg("notifications.waitlist.expired.body",
                            expired.getGymClass() != null ? expired.getGymClass().getName() : ""),
                    "schedule_change",
                    "class_session",
                    expired.getId());
        }
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
