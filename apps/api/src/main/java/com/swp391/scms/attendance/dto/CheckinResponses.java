package com.swp391.scms.attendance.dto;

import java.time.LocalDateTime;
import java.time.LocalDate;
import java.util.List;

public final class CheckinResponses {

    private CheckinResponses() {}

    public record StreakDto(int currentStreak, int longestStreak, int workoutDays,
                            LocalDate startDate, LocalDate endDate, List<LocalDate> activeDates) {}

    public record GateQrDto(String qrCode, String gateId, String gate, java.time.Instant generatedAt,
                            java.time.Instant expiresAt, long expiresInSeconds) {}

    public record CheckinDto(
            Long id,
            Long memberId,
            String memberName,
            LocalDateTime checkInTime,
            LocalDateTime checkOutTime,
            String method,
            String gate,
            String status,
            String denialReason,
            String avatarUrl,
            String packageName,
            Long remainingDays
    ) {
        public CheckinDto(Long id, Long memberId, String memberName, LocalDateTime checkInTime,
                          LocalDateTime checkOutTime, String method, String gate, String status, String denialReason) {
            this(id, memberId, memberName, checkInTime, checkOutTime, method, gate, status, denialReason, null, null, null);
        }
        public CheckinDto(Long id, Long memberId, String memberName, LocalDateTime checkInTime,
                          LocalDateTime checkOutTime, String method, String gate, String status) {
            this(id, memberId, memberName, checkInTime, checkOutTime, method, gate, status, null);
        }
    }
}
