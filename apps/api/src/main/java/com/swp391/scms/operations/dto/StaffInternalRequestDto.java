package com.swp391.scms.operations.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record StaffInternalRequestDto(
        Long id,
        Long userId,
        String userFullName,
        String userEmail,
        String userRole,
        String requestType,
        String title,
        String reason,
        LocalDate startDate,
        LocalDate endDate,
        String targetShift,
        Long replacementUserId,
        String replacementUserFullName,
        String status,
        String managerNotes,
        Long reviewedByUserId,
        String reviewedByName,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}

