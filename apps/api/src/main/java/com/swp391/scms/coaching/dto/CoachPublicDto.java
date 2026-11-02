package com.swp391.scms.coaching.dto;

import java.math.BigDecimal;

public record CoachPublicDto(
        Long id,
        String fullName,
        String email,
        String phone,
        String specialization,
        String bio,
        String certification,
        String avatarUrl,
        BigDecimal defaultHourlyRate
) {}
