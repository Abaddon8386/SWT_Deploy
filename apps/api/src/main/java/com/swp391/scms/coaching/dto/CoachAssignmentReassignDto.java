package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;

public record CoachAssignmentReassignDto(
        @NotNull(message = "{validation.coach_assignment.member_id.not_null}")
        Long memberId,

        @NotNull(message = "{validation.coach_assignment.from_coach_id.not_null}")
        Long fromCoachId,

        @NotNull(message = "{validation.coach_assignment.to_coach_id.not_null}")
        Long toCoachId,

        Long referenceId,

        String reason
) {}

