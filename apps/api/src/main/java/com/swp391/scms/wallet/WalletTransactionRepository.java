package com.swp391.scms.wallet;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, Long> {

    List<WalletTransaction> findTop50ByWallet_IdOrderByCreatedAtDescIdDesc(Long walletId);

    boolean existsByWallet_IdAndReferenceId(Long walletId, String referenceId);
}
