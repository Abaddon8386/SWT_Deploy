package com.swp391.scms.coaching.dto;

import java.math.BigDecimal;
import jakarta.validation.constraints.*;

public record CoachMonthlyReviewUpdateDto(
        @Min(value = 1, message = "{error.coaching.monthly.invalid_rank}") Integer rankPosition,
        @Size(max = 100, message = "{error.coaching.monthly.invalid_badge}") String badge,
        @DecimalMin(value = "0", message = "{error.coaching.monthly.invalid_bonus}")
        @Digits(integer = 10, fraction = 2, message = "{error.coaching.monthly.invalid_bonus}") BigDecimal bonusAmount,
        String managerFeedback,
        @Pattern(regexp = "draft|published", message = "{error.coaching.monthly.invalid_status}") String status
) {}

