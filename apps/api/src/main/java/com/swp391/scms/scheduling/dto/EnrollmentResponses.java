package com.swp391.scms.scheduling.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * SCRUM-73: response payloads for enrollments.
 */
public final class EnrollmentResponses {

    private EnrollmentResponses() {
    }

    public record EnrollmentDto(
            Long id,
            Long classId,
            String className,
            Long memberId,
            Long sessionId,
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime,
            String status,
            LocalDateTime enrolledAt,
            LocalDateTime cancelledAt,
            String cancelReason
    ) {
    }
}
