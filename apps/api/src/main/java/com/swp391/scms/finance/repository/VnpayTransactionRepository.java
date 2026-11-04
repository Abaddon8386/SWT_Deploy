package com.swp391.scms.finance.repository;

import com.swp391.scms.finance.entity.VnpayTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface VnpayTransactionRepository extends JpaRepository<VnpayTransaction, String> {
    Optional<VnpayTransaction> findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(Long paymentId, String status);
    List<VnpayTransaction> findAllByPaymentId(Long paymentId);
    boolean existsByPaymentIdAndStatus(Long paymentId, String status);
    boolean existsByPaymentId(Long paymentId);
}
