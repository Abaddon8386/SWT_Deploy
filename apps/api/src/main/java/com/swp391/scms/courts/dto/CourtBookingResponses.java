package com.swp391.scms.courts.dto;

import java.time.*;

public final class CourtBookingResponses {
    private CourtBookingResponses() {}
    public record CourtDto(Long id, String name, String location, Long disciplineId, String disciplineName,
                           LocalTime openTime, LocalTime closeTime) {}
    public record SlotDto(LocalTime startTime, LocalTime endTime, String status) {}
    public record RecurringResult(java.util.List<BookingDto> booked,
                                  java.util.List<com.swp391.scms.common.RecurrenceDates.Skipped> skipped) {}
    public record BookingDto(Long id, Long roomId, String roomName, String disciplineName,
                             Long memberId, String memberName, LocalDate date, LocalTime startTime,
                             LocalTime endTime, String status, LocalDateTime createdAt, LocalDateTime cancelledAt,
                             String cancelReason, boolean canCancel) {}
}
