package com.swp391.scms.scheduling.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.dto.EnrollmentResponses.WaitlistDto;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * SCRUM-74: smart waitlist for full classes.
 *
 * <p>Only the underlying API is in scope here. The automatic promotion/handover and the
 * 24h expiry window belong to Sprint 3 (SCRUM-112).
 */
@Service
public class WaitlistService {

    private static final String WAITING = "waiting";
    private static final String BOOKED = "booked";

    private final ClassWaitlistRepository waitlists;
    private final ClassEnrollmentRepository enrollments;
    private final ClassSessionRepository sessions;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final GymClassRepository gymClasses;
    private final Clock clock;
    private final EnrollmentService enrollmentService;

    public WaitlistService(ClassWaitlistRepository waitlists,
                           ClassEnrollmentRepository enrollments,
                           ClassSessionRepository sessions,
                           MembershipSubscriptionRepository subscriptions,
                           MemberRepository members,
                           GymClassRepository gymClasses,
                           Clock clock,
                           EnrollmentService enrollmentService) {
        this.waitlists = waitlists;
        this.enrollments = enrollments;
        this.sessions = sessions;
        this.subscriptions = subscriptions;
        this.members = members;
        this.gymClasses = gymClasses;
        this.clock = clock;
        this.enrollmentService = enrollmentService;
    }

    /**
     * SCRUM-74 BR-01..BR-03: join the waitlist only when the class is full.
     */
    @Transactional
    public WaitlistDto join(AuthenticatedPrincipal principal, Long sessionId) {
        Member member = findMember(principal.id());
        ClassSession session = findSession(sessionId);
        // Serialize bookings and waitlist joins for this class before checking either state.
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

        // BR-03: same membership requirement as booking (Trigger P4).
        SessionEligibility.ensureMembershipCoversSession(subscriptions, member.getUserId(), session.getSessionDate(), clock);

        // BR-02: a member already holding a booking may not also wait.
        if (enrollments.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), member.getUserId(), BOOKED)
                .isPresent()) {
            throw new BadRequestException(
                    "SCHEDULING_WAITLIST_ALREADY_BOOKED",
                    "error.scheduling.waitlist_already_booked",
                    null,
                    "Member already holds a booking for this class");
        }

        // BR-01: only allowed when there is no free seat (taking active reservations into account).
        LocalDateTime now = LocalDateTime.now(clock);
        long booked = enrollments.countByGymClassIdAndStatus(gymClass.getId(), BOOKED);
        long activeReservations = waitlists
                .countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(gymClass.getId(), "notified", now);
        if (booked + activeReservations < gymClass.getCapacity()) {
            throw new BadRequestException(
                    "SCHEDULING_WAITLIST_CLASS_HAS_SPACE",
                    "error.scheduling.waitlist_class_has_space",
                    null,
                    "Class still has seats; book directly instead");
        }

        // BR-02: unique active waitlist entry per member/class (mirrors uq_waitlist_active).
        if (waitlists.findByGymClassIdAndMemberUserIdAndStatus(gymClass.getId(), member.getUserId(), WAITING)
                .isPresent()) {
            throw new BadRequestException(
                    "SCHEDULING_WAITLIST_DUPLICATE",
                    "error.scheduling.waitlist_duplicate",
                    null,
                    "Member is already waiting for this class");
        }

        ClassWaitlist waitlist = new ClassWaitlist();
        waitlist.setGymClass(gymClass);
        waitlist.setMember(member);
        waitlist.setStatus(WAITING);
        waitlist.setRequestedAt(now);

        return toDto(waitlists.saveAndFlush(waitlist));
    }

    /**
     * SCRUM-74 BR-05: the owner withdraws their own waitlist entry.
     */
    @Transactional
    public WaitlistDto withdraw(AuthenticatedPrincipal principal, Long waitlistId) {
        ClassWaitlist waitlist = waitlists.findById(waitlistId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_waitlist", waitlistId));

        if (waitlist.getMember() == null || !waitlist.getMember().getUserId().equals(principal.id())) {
            throw new ForbiddenException(
                    "SCHEDULING_WAITLIST_NOT_OWNER",
                    "error.scheduling.waitlist_not_owner",
                    null,
                    "You can only withdraw your own waitlist entry");
        }

        if (!WAITING.equalsIgnoreCase(waitlist.getStatus())
                && !"notified".equalsIgnoreCase(waitlist.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_WAITLIST_NOT_ACTIVE",
                    "error.scheduling.waitlist_not_active",
                    null,
                    "Only a waiting entry can be withdrawn");
        }

        boolean wasNotified = "notified".equalsIgnoreCase(waitlist.getStatus());
        // Schema only permits waiting/notified/expired. Mark withdrawal as expired rather than
        // writing the unsupported cancelled value (no schema changes are allowed).
        waitlist.setStatus("expired");
        ClassWaitlist saved = waitlists.saveAndFlush(waitlist);

        if (wasNotified && waitlist.getGymClass() != null && waitlist.getGymClass().getId() != null) {
            enrollmentService.promoteNextWaitlistEntry(waitlist.getGymClass().getId(), LocalDateTime.now(clock));
        }

        return toDto(saved);
    }

    /**
     * SCRUM-74 BR-04/BR-05: the authenticated member's own waitlist, FIFO by requested_at.
     */
    @Transactional(readOnly = true)
    public List<WaitlistDto> myWaitlists(AuthenticatedPrincipal principal) {
        findMember(principal.id());
        return waitlists.findByMemberUserIdOrderByRequestedAtAsc(principal.id()).stream()
                .map(this::toDto)
                .toList();
    }

    private ClassSession findSession(Long sessionId) {
        return sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));
    }

    private Member findMember(Long userId) {
        return members.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", userId));
    }

    private WaitlistDto toDto(ClassWaitlist waitlist) {
        GymClass gymClass = waitlist.getGymClass();
        return new WaitlistDto(
                waitlist.getId(),
                gymClass != null ? gymClass.getId() : null,
                gymClass != null ? gymClass.getName() : null,
                waitlist.getMember() != null ? waitlist.getMember().getUserId() : null,
                waitlist.getStatus(),
                waitlist.getRequestedAt(),
                waitlist.getReservationExpiresAt()
        );
    }
}
