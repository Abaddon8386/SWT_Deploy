package com.swp391.scms.shop;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.shop.service.ShopPricing;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ShopPricingTest {
    static ShopProperties props(long fee, long threshold) {
        ShopProperties p = new ShopProperties();
        p.setShippingFee(BigDecimal.valueOf(fee));
        p.setFreeShippingThreshold(BigDecimal.valueOf(threshold));
        return p;
    }

    @Test
    void shippingIsFreeAboveThresholdAndForPickup() {
        var pricing = new ShopPricing(props(30000, 500000));
        assertThat(pricing.shippingFee("delivery", new BigDecimal("499999"))).isEqualByComparingTo("30000");
        assertThat(pricing.shippingFee("delivery", new BigDecimal("500000"))).isEqualByComparingTo("0");
        assertThat(pricing.shippingFee("pickup", new BigDecimal("1000"))).isEqualByComparingTo("0");
        assertThatThrownBy(() -> pricing.shippingFee("drone", new BigDecimal("1000")))
                .isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "FULFILLMENT_INVALID");
    }
}
