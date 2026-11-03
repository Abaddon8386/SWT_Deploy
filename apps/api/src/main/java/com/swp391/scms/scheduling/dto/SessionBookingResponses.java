package com.swp391.scms.scheduling.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public final class SessionBookingResponses {

    private SessionBookingResponses() {
    }

    public record SessionBookingDto(
            Long id,
            Long sessionId,
            Long classId,
            String className,
            Long memberId,
            LocalDate sessionDate,
            LocalTime startTime,
            LocalTime endTime,
            String roomName,
            String coachName,
            String status,
            LocalDateTime bookedAt,
            LocalDateTime cancelledAt,
            String cancelReason,
            String batchId
    ) {
    }

    /** One id that could not be processed in a bulk request, with the API error code and a localised reason. */
    public record Skipped(Long id, LocalDate date, String code, String message) {
    }

    public record BulkBookResult(List<SessionBookingDto> booked, List<Skipped> skipped) {
    }

    public record BulkCancelResult(List<SessionBookingDto> cancelled, List<Skipped> skipped) {
    }
}
