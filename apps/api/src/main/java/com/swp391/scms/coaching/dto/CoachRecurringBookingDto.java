package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Standing 1:1 booking: same slot with one coach on chosen weekdays for a week or a month. */
public record CoachRecurringBookingDto(
        @NotNull(message = "{error.coach_booking.coach_required}") Long coachId,
        Long disciplineId,
        @NotNull(message = "{error.coach_booking.date_required}") LocalDate startDate,
        @NotNull(message = "{error.coach_booking.start_time_required}") LocalTime startTime,
        @NotNull(message = "{error.coach_booking.end_time_required}") LocalTime endTime,
        @NotNull(message = "{validation.recurring.period.not_null}")
        @Pattern(regexp = "(?i)week|month", message = "{validation.recurring.period.pattern}") String period,
        @Size(max = 7, message = "{validation.recurring.days.size}") List<Integer> daysOfWeek,
        String paymentMethod,
        String notes
) {}
