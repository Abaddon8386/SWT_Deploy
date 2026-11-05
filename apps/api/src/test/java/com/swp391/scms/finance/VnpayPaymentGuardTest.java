package com.swp391.scms.finance;

import com.swp391.scms.finance.service.VnpayPaymentGuard;
import com.swp391.scms.finance.service.VnpayExpiryScheduler;
import com.swp391.scms.finance.repository.*;
import com.swp391.scms.common.exception.ConflictException;
import org.junit.jupiter.api.Test;
import com.swp391.scms.finance.entity.*;
import java.time.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class VnpayPaymentGuardTest {
    @Test void unsettledAttemptBlocksCashierAndRefundEvenAfterLocalTimeout() {
        var transactions=mock(VnpayTransactionRepository.class);
        when(transactions.existsByPaymentIdAndStatus(9L,"pending")).thenReturn(true);
        var guard=new VnpayPaymentGuard(transactions,mock(PaymentRepository.class));
        assertThrows(ConflictException.class,()->guard.payment(9L));assertThrows(ConflictException.class,()->guard.refund(9L));
    }
    @Test void successfulGatewayPaymentCannotBeRefundedByLocalBookkeeping() {
        var transactions=mock(VnpayTransactionRepository.class);
        when(transactions.existsByPaymentIdAndStatus(9L,"success")).thenReturn(true);
        var guard=new VnpayPaymentGuard(transactions,mock(PaymentRepository.class));
        assertThrows(ConflictException.class,()->guard.refund(9L));
    }
    final Clock clock=Clock.fixed(Instant.parse("2026-11-03T05:00:00Z"),ZoneId.of("Asia/Ho_Chi_Minh")); // 12:00 at the center
    VnpayTransaction attempt(String ref, LocalDateTime expires) {
        var payment=new Payment();payment.setId(9L);
        return new VnpayTransaction(ref,payment,java.math.BigDecimal.TEN,expires.minusMinutes(15),expires,"127.0.0.1");
    }
    @Test void abandonedAttemptPastGatewayExpiryAndGraceIsClosedAndNoLongerBlocks() {
        var transactions=mock(VnpayTransactionRepository.class);
        var abandoned=attempt("OLD",LocalDateTime.of(2026,11,3,11,30));
        when(transactions.findAllByPaymentId(9L)).thenReturn(List.of(abandoned));
        var guard=new VnpayPaymentGuard(transactions,mock(PaymentRepository.class),clock);
        assertDoesNotThrow(()->guard.payment(9L));
        assertEquals("failed",abandoned.getStatus());verify(transactions).save(abandoned);
    }
    @Test void attemptWithinIpnGraceStillBlocks() {
        var transactions=mock(VnpayTransactionRepository.class);
        var recent=attempt("NEW",LocalDateTime.of(2026,11,3,11,50));
        when(transactions.findAllByPaymentId(9L)).thenReturn(List.of(recent));
        when(transactions.existsByPaymentIdAndStatus(9L,"pending")).thenReturn(true);
        var guard=new VnpayPaymentGuard(transactions,mock(PaymentRepository.class),clock);
        assertThrows(ConflictException.class,()->guard.payment(9L));
        assertEquals("pending",recent.getStatus());verify(transactions,never()).save(any());
    }
    @Test void schedulerClosesEveryPaymentWithAnAbandonedAttempt() {
        var transactions=mock(VnpayTransactionRepository.class);
        var abandoned=attempt("OLD",LocalDateTime.of(2026,11,3,11,0));
        when(transactions.findPaymentIdsWithPendingExpiredBefore(LocalDateTime.of(2026,11,3,11,45))).thenReturn(List.of(9L));
        when(transactions.findAllByPaymentId(9L)).thenReturn(List.of(abandoned));
        var guard=new VnpayPaymentGuard(transactions,mock(PaymentRepository.class),clock);
        assertEquals(1,new VnpayExpiryScheduler(transactions,guard).closeAbandonedAttempts());
        assertEquals("failed",abandoned.getStatus());
    }
}
