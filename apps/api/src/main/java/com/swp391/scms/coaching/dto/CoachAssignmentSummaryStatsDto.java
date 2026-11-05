package com.swp391.scms.coaching.dto;

public record CoachAssignmentSummaryStatsDto(
        int totalCoaches,
        int activeCoaches,
        int totalAssignedStudents,
        int totalPtStudents,
        int totalPlanStudents,
        int totalClassStudents
) {}

