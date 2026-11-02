package com.swp391.scms.operations.dto;

import jakarta.validation.constraints.NotBlank;

public record StaffInternalRequestReviewDto(
        @NotBlank(message = "{error.operations.request.review_status_required}")
        String status, // APPROVED, REJECTED

        String managerNotes
) {}

