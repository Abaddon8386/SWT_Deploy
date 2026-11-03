package com.swp391.scms.finance;

import com.swp391.scms.finance.controller.VnpayController;
import com.swp391.scms.finance.service.*;
import com.swp391.scms.security.*;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.common.i18n.MessageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import java.util.Map;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(VnpayController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,JsonAuthenticationEntryPoint.class,JsonAccessDeniedHandler.class})
class VnpaySecurityTest {
    @Autowired MockMvc mvc;
    @MockBean VnpayPaymentService payments;
    @MockBean VnpayIpnHandler handler;
    @MockBean JwtService jwt;
    @MockBean UserRepository users;
    @MockBean MessageService messages;
    @Test void onlyIpnIsAnonymous() throws Exception {
        when(handler.handle(any())).thenReturn(Map.of("RspCode","97","Message","Invalid Checksum"));
        mvc.perform(get("/api/v1/payments/vnpay/ipn")).andExpect(status().isOk()).andExpect(jsonPath("$.RspCode").value("97"));
        mvc.perform(get("/api/v1/payments/vnpay/config")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/payments/vnpay/transactions/ABC")).andExpect(status().isUnauthorized());
    }
    @Test @WithMockUser(roles="RECEPTIONIST") void cashierCannotStartMemberCheckout() throws Exception {
        mvc.perform(get("/api/v1/payments/vnpay/config")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(roles="MEMBER") void memberCanReadAvailability() throws Exception {
        mvc.perform(get("/api/v1/payments/vnpay/config")).andExpect(status().isOk()).andExpect(jsonPath("$.data.enabled").value(false));
    }
}
