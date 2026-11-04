package com.swp391.scms.membership.service;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Băm số CCCD bằng HMAC-SHA256 với pepper phía server để không lưu số định danh dạng đọc được
 * nhưng vẫn kiểm tra trùng lặp được. Chỉ giữ 4 số cuối để hiển thị.
 */
@Component
public class CccdHasher {

    private final byte[] pepper;

    public CccdHasher(@Value("${app.trial.cccd-pepper:${app.jwt.secret}}") String pepper) {
        this.pepper = pepper.getBytes(StandardCharsets.UTF_8);
    }

    public String hash(String cccd) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pepper, "HmacSHA256"));
            byte[] digest = mac.doFinal(cccd.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    public String last4(String cccd) {
        return cccd.length() <= 4 ? cccd : cccd.substring(cccd.length() - 4);
    }

    public String mask(String last4) {
        return last4 == null ? null : "********" + last4;
    }
}
