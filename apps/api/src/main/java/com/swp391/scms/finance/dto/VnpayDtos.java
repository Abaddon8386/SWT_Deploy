package com.swp391.scms.finance.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public final class VnpayDtos {
    private VnpayDtos() {}
    public record CheckoutRequest(Long subscriptionId, Long coachBookingId, Long courtBookingId, Long paymentId, Long productOrderId) {
        public CheckoutRequest(Long subscriptionId, Long coachBookingId, Long courtBookingId, Long paymentId) {
            this(subscriptionId, coachBookingId, courtBookingId, paymentId, null);
        }
    }
    public record Configuration(boolean enabled) {}
    public record Checkout(String reference, String paymentUrl, BigDecimal amount, LocalDateTime expiresAt) {}
    public record Status(String reference, Long paymentId, Long subscriptionId, BigDecimal amount, String status, LocalDateTime expiresAt, String destination) {}
}
