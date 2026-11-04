package com.swp391.scms.membership.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record TrialClaimRequest(
        @NotBlank(message = "{validation.trial.cccd.required}")
        @Pattern(regexp = "^\\d{9,12}$", message = "{validation.trial.cccd.format}")
        String cccd,

        @NotBlank(message = "{validation.trial.full_name.required}")
        @Size(max = 150, message = "{validation.trial.full_name.size}")
        String fullName
) {}

