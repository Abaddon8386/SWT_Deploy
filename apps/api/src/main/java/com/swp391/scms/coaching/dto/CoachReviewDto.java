package com.swp391.scms.coaching.dto;

import java.time.LocalDateTime;

public record CoachReviewDto(
        Long id,
        Long coachId,
        String coachName,
        String coachSpecialization,
        String coachAvatarUrl,
        Long memberId,
        String memberName,
        Long bookingId,
        Long classSessionId,
        Integer rating,
        String comment,
        Boolean isAnonymous,
        String status,
        LocalDateTime createdAt
) {}

