package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;

public record CoachBookingCreateDto(
        @NotNull(message = "{error.coach_booking.coach_required}")
        Long coachId,

        Long disciplineId,

        @NotNull(message = "{error.coach_booking.date_required}")
        LocalDate bookingDate,

        @NotNull(message = "{error.coach_booking.start_time_required}")
        LocalTime startTime,

        @NotNull(message = "{error.coach_booking.end_time_required}")
        LocalTime endTime,

        String paymentMethod, // "package_quota", "cash", "bank_transfer", "online_wallet"

        String notes
) {}
