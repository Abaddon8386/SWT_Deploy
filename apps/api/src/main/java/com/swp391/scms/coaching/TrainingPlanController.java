package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.TrainingPlanCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto;
import com.swp391.scms.coaching.service.TrainingPlanService;
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

@Tag(name = "Coaching & Training Plans", description = "Quản lý kế hoạch huấn luyện và bài tập (SCRUM-116)")
@RestController
@RequestMapping({"/api/v1/coaching/training-plans", "/api/v1/training-plans"})
public class TrainingPlanController {

    private final TrainingPlanService trainingPlanService;
    private final MessageService messageService;

    public TrainingPlanController(TrainingPlanService trainingPlanService) {
        this(trainingPlanService, null);
    }

    @Autowired
    public TrainingPlanController(TrainingPlanService trainingPlanService, MessageService messageService) {
        this.trainingPlanService = trainingPlanService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Tạo giáo án huấn luyện mới", description = "Tạo giáo án ở trạng thái draft kèm danh sách bài tập theo thứ tự")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @PostMapping
    public ResponseEntity<ApiResponse<TrainingPlanDto>> createPlan(
            @Valid @RequestBody TrainingPlanCreateDto dto,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        TrainingPlanDto created = trainingPlanService.createPlan(dto, userId, role);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("coaching.plan.created"), created));
    }

    @Operation(summary = "Thêm bài tập vào giáo án", description = "Bổ sung bài tập mới theo thứ tự vào giáo án huấn luyện")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @PostMapping("/{id}/items")
    public ResponseEntity<ApiResponse<TrainingPlanDto>> addItem(
            @PathVariable Long id,
            @Valid @RequestBody TrainingPlanItemCreateDto itemDto,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        TrainingPlanDto updated = trainingPlanService.addItem(id, itemDto, userId, role);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("coaching.plan.item_added"), updated));
    }

    @Operation(summary = "Phê duyệt kích hoạt giáo án", description = "HLV phê duyệt kích hoạt giáo án sang trạng thái active")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @PutMapping("/{id}/activate")
    public ResponseEntity<ApiResponse<TrainingPlanDto>> activatePlan(
            @PathVariable Long id,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        TrainingPlanDto activated = trainingPlanService.activatePlan(id, userId, role);
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.activated"), activated));
    }

    @Operation(summary = "Xem giáo án đang hoạt động của hội viên", description = "Hội viên xem giáo án bài tập đang hoạt động của mình")
    @PreAuthorize("hasRole('MEMBER')")
    @GetMapping("/my")
    public ResponseEntity<ApiResponse<List<TrainingPlanDto>>> getMyActivePlans(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long memberId = principal != null ? principal.id() : null;
        List<TrainingPlanDto> plans = trainingPlanService.getMyActivePlans(memberId);
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.my_list"), plans));
    }

    @Operation(summary = "Danh sách giáo án huấn luyện", description = "HLV hoặc Quản lý xem danh sách giáo án, lọc theo memberId")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @GetMapping
    public ResponseEntity<ApiResponse<List<TrainingPlanDto>>> getPlans(
            @RequestParam(required = false) Long memberId,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        List<TrainingPlanDto> plans = trainingPlanService.getPlans(memberId, userId, role);
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.list"), plans));
    }

    @Operation(summary = "Chi tiết giáo án huấn luyện")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER', 'MEMBER')")
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TrainingPlanDto>> getPlanById(
            @PathVariable Long id,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "MEMBER";
        TrainingPlanDto plan = trainingPlanService.getPlanById(id, userId, role);
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.detail"), plan));
    }

    @Operation(summary = "Cập nhật giáo án", description = "Sửa mục tiêu, thời gian và bài tập của giáo án nháp hoặc đang hoạt động")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<TrainingPlanDto>> updatePlan(
            @PathVariable Long id,
            @Valid @RequestBody com.swp391.scms.coaching.dto.TrainingPlanUpdateDto dto,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.updated"),
                trainingPlanService.updatePlan(id, dto, userId, role)));
    }

    @Operation(summary = "Xóa hoặc ngừng áp dụng giáo án", description = "Bản nháp được xóa; giáo án active chuyển cancelled để giữ lịch sử tập")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deletePlan(
            @PathVariable Long id,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long userId = principal != null ? principal.id() : null;
        String role = principal != null ? principal.role() : "COACH";
        trainingPlanService.deletePlan(id, userId, role);
        return ResponseEntity.ok(ApiResponse.ok(msg("coaching.plan.deleted"), null));
    }
}
