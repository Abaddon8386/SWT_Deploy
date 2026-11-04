package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record CoachAssignmentAssignDto(
        @NotNull(message = "{validation.coach_assignment.member_id.not_null}")
        Long memberId,

        @NotNull(message = "{validation.coach_assignment.coach_id.not_null}")
        Long coachId,

        String assignmentType,

        String goal,

        @NotNull(message = "{validation.coach_assignment.start_date.not_null}")
        LocalDate startDate,

        @NotNull(message = "{validation.coach_assignment.end_date.not_null}")
        LocalDate endDate,

        String notes
) {}

