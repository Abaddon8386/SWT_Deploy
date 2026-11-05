package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CoachAssignmentAssignDto(
        @NotNull(message = "{validation.coach_assignment.member_id.not_null}")
        Long memberId,

        @NotNull(message = "{validation.coach_assignment.coach_id.not_null}")
        Long coachId,

        @NotBlank(message = "{validation.coach_assignment.type.required}")
        @Pattern(regexp = "TRAINING_PLAN", message = "{validation.coach_assignment.assign_type}")
        String assignmentType,

        @Size(max = 255, message = "{validation.coach_assignment.goal.size}") String goal,

        @NotNull(message = "{validation.coach_assignment.start_date.not_null}")
        LocalDate startDate,

        @NotNull(message = "{validation.coach_assignment.end_date.not_null}")
        LocalDate endDate
) {}

