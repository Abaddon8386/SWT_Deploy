package com.swp391.scms.coaching;

import com.swp391.scms.ai.entity.AiRecommendationLog;
import com.swp391.scms.ai.repository.AiRecommendationLogRepository;
import com.swp391.scms.coaching.dto.TrainingPlanCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.entity.TrainingPlanItem;
import com.swp391.scms.coaching.repository.TrainingPlanItemRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.coaching.service.TrainingPlanService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrainingPlanServiceTest {

    @Mock
    private TrainingPlanRepository trainingPlanRepository;

    @Mock
    private TrainingPlanItemRepository trainingPlanItemRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private GymClassRepository gymClassRepository;

    @Mock
    private AiRecommendationLogRepository aiRecommendationLogRepository;

    private TrainingPlanService service;

    @Mock private com.swp391.scms.coaching.service.CurrentCoachMembers currentCoachMembers;

    @BeforeEach
    void setUp() {
        service = new TrainingPlanService(
                trainingPlanRepository,
                trainingPlanItemRepository,
                memberRepository,
                coachRepository,
                gymClassRepository,
                aiRecommendationLogRepository
        );
        org.springframework.test.util.ReflectionTestUtils.setField(service,"currentCoachMembers",currentCoachMembers);
    }

    @Test
    @DisplayName("Should create training plan in draft status with ordered items")
    void shouldCreatePlanInDraftWithItems() {
        User memberUser = new User();
        memberUser.setId(10L);
        memberUser.setFullName("Nguyễn Văn An");
        Member member = new Member();
        member.setUserId(10L);
        member.setUser(memberUser);

        User coachUser = new User();
        coachUser.setId(20L);
        coachUser.setFullName("HLV Khoa");
        Coach coach = new Coach();
        coach.setUserId(20L);
        coach.setUser(coachUser);

        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> {
            TrainingPlan p = inv.getArgument(0);
            ReflectionTestUtils.setField(p, "id", 100L);
            return p;
        });
        when(trainingPlanItemRepository.save(any(TrainingPlanItem.class))).thenAnswer(inv -> {
            TrainingPlanItem item = inv.getArgument(0);
            ReflectionTestUtils.setField(item, "id", 500L + item.getOrderIndex());
            return item;
        });

        TrainingPlanCreateDto dto = new TrainingPlanCreateDto();
        dto.setMemberId(10L);
        dto.setGoal("Tăng cơ giảm mỡ 8 tuần");
        dto.setStartDate(LocalDate.of(2026, 10, 20));
        dto.setEndDate(LocalDate.of(2026, 12, 15));
        dto.setItems(List.of(
                new TrainingPlanItemCreateDto(1, "Barbell Squat", "Giữ lưng thẳng", 4, 10, 15, null),
                new TrainingPlanItemCreateDto(3, "Romanian Deadlift", "Kiểm soát nhịp hạ", 3, 12, 15, null)
        ));

        TrainingPlanDto created = service.createPlan(dto, 20L, "COACH");

        assertNotNull(created);
        assertEquals(100L, created.getId());
        assertEquals("draft", created.getStatus());
        assertEquals(10L, created.getMemberId());
        assertEquals(20L, created.getCoachId());
        assertEquals(2, created.getItems().size());
        assertEquals(1, created.getItems().get(0).getOrderIndex());
        assertEquals("Barbell Squat", created.getItems().get(0).getExerciseName());
        assertEquals(2, created.getItems().get(1).getOrderIndex());
    }

    @Test
    @DisplayName("Should reject plan creation when startDate is after endDate")
    void shouldRejectInvalidDateRange() {
        TrainingPlanCreateDto dto = new TrainingPlanCreateDto();
        dto.setMemberId(10L);
        dto.setStartDate(LocalDate.of(2026, 11, 10));
        dto.setEndDate(LocalDate.of(2026, 10, 10));

        assertThrows(BadRequestException.class, () -> service.createPlan(dto, 20L, "COACH"));
    }

    @Test
    @DisplayName("Should activate draft plan when owned by coach")
    void shouldActivateDraftPlan() {
        Coach coach = new Coach();
        coach.setUserId(20L);
        Member member = new Member();
        member.setUserId(10L);

        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 100L);
        plan.setCoach(coach);
        plan.setMember(member);
        plan.setStatus("draft");

        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(100L)).thenReturn(List.of());

        TrainingPlanDto activated = service.activatePlan(100L, 20L, "COACH");

        assertEquals("active", activated.getStatus());
        verify(trainingPlanRepository).save(plan);
    }

    @Test
    @DisplayName("Should forbid activating another coach's training plan")
    void shouldForbidActivatingOtherCoachPlan() {
        Coach coach = new Coach();
        coach.setUserId(20L);
        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 100L);
        plan.setCoach(coach);
        plan.setStatus("draft");

        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));

        assertThrows(ForbiddenException.class, () -> service.activatePlan(100L, 99L, "COACH"));
    }

    @Test
    @DisplayName("Should reject activating cancelled training plan")
    void shouldRejectActivatingCancelledPlan() {
        Coach coach = new Coach();
        coach.setUserId(20L);
        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 100L);
        plan.setCoach(coach);
        plan.setStatus("cancelled");

        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));

        assertThrows(ConflictException.class, () -> service.activatePlan(100L, 20L, "COACH"));
    }

    @Test
    @DisplayName("Should return active training plans for member")
    void shouldReturnMyActivePlans() {
        Member member = new Member();
        member.setUserId(10L);
        Coach coach = new Coach();
        coach.setUserId(20L);

        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 100L);
        plan.setMember(member);
        plan.setCoach(coach);
        plan.setStatus("active");
        plan.setGoal("Core Strength");

        TrainingPlanItem item = new TrainingPlanItem();
        ReflectionTestUtils.setField(item, "id", 1L);
        item.setTrainingPlan(plan);
        item.setDayOfWeek(2);
        item.setExerciseName("Plank Hold");
        item.setSets(3);
        item.setDurationMinutes(5);
        item.setOrderIndex(1);

        when(trainingPlanRepository.findByMemberUserIdAndStatusOrderByCreatedAtDesc(10L, "active"))
                .thenReturn(List.of(plan));
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(100L))
                .thenReturn(List.of(item));

        List<TrainingPlanDto> plans = service.getMyActivePlans(10L);

        assertEquals(1, plans.size());
        assertEquals("active", plans.get(0).getStatus());
        assertEquals(1, plans.get(0).getItems().size());
        assertEquals("Plank Hold", plans.get(0).getItems().get(0).getExerciseName());
    }

    @Test
    @DisplayName("Should mark AI recommendation as applied when creating plan with aiRecommendationId")
    void shouldMarkAiRecommendationAppliedOnCreate() {
        Member member = new Member();
        member.setUserId(10L);
        Coach coach = new Coach();
        coach.setUserId(20L);
        AiRecommendationLog recoLog = new AiRecommendationLog();
        ReflectionTestUtils.setField(recoLog, "id", 55L);
        recoLog.setApplied(false);

        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(aiRecommendationLogRepository.findById(55L)).thenReturn(Optional.of(recoLog));
        when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> {
            TrainingPlan p = inv.getArgument(0);
            ReflectionTestUtils.setField(p, "id", 101L);
            return p;
        });

        TrainingPlanCreateDto dto = new TrainingPlanCreateDto();
        dto.setMemberId(10L);
        dto.setGoal("AI Hypertrophy Plan");
        dto.setStartDate(LocalDate.of(2026, 10, 20));
        dto.setEndDate(LocalDate.of(2026, 11, 20));
        dto.setAiRecommendationId(55L);

        TrainingPlanDto created = service.createPlan(dto, 20L, "COACH");

        assertTrue(created.isAiGenerated());
        assertEquals(55L, created.getAiRecommendationId());
        assertTrue(recoLog.isApplied());
        verify(aiRecommendationLogRepository).save(recoLog);
    }

    @Test
    @DisplayName("Should forbid a coach from changing a plan no coach is assigned to")
    void shouldForbidCoachEditingUnassignedPlan() {
        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 101L);
        plan.setStatus("draft");
        when(trainingPlanRepository.findById(101L)).thenReturn(Optional.of(plan));

        assertThrows(ForbiddenException.class, () -> service.activatePlan(101L, 20L, "COACH"));
    }

    private TrainingPlan ownedPlan(String status) {
        Coach coach = new Coach();
        coach.setUserId(20L);
        Member member = new Member();
        member.setUserId(10L);
        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 100L);
        plan.setCoach(coach);
        plan.setMember(member);
        plan.setStatus(status);
        plan.setStartDate(LocalDate.of(2026, 11, 1));
        plan.setEndDate(LocalDate.of(2026, 11, 30));
        return plan;
    }

    @Test
    @DisplayName("Should update goal and dates of an owned plan")
    void shouldUpdateOwnedPlan() {
        TrainingPlan plan = ownedPlan("active");
        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        when(trainingPlanRepository.save(any(TrainingPlan.class))).thenAnswer(inv -> inv.getArgument(0));
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(100L)).thenReturn(List.of());
        var dto = new com.swp391.scms.coaching.dto.TrainingPlanUpdateDto();
        dto.setGoal("  Giảm mỡ  ");
        dto.setEndDate(LocalDate.of(2026, 12, 15));
        TrainingPlanDto updated = service.updatePlan(100L, dto, 20L, "COACH");
        assertEquals("Giảm mỡ", updated.getGoal());
        assertEquals(LocalDate.of(2026, 12, 15), updated.getEndDate());
        assertEquals(LocalDate.of(2026, 11, 1), updated.getStartDate());
    }

    @Test
    @DisplayName("Should reject update with start after end and update of completed plan")
    void shouldRejectInvalidUpdates() {
        TrainingPlan plan = ownedPlan("draft");
        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        var dto = new com.swp391.scms.coaching.dto.TrainingPlanUpdateDto();
        dto.setStartDate(LocalDate.of(2026, 12, 31));
        assertThrows(BadRequestException.class, () -> service.updatePlan(100L, dto, 20L, "COACH"));
        plan.setStatus("completed");
        assertThrows(ConflictException.class, () -> service.updatePlan(100L, new com.swp391.scms.coaching.dto.TrainingPlanUpdateDto(), 20L, "COACH"));
        verify(trainingPlanRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should delete only draft plans owned by the caller")
    void shouldDeleteDraftPlanOnly() {
        TrainingPlan plan = ownedPlan("draft");
        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        assertThrows(ForbiddenException.class, () -> service.deletePlan(100L, 99L, "COACH"));
        verify(trainingPlanRepository, never()).delete(any());
        service.deletePlan(100L, 20L, "COACH");
        verify(trainingPlanRepository).delete(plan);
        plan.setStatus("completed");
        assertThrows(ConflictException.class, () -> service.deletePlan(100L, 20L, "COACH"));
        verify(trainingPlanRepository, times(1)).delete(any());
    }
    @Test void updatesExerciseDetailsWithoutReplacingItsId() {
        var plan = ownedPlan("active");
        var item = new com.swp391.scms.coaching.entity.TrainingPlanItem();
        ReflectionTestUtils.setField(item, "id", 501L); item.setTrainingPlan(plan); item.setExerciseName("Squat");
        when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        when(trainingPlanRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(100L)).thenReturn(List.of(item));
        var edit = new com.swp391.scms.coaching.dto.TrainingPlanItemUpdateDto();
        edit.setId(501L); edit.setExerciseName("Squat chỉnh sửa");edit.setDayOfWeek(3);edit.setSets(5);edit.setReps(8);edit.setDurationMinutes(20);edit.setRestSeconds(90);
        var dto = new com.swp391.scms.coaching.dto.TrainingPlanUpdateDto();dto.setItems(List.of(edit));
        var result = service.updatePlan(100L,dto,20L,"COACH");
        assertEquals(501L,result.getItems().getFirst().getId());assertEquals(5,item.getSets());assertEquals(8,item.getReps());
        assertEquals(90,result.getItems().getFirst().getRestSeconds());assertEquals(3,item.getDayOfWeek());
        verify(trainingPlanItemRepository,never()).delete(any());
    }
    @Test void cannotAttachAnotherPlansExerciseToAnUpdate() {
        var plan=ownedPlan("draft");when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(100L)).thenReturn(List.of());
        var edit=new com.swp391.scms.coaching.dto.TrainingPlanItemUpdateDto();edit.setId(999L);edit.setExerciseName("Squat");
        var dto=new com.swp391.scms.coaching.dto.TrainingPlanUpdateDto();dto.setItems(List.of(edit));
        assertThrows(BadRequestException.class,()->service.updatePlan(100L,dto,20L,"COACH"));verify(trainingPlanRepository,never()).save(any());
    }
    @Test void deletingAnActivePlanHidesItWithoutRemovingItsExerciseHistory() {
        var plan=ownedPlan("active");when(trainingPlanRepository.findById(100L)).thenReturn(Optional.of(plan));
        service.deletePlan(100L,20L,"COACH");assertEquals("cancelled",plan.getStatus());
        verify(trainingPlanRepository,never()).delete(any());
    }

    @Test void exerciseValidationAllowsZeroRestButRejectsZeroSetsAndNegativeRest() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var item = new com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto();
            item.setExerciseName("Squat");item.setSets(3);item.setReps(10);item.setRestSeconds(0);
            assertTrue(validator.validate(item).isEmpty());
            item.setSets(0);assertFalse(validator.validate(item).isEmpty());
            item.setSets(3);item.setRestSeconds(-1);assertFalse(validator.validate(item).isEmpty());
        }
    }


 @Test void rejectsCreatingPlanForExpiredOrUnassignedMember() {
  var dto = new com.swp391.scms.coaching.dto.TrainingPlanCreateDto();
  dto.setMemberId(10L);dto.setStartDate(LocalDate.of(2026,11,4));dto.setEndDate(LocalDate.of(2026,11,10));
  Member member=new Member();member.setUserId(10L);when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
  doThrow(new com.swp391.scms.common.exception.ForbiddenException("COACH_MEMBER_NOT_ASSIGNED","coaching.member.not_assigned",null,"Denied")).when(currentCoachMembers).requireCoachOf(20L,10L);
  assertThrows(com.swp391.scms.common.exception.ForbiddenException.class,()->service.createPlan(dto,20L,"COACH"));
  verify(trainingPlanRepository,never()).save(any());
 }
}
