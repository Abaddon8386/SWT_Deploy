package com.swp391.scms.security;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.*;
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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({UserController.class, RoleController.class, StaffAccountController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class})
class AccountProvisioningSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean UserService service;
    @MockitoBean RoleService roles;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean MessageService messages;

    private UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(10L, "actor", role), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test
    void managerCannotBypassStaffProvisioningThroughGeneralUserOrRoleEndpoints() throws Exception {
        mvc.perform(get("/api/v1/users").with(authentication(actor("CENTER_MANAGER"))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/users").with(authentication(actor("CENTER_MANAGER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/users/10").with(authentication(actor("CENTER_MANAGER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"roleId\":1}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/roles").with(authentication(actor("CENTER_MANAGER"))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, roles);
    }

    @Test
    void adminCanUseAccountAndRoleAdministration() throws Exception {
        mvc.perform(get("/api/v1/users").with(authentication(actor("ADMIN"))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/roles").with(authentication(actor("ADMIN"))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/users").with(authentication(actor("ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Manager\",\"email\":\"manager@example.com\",\"password\":\"Secret123\",\"gender\":\"other\",\"roleId\":1}"))
                .andExpect(status().isCreated());
    }

    @Test
    void managerAndAdminCanProvisionStaffButOtherRolesCannot() throws Exception {
        for (String role : List.of("CENTER_MANAGER", "ADMIN")) {
            mvc.perform(get("/api/v1/staff-accounts").with(authentication(actor(role))))
                    .andExpect(status().isOk());
            for (String staffRole : List.of("COACH", "RECEPTIONIST")) {
                mvc.perform(post("/api/v1/staff-accounts").with(authentication(actor(role)))
                                .contentType(MediaType.APPLICATION_JSON).content(staffBody(staffRole)))
                        .andExpect(status().isCreated());
            }
        }
        for (String role : List.of("COACH", "RECEPTIONIST", "MEMBER")) {
            mvc.perform(post("/api/v1/staff-accounts").with(authentication(actor(role)))
                            .contentType(MediaType.APPLICATION_JSON).content(staffBody("COACH")))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/staff-accounts").contentType(MediaType.APPLICATION_JSON)
                        .content(staffBody("COACH"))).andExpect(status().isUnauthorized());
    }

    @Test
    void managerCannotInjectPrivilegedOrPublicRolesIntoStaffProvisioning() throws Exception {
        for (String role : List.of("CENTER_MANAGER", "MANAGER", "ADMIN", "MEMBER", "STAFF")) {
            mvc.perform(post("/api/v1/staff-accounts").with(authentication(actor("CENTER_MANAGER")))
                            .contentType(MediaType.APPLICATION_JSON).content(staffBody(role)))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    private String staffBody(String role) {
        return "{\"fullName\":\"Staff\",\"email\":\"staff@gmail.com\",\"password\":\"Secret123\",\"gender\":\"other\",\"roleCode\":\"" + role + "\"}";
    }
}
