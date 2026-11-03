package com.swp391.scms.finance;

import com.swp391.scms.finance.service.VnpayPaymentGuard;
import com.swp391.scms.finance.repository.*;
import com.swp391.scms.common.exception.ConflictException;
import org.junit.jupiter.api.Test;
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
}
