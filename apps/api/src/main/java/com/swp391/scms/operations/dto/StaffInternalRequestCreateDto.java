package com.swp391.scms.operations.dto;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public record StaffInternalRequestCreateDto(
        @NotBlank(message = "{error.operations.request.type_required}")
        String requestType, // LEAVE, SHIFT_EXCHANGE, SCHEDULE_CHANGE, OTHER

        @NotBlank(message = "{error.operations.request.title_required}")
        String title,

        @NotBlank(message = "{error.operations.request.reason_required}")
        String reason,

        LocalDate startDate,
        LocalDate endDate,
        String targetShift,
        Long replacementUserId
) {}

