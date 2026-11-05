package com.swp391.scms.shop.service;

import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.wallet.WalletService;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProductOrderRefunds {
    private final PaymentRepository payments;
    private final WalletService walletService;

    @Autowired
    public ProductOrderRefunds(PaymentRepository payments,
                               @Autowired(required = false) WalletService walletService) {
        this.payments = payments;
        this.walletService = walletService;
    }

    public BigDecimal refundIfPaid(ProductOrder order, String reason) {
        if (order == null || order.getId() == null) {
            return BigDecimal.ZERO;
        }
        List<Payment> existing = payments.findAllByProductOrderId(order.getId());
        if (existing == null || existing.isEmpty()) {
            return BigDecimal.ZERO;
        }
        Payment paid = existing.stream()
                .filter(p -> "success".equalsIgnoreCase(p.getStatus()))
                .findFirst()
                .orElse(null);
        if (paid == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal amount = paid.getAmount();
        Long memberUserId = order.getMember().getUserId();
        if (walletService != null) {
            walletService.creditRefund(memberUserId, amount, "ORDER_REFUND_" + order.getId(), reason);
        }
        paid.setStatus("refunded");
        paid.setRefundedAmount(amount);
        if (reason != null && !reason.isBlank()) {
            String combined = (paid.getNote() != null && !paid.getNote().isBlank())
                    ? paid.getNote() + " | " + reason
                    : reason;
            paid.setNote(combined.length() > 255 ? combined.substring(0, 255) : combined);
        }
        payments.save(paid);
        return amount;
    }
}
