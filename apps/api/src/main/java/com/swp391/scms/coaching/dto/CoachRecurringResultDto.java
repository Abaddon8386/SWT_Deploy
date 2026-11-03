package com.swp391.scms.coaching.dto;

import com.swp391.scms.common.RecurrenceDates;
import java.util.List;

public record CoachRecurringResultDto(List<CoachBookingDto> booked, List<RecurrenceDates.Skipped> skipped) {}
