package com.swp391.scms.coaching.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record CoachBookingDto(
        Long id,
        Long memberId,
        String memberName,
        Long coachId,
        String coachName,
        String coachSpecialization,
        String coachAvatarUrl,
        Long disciplineId,
        String disciplineName,
        LocalDate bookingDate,
        LocalTime startTime,
        LocalTime endTime,
        BigDecimal hourlyRate,
        String paymentMethod,
        String paymentStatus,
        String status,
        String notes,
        LocalDateTime createdAt,
        LocalDateTime cancelledAt,
        String cancelReason
) {}
