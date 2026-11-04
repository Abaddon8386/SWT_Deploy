package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachAssignmentAssignDto;
import com.swp391.scms.coaching.dto.CoachAssignmentReassignDto;
import com.swp391.scms.coaching.dto.CoachAssignmentStudentDto;
import com.swp391.scms.coaching.service.CoachAssignmentService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "Manager Coach Assignments", description = "Quản lý và theo dõi học viên đang được các HLV phụ trách (SCRUM Manager)")
@RestController
@RequestMapping("/api/v1/manager/coach-assignments")
@PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
public class CoachAssignmentController {

    private final CoachAssignmentService coachAssignmentService;
    private final MessageService messageService;

    @Autowired
    public CoachAssignmentController(
            CoachAssignmentService coachAssignmentService,
            @Autowired(required = false) MessageService messageService
    ) {
        this.coachAssignmentService = coachAssignmentService;
        this.messageService = messageService;
    }

    private String msg(String code, String fallback) {
        if (messageService == null) return fallback;
        try {
            String resolved = messageService.getMessage(code);
            return (resolved != null && !resolved.equals(code)) ? resolved : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    @Operation(summary = "Xem danh sách và tổng quan các HLV kèm học viên phụ trách")
    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOverview(
            @RequestParam(required = false) Long coachId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type
    ) {
        Map<String, Object> data = coachAssignmentService.getOverview(coachId, search, type);
        return ResponseEntity.ok(ApiResponse.ok(
                msg("manager.coach_assignments.loaded", "Tải danh sách học viên phụ trách của HLV thành công"),
                data
        ));
    }

    @Operation(summary = "Phân công học viên mới cho HLV kèm mục tiêu và thời hạn")
    @PostMapping("/assign")
    public ResponseEntity<ApiResponse<CoachAssignmentStudentDto>> assign(
            @Valid @RequestBody CoachAssignmentAssignDto dto
    ) {
        CoachAssignmentStudentDto student = coachAssignmentService.assignStudent(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(
                msg("manager.coach_assignments.assigned", "Phân công học viên cho huấn luyện viên thành công"),
                student
        ));
    }

    @Operation(summary = "Điều chuyển học viên từ HLV này sang HLV khác")
    @PostMapping("/reassign")
    public ResponseEntity<ApiResponse<Void>> reassign(
            @Valid @RequestBody CoachAssignmentReassignDto dto
    ) {
        coachAssignmentService.reassignStudent(dto);
        return ResponseEntity.ok(ApiResponse.ok(
                msg("manager.coach_assignments.reassigned", "Điều chuyển học viên sang huấn luyện viên mới thành công"),
                null
        ));
    }

    @Operation(summary = "Đánh dấu kết thúc phân công phụ trách học viên")
    @DeleteMapping("/{planId}")
    public ResponseEntity<ApiResponse<Void>> removeAssignment(
            @PathVariable Long planId
    ) {
        coachAssignmentService.removeAssignment(planId);
        return ResponseEntity.ok(ApiResponse.ok(
                msg("manager.coach_assignments.removed", "Đã kết thúc phân công phụ trách học viên"),
                null
        ));
    }
}

