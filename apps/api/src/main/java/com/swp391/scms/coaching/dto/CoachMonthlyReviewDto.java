package com.swp391.scms.coaching.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CoachMonthlyReviewDto(
        Long id,
        Long coachId,
        String coachName,
        String coachSpecialization,
        String coachAvatarUrl,
        Integer year,
        Integer month,
        BigDecimal averageRating,
        Integer totalReviews,
        Integer totalSessions,
        Integer rankPosition,
        String badge,
        BigDecimal bonusAmount,
        String managerFeedback,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}

