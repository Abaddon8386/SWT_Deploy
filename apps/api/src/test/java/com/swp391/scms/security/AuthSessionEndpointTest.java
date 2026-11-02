package com.swp391.scms.security;

import com.swp391.scms.auth.AuthController;
import com.swp391.scms.auth.AuthService;
import com.swp391.scms.auth.GoogleOAuthRedirectService;
import com.swp391.scms.common.i18n.MessageService;
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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** GET /auth/me must expose the role currently stored in the database, never an anonymous caller. */
@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class})
class AuthSessionEndpointTest {
    @Autowired MockMvc mvc;
    @MockitoBean AuthService authService;
    @MockitoBean GoogleOAuthRedirectService googleRedirect;
    @MockitoBean JwtService jwt;
    @MockitoBean UserRepository users;
    @MockitoBean MessageService messages;

    @Test
    void anonymousCallerIsRejected() throws Exception {
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedCallerReceivesCurrentUsernameAndRole() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(7L, "manager01", "CENTER_MANAGER"),
                null, List.of(new SimpleGrantedAuthority("ROLE_CENTER_MANAGER")));
        mvc.perform(get("/api/v1/auth/me").with(authentication(auth)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("manager01"))
                .andExpect(jsonPath("$.data.role").value("CENTER_MANAGER"));
    }
}
