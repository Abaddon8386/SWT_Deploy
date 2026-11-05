package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.coaching.service.CoachAssignmentService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CoachAssignmentServiceTest {

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private TrainingPlanRepository trainingPlanRepository;

    @Mock
    private CoachBookingRepository coachBookingRepository;

    @Mock
    private GymClassRepository gymClassRepository;

    @Mock
    private ClassEnrollmentRepository classEnrollmentRepository;

    @Mock
    private MembershipSubscriptionRepository subscriptionRepository;

    @Mock
    private NotificationService notificationService;

    @Mock
    private MessageService messageService;

    private Clock clock = Clock.fixed(LocalDate.of(2026, 11, 4).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private CoachAssignmentService service;

    private Coach coach1;
    private Coach coach2;
    private Member member1;
    private User userCoach1;
    private User userCoach2;
    private User userMember1;

    @BeforeEach
    void setUp() {
        service = new CoachAssignmentService(
                coachRepository,
                memberRepository,
                trainingPlanRepository,
                coachBookingRepository,
                gymClassRepository,
                classEnrollmentRepository,
                subscriptionRepository,
                notificationService,
                messageService,
                clock
        );

        userCoach1 = new User();
        userCoach1.setId(10L);
        userCoach1.setFullName("Coach Alpha");
        userCoach1.setEmail("alpha@solfitness.vn");
        userCoach1.setPhone("0901234567");
        userCoach1.setStatus("active");

        coach1 = new Coach();
        coach1.setUserId(10L);
        coach1.setUser(userCoach1);
        coach1.setEmploymentStatus("active");
        coach1.setSpecialization("Boxing & HIIT");

        userCoach2 = new User();
        userCoach2.setId(20L);
        userCoach2.setFullName("Coach Beta");
        userCoach2.setEmail("beta@solfitness.vn");
        userCoach2.setPhone("0907654321");
        userCoach2.setStatus("active");

        coach2 = new Coach();
        coach2.setUserId(20L);
        coach2.setUser(userCoach2);
        coach2.setEmploymentStatus("active");
        coach2.setSpecialization("Yoga & Pilates");

        userMember1 = new User();
        userMember1.setId(100L);
        userMember1.setFullName("Nguyễn Văn Học Viên");
        userMember1.setEmail("student@gmail.com");
        userMember1.setPhone("0988776655");
        userMember1.setStatus("active");

        member1 = new Member();
        member1.setUserId(100L);
        member1.setUser(userMember1);
        member1.setMembershipCode("SOL-MB-100");
        member1.setFitnessLevel("intermediate");
        member1.setFitnessGoal("Tăng cơ giảm mỡ");
    }

    @Test
    @DisplayName("getOverview returns coaches with consolidated students and summary stats")
    void testGetOverview() {
        when(coachRepository.findActiveWithUser()).thenReturn(List.of(coach1, coach2));
        when(coachRepository.findAll()).thenReturn(List.of(coach1, coach2));

        TrainingPlan plan = new TrainingPlan();
        plan.setId(501L);
        plan.setCoach(coach1);
        plan.setMember(member1);
        plan.setGoal("Giảm mỡ 5kg");
        plan.setStartDate(LocalDate.of(2026, 11, 1));
        plan.setEndDate(LocalDate.of(2026, 11, 30));
        plan.setStatus("active");

        when(trainingPlanRepository.findByCoachUserIdOrderByCreatedAtDesc(10L)).thenReturn(List.of(plan));
        when(trainingPlanRepository.findByCoachUserIdOrderByCreatedAtDesc(20L)).thenReturn(Collections.emptyList());

        when(coachBookingRepository.findByCoachId(10L)).thenReturn(Collections.emptyList());
        when(coachBookingRepository.findByCoachId(20L)).thenReturn(Collections.emptyList());

        when(gymClassRepository.findByCoachUserId(10L)).thenReturn(Collections.emptyList());
        when(gymClassRepository.findByCoachUserId(20L)).thenReturn(Collections.emptyList());

        Map<String, Object> result = service.getOverview(null, null, null);

        assertThat(result).isNotNull();
        assertThat(result).containsKey("coaches");
        assertThat(result).containsKey("stats");

        @SuppressWarnings("unchecked")
        List<CoachAssignmentOverviewDto> coaches = (List<CoachAssignmentOverviewDto>) result.get("coaches");
        assertThat(coaches).hasSize(2);

        CoachAssignmentOverviewDto alphaOverview = coaches.stream().filter(c -> c.coachId().equals(10L)).findFirst().orElseThrow();
        assertThat(alphaOverview.coachName()).isEqualTo("Coach Alpha");
        assertThat(alphaOverview.totalStudentsCount()).isEqualTo(1);
        assertThat(alphaOverview.students()).hasSize(1);
        assertThat(alphaOverview.students().get(0).fullName()).isEqualTo("Nguyễn Văn Học Viên");
    }

    @Test
    @DisplayName("assignStudent creates training plan and sends notifications to coach and member")
    void testAssignStudent_Success() {
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach1));
        when(memberRepository.findById(100L)).thenReturn(Optional.of(member1));
        when(subscriptionRepository.existsEntitlementEndingOnOrAfter(eq(100L), any(LocalDate.class))).thenReturn(true);
        when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> {
            TrainingPlan p = inv.getArgument(0);
            p.setId(999L);
            return p;
        });

        CoachAssignmentAssignDto dto = new CoachAssignmentAssignDto(
                100L,
                10L,
                "TRAINING_PLAN",
                "Mục tiêu tăng cơ",
                LocalDate.of(2026, 11, 10),
                LocalDate.of(2026, 12, 10),
                "Tập 3 buổi/tuần"
        );

        CoachAssignmentStudentDto result = service.assignStudent(dto);

        assertThat(result).isNotNull();
        assertThat(result.memberId()).isEqualTo(100L);
        assertThat(result.fullName()).isEqualTo("Nguyễn Văn Học Viên");
        assertThat(result.detail()).isEqualTo("Mục tiêu tăng cơ");

        verify(notificationService, times(2)).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong(), anyString());
    }

    @Test
    @DisplayName("assignStudent throws error if member has no active subscription")
    void testAssignStudent_NoActiveSubscription() {
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach1));
        when(memberRepository.findById(100L)).thenReturn(Optional.of(member1));
        when(subscriptionRepository.existsEntitlementEndingOnOrAfter(eq(100L), any(LocalDate.class))).thenReturn(false);

        CoachAssignmentAssignDto dto = new CoachAssignmentAssignDto(
                100L,
                10L,
                "TRAINING_PLAN",
                "Mục tiêu tăng cơ",
                LocalDate.of(2026, 11, 10),
                LocalDate.of(2026, 12, 10),
                null
        );

        assertThatThrownBy(() -> service.assignStudent(dto))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("chưa có gói tập");
    }

    @Test
    @DisplayName("reassignStudent transfers active plans and sends notifications to member and both coaches")
    void testReassignStudent_Success() {
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach1));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach2));
        when(memberRepository.findById(100L)).thenReturn(Optional.of(member1));

        TrainingPlan plan = new TrainingPlan();
        plan.setId(888L);
        plan.setCoach(coach1);
        plan.setMember(member1);
        plan.setStatus("active");

        when(trainingPlanRepository.findByMemberUserIdOrderByCreatedAtDesc(100L)).thenReturn(List.of(plan));
        when(coachBookingRepository.findByMemberId(100L)).thenReturn(Collections.emptyList());

        CoachAssignmentReassignDto dto = new CoachAssignmentReassignDto(
                100L,
                10L,
                20L,
                null,
                "HLV cũ đi công tác"
        );

        service.reassignStudent(dto);

        assertThat(plan.getCoach()).isEqualTo(coach2);
        verify(trainingPlanRepository).save(plan);
        verify(notificationService, times(3)).send(anyLong(), anyString(), anyString(), anyString(), anyString(), any(), anyString());
    }
}

