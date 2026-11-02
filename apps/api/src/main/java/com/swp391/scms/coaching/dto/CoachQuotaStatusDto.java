package com.swp391.scms.coaching.dto;

public record CoachQuotaStatusDto(
        String packageName,
        int monthlyQuota,
        int usedThisMonth,
        int remainingQuota
) {}
