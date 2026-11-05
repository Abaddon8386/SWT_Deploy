package com.swp391.scms.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class StaffOrderDtos {
    private StaffOrderDtos() {}

    public record ShipRequest(
            @Size(max = 60) String carrier,
            @NotBlank @Size(min = 3, max = 60) String trackingNumber
    ) {}

    public record CounterPaymentRequest(
            @NotBlank String method
    ) {}

    public record StaffCancelRequest(
            @NotBlank @Size(min = 5, max = 255) String reason,
            Boolean restock
    ) {
        public StaffCancelRequest(String reason, boolean restock) {
            this(reason, Boolean.valueOf(restock));
        }

        public boolean shouldRestock() {
            return restock == null || restock;
        }
    }

    public record OrderCountsDto(
            long paid,
            long processing,
            long ready_for_pickup,
            long shipping,
            long counter_pending
    ) {}
}
