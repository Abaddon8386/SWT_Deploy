package com.swp391.scms.membership.dto;

import java.time.LocalDateTime;

public record TrialStatusDto(
        boolean eligible,
        boolean alreadyClaimed,
        String cccd,
        String fullName,
        LocalDateTime redeemedAt,
        Long subscriptionId
) {}

