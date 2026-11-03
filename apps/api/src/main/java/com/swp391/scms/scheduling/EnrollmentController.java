package com.swp391.scms.scheduling;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.scheduling.dto.EnrollmentResponses.EnrollmentDto;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * SCRUM-73: class booking and cancellation endpoints.
 */
@Tag(name = "Class Enrollments", description = "Member class booking and cancellation (SCRUM-73)")
@RestController
@RequestMapping("/api/v1/classes")
public class EnrollmentController {

    private final EnrollmentService service;
    private final MessageService messageService;

    public EnrollmentController(EnrollmentService service) {
        this(service, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public EnrollmentController(EnrollmentService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Enroll the authenticated member in a class session")
    @PostMapping("/sessions/{id}/enroll")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<EnrollmentDto>> enroll(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("scheduling.enrollment.created"), service.enroll(principal, id)));
    }

    @Operation(summary = "Cancel a class enrollment (owner or staff)")
    @DeleteMapping("/enrollments/{id}")
    @PreAuthorize("hasAnyRole('MEMBER', 'CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<EnrollmentDto> cancel(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ApiResponse.ok(msg("scheduling.enrollment.cancelled"), service.cancel(principal, id));
    }

    @Operation(summary = "List the authenticated member's class enrollments")
    @GetMapping("/enrollments/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<List<EnrollmentDto>> myEnrollments(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestParam(required = false) String status) {
        return ApiResponse.ok(msg("scheduling.enrollment.list"), service.myEnrollments(principal, status));
    }

    public ApiResponse<List<EnrollmentDto>> myEnrollments(AuthenticatedPrincipal principal) {
        return myEnrollments(principal, null);
    }
}
