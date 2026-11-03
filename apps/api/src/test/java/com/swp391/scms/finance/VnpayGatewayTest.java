package com.swp391.scms.finance;

import com.swp391.scms.finance.service.VnpayGateway;
import com.swp391.scms.finance.service.VnpayProperties;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class VnpayGatewayTest {
    private final VnpayProperties config = new VnpayProperties(true, "TEST1234", "test-secret",
            "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "https://example.test/member/payments/vnpay/return", 15);
    private final VnpayGateway gateway = new VnpayGateway(config);

    @Test void signsSortedEncodedValuesAndExcludesHashFields() {
        // Independent HMAC vector generated with Python's hmac/hashlib.
        assertEquals("3ee11a2a58002440975b50b6de187e788983c80b575a9d5827cabbc02face3d9e6a4b0fdbf27bedd76b924c2c2ce65947a6502c417d77829e7e23fe430cc811a", gateway.sign(Map.of("vnp_TxnRef", "ABC123", "vnp_OrderInfo", "SOL payment 12")));
        var fields = new java.util.HashMap<>(Map.of("vnp_TmnCode", "TEST1234", "vnp_Amount", "65000000", "vnp_TxnRef", "ABC123"));
        fields.put("vnp_SecureHash", gateway.sign(fields));
        assertTrue(gateway.validSignature(fields));
        fields.put("vnp_Amount", "1");
        assertFalse(gateway.validSignature(fields));
    }
    @Test void buildsVndAmountAndExpiryWithoutLeakingSecret() {
        var start = LocalDateTime.of(2026, 11, 3, 12, 0);
        String url = gateway.paymentUrl("ABC123", new BigDecimal("650000.00"), start, start.plusMinutes(15), "127.0.0.1");
        assertTrue(url.contains("vnp_Amount=65000000"));
        assertTrue(url.contains("vnp_ExpireDate=20261103121500"));
        assertTrue(url.contains("vnp_Version=2.1.0"));
        assertFalse(url.contains("test-secret"));
        assertFalse(url.contains("vnp_BankCode"));
    }
    @Test void rejectsForgedMerchantAndInvalidAmount() {
        var fields = new java.util.HashMap<>(Map.of("vnp_TmnCode", "OTHER123", "vnp_TxnRef", "ABC123"));
        fields.put("vnp_SecureHash", gateway.sign(fields));
        assertFalse(gateway.validSignature(fields));
        assertThrows(RuntimeException.class, () -> gateway.paymentUrl("ABC123", new BigDecimal("1.01"), LocalDateTime.now(), LocalDateTime.now().plusMinutes(15), "127.0.0.1"));
    }
}
