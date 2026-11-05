package com.swp391.scms.shop.dto;

import com.swp391.scms.shop.dto.AddressDtos.AddressRequest;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteLineRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public final class OrderDtos {
    private OrderDtos() {}

    public record CreateOrderRequest(
            @NotBlank @Size(min = 8, max = 36) String clientRequestId,
            @NotEmpty @Size(min = 1, max = 30) List<@Valid QuoteLineRequest> items,
            @NotBlank String fulfillment,
            @NotBlank String paymentMethod,
            Long addressId,
            @Valid AddressRequest shippingAddress,
            boolean saveAddress,
            @NotNull @DecimalMin("0") BigDecimal expectedTotal
    ) {
        public CreateOrderRequest(
                String clientRequestId,
                List<QuoteLineRequest> items,
                String fulfillment,
                String paymentMethod,
                BigDecimal expectedTotal
        ) {
            this(clientRequestId, items, fulfillment, paymentMethod, null, null, false, expectedTotal);
        }
    }

    public record CancelOrderRequest(
            @Size(max = 255) String reason
    ) {}

    public record OrderItemDto(
            Long variantId,
            String productName,
            String variantLabel,
            String sku,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal,
            String slug,
            String imageUrl
    ) {}

    public record OrderShippingDto(
            String recipientName,
            String phone,
            String provinceName,
            String wardName,
            String streetLine,
            String note
    ) {}

    public record OrderMemberDto(
            Long id,
            String fullName,
            String phone
    ) {}

    public record OrderDto(
            Long id,
            String code,
            String status,
            String fulfillment,
            String paymentMethod,
            List<OrderItemDto> items,
            BigDecimal subtotal,
            BigDecimal shippingFee,
            BigDecimal total,
            OrderShippingDto shipping,
            String pickupAddress,
            LocalDateTime paymentDueAt,
            LocalDateTime createdAt,
            LocalDateTime paidAt,
            LocalDateTime processingAt,
            LocalDateTime shippedAt,
            LocalDateTime readyAt,
            LocalDateTime completedAt,
            LocalDateTime cancelledAt,
            String cancelReason,
            String trackingCarrier,
            String trackingNumber,
            boolean canCancel,
            boolean canPay,
            BigDecimal refundedAmount,
            OrderMemberDto member
    ) {}

    public record OrderSummaryDto(
            Long id,
            String code,
            String status,
            String fulfillment,
            String paymentMethod,
            BigDecimal total,
            int itemCount,
            String firstItemName,
            LocalDateTime createdAt,
            boolean canPay
    ) {}
}
