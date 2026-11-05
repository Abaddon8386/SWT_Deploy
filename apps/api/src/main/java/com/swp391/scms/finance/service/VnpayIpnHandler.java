package com.swp391.scms.finance.service;

import com.swp391.scms.common.i18n.MessageService;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import java.util.*;

/** Outside the settlement transaction so database/commit errors are returned as retryable VNPay responses. */
@Service
public class VnpayIpnHandler {
    private final VnpayPaymentService payments;
    private final MessageService messages;
    public VnpayIpnHandler(VnpayPaymentService payments, MessageService messages) {this.payments=payments;this.messages=messages;}
    public Map<String,String> process(Map<String,String> params) {
        if (params == null || params.isEmpty()) {
            return Map.of("RspCode","97","Message",messages!=null?messages.getMessage("finance.vnpay.ipn.97"):"finance.vnpay.ipn.97");
        }
        var multi = new org.springframework.util.LinkedMultiValueMap<String,String>();
        params.forEach((k, v) -> {
            if (k != null && v != null) multi.add(k, v);
        });
        return handle(multi);
    }
    public Map<String,String> handle(MultiValueMap<String,String> params) {
        String code;
        if(params.entrySet().stream().anyMatch(e->e.getValue().size()!=1)) code="97";
        else {
            try { code=payments.ipn(params.toSingleValueMap()); }
            catch(RuntimeException e) {
                org.slf4j.LoggerFactory.getLogger(VnpayIpnHandler.class).warn("VNPay settlement rolled back; callback can be retried ({})",e.getClass().getSimpleName());
                code="99";
            }
        }
        return Map.of("RspCode",code,"Message",messages!=null?messages.getMessage("finance.vnpay.ipn."+code):"finance.vnpay.ipn."+code);
    }
}
