package com.swp391.scms.membership.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ReceptionTrialDto(
        Long id,
        Long memberId,
        String membershipCode,
        String memberName,
        String memberEmail,
        String memberPhone,
        String documentType,
        String documentNumberMasked,
        String documentFullName,
        String nationality,
        String frontImageUrl,
        String backImageUrl,
        String status,
        LocalDateTime requestedAt,
        Long reviewedBy,
        LocalDateTime reviewedAt,
        String rejectionReason,
        Long subscriptionId,
        LocalDate subscriptionStartDate,
        LocalDate subscriptionEndDate,
        String subscriptionStatus
) {}

