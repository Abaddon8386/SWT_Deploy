package com.swp391.scms.finance.repository;

import com.swp391.scms.finance.entity.VnpayTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VnpayTransactionRepository extends JpaRepository<VnpayTransaction, String> {
    Optional<VnpayTransaction> findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(Long paymentId, String status);
    java.util.List<VnpayTransaction> findAllByPaymentId(Long paymentId);
    boolean existsByPaymentIdAndStatus(Long paymentId, String status);
    boolean existsByPaymentId(Long paymentId);

    /** Payments with a pending attempt whose gateway expiry passed before {@code cutoff}. */
    @org.springframework.data.jpa.repository.Query("""
            select distinct t.payment.id from VnpayTransaction t
            where t.status = 'pending' and t.expiresAt < :cutoff
            """)
    java.util.List<Long> findPaymentIdsWithPendingExpiredBefore(
            @org.springframework.data.repository.query.Param("cutoff") java.time.LocalDateTime cutoff);
}
