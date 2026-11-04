package com.swp391.scms.coaching.dto;

import java.util.List;

public record CoachAssignmentOverviewDto(
        Long coachId,
        String coachName,
        String coachEmail,
        String coachPhone,
        String specialization,
        String bio,
        String employmentStatus,
        int totalStudentsCount,
        int ptStudentsCount,
        int planStudentsCount,
        int classStudentsCount,
        List<CoachAssignmentStudentDto> students
) {}

