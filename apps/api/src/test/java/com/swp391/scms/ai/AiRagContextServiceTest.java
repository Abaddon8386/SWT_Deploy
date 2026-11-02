package com.swp391.scms.ai;

import com.swp391.scms.ai.service.AiRagContextService;
import com.swp391.scms.catalog.PublicCatalogService;
import com.swp391.scms.catalog.PublicCatalogService.CatalogDto;
import com.swp391.scms.catalog.PublicCatalogService.CoachDto;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.entity.TrainingPlanItem;
import com.swp391.scms.coaching.repository.TrainingPlanItemRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiRagContextServiceTest {

    @Mock
    private PublicCatalogService catalogService;

    @Mock
    private MembershipSubscriptionRepository subscriptionRepository;

    @Mock
    private ClassEnrollmentRepository enrollmentRepository;

    @Mock
    private TrainingPlanRepository trainingPlanRepository;

    @Mock
    private TrainingPlanItemRepository trainingPlanItemRepository;

    private AiRagContextService ragContextService;

    @BeforeEach
    void setUp() {
        ragContextService = new AiRagContextService(
                catalogService,
                subscriptionRepository,
                enrollmentRepository,
                trainingPlanRepository,
                trainingPlanItemRepository
        );
    }

    @Test
    void buildRagContext_IncludesCatalogAndAuthenticatedMemberData() {
        PackageDto pkg = new PackageDto(1L, "SÖL Signature", "Full gym & yoga", BigDecimal.valueOf(499000), 30, 12, "active");
        CoachDto coach = new CoachDto(10L, "Trần Minh", "Strength & Conditioning", "10 năm kinh nghiệm", "NASM-CPT", null);
        ClassSessionDto session = new ClassSessionDto(
                20L, 5L, "Morning Vinyasa Flow", 2L, "Yoga", 10L, "Trần Minh",
                3L, "Studio A", LocalDate.of(2026, 11, 3), LocalTime.of(7, 0), LocalTime.of(8, 0),
                "scheduled", null, 20, 12L
        );
        when(catalogService.getCatalog()).thenReturn(new CatalogDto(List.of(pkg), List.of(coach), List.of(session)));

        Member member = new Member();
        member.setUserId(100L);
        member.setMembershipCode("MEM-100");
        member.setFitnessGoal("Giảm mỡ bụng và tăng sức bền");
        member.setFitnessLevel("intermediate");
        member.setHealthNotes("Đau nhẹ khớp gối trái");

        MembershipPackage activePkg = new MembershipPackage();
        activePkg.setName("SÖL Signature");
        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(activePkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 15));
        sub.setEndDate(LocalDate.of(2026, 11, 14));
        when(subscriptionRepository.findFirstByMemberUserIdAndStatusOrderByEndDateDesc(100L, "active"))
                .thenReturn(Optional.of(sub));

        when(enrollmentRepository.findBookedClassIdsByMemberId(100L)).thenReturn(List.of(5L));

        TrainingPlan plan = new TrainingPlan();
        ReflectionTestUtils.setField(plan, "id", 77L);
        plan.setGoal("Tăng cơ giảm mỡ 4 tuần");
        when(trainingPlanRepository.findByMemberUserIdAndStatusOrderByCreatedAtDesc(100L, "active"))
                .thenReturn(List.of(plan));

        TrainingPlanItem item = new TrainingPlanItem();
        item.setDayOfWeek(1);
        item.setExerciseName("Goblet Squat");
        item.setSets(4);
        item.setReps(12);
        when(trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(77L))
                .thenReturn(List.of(item));

        String context = ragContextService.buildRagContext(member, "Cho mình hỏi giá gói tập và lịch học Yoga ngày mai?");

        assertTrue(context.contains("SÖL Signature"));
        assertTrue(context.contains("499000"));
        assertTrue(context.contains("Morning Vinyasa Flow"));
        assertTrue(context.contains("Trần Minh"));
        assertTrue(context.contains("MEM-100"));
        assertTrue(context.contains("Đau nhẹ khớp gối trái"));
        assertTrue(context.contains("2026-11-14"));
        assertTrue(context.contains("Goblet Squat"));

        // Second rapid call should reuse the cached catalog & member snapshot without re-querying DB
        String secondContext = ragContextService.buildRagContext(member, "Câu hỏi tiếp theo");
        assertTrue(secondContext.contains("SÖL Signature"));
        org.mockito.Mockito.verify(catalogService, org.mockito.Mockito.times(1)).getCatalog();
    }
}

