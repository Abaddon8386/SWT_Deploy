package com.swp391.scms.coaching.service;

import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides whether a coach works with a member: they wrote a training plan for them, have a 1:1 session with them,
 * or teach a class the member is booked in or attended. Coaches see health and coaching data only for those members;
 * managers see everyone.
 */
@Service
public class CoachMemberAccess {

    private final TrainingPlanRepository plans;
    private final CoachBookingRepository bookings;
    private final ClassEnrollmentRepository enrollments;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;

    public CoachMemberAccess(TrainingPlanRepository plans, CoachBookingRepository bookings,
                             ClassEnrollmentRepository enrollments) {
        this.plans = plans;
        this.bookings = bookings;
        this.enrollments = enrollments;
    }

    @Transactional(readOnly = true)
    public boolean coachesMember(Long coachId, Long memberId) {
        if (coachId == null || memberId == null) return false;
        return plans.existsForCoachAndMember(coachId, memberId)
                || bookings.existsForCoachAndMember(coachId, memberId)
                || enrollments.existsForCoachAndMember(coachId, memberId)
                || (sessionBookings != null && sessionBookings.existsForCoachAndMember(coachId, memberId));
    }

    /** Throws for a coach who does not work with the member; other roles are checked elsewhere. */
    public void requireAccess(Long userId, String role, Long memberId) {
        if ("COACH".equalsIgnoreCase(role)) {
            requireCoachOf(userId, memberId);
        }
    }

    public void requireCoachOf(Long coachId, Long memberId) {
        if (!coachesMember(coachId, memberId)) {
            throw new ForbiddenException("COACH_MEMBER_NOT_ASSIGNED", "coaching.member.not_assigned", null,
                    "This member does not train with you.");
        }
    }
}
