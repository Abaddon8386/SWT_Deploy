package com.swp391.scms.finance.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.dto.VnpayDtos.*;
import com.swp391.scms.finance.service.VnpayPaymentService;
import com.swp391.scms.finance.service.VnpayIpnHandler;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments/vnpay")
public class VnpayController {
    private final VnpayPaymentService payments;
    private final VnpayIpnHandler ipn;
    private final MessageService messages;
    public VnpayController(VnpayPaymentService payments,VnpayIpnHandler ipn,MessageService messages) {
        this.payments=payments;this.ipn=ipn;this.messages=messages;
    }
    private String msg(String key) {return messages!=null?messages.getMessage(key):key;}
    @GetMapping("/config") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Configuration> config() {return ApiResponse.ok(msg("finance.vnpay.config"),new Configuration(payments.enabled()));}
    @PostMapping("/checkout") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Checkout> checkout(@AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CheckoutRequest body,HttpServletRequest request) {
        return ApiResponse.ok(msg("finance.vnpay.checkout_created"),payments.checkout(principal,body,request.getRemoteAddr()));
    }
    @GetMapping("/transactions/{reference}") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Status> status(@AuthenticationPrincipal AuthenticatedPrincipal principal,@PathVariable String reference) {
        return ApiResponse.ok(msg("finance.vnpay.status"),payments.status(principal,reference));
    }
    @PostMapping("/verify-return") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Status> verifyReturn(@AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestBody Map<String,String> params) {
        String reference = params != null ? params.get("vnp_TxnRef") : "";
        if (params != null && params.containsKey("vnp_SecureHash")) {
            ipn.process(params);
        }
        return ApiResponse.ok(msg("finance.vnpay.status"),payments.status(principal,reference));
    }
    @GetMapping("/ipn") @PreAuthorize("permitAll()")
    public Map<String,String> ipn(@RequestParam MultiValueMap<String,String> params) {return ipn.handle(params);}
}
