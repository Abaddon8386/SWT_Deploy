package com.swp391.scms.coaching.dto;

import java.time.LocalDate;

public record CoachAssignmentStudentDto(
        Long memberId,
        String membershipCode,
        String fullName,
        String phone,
        String email,
        String avatarUrl,
        String fitnessGoal,
        String fitnessLevel,
        String healthNotes,
        String assignmentType,
        String assignmentTypeLabel,
        String detail,
        LocalDate startDate,
        LocalDate endDate,
        String nextSession,
        String status,
        Long referenceId
) {}

