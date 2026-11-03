package com.swp391.scms.security;

import com.swp391.scms.attendance.CenterCheckinController;
import com.swp391.scms.attendance.dto.CheckinResponses.CheckinDto;
import com.swp391.scms.attendance.service.CenterCheckinService;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.MembershipSubscriptionController;
import com.swp391.scms.membership.service.MembershipSubscriptionService;
import com.swp391.scms.scheduling.ClassController;
import com.swp391.scms.scheduling.EnrollmentController;
import com.swp391.scms.scheduling.service.ClassService;
import com.swp391.scms.scheduling.service.EnrollmentService;
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

import java.util.List;
import java.time.LocalDateTime;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Exercises the merged SCRUM-71..75 matchers with the real security filter chain. */
@WebMvcTest({ClassController.class, EnrollmentController.class,
        CenterCheckinController.class, MembershipSubscriptionController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class})
class OperationsSecurityRegressionTest {
    @Autowired MockMvc mvc;
    @MockitoBean ClassService classes;
    @MockitoBean EnrollmentService enrollments;
    @MockitoBean CenterCheckinService checkins;
    @MockitoBean MembershipSubscriptionService subscriptions;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean MessageService messages;

    private static UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(10L, "review-user", role),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test
    void anonymousCannotReadSchedulesOrCheckinHistory() throws Exception {
        mvc.perform(get("/api/v1/classes/sessions")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/check-in/history")).andExpect(status().isUnauthorized());
        verifyNoInteractions(classes, checkins);
    }

    @Test
    void memberCannotScanCheckoutOrCreateClasses() throws Exception {
        mvc.perform(post("/api/v1/check-in/scan").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"qrCode\":\"sample\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/check-in/1/checkout").with(authentication(actor("MEMBER"))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/classes").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(checkins, classes);
    }

    @Test
    void staffAndCoachCannotUseMemberOnlyBookingsOrSubscriptions() throws Exception {
        for (String role : List.of("RECEPTIONIST", "COACH", "CENTER_MANAGER")) {
            mvc.perform(post("/api/v1/classes/sessions/1/enroll").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/classes/enrollments/my").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/memberships/subscriptions/my").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/memberships/subscriptions").with(authentication(actor(role)))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"packageId\":1}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(enrollments, subscriptions);
    }

    @Test
    void receptionAndManagerReachPosRenewalEndpointsButMemberCannot() throws Exception {
        for (String path : List.of("/api/v1/memberships/subscriptions", "/api/v1/subscriptions")) {
            for (String role : List.of("RECEPTIONIST", "CENTER_MANAGER")) {
                mvc.perform(get(path + "/members/5/renewal-candidates").with(authentication(actor(role))))
                        .andExpect(status().isOk());
                mvc.perform(post(path + "/members/5/renew/9").with(authentication(actor(role))))
                        .andExpect(status().isCreated());
            }
            mvc.perform(get(path + "/members/5/renewal-candidates").with(authentication(actor("MEMBER"))))
                    .andExpect(status().isForbidden());
            mvc.perform(post(path + "/members/5/renew/9").with(authentication(actor("COACH"))))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void mergedMatchersAllowMemberBookingAndReceptionistScanning() throws Exception {
        when(checkins.scan(any(), any())).thenReturn(new CheckinDto(1L, 10L, "Member",
                LocalDateTime.of(2026, 10, 17, 10, 0), null, "qr", null, "GRANTED"));
        mvc.perform(post("/api/v1/classes/sessions/1/enroll").with(authentication(actor("MEMBER"))))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/classes/enrollments/my").with(authentication(actor("MEMBER"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/check-in/scan").with(authentication(actor("RECEPTIONIST")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"qrCode\":\"sample\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/check-in/1/checkout").with(authentication(actor("CENTER_MANAGER"))))
                .andExpect(status().isOk());
    }
}
