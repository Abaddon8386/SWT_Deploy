package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CoachReviewCreateDto(
        @NotNull Long coachId,
        Long bookingId,
        Long classSessionId,
        @NotNull @Min(1) @Max(5) Integer rating,
        @Size(max = 2000) String comment,
        Boolean isAnonymous
) {}

