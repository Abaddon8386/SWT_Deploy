package com.swp391.scms.courts.service;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.Locale;

/** Court fees and the number of court bookings each membership plan includes per month. */
public final class CourtPricing {
    public static final String PACKAGE_QUOTA = "package_quota";
    /** One-hour slot, any of the three court types. */
    public static final BigDecimal STANDARD_PRICE = new BigDecimal("100000");
    /** Slots starting at 18:00 or later; the price already includes court lighting. */
    public static final BigDecimal EVENING_PRICE = new BigDecimal("125000");
    public static final LocalTime EVENING_FROM = LocalTime.of(18, 0);

    private CourtPricing() {}

    public static BigDecimal priceFor(LocalTime start) {
        return start.isBefore(EVENING_FROM) ? STANDARD_PRICE : EVENING_PRICE;
    }

    /** Court bookings included per calendar month across Tennis, Badminton and Swimming together. */
    public static int monthlyQuota(String packageName) {
        String name = packageName == null ? "" : packageName.toUpperCase(Locale.ROOT);
        if (name.contains("PLATINUM")) return 3;
        if (name.contains("GOLD")) return 2;
        if (name.contains("SILVER")) return 1;
        return 0;
    }
}
