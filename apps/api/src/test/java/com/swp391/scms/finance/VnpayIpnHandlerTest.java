package com.swp391.scms.finance;

import com.swp391.scms.finance.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class VnpayIpnHandlerTest {
    @Test void duplicateQueryParametersNeverReachSettlement() {
        var service=mock(VnpayPaymentService.class);var handler=new VnpayIpnHandler(service,null);
        var values=new LinkedMultiValueMap<String,String>();values.add("vnp_Amount","1");values.add("vnp_Amount","2");
        assertEquals("97",handler.handle(values).get("RspCode"));verifyNoInteractions(service);
    }
    @Test void databaseCommitFailureProducesRetryResponseOutsideTransaction() {
        var service=mock(VnpayPaymentService.class);var handler=new VnpayIpnHandler(service,null);
        when(service.ipn(anyMap())).thenThrow(new org.springframework.transaction.UnexpectedRollbackException("private_database"));
        var response=handler.handle(new LinkedMultiValueMap<>());
        assertEquals("99",response.get("RspCode"));assertFalse(response.toString().contains("private_database"));
    }
}
