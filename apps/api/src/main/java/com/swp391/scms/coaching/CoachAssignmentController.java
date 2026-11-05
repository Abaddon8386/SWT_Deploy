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

    private String msg(String code) {
        return messageService == null ? code : messageService.getMessage(code);
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
                msg("manager.coach_assignments.loaded"),
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
                msg("manager.coach_assignments.assigned"),
                student
        ));
    }

    @Operation(summary = "Điều chuyển đúng giáo án hoặc buổi PT đã chọn; lớp học chỉ đọc")
    @PostMapping("/reassign")
    public ResponseEntity<ApiResponse<Void>> reassign(
            @Valid @RequestBody CoachAssignmentReassignDto dto
    ) {
        coachAssignmentService.reassignStudent(dto);
        return ResponseEntity.ok(ApiResponse.ok(
                msg("manager.coach_assignments.reassigned"),
                null
        ));
    }

    @Operation(summary = "Hủy phân công giáo án active chưa hết hạn, giữ lịch sử")
    @DeleteMapping("/{planId}")
    public ResponseEntity<ApiResponse<Void>> removeAssignment(
            @PathVariable Long planId
    ) {
        coachAssignmentService.removeAssignment(planId);
        return ResponseEntity.ok(ApiResponse.ok(
                msg("manager.coach_assignments.removed"),
                null
        ));
    }
}

