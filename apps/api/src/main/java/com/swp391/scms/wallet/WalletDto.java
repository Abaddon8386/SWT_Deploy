package com.swp391.scms.wallet;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record WalletDto(
        BigDecimal balance,
        LocalDateTime updatedAt,
        List<WalletTransactionDto> transactions
) {}
