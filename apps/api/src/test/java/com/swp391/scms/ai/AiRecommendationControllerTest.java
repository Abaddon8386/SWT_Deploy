package com.swp391.scms.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.ai.client.AiClient;
import com.swp391.scms.ai.client.MockAiClient;
import com.swp391.scms.ai.dto.AiApplyRecommendationRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanResponse;
import com.swp391.scms.ai.entity.AiRecommendationLog;
import com.swp391.scms.ai.repository.AiRecommendationLogRepository;
import com.swp391.scms.ai.service.AiRecommendationService;
import com.swp391.scms.coaching.dto.TrainingPlanCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto;
import com.swp391.scms.coaching.service.TrainingPlanService;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.health.MemberProgressLogRepository;
import com.swp391.scms.health.entity.MemberProgressLog;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class AiRecommendationControllerTest {

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @Mock
    private AiRecommendationLogRepository recommendationLogRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private MemberProgressLogRepository progressLogRepository;

    @Mock
    private TrainingPlanService trainingPlanService;

    private AiRecommendationService recommendationService;
    private AiRecommendationController controller;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        AiClient aiClient = new MockAiClient("gpt-4o");
        recommendationService = new AiRecommendationService(
                aiClient,
                recommendationLogRepository,
                memberRepository,
                coachRepository,
                progressLogRepository,
                trainingPlanService,
                objectMapper
        );
        controller = new AiRecommendationController(recommendationService);

        HandlerMethodArgumentResolver principalResolver = new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.getParameterType().isAssignableFrom(AuthenticatedPrincipal.class);
            }

            @Override
            public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                          NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
                return new AuthenticatedPrincipal(20L, "coach1", "COACH");
            }
        };

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(principalResolver)
                .build();
    }

    @Test
    @DisplayName("POST /api/v1/ai/generate-workout-plan should read height, weight, BMI, fitness_goal, health_notes and save log")
    void shouldGenerateStructuredWorkoutPlanAndLog() throws Exception {
        Member member = new Member();
        member.setUserId(10L);
        member.setMembershipCode("MB-2026-089");
        member.setFitnessGoal("Tăng cơ giảm mỡ");
        member.setFitnessLevel("intermediate");
        member.setHealthNotes("Đau nhẹ khớp gối trái");

        Coach coach = new Coach();
        coach.setUserId(20L);

        MemberProgressLog heightLog = new MemberProgressLog();
        heightLog.setMetricName("height");
        heightLog.setMetricValue(new BigDecimal("175.0"));

        MemberProgressLog weightLog = new MemberProgressLog();
        weightLog.setMetricName("weight");
        weightLog.setMetricValue(new BigDecimal("73.5"));

        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(progressLogRepository.findByMemberUserIdOrderByRecordedAtDesc(10L))
                .thenReturn(List.of(heightLog, weightLog));
        when(recommendationLogRepository.save(any(AiRecommendationLog.class))).thenAnswer(inv -> {
            AiRecommendationLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", 77L);
            return log;
        });

        AiWorkoutPlanRequest req = new AiWorkoutPlanRequest(10L, "Ưu tiên bài tập ít áp lực khớp gối", 4);

        mockMvc.perform(post("/api/v1/ai/generate-workout-plan")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(77))
                .andExpect(jsonPath("$.data.memberId").value(10))
                .andExpect(jsonPath("$.data.modelName").value("gpt-4o"))
                .andExpect(jsonPath("$.data.inputContext.heightCm").value(175.0))
                .andExpect(jsonPath("$.data.inputContext.weightKg").value(73.5))
                .andExpect(jsonPath("$.data.inputContext.bmi").value(24.0))
                .andExpect(jsonPath("$.data.inputContext.healthNotes").value("Đau nhẹ khớp gối trái"))
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items[0].exerciseName").isNotEmpty());

        verify(recommendationLogRepository).save(any(AiRecommendationLog.class));
    }

    @Test
    @DisplayName("POST /api/v1/ai/recommendations/{id}/apply should create training plan with is_ai_generated=true and mark log is_applied=true")
    void shouldApplyAiRecommendationToTrainingPlan() throws Exception {
        Member member = new Member();
        member.setUserId(10L);
        member.setFitnessGoal("Tăng sức bền");

        AiRecommendationLog log = new AiRecommendationLog();
        ReflectionTestUtils.setField(log, "id", 77L);
        log.setMember(member);
        log.setRecommendedContent("{\"goal\":\"Tăng sức bền 4 tuần\",\"items\":[{\"dayOfWeek\":1,\"exerciseName\":\"Kettlebell Swing\",\"sets\":4,\"reps\":15,\"durationMinutes\":15,\"orderIndex\":1}]}");
        log.setApplied(false);

        when(recommendationLogRepository.findById(77L)).thenReturn(Optional.of(log));
        when(trainingPlanService.createPlan(any(TrainingPlanCreateDto.class), eq(20L), eq("COACH")))
                .thenAnswer(inv -> {
                    TrainingPlanCreateDto dto = inv.getArgument(0);
                    TrainingPlanDto created = new TrainingPlanDto();
                    created.setId(200L);
                    created.setMemberId(dto.getMemberId());
                    created.setGoal(dto.getGoal());
                    created.setStatus("draft");
                    created.setAiGenerated(Boolean.TRUE.equals(dto.getAiGenerated()));
                    created.setAiRecommendationId(dto.getAiRecommendationId());
                    return created;
                });

        AiApplyRecommendationRequest applyReq = new AiApplyRecommendationRequest();

        mockMvc.perform(post("/api/v1/ai/recommendations/77/apply")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(applyReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(200))
                .andExpect(jsonPath("$.data.aiGenerated").value(true))
                .andExpect(jsonPath("$.data.aiRecommendationId").value(77));

        assertTrue(log.isApplied());
        verify(recommendationLogRepository).save(log);
    }

    @Test
    @DisplayName("AI generation must execute outside DB transaction between short read-only and write transactions")
    void shouldNotHoldTransactionDuringAiCalls() throws Exception {
        assertFalse(AiRecommendationService.class.isAnnotationPresent(
                org.springframework.transaction.annotation.Transactional.class));
        assertFalse(AiRecommendationService.class
                .getMethod("generateRecommendation", Long.class, String.class)
                .isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));
        assertFalse(AiRecommendationService.class
                .getMethod("generateWorkoutPlan", AiWorkoutPlanRequest.class, Long.class)
                .isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));

        var txManager = new org.springframework.transaction.support.AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() { return new Object(); }
            @Override
            protected void doBegin(Object transaction, org.springframework.transaction.TransactionDefinition definition) {
                org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
            }
            @Override
            protected void doCommit(org.springframework.transaction.support.DefaultTransactionStatus status) {}
            @Override
            protected void doRollback(org.springframework.transaction.support.DefaultTransactionStatus status) {}
            @Override
            protected void doCleanupAfterCompletion(Object transaction) {
                org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);
            }
        };

        var txActiveDuringAi = new java.util.concurrent.atomic.AtomicBoolean(true);
        AiClient slowAiClient = new AiClient() {
            @Override
            public String generate(String systemPrompt, String userMessage) {
                txActiveDuringAi.set(
                        org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
                return "{\"goal\":\"Test\",\"analysis\":\"OK\",\"items\":[]}";
            }
            @Override
            public String getModelName() { return "test-model"; }
            @Override
            public String getProviderName() { return "test-provider"; }
        };

        Member member = new Member();
        member.setUserId(10L);
        member.setMembershipCode("MEM-10");
        when(memberRepository.findById(10L)).thenAnswer(inv -> {
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            return Optional.of(member);
        });
        when(recommendationLogRepository.save(any(AiRecommendationLog.class))).thenAnswer(inv -> {
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            return inv.getArgument(0);
        });

        AiRecommendationService txService = new AiRecommendationService(
                slowAiClient, recommendationLogRepository, memberRepository,
                coachRepository, progressLogRepository, trainingPlanService, objectMapper, txManager);

        txService.generateRecommendation(10L, "healthy");
        assertFalse(txActiveDuringAi.get(), "Transaction must NOT be active while calling AiClient.generate");

        txActiveDuringAi.set(true);
        txService.generateWorkoutPlan(new AiWorkoutPlanRequest(10L, "extra", 4), null);
        assertFalse(txActiveDuringAi.get(), "Transaction must NOT be active while calling AiClient.generate in generateWorkoutPlan");
    }
}
