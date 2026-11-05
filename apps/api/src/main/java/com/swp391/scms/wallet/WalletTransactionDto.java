package com.swp391.scms.wallet;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record WalletTransactionDto(
        Long id,
        String type,
        BigDecimal amount,
        BigDecimal balanceAfter,
        String referenceType,
        String referenceId,
        String description,
        LocalDateTime createdAt
) {}
