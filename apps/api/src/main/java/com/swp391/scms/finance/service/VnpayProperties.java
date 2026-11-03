package com.swp391.scms.finance.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.vnpay")
public record VnpayProperties(boolean enabled, String tmnCode, String hashSecret,
        String paymentUrl, String returnUrl, int timeoutMinutes) {}
