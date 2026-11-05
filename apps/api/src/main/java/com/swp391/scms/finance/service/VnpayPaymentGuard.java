package com.swp391.scms.finance.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.finance.entity.VnpayTransaction;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.repository.VnpayTransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Called under the existing member/booking lock before cashier settlement or cancellation.
 *
 * <p>A VNPay attempt blocks the order only while the gateway may still settle it. VNPay refuses payment after the
 * {@code vnp_ExpireDate} sent at checkout, so an attempt still pending {@link #SETTLEMENT_GRACE} after that moment
 * (the customer closed the gateway page and no IPN will come) is closed as {@code failed}. A late successful IPN for
 * such an attempt is still honoured while its payment is pending, see {@link VnpayPaymentService#ipn}.
 */
@Component
public class VnpayPaymentGuard {
    /** Time allowed after the gateway expiry for a delayed IPN before the attempt is closed locally. */
    public static final Duration SETTLEMENT_GRACE = Duration.ofMinutes(15);
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final VnpayTransactionRepository transactions;
    private final PaymentRepository payments;
    private final Clock clock;

    public VnpayPaymentGuard(VnpayTransactionRepository transactions, PaymentRepository payments) {
        this(transactions, payments, Clock.system(CENTER_ZONE));
    }

    @Autowired
    public VnpayPaymentGuard(VnpayTransactionRepository transactions, PaymentRepository payments, Clock clock) {
        this.transactions = transactions;
        this.payments = payments;
        this.clock = clock;
    }

    public void payment(Long id) {
        expireStale(id);
        if (transactions.existsByPaymentIdAndStatus(id, "pending")) throw blocked();
    }
    public void subscription(Long id) { payments.findAllBySubscriptionId(id).forEach(p -> payment(p.getId())); }
    public void coach(Long id) { payments.findAllByCoachBookingId(id).forEach(p -> payment(p.getId())); }
    public void court(Long id) { payments.findAllByCourtBookingId(id).forEach(p -> payment(p.getId())); }
    public void productOrder(Long id) { payments.findAllByProductOrderId(id).forEach(p -> payment(p.getId())); }
    public void refund(Long id) {
        payment(id);
        if (transactions.existsByPaymentIdAndStatus(id, "success")) throw new ConflictException("VNPAY_REFUND_UNSUPPORTED", "finance.vnpay.refund_unsupported", null, null);
    }

    /** Closes this payment's attempts that the gateway can no longer settle. */
    public void expireStale(Long paymentId) {
        LocalDateTime now = now();
        var attempts = transactions.findAllByPaymentId(paymentId);
        if (attempts == null) return;
        for (VnpayTransaction attempt : attempts) {
            if (isStale(attempt, now)) {
                attempt.setStatus("failed");
                transactions.save(attempt);
            }
        }
    }

    /** True when an attempt is pending and past the gateway expiry plus the IPN grace period. */
    public boolean isStale(VnpayTransaction attempt, LocalDateTime now) {
        return attempt != null && "pending".equals(attempt.getStatus()) && attempt.getExpiresAt() != null
                && attempt.getExpiresAt().plus(SETTLEMENT_GRACE).isBefore(now);
    }

    public LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(), CENTER_ZONE); }

    private ConflictException blocked() { return new ConflictException("VNPAY_AWAITING_CONFIRMATION", "finance.vnpay.awaiting_confirmation", null, null); }
}
