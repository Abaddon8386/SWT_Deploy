package com.swp391.scms.finance.repository;

import com.swp391.scms.finance.entity.VnpayTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VnpayTransactionRepository extends JpaRepository<VnpayTransaction, String> {
    Optional<VnpayTransaction> findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(Long paymentId, String status);
    boolean existsByPaymentIdAndStatus(Long paymentId, String status);
    boolean existsByPaymentId(Long paymentId);
}
