package com.swp391.scms.membership.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class SubscriptionResponses {

    private SubscriptionResponses() {}

    public record SubscriptionDto(
            Long id,
            Long memberId,
            Long packageId,
            String packageName,
            Long previousSubscriptionId,
            LocalDate startDate,
            LocalDate endDate,
            String status,
            String qrCode,
            LocalDateTime createdAt,
            String holdStatus,
            String holdReason,
            LocalDateTime holdRequestedAt,
            LocalDateTime holdResolvedAt,
            LocalDate paidThroughDate,
            java.math.BigDecimal upgradeCharge
    ) {
        public SubscriptionDto(Long id, Long memberId, Long packageId, String packageName,
                Long previousSubscriptionId, LocalDate startDate, LocalDate endDate, String status,
                String qrCode, LocalDateTime createdAt, String holdStatus, String holdReason,
                LocalDateTime holdRequestedAt, LocalDateTime holdResolvedAt, LocalDate paidThroughDate) {
            this(id, memberId, packageId, packageName, previousSubscriptionId, startDate, endDate,
                    status, qrCode, createdAt, holdStatus, holdReason, holdRequestedAt, holdResolvedAt, paidThroughDate, null);
        }

        public SubscriptionDto(Long id, Long memberId, Long packageId, String packageName,
                Long previousSubscriptionId, LocalDate startDate, LocalDate endDate, String status,
                String qrCode, LocalDateTime createdAt, String holdStatus, String holdReason,
                LocalDateTime holdRequestedAt, LocalDateTime holdResolvedAt) {
            this(id, memberId, packageId, packageName, previousSubscriptionId, startDate, endDate,
                    status, qrCode, createdAt, holdStatus, holdReason, holdRequestedAt, holdResolvedAt, null, null);
        }

        public SubscriptionDto(
                Long id,
                Long memberId,
                Long packageId,
                String packageName,
                Long previousSubscriptionId,
                LocalDate startDate,
                LocalDate endDate,
                String status,
                String qrCode,
                LocalDateTime createdAt) {
            this(id, memberId, packageId, packageName, previousSubscriptionId, startDate, endDate, status, qrCode, createdAt, null, null, null, null);
        }
    }

    public record PendingSubscriptionDto(
            Long id,
            Long memberId,
            String membershipCode,
            String memberName,
            String memberEmail,
            String memberPhone,
            Long packageId,
            String packageName,
            Integer durationDays,
            java.math.BigDecimal packagePrice,
            LocalDate startDate,
            LocalDate endDate,
            String status,
            LocalDateTime createdAt
    ) {}

    public record HoldRequestDto(
            Long id,
            Long memberId,
            String membershipCode,
            String memberName,
            String memberEmail,
            String memberPhone,
            Long packageId,
            String packageName,
            LocalDate startDate,
            LocalDate endDate,
            String status,
            String holdStatus,
            String holdReason,
            LocalDateTime holdRequestedAt,
            LocalDateTime holdResolvedAt,
            int cancelledEnrollmentsCount
    ) {}

    public record DynamicQrDto(
            String qrCode,
            long expiresInSeconds,
            LocalDateTime generatedAt
    ) {}
}
