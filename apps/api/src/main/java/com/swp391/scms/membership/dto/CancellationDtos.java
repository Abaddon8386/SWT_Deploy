package com.swp391.scms.membership.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public final class CancellationDtos {
    private CancellationDtos() {}

    public record Request(
            @NotBlank(message = "{validation.membership.cancellation_reason.not_blank}")
            @Size(max = 500, message = "{validation.membership.cancellation_reason.size}") String reason) {}

    public record StaffRequest(
            Long memberId,
            Long subscriptionId,
            @NotBlank(message = "{validation.membership.cancellation_reason.not_blank}")
            @Size(max = 500, message = "{validation.membership.cancellation_reason.size}") String reason,
            @PositiveOrZero BigDecimal refundAmount) {}

    public record Decision(
            @Size(max = 500, message = "{validation.membership.cancellation_note.size}") String note,
            @PositiveOrZero BigDecimal refundAmount) {
        public Decision(String note) {
            this(note, null);
        }
    }

    public record Response(Long id, Long memberId, String memberName, Long subscriptionId,
            String packageName, String reason, String status, LocalDateTime requestedAt,
            Long resolvedById, LocalDateTime resolvedAt, String resolutionNote,
            BigDecimal refundAmount, Long requestedById, String requestedByName) {
        public Response(Long id, Long memberId, String memberName, Long subscriptionId,
                String packageName, String reason, String status, LocalDateTime requestedAt,
                Long resolvedById, LocalDateTime resolvedAt, String resolutionNote) {
            this(id, memberId, memberName, subscriptionId, packageName, reason, status,
                    requestedAt, resolvedById, resolvedAt, resolutionNote, null, null, null);
        }
    }
}
