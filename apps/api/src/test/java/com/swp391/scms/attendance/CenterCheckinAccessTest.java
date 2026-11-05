package com.swp391.scms.attendance;

import com.swp391.scms.attendance.dto.CheckinResponses;
import com.swp391.scms.attendance.service.CenterCheckinService;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.*;
import com.swp391.scms.users.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CenterCheckinController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
class CenterCheckinAccessTest {
    @Test void streakIsPrivateToTheMemberAndNeverCached() throws Exception {
        var today = java.time.LocalDate.of(2026, 11, 5);
        when(service.streak(any())).thenReturn(new CheckinResponses.StreakDto(2, 5, 8, today.minusWeeks(12), today, List.of(today)));
        mvc.perform(get("/api/v1/check-in/streak").with(authentication(actor("MEMBER"))))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.currentStreak").value(2));
        verify(service).streak(new AuthenticatedPrincipal(10L, "actor", "MEMBER"));
        for (String role : List.of("COACH", "RECEPTIONIST", "CENTER_MANAGER", "ADMIN")) {
            mvc.perform(get("/api/v1/check-in/streak").with(authentication(actor(role)))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/check-in/streak")).andExpect(status().isUnauthorized());
    }
    @Autowired MockMvc mvc;
    @MockitoBean CenterCheckinService service;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean MessageService messages;

    private UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(10L, "actor", role), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test void gateChallengeIsStaffOnlyAndNeverCached() throws Exception {
        when(service.gateQr(any(), eq("A1"))).thenReturn(new CheckinResponses.GateQrDto("code", "A1", "Gate", Instant.EPOCH, Instant.EPOCH.plusSeconds(60), 60));
        mvc.perform(get("/api/v1/check-in/gate-qr").with(authentication(actor("RECEPTIONIST"))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get("/api/v1/check-in/gate-qr").with(authentication(actor("MEMBER")))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/check-in/gate-qr").with(authentication(actor("COACH")))).andExpect(status().isForbidden());
    }

    @Test void selfScanUsesMemberPrincipalWhileStaffEndpointRemainsProtected() throws Exception {
        when(service.selfScan(any(), any())).thenReturn(new CheckinResponses.CheckinDto(1L, 10L, "Member", LocalDateTime.now(), null, "qr", "Gate", "GRANTED"));
        mvc.perform(post("/api/v1/check-in/self").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"gateQr\":\"signed\",\"memberId\":999}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.memberId").value(10));
        verify(service).selfScan(eq(new AuthenticatedPrincipal(10L, "actor", "MEMBER")), any());
        mvc.perform(post("/api/v1/check-in/self").with(authentication(actor("RECEPTIONIST")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"gateQr\":\"signed\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/check-in/scan").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"qrCode\":\"member-card\"}"))
                .andExpect(status().isForbidden());
    }

    @Test void selfScanRejectsBlankAndOversizedPayloadBeforeService() throws Exception {
        for (String code : List.of("", "x".repeat(257))) {
            mvc.perform(post("/api/v1/check-in/self").with(authentication(actor("MEMBER")))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"gateQr\":\"" + code + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
}
