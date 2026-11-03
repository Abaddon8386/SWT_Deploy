package com.swp391.scms.courts.dto;

import jakarta.validation.constraints.*;
import java.time.*;

public final class CourtBookingRequests {
    private CourtBookingRequests() {}
    public record BookRequest(
            @NotNull(message = "{validation.courts.room.not_null}") Long roomId,
            @NotNull(message = "{validation.courts.date.not_null}") LocalDate date,
            @NotNull(message = "{validation.courts.time.not_null}") LocalTime startTime,
            @Pattern(regexp = "(?i)cash|vnpay", message = "{validation.courts.payment_method.pattern}") String paymentMethod) {
        public BookRequest(Long roomId, LocalDate date, LocalTime startTime) { this(roomId, date, startTime, null); }
    }
    /** Standing booking: same one-hour slot on chosen weekdays for a week or a month. */
    public record RecurringBookRequest(
            @NotNull(message = "{validation.courts.room.not_null}") Long roomId,
            @NotNull(message = "{validation.courts.date.not_null}") LocalDate startDate,
            @NotNull(message = "{validation.courts.time.not_null}") LocalTime startTime,
            @NotNull(message = "{validation.recurring.period.not_null}")
            @Pattern(regexp = "(?i)week|month", message = "{validation.recurring.period.pattern}") String period,
            @Size(max = 7, message = "{validation.recurring.days.size}") java.util.List<Integer> daysOfWeek,
            @Pattern(regexp = "(?i)cash|vnpay", message = "{validation.courts.payment_method.pattern}") String paymentMethod) {
        public RecurringBookRequest(Long roomId, LocalDate startDate, LocalTime startTime, String period, java.util.List<Integer> daysOfWeek) {
            this(roomId, startDate, startTime, period, daysOfWeek, null);
        }
    }
    public record CancelRequest(@Size(max = 255, message = "{validation.courts.reason.size}") String reason) {}
}
