package com.swp391.scms.shop;

import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.service.ProductOrderRefunds;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.wallet.WalletService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ProductOrderRefundsTest {
    final PaymentRepository payments = mock(PaymentRepository.class);
    final WalletService wallet = mock(WalletService.class);
    ProductOrderRefunds service;
    ProductOrder order;

    @BeforeEach
    void setUp() {
        service = new ProductOrderRefunds(payments, wallet);
        Member member = new Member();
        member.setUserId(1L);
        order = new ProductOrder();
        order.setId(9L);
        order.setMember(member);
        order.setTotal(new BigDecimal("2580000"));
    }

    @Test
    void paidOrderCreditsWalletMarksPaymentRefundedAndIsIdempotent() {
        Payment payment = new Payment();
        payment.setId(50L);
        payment.setProductOrderId(9L);
        payment.setAmount(new BigDecimal("2580000"));
        payment.setStatus("success");
        when(payments.findAllByProductOrderId(9L)).thenReturn(List.of(payment));

        BigDecimal first = service.refundIfPaid(order, "Hủy đơn");
        assertThat(first).isEqualByComparingTo("2580000");
        assertThat(payment.getStatus()).isEqualTo("refunded");
        assertThat(payment.getRefundedAmount()).isEqualByComparingTo("2580000");
        verify(wallet, times(1)).creditRefund(1L, new BigDecimal("2580000"), "ORDER_REFUND_9", "Hủy đơn");

        // Second call sees status="refunded" -> returns ZERO and does not credit wallet again
        BigDecimal second = service.refundIfPaid(order, "Hủy đơn");
        assertThat(second).isEqualByComparingTo("0");
        verify(wallet, times(1)).creditRefund(1L, new BigDecimal("2580000"), "ORDER_REFUND_9", "Hủy đơn");
    }

    @Test
    void unpaidOrderReturnsZeroWithoutCallingWallet() {
        Payment pending = new Payment();
        pending.setId(51L);
        pending.setProductOrderId(9L);
        pending.setAmount(new BigDecimal("2580000"));
        pending.setStatus("pending");
        when(payments.findAllByProductOrderId(9L)).thenReturn(List.of(pending));

        BigDecimal refunded = service.refundIfPaid(order, "Quá hạn");
        assertThat(refunded).isEqualByComparingTo("0");
        verifyNoInteractions(wallet);
    }
}
