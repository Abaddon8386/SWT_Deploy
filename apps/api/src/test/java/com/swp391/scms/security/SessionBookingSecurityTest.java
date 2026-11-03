package com.swp391.scms.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.scheduling.SessionBookingController;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkBookResult;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkCancelResult;
import com.swp391.scms.scheduling.service.SessionBookingService;
import com.swp391.scms.users.UserRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Per-session booking endpoints live under /api/v1/classes, where a catch-all matcher reserves writes for the
 * manager. These tests run the real filter chain to prove the member-only matchers are reached first.
 */
@WebMvcTest(SessionBookingController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class})
class SessionBookingSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean SessionBookingService service;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean MessageService messages;

    private static UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(10L, "review-user", role),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private static final String BULK = "{\"sessionIds\":[1,2,3]}";

    @Test
    void anonymousCannotBookOrReadBookings() throws Exception {
        mvc.perform(post("/api/v1/classes/sessions/1/bookings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/classes/session-bookings/my")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void onlyMembersBookAndListTheirOwnSessions() throws Exception {
        for (String role : List.of("RECEPTIONIST", "COACH", "CENTER_MANAGER", "ADMIN")) {
            mvc.perform(post("/api/v1/classes/sessions/1/bookings").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/classes/session-bookings/bulk").with(authentication(actor(role)))
                            .contentType(MediaType.APPLICATION_JSON).content(BULK))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/classes/session-bookings/my").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void memberReachesTheBookingEndpoints() throws Exception {
        when(service.bookMany(any(), any())).thenReturn(new BulkBookResult(List.of(), List.of()));
        mvc.perform(post("/api/v1/classes/sessions/1/bookings").with(authentication(actor("MEMBER"))))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/classes/session-bookings/bulk").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content(BULK))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/classes/session-bookings/my").with(authentication(actor("MEMBER"))))
                .andExpect(status().isOk());
        verify(service).book(any(), any());
        verify(service).myBookings(any(), any(), any(), any());
    }

    @Test
    void bulkRequestIsValidated() throws Exception {
        mvc.perform(post("/api/v1/classes/session-bookings/bulk").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"sessionIds\":[]}"))
                .andExpect(status().isBadRequest());
        StringBuilder many = new StringBuilder("{\"sessionIds\":[");
        for (int i = 1; i <= 63; i++) many.append(i == 1 ? "" : ",").append(i);
        many.append("]}");
        mvc.perform(post("/api/v1/classes/session-bookings/bulk").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content(many.toString()))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void membersAndFrontDeskCancelButCoachesCannot() throws Exception {
        when(service.cancelMany(any(), any())).thenReturn(new BulkCancelResult(List.of(), List.of()));
        for (String role : List.of("MEMBER", "RECEPTIONIST", "CENTER_MANAGER")) {
            mvc.perform(delete("/api/v1/classes/session-bookings/7").with(authentication(actor(role))))
                    .andExpect(status().isOk());
            mvc.perform(post("/api/v1/classes/session-bookings/cancel").with(authentication(actor(role)))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"bookingIds\":[7]}"))
                    .andExpect(status().isOk());
        }
        mvc.perform(delete("/api/v1/classes/session-bookings/7").with(authentication(actor("COACH"))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/classes/session-bookings/cancel").with(authentication(actor("COACH")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"bookingIds\":[7]}"))
                .andExpect(status().isForbidden());
    }
}
