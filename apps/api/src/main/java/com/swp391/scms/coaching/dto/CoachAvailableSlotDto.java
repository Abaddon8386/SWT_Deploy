package com.swp391.scms.coaching.dto;

import java.time.LocalTime;

public record CoachAvailableSlotDto(
        LocalTime startTime,
        LocalTime endTime,
        boolean available,
        String reason // null, "too_soon", "coach_busy", "member_busy"
) {}
