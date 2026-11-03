package com.swp391.scms.finance.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ServiceUnavailableException;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/** PAY 2.1.0: sorted, URL-encoded fields and HMAC-SHA512. Credentials never leave this adapter. */
@Component
@EnableConfigurationProperties(VnpayProperties.class)
public class VnpayGateway {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private final VnpayProperties config;
    public VnpayGateway(VnpayProperties config) { this.config = config; }

    public boolean enabled() {
        if (!config.enabled() || config.hashSecret() == null || config.hashSecret().isBlank()
                || config.tmnCode() == null || !config.tmnCode().matches("[A-Za-z0-9]{8}")
                || config.timeoutMinutes() < 1 || config.timeoutMinutes() > 60) return false;
        try {
            URI pay = URI.create(config.paymentUrl());
            URI back = URI.create(config.returnUrl());
            return "https".equals(pay.getScheme()) && pay.getUserInfo() == null && pay.getQuery() == null
                    && "sandbox.vnpayment.vn".equals(pay.getHost())
                    && back.getHost() != null && back.getUserInfo() == null && back.getFragment() == null && back.getQuery() == null
                    && ("https".equals(back.getScheme()) || ("http".equals(back.getScheme())
                        && Set.of("localhost", "127.0.0.1").contains(back.getHost())));
        } catch (RuntimeException e) { return false; }
    }
    public void requireEnabled() {
        if (!enabled()) throw new ServiceUnavailableException("VNPAY_UNAVAILABLE", "finance.vnpay.unavailable", null, null);
    }
    public int timeoutMinutes() { return config.timeoutMinutes(); }
    public String paymentUrl(String reference, BigDecimal amount, LocalDateTime created, LocalDateTime expires, String ip) {
        requireEnabled();
        if (amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 0
                || amount.multiply(BigDecimal.valueOf(100)).toBigInteger().toString().length() > 12) {
            throw new BadRequestException("VNPAY_INVALID_AMOUNT", "finance.vnpay.invalid_amount", null, null);
        }
        var fields = new TreeMap<String,String>();
        fields.put("vnp_Version", "2.1.0"); fields.put("vnp_Command", "pay");
        fields.put("vnp_TmnCode", config.tmnCode()); fields.put("vnp_Amount", amount.multiply(BigDecimal.valueOf(100)).toBigIntegerExact().toString());
        fields.put("vnp_CurrCode", "VND"); fields.put("vnp_TxnRef", reference);
        fields.put("vnp_OrderInfo", "SOL Fitness payment " + reference); fields.put("vnp_OrderType", "other");
        fields.put("vnp_Locale", "vn"); fields.put("vnp_ReturnUrl", config.returnUrl());
        fields.put("vnp_IpAddr", ip); fields.put("vnp_CreateDate", created.format(DATE)); fields.put("vnp_ExpireDate", expires.format(DATE));
        return config.paymentUrl() + "?" + canonical(fields) + "&vnp_SecureHash=" + sign(fields);
    }
    public boolean validSignature(Map<String,String> fields) {
        if (!enabled() || !config.tmnCode().equals(fields.get("vnp_TmnCode"))) return false;
        String supplied = fields.get("vnp_SecureHash");
        if (supplied == null || !supplied.matches("[0-9a-fA-F]{128}")) return false;
        return MessageDigest.isEqual(HexFormat.of().parseHex(supplied), HexFormat.of().parseHex(sign(fields)));
    }
    public String sign(Map<String,String> fields) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(config.hashSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return HexFormat.of().formatHex(mac.doFinal(canonical(fields).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    private String canonical(Map<String,String> fields) {
        return new TreeMap<>(fields).entrySet().stream()
                .filter(e -> !Set.of("vnp_SecureHash", "vnp_SecureHashType").contains(e.getKey()))
                .filter(e -> e.getValue() != null && !e.getValue().isEmpty())
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }
}
