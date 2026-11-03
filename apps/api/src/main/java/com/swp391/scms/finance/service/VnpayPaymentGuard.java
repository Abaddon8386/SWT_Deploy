package com.swp391.scms.finance.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.repository.VnpayTransactionRepository;
import org.springframework.stereotype.Component;

/** Called under the existing member/booking lock before cashier settlement or cancellation. */
@Component
public class VnpayPaymentGuard {
    private final VnpayTransactionRepository transactions;
    private final PaymentRepository payments;
    public VnpayPaymentGuard(VnpayTransactionRepository transactions, PaymentRepository payments) {
        this.transactions=transactions;this.payments=payments;
    }
    public void payment(Long id) {
        if(transactions.existsByPaymentIdAndStatus(id,"pending")) throw blocked();
    }
    public void subscription(Long id) { payments.findAllBySubscriptionId(id).forEach(p->payment(p.getId())); }
    public void coach(Long id) { payments.findAllByCoachBookingId(id).forEach(p->payment(p.getId())); }
    public void court(Long id) { payments.findAllByCourtBookingId(id).forEach(p->payment(p.getId())); }
    public void refund(Long id) {
        payment(id);
        if(transactions.existsByPaymentIdAndStatus(id,"success")) throw new ConflictException("VNPAY_REFUND_UNSUPPORTED","finance.vnpay.refund_unsupported",null,null);
    }
    private ConflictException blocked() {return new ConflictException("VNPAY_AWAITING_CONFIRMATION","finance.vnpay.awaiting_confirmation",null,null);}
}
