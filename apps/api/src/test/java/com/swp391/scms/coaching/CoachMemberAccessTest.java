package com.swp391.scms.coaching;

import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.coaching.service.CoachMemberAccess;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.health.HealthMetricService;
import com.swp391.scms.health.MemberProgressLogRepository;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CoachMemberAccessTest {

    @Mock private TrainingPlanRepository plans;
    @Mock private CoachBookingRepository bookings;
    @Mock private ClassEnrollmentRepository enrollments;
    @Mock private MemberProgressLogRepository progressLogs;
    @Mock private MemberRepository members;
    @Mock private UserRepository users;

    @Test
    void coachReachesOnlyMembersTheyTrain() {
        var access = new CoachMemberAccess(plans, bookings, enrollments);
        when(enrollments.existsForCoachAndMember(20L, 30L)).thenReturn(true);

        assertDoesNotThrow(() -> access.requireAccess(20L, "COACH", 30L));
        assertThrows(ForbiddenException.class, () -> access.requireAccess(20L, "COACH", 31L));
        assertDoesNotThrow(() -> access.requireAccess(1L, "CENTER_MANAGER", 31L));
    }

    @Test
    void coachCannotReadHealthMetricsOfAStranger() {
        var access = new CoachMemberAccess(plans, bookings, enrollments);
        var healthService = new HealthMetricService(progressLogs, members, users);
        ReflectionTestUtils.setField(healthService, "coachMemberAccess", access);

        assertThrows(ForbiddenException.class, () -> healthService.getMetrics(31L, 20L, "COACH"));
        verifyNoInteractions(progressLogs);
    }
}
