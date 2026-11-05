package com.swp391.scms.membership.dto;

import java.time.LocalDateTime;

public record TrialStatusDto(
        boolean eligible,
        boolean alreadyClaimed,
        String status,
        String documentType,
        String cccd,
        String fullName,
        String nationality,
        String frontImageUrl,
        String backImageUrl,
        String rejectionReason,
        LocalDateTime redeemedAt,
        Long subscriptionId,
        String packageName,
        Integer coachSessionQuota
) {
    public TrialStatusDto(
            boolean eligible,
            boolean alreadyClaimed,
            String cccd,
            String fullName,
            LocalDateTime redeemedAt,
            Long subscriptionId
    ) {
        this(
                eligible,
                alreadyClaimed,
                alreadyClaimed ? (subscriptionId != null ? "APPROVED" : "PENDING_APPROVAL") : "NONE",
                "CCCD",
                cccd,
                fullName,
                null,
                null,
                null,
                null,
                redeemedAt,
                subscriptionId,
                "Gói Trải Nghiệm 3 Ngày",
                1
        );
    }

    public String getDocumentNumberMasked() {
        return cccd;
    }

    public LocalDateTime getRequestedAt() {
        return redeemedAt;
    }
}
