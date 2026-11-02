package com.swp391.scms.security;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.MembershipSubscriptionController;
import com.swp391.scms.membership.service.MembershipSubscriptionService;
import com.swp391.scms.users.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Diagnostic probe of CURRENT behavior, not a regression expectation of the intended policy.
@WebMvcTest(MembershipSubscriptionController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class, JsonAccessDeniedHandler.class})
class RoleFlowPolicyProbeTest {
    @Autowired MockMvc mvc;
    @MockitoBean MembershipSubscriptionService subscriptions;
    @MockitoBean UserRepository users;
    @MockitoBean JwtService jwt;
    @MockitoBean MessageService messages;

    private UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(10L, "probe", role), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test
    void documentsStaffRenewalRoutesBlockedBeforeAllowedController() throws Exception {
        for (String role : List.of("CENTER_MANAGER", "RECEPTIONIST")) {
            mvc.perform(get("/api/v1/memberships/subscriptions/members/1/renewal-candidates").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/memberships/subscriptions/members/1/renew/1").with(authentication(actor(role))))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(subscriptions);
    }

    @Test
    void staffPendingQueueStillReachesController() throws Exception {
        mvc.perform(get("/api/v1/memberships/subscriptions/pending").with(authentication(actor("RECEPTIONIST"))))
                .andExpect(status().isOk());
        verify(subscriptions).listPending();
    }

    @Test
    void managerPlanWithoutCoachIdLooksUpManagerAsCoachAndFails() {
        var members = mock(com.swp391.scms.users.MemberRepository.class);
        var coaches = mock(com.swp391.scms.users.CoachRepository.class);
        var plans = mock(com.swp391.scms.coaching.repository.TrainingPlanRepository.class);
        var service = new com.swp391.scms.coaching.service.TrainingPlanService(plans,
                mock(com.swp391.scms.coaching.repository.TrainingPlanItemRepository.class), members, coaches, null, null);
        var dto = new com.swp391.scms.coaching.dto.TrainingPlanCreateDto();
        dto.setMemberId(1L);
        dto.setStartDate(java.time.LocalDate.of(2026, 11, 2));
        dto.setEndDate(java.time.LocalDate.of(2026, 11, 30));
        when(members.findById(1L)).thenReturn(java.util.Optional.of(new com.swp391.scms.users.entity.Member()));
        org.junit.jupiter.api.Assertions.assertThrows(com.swp391.scms.common.exception.ResourceNotFoundException.class,
                () -> service.createPlan(dto, 99L, "CENTER_MANAGER"));
        verify(coaches).findById(99L);
        verifyNoInteractions(plans);
    }
}
