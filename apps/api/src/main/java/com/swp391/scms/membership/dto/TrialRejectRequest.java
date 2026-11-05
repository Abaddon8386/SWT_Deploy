package com.swp391.scms.membership.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TrialRejectRequest(
        @NotBlank(message = "{validation.trial.rejection_reason.required}")
        @Size(max = 500, message = "{validation.trial.rejection_reason.size}")
        String reason
) {}

