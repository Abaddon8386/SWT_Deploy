package com.swp391.scms.ai;

import com.swp391.scms.ai.dto.AiApplyRecommendationRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanRequest;
import com.swp391.scms.ai.dto.AiWorkoutPlanResponse;
import com.swp391.scms.ai.service.AiRecommendationService;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "AI Workout Recommendation", description = "Động cơ AI phân tích thể trạng và gợi ý giáo án bài tập cá nhân hóa (SCRUM-117)")
@PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
@RestController
@RequestMapping("/api/v1/ai")
public class AiRecommendationController {

    private final AiRecommendationService recommendationService;
    private final MessageService messageService;

    public AiRecommendationController(AiRecommendationService recommendationService) {
        this(recommendationService, null);
    }

    @Autowired
    public AiRecommendationController(AiRecommendationService recommendationService, MessageService messageService) {
        this.recommendationService = recommendationService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "AI gợi ý giáo án bài tập cá nhân hóa", description = "Phân tích chiều cao, cân nặng, BMI, mục tiêu và tiền sử chấn thương của hội viên để sinh giáo án JSON và lưu vết ai_recommendation_logs")
    @PostMapping({"/generate-workout-plan", "/recommend", "/recommendations"})
    public ResponseEntity<ApiResponse<AiWorkoutPlanResponse>> generateWorkoutPlan(
            @Valid @RequestBody AiWorkoutPlanRequest request,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long coachId = principal != null ? principal.id() : null;
        AiWorkoutPlanResponse result = recommendationService.generateWorkoutPlan(request, coachId);
        return ResponseEntity.ok(ApiResponse.ok(msg("ai.recommend.generated"), result));
    }

    @Operation(summary = "Áp dụng gợi ý AI vào giáo án huấn luyện", description = "Tự động tạo giáo án trong training_plans với is_ai_generated = true và cập nhật is_applied = true")
    @PostMapping("/recommendations/{id}/apply")
    public ResponseEntity<ApiResponse<TrainingPlanDto>> applyRecommendation(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) AiApplyRecommendationRequest request,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        TrainingPlanDto applied = recommendationService.applyRecommendation(id, request, userId, role);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("ai.recommend.applied"), applied));
    }

    @Operation(summary = "Lịch sử gợi ý giáo án AI của hội viên")
    @GetMapping("/recommendations/member/{memberId}")
    public ResponseEntity<ApiResponse<List<AiWorkoutPlanResponse>>> getMemberRecommendations(
            @PathVariable Long memberId,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<AiWorkoutPlanResponse> list = principal == null
                ? recommendationService.getMemberRecommendations(memberId)
                : recommendationService.getMemberRecommendations(memberId, principal.id(), principal.role());
        return ResponseEntity.ok(ApiResponse.ok(msg("ai.recommend.list"), list));
    }
}
