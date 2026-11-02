package com.swp391.scms.coaching.dto;

import java.math.BigDecimal;

public record CoachLeaderboardItemDto(
        Integer rankPosition,
        Long coachId,
        String coachName,
        String coachSpecialization,
        String coachAvatarUrl,
        BigDecimal averageRating,
        Integer totalReviews,
        Integer totalSessions,
        String badge,
        BigDecimal bonusAmount,
        String managerFeedback
) {}

