package com.swp391.scms.scheduling.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * SCRUM-72 & SCRUM-131: request payloads for class and session management.
 */
public final class SchedulingRequests {

    private SchedulingRequests() {
    }

    /**
     * SCRUM-72 AC: Manager creates a class (discipline, coach, room, capacity, level),
     * optionally scheduling the first session in the same request.
     */
    public record CreateClassRequest(
            @NotBlank(message = "{validation.scheduling.class_name.not_blank}")
            @Size(max = 150, message = "{validation.scheduling.class_name.size}")
            String name,

            @NotNull(message = "{validation.scheduling.discipline.not_null}")
            Long disciplineId,

            @NotNull(message = "{validation.scheduling.coach.not_null}")
            Long coachId,

            @NotNull(message = "{validation.scheduling.room.not_null}")
            Long roomId,

            @NotNull(message = "{validation.scheduling.capacity.not_null}")
            @Min(value = 1, message = "{validation.scheduling.capacity.min}")
            Integer capacity,

            @Pattern(regexp = "beginner|intermediate|advanced|all", message = "{validation.scheduling.level.pattern}")
            String level,

            String description,

            java.time.LocalDate sessionDate,
            java.time.LocalTime startTime,
            java.time.LocalTime endTime
    ) {
        public CreateClassRequest(String name,
                                  Long disciplineId,
                                  Long coachId,
                                  Long roomId,
                                  Integer capacity,
                                  String level,
                                  String description) {
            this(name, disciplineId, coachId, roomId, capacity, level, description, null, null, null);
        }
    }

    /**
     * SCRUM-131 AC: Manager updates an existing class (name, discipline, coach, room, capacity, level, description, status).
     */
    public record UpdateClassRequest(
            @NotBlank(message = "{validation.scheduling.class_name.not_blank}")
            @Size(max = 150, message = "{validation.scheduling.class_name.size}")
            String name,

            @NotNull(message = "{validation.scheduling.discipline.not_null}")
            Long disciplineId,

            @NotNull(message = "{validation.scheduling.coach.not_null}")
            Long coachId,

            @NotNull(message = "{validation.scheduling.room.not_null}")
            Long roomId,

            @NotNull(message = "{validation.scheduling.capacity.not_null}")
            @Min(value = 1, message = "{validation.scheduling.capacity.min}")
            Integer capacity,

            @Pattern(regexp = "beginner|intermediate|advanced|all", message = "{validation.scheduling.level.pattern}")
            String level,

            String description,

            @Pattern(regexp = "active|cancelled|archived", message = "{validation.scheduling.class_status.pattern}")
            String status
    ) {
    }

    /**
     * SCRUM-72 AC: schedule a concrete session for a class.
     */
    public record CreateSessionRequest(
            @NotNull(message = "{validation.scheduling.session_date.not_null}")
            java.time.LocalDate sessionDate,

            @NotNull(message = "{validation.scheduling.start_time.not_null}")
            java.time.LocalTime startTime,

            @NotNull(message = "{validation.scheduling.end_time.not_null}")
            java.time.LocalTime endTime
    ) {
    }

    /**
     * SCRUM-131 AC: reschedule an existing class session.
     */
    public record RescheduleSessionRequest(
            @NotNull(message = "{validation.scheduling.session_date.not_null}")
            java.time.LocalDate sessionDate,

            @NotNull(message = "{validation.scheduling.start_time.not_null}")
            java.time.LocalTime startTime,

            @NotNull(message = "{validation.scheduling.end_time.not_null}")
            java.time.LocalTime endTime
    ) {
    }
}
