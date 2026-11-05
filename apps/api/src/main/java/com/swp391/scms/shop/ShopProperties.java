package com.swp391.scms.shop;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@ConfigurationProperties(prefix = "app.shop")
public class ShopProperties {
    private BigDecimal shippingFee = BigDecimal.valueOf(30000);
    private BigDecimal freeShippingThreshold = BigDecimal.valueOf(500000);
    private int paymentWindowMinutes = 30;
    private int counterHoldHours = 48;
    private String pickupAddress = "120 Hai Bà Trưng, Phường Sài Gòn, TP. Hồ Chí Minh — quầy lễ tân";
    private boolean seedSamples = true;

    public BigDecimal getShippingFee() { return shippingFee; }
    public void setShippingFee(BigDecimal shippingFee) { this.shippingFee = shippingFee; }
    public BigDecimal shippingFee() { return shippingFee; }

    public BigDecimal getFreeShippingThreshold() { return freeShippingThreshold; }
    public void setFreeShippingThreshold(BigDecimal freeShippingThreshold) { this.freeShippingThreshold = freeShippingThreshold; }
    public BigDecimal freeShippingThreshold() { return freeShippingThreshold; }

    public int getPaymentWindowMinutes() { return paymentWindowMinutes; }
    public void setPaymentWindowMinutes(int paymentWindowMinutes) { this.paymentWindowMinutes = paymentWindowMinutes; }
    public int paymentWindowMinutes() { return paymentWindowMinutes; }

    public int getCounterHoldHours() { return counterHoldHours; }
    public void setCounterHoldHours(int counterHoldHours) { this.counterHoldHours = counterHoldHours; }
    public int counterHoldHours() { return counterHoldHours; }

    public String getPickupAddress() { return pickupAddress; }
    public void setPickupAddress(String pickupAddress) { this.pickupAddress = pickupAddress; }
    public String pickupAddress() { return pickupAddress; }

    public boolean isSeedSamples() { return seedSamples; }
    public void setSeedSamples(boolean seedSamples) { this.seedSamples = seedSamples; }
    public boolean seedSamples() { return seedSamples; }
}
