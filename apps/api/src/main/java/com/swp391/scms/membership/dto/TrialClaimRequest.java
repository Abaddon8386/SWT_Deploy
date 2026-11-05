package com.swp391.scms.membership.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TrialClaimRequest(
        String documentType,
        String documentNumber,
        String cccd,
        @NotBlank(message = "{validation.trial.full_name.required}")
        @Size(max = 150, message = "{validation.trial.full_name.size}")
        String fullName,
        String nationality,
        String frontImageUrl,
        String backImageUrl
) {
    public TrialClaimRequest(String cccd, String fullName) {
        this("CCCD", cccd, cccd, fullName, null, null, null);
    }

    public String resolvedDocumentType() {
        if (documentType != null && !documentType.isBlank()) {
            return documentType.trim().toUpperCase();
        }
        return "CCCD";
    }

    public String resolvedDocumentNumber() {
        if (documentNumber != null && !documentNumber.isBlank()) {
            return documentNumber.trim();
        }
        if (cccd != null && !cccd.isBlank()) {
            return cccd.trim();
        }
        return "";
    }

    public String cccd() {
        return resolvedDocumentNumber();
    }
}
