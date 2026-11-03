package com.swp391.scms.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.ai.client.AiClient;
import com.swp391.scms.ai.dto.AiApplyRecommendationRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanResponse;
import com.swp391.scms.ai.entity.AiRecommendationLog;
import com.swp391.scms.ai.repository.AiRecommendationLogRepository;
import com.swp391.scms.coaching.dto.TrainingPlanCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto;
import com.swp391.scms.coaching.service.TrainingPlanService;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.health.MemberProgressLogRepository;
import com.swp391.scms.health.entity.MemberProgressLog;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Supplier;

@Service
public class AiRecommendationService {

    private static final String WORKOUT_SYSTEM_PROMPT =
            "Bạn là Chuyên gia Khoa học Thể thao và Huấn luyện viên Trưởng tại Trung tâm Thể thao SCMS. "
            + "Hãy phân tích chỉ số hình thể (Chiều cao, Cân nặng, BMI), mục tiêu thể lực (fitness_goal) và tiền sử chấn thương (health_notes) "
            + "của hội viên để thiết kế giáo án tập luyện cá nhân hóa an toàn, hiệu quả, trả về đúng định dạng JSON chuẩn gồm goal, analysis và danh sách items "
            + "(dayOfWeek 1-7, exerciseName, description, sets, reps, durationMinutes, orderIndex).";

    private final AiClient aiClient;
    private final AiRecommendationLogRepository recommendationLogRepository;
    private final MemberRepository memberRepository;
    private final CoachRepository coachRepository;
    private final MemberProgressLogRepository progressLogRepository;
    private final TrainingPlanService trainingPlanService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate writeTx;
    private final TransactionTemplate readOnlyTx;

    public AiRecommendationService(AiClient aiClient,
                                   AiRecommendationLogRepository recommendationLogRepository,
                                   MemberRepository memberRepository) {
        this(aiClient, recommendationLogRepository, memberRepository, null, null, null, new ObjectMapper(), null);
    }

    public AiRecommendationService(AiClient aiClient,
                                   AiRecommendationLogRepository recommendationLogRepository,
                                   MemberRepository memberRepository,
                                   CoachRepository coachRepository,
                                   MemberProgressLogRepository progressLogRepository,
                                   TrainingPlanService trainingPlanService,
                                   ObjectMapper objectMapper) {
        this(aiClient, recommendationLogRepository, memberRepository, coachRepository,
                progressLogRepository, trainingPlanService, objectMapper, null);
    }

    @Autowired
    public AiRecommendationService(AiClient aiClient,
                                   AiRecommendationLogRepository recommendationLogRepository,
                                   MemberRepository memberRepository,
                                   @Autowired(required = false) CoachRepository coachRepository,
                                   @Autowired(required = false) MemberProgressLogRepository progressLogRepository,
                                   @Autowired(required = false) TrainingPlanService trainingPlanService,
                                   @Autowired(required = false) ObjectMapper objectMapper,
                                   @Autowired(required = false) PlatformTransactionManager txManager) {
        this.aiClient = aiClient;
        this.recommendationLogRepository = recommendationLogRepository;
        this.memberRepository = memberRepository;
        this.coachRepository = coachRepository;
        this.progressLogRepository = progressLogRepository;
        this.trainingPlanService = trainingPlanService;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        if (txManager != null) {
            this.writeTx = new TransactionTemplate(txManager);
            this.readOnlyTx = new TransactionTemplate(txManager);
            this.readOnlyTx.setReadOnly(true);
        } else {
            this.writeTx = null;
            this.readOnlyTx = null;
        }
    }

    private <T> T inReadOnlyTx(Supplier<T> action) {
        return readOnlyTx != null ? readOnlyTx.execute(status -> action.get()) : action.get();
    }

    private <T> T inWriteTx(Supplier<T> action) {
        return writeTx != null ? writeTx.execute(status -> action.get()) : action.get();
    }

    public String generateRecommendation(Long memberId, String healthContext) {
        // Phase 1: short read-only transaction
        Member member = inReadOnlyTx(() -> memberRepository.findById(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId)));
        String membershipCode = member.getMembershipCode();

        // Phase 2: call AI outside transaction (no DB connection held)
        String systemPrompt = "Bạn là chuyên gia thể hình và sức khỏe tại Trung tâm Thể thao SCMS.";
        String userMessage = "Tạo gợi ý bài tập cho hội viên " + membershipCode + ": " + healthContext;
        String response = aiClient.generate(systemPrompt, userMessage);

        // Phase 3: short write transaction
        inWriteTx(() -> {
            if (recommendationLogRepository != null) {
                AiRecommendationLog log = new AiRecommendationLog();
                Member ref = memberRepository.getReferenceById(memberId);
                log.setMember(ref != null ? ref : member);
                log.setInputContext(healthContext != null ? healthContext : "{}");
                log.setRecommendedContent(response);
                log.setModelName(aiClient.getModelName());
                log.setApplied(false);
                log.setCreatedAt(LocalDateTime.now());
                recommendationLogRepository.save(log);
            }
            return null;
        });

        return response;
    }

    private record WorkoutPlanReadSnapshot(
            Member member,
            Coach coach,
            BigDecimal height,
            BigDecimal weight,
            BigDecimal bmi,
            Map<String, Object> inputContextMap,
            String inputContextJson
    ) {}

    public AiWorkoutPlanResponse generateWorkoutPlan(AiWorkoutPlanRequest request, Long coachUserId) {
        // Phase 1: short read-only transaction
        WorkoutPlanReadSnapshot snapshot = inReadOnlyTx(() -> {
            Member member = memberRepository.findById(request.getMemberId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.member", request.getMemberId()));

            Coach coach = null;
            if (coachUserId != null && coachRepository != null) {
                coach = coachRepository.findById(coachUserId).orElse(null);
            }
            // A coach (not a manager, who has no coach profile) plans only for members they train.
            if (coach != null && coachMemberAccess != null) {
                coachMemberAccess.requireCoachOf(coach.getUserId(), member.getUserId());
            }

            Map<String, BigDecimal> latestMetrics = readLatestMetrics(member.getUserId());
            BigDecimal height = latestMetrics.get("height");
            BigDecimal weight = latestMetrics.get("weight");
            BigDecimal bmi = latestMetrics.get("bmi");
            if (bmi == null && height != null && weight != null && height.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal heightMeters = height.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
                if (heightMeters.compareTo(BigDecimal.ZERO) > 0) {
                    bmi = weight.divide(heightMeters.multiply(heightMeters), 1, RoundingMode.HALF_UP);
                }
            }

            Map<String, Object> inputContextMap = new LinkedHashMap<>();
            inputContextMap.put("memberId", member.getUserId());
            inputContextMap.put("membershipCode", member.getMembershipCode());
            inputContextMap.put("fitnessGoal", member.getFitnessGoal() != null ? member.getFitnessGoal() : "Cải thiện thể lực toàn diện");
            inputContextMap.put("fitnessLevel", member.getFitnessLevel() != null ? member.getFitnessLevel() : "beginner");
            inputContextMap.put("healthNotes", member.getHealthNotes() != null ? member.getHealthNotes() : "Không có tiền sử chấn thương");
            if (height != null) inputContextMap.put("heightCm", height);
            if (weight != null) inputContextMap.put("weightKg", weight);
            if (bmi != null) inputContextMap.put("bmi", bmi);
            if (latestMetrics.get("body_fat") != null) inputContextMap.put("bodyFatPct", latestMetrics.get("body_fat"));
            if (request.getAdditionalRequirements() != null && !request.getAdditionalRequirements().isBlank()) {
                inputContextMap.put("additionalRequirements", request.getAdditionalRequirements().trim());
            }

            String inputContextJson = toJsonSafe(inputContextMap);
            return new WorkoutPlanReadSnapshot(member, coach, height, weight, bmi, inputContextMap, inputContextJson);
        });

        // Phase 2: call AI outside transaction (no DB connection held)
        String userPrompt = "Dữ liệu thể chất hội viên: " + snapshot.inputContextJson();
        String rawAiOutput = aiClient.generate(WORKOUT_SYSTEM_PROMPT, userPrompt);

        Member member = snapshot.member();
        Coach coach = snapshot.coach();
        String defaultGoal = member.getFitnessGoal() != null && !member.getFitnessGoal().isBlank()
                ? member.getFitnessGoal()
                : "Tăng cường thể lực & Tối ưu chuyển hóa";
        String analysis = buildAnalysisSummary(member, snapshot.height(), snapshot.weight(), snapshot.bmi(), request.getAdditionalRequirements());
        JsonNode parsedAiRoot = tryReadTree(rawAiOutput);
        List<TrainingPlanItemCreateDto> structuredItems = parseOrBuildStructuredItems(
                parsedAiRoot, member, request.getAdditionalRequirements());
        String resolvedGoal = parseGoalOrDefault(parsedAiRoot, defaultGoal);
        String resolvedAnalysis = parseAnalysisOrDefault(parsedAiRoot, analysis);

        Map<String, Object> recommendedContentMap = new LinkedHashMap<>();
        recommendedContentMap.put("goal", resolvedGoal);
        recommendedContentMap.put("analysis", resolvedAnalysis);
        recommendedContentMap.put("model", aiClient.getModelName());
        recommendedContentMap.put("items", structuredItems);
        String recommendedContentJson = toJsonSafe(recommendedContentMap);

        // Phase 3: short write transaction
        AiRecommendationLog saved = inWriteTx(() -> {
            AiRecommendationLog log = new AiRecommendationLog();
            if (coach != null) {
                Coach coachRef = coachRepository != null ? coachRepository.getReferenceById(coach.getUserId()) : null;
                log.setCoach(coachRef != null ? coachRef : coach);
            }
            Member memberRef = memberRepository.getReferenceById(member.getUserId());
            log.setMember(memberRef != null ? memberRef : member);
            log.setInputContext(snapshot.inputContextJson());
            log.setRecommendedContent(recommendedContentJson);
            log.setModelName(aiClient.getModelName());
            log.setApplied(false);
            log.setCreatedAt(LocalDateTime.now());
            return recommendationLogRepository != null ? recommendationLogRepository.save(log) : log;
        });

        AiWorkoutPlanResponse response = new AiWorkoutPlanResponse();
        response.setId(saved.getId());
        response.setMemberId(member.getUserId());
        response.setMemberCode(member.getMembershipCode());
        response.setCoachId(coach != null ? coach.getUserId() : coachUserId);
        response.setModelName(saved.getModelName());
        response.setApplied(saved.isApplied());
        response.setInputContext(snapshot.inputContextMap());
        response.setGoal(resolvedGoal);
        response.setAnalysis(resolvedAnalysis);
        response.setItems(structuredItems);
        response.setCreatedAt(saved.getCreatedAt());
        return response;
    }

    @Transactional
    public TrainingPlanDto applyRecommendation(Long recommendationId,
                                               AiApplyRecommendationRequest request,
                                               Long currentUserId,
                                               String currentUserRole) {
        AiRecommendationLog log = recommendationLogRepository.findById(recommendationId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.ai_recommendation", recommendationId));

        if (trainingPlanService == null) {
            log.setApplied(true);
            recommendationLogRepository.save(log);
            TrainingPlanDto fallback = new TrainingPlanDto();
            fallback.setMemberId(log.getMember().getUserId());
            fallback.setAiGenerated(true);
            fallback.setAiRecommendationId(log.getId());
            fallback.setStatus("draft");
            return fallback;
        }

        LocalDate start = (request != null && request.getStartDate() != null)
                ? request.getStartDate()
                : LocalDate.now();
        LocalDate end = (request != null && request.getEndDate() != null)
                ? request.getEndDate()
                : start.plusWeeks(4);

        JsonNode savedContentRoot = tryReadTree(log.getRecommendedContent());

        String goal = (request != null && request.getGoal() != null && !request.getGoal().isBlank())
                ? request.getGoal()
                : parseGoalOrDefault(savedContentRoot,
                        log.getMember().getFitnessGoal() != null ? log.getMember().getFitnessGoal() : "Giáo án AI cá nhân hóa");

        List<TrainingPlanItemCreateDto> items = (request != null && request.getItems() != null && !request.getItems().isEmpty())
                ? request.getItems()
                : parseOrBuildStructuredItems(savedContentRoot, log.getMember(), null);

        Long targetCoachId = currentUserId != null ? currentUserId
                : (log.getCoach() != null ? log.getCoach().getUserId() : null);

        TrainingPlanCreateDto createDto = new TrainingPlanCreateDto();
        createDto.setMemberId(log.getMember().getUserId());
        createDto.setCoachId(targetCoachId);
        if (request != null) {
            createDto.setClassId(request.getClassId());
        }
        createDto.setGoal(goal);
        createDto.setStartDate(start);
        createDto.setEndDate(end);
        createDto.setAiGenerated(true);
        createDto.setAiRecommendationId(log.getId());
        createDto.setItems(items);

        TrainingPlanDto created = trainingPlanService.createPlan(createDto, currentUserId, currentUserRole);
        log.setApplied(true);
        recommendationLogRepository.save(log);

        if (request == null || !Boolean.FALSE.equals(request.getActivate())) {
            if (created.getId() != null && (request != null && Boolean.TRUE.equals(request.getActivate()))) {
                return trainingPlanService.activatePlan(created.getId(), currentUserId, currentUserRole);
            }
        }
        return created;
    }

    @Transactional(readOnly = true)
    public List<AiWorkoutPlanResponse> getMemberRecommendations(Long memberId, Long currentUserId, String currentRole) {
        if (coachMemberAccess != null) {
            coachMemberAccess.requireAccess(currentUserId, currentRole, memberId);
        }
        return getMemberRecommendations(memberId);
    }

    @Transactional(readOnly = true)
    public List<AiWorkoutPlanResponse> getMemberRecommendations(Long memberId) {
        if (!memberRepository.existsById(memberId)) {
            throw new ResourceNotFoundException("resource.member", memberId);
        }
        return recommendationLogRepository.findByMemberUserId(memberId).stream()
                .map(log -> {
                    JsonNode contentRoot = tryReadTree(log.getRecommendedContent());
                    AiWorkoutPlanResponse dto = new AiWorkoutPlanResponse();
                    dto.setId(log.getId());
                    dto.setMemberId(log.getMember().getUserId());
                    dto.setMemberCode(log.getMember().getMembershipCode());
                    dto.setCoachId(log.getCoach() != null ? log.getCoach().getUserId() : null);
                    dto.setModelName(log.getModelName());
                    dto.setApplied(log.isApplied());
                    dto.setInputContext(parseMapSafe(log.getInputContext()));
                    dto.setGoal(parseGoalOrDefault(contentRoot, log.getMember().getFitnessGoal()));
                    dto.setAnalysis(parseAnalysisOrDefault(contentRoot, ""));
                    dto.setItems(parseOrBuildStructuredItems(contentRoot, log.getMember(), null));
                    dto.setCreatedAt(log.getCreatedAt());
                    return dto;
                })
                .toList();
    }

    private Map<String, BigDecimal> readLatestMetrics(Long memberId) {
        Map<String, BigDecimal> map = new HashMap<>();
        if (progressLogRepository == null || memberId == null) {
            return map;
        }
        List<MemberProgressLog> logs = progressLogRepository.findByMemberUserIdOrderByRecordedAtDesc(memberId);
        if (logs == null) {
            return map;
        }
        for (MemberProgressLog log : logs) {
            if (log.getMetricName() != null && log.getMetricValue() != null) {
                map.putIfAbsent(log.getMetricName().toLowerCase(Locale.ROOT), log.getMetricValue());
            }
        }
        return map;
    }

    private String buildAnalysisSummary(Member member, BigDecimal height, BigDecimal weight, BigDecimal bmi, String extra) {
        StringBuilder sb = new StringBuilder("Phân tích thể trạng hội viên ");
        sb.append(member.getMembershipCode() != null ? member.getMembershipCode() : "#" + member.getUserId());
        sb.append(" (trình độ: ").append(member.getFitnessLevel() != null ? member.getFitnessLevel() : "beginner").append(")");
        if (height != null || weight != null || bmi != null) {
            sb.append(" — Chỉ số: ");
            List<String> parts = new ArrayList<>();
            if (height != null) parts.add("Chiều cao " + height + "cm");
            if (weight != null) parts.add("Cân nặng " + weight + "kg");
            if (bmi != null) parts.add("BMI " + bmi);
            sb.append(String.join(", ", parts));
        }
        if (member.getHealthNotes() != null && !member.getHealthNotes().isBlank()) {
            sb.append(". Lưu ý chấn thương/sức khỏe: ").append(member.getHealthNotes());
        }
        if (extra != null && !extra.isBlank()) {
            sb.append(". Yêu cầu HLV: ").append(extra.trim());
        }
        return sb.toString();
    }

    private JsonNode tryReadTree(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String parseGoalOrDefault(JsonNode root, String defaultGoal) {
        if (root != null && root.hasNonNull("goal") && !root.get("goal").asText().isBlank()) {
            return root.get("goal").asText();
        }
        return defaultGoal;
    }

    private String parseAnalysisOrDefault(JsonNode root, String defaultAnalysis) {
        if (root != null) {
            if (root.hasNonNull("analysis") && !root.get("analysis").asText().isBlank()) {
                return root.get("analysis").asText();
            }
            if (root.hasNonNull("content") && !root.get("content").asText().isBlank() && defaultAnalysis.isBlank()) {
                return root.get("content").asText();
            }
        }
        return defaultAnalysis;
    }

    private List<TrainingPlanItemCreateDto> parseOrBuildStructuredItems(JsonNode root, Member member, String extra) {
        if (root != null) {
            try {
                JsonNode itemsNode = root.get("items");
                if (itemsNode != null && itemsNode.isArray() && !itemsNode.isEmpty()) {
                    return objectMapper.convertValue(itemsNode, new TypeReference<List<TrainingPlanItemCreateDto>>() {});
                }
            } catch (Exception ignored) {}
        }

        String notes = member != null && member.getHealthNotes() != null ? member.getHealthNotes() : "";
        String noteHint = !notes.isBlank() ? " (Điều chỉnh bảo vệ: " + notes + ")" : "";
        if (extra != null && !extra.isBlank()) {
            noteHint += " [" + extra.trim() + "]";
        }

        return List.of(
                new TrainingPlanItemCreateDto(1, "Goblet Squat & Core Bracing",
                        "Khởi động khớp hông và kiểm soát trục cột sống" + noteHint, 3, 12, 15, 1),
                new TrainingPlanItemCreateDto(3, "Incline Dumbbell Press & Scapular Retraction",
                        "Tăng sức mạnh thân trên và ổn định bả vai" + noteHint, 4, 10, 20, 2),
                new TrainingPlanItemCreateDto(5, "Romanian Deadlift & Mobility Cooldown",
                        "Phát triển chuỗi cơ sau và giãn cơ phục hồi" + noteHint, 3, 12, 20, 3)
        );
    }

    private Map<String, Object> parseMapSafe(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of("raw", json);
        }
    }

    private String toJsonSafe(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }

    public AiClient getAiClient() {
        return aiClient;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.coaching.service.CoachMemberAccess coachMemberAccess;
}
