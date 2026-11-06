package com.swp391.scms.shop.service;

import com.swp391.scms.common.i18n.MessageService;
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
    private final MessageService messages;

    public ProductOrderRefunds(PaymentRepository payments, WalletService walletService) {
        this(payments, walletService, null);
    }

    @Autowired
    public ProductOrderRefunds(PaymentRepository payments,
                               @Autowired(required = false) WalletService walletService,
                               @Autowired(required = false) MessageService messages) {
        this.payments = payments;
        this.walletService = walletService;
        this.messages = messages;
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
            walletService.creditOrderRefund(memberUserId, amount, "ORDER_REFUND_" + order.getId(),
                    refundDescription(order, reason), order.getId());
        }
        paid.setStatus("refunded");
        paid.setRefundedAmount(amount);
        appendNote(paid, reason);
        payments.save(paid);
        return amount;
    }

    /**
     * A VNPay success that arrives after the order was already cancelled (its payment closed as failed): the member was
     * charged, so the money goes to their wallet and the payment is recorded as refunded instead of being lost.
     */
    public BigDecimal refundLatePayment(ProductOrder order, Payment payment, BigDecimal amount, String reference) {
        if (order == null || payment == null || amount == null || amount.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        if (walletService != null && order.getMember() != null) {
            String code = orderCode(order);
            walletService.creditOrderRefund(order.getMember().getUserId(), amount, "ORDER_LATE_REFUND_" + reference,
                    msg("wallet.description.product_order_late_payment", "Hoàn tiền thanh toán VNPay đến sau khi đơn " + code + " đã hủy", code),
                    order.getId());
        }
        payment.setStatus("refunded");
        payment.setRefundedAmount(amount);
        appendNote(payment, "VNPay " + reference);
        payments.save(payment);
        return amount;
    }

    private String refundDescription(ProductOrder order, String reason) {
        String code = orderCode(order);
        if (reason != null && !reason.isBlank()) {
            return msg("wallet.description.product_order_refund_reason", "Hoàn tiền đơn hàng " + code + ": " + reason, code, reason);
        }
        return msg("wallet.description.product_order_refund", "Hoàn tiền đơn hàng " + code, code);
    }

    private static String orderCode(ProductOrder order) {
        return order.getCode() != null && !order.getCode().isBlank() ? order.getCode() : "#" + order.getId();
    }

    private static void appendNote(Payment payment, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        String combined = (payment.getNote() != null && !payment.getNote().isBlank())
                ? payment.getNote() + " | " + text
                : text;
        payment.setNote(combined.length() > 255 ? combined.substring(0, 255) : combined);
    }

    private String msg(String key, String fallback, Object... args) {
        if (messages != null) {
            String resolved = messages.getMessage(key, args);
            if (resolved != null && !resolved.isBlank() && !resolved.equals(key)) {
                return resolved;
            }
        }
        return fallback;
    }
}
