package com.swp391.scms.security;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.swp391.scms.coaching.TrainingPlanProgressController;
import com.swp391.scms.coaching.service.TrainingPlanProgressService;
import com.swp391.scms.common.i18n.MessageService;
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
@WebMvcTest(TrainingPlanProgressController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,JsonAuthenticationEntryPoint.class,JsonAccessDeniedHandler.class})
class TrainingPlanProgressSecurityTest {
 @Autowired MockMvc mvc;
 @MockitoBean TrainingPlanProgressService service;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean MessageService messages;
 private static UsernamePasswordAuthenticationToken actor(String role){return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(20L,"test-coach",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role)));}

 private final String url="/api/v1/coaching/training-plans/1/completions?exerciseDate=2026-10-26";
 @Test void anonymousCannotRead() throws Exception {mvc.perform(get(url)).andExpect(status().isUnauthorized());}
 @Test void memberAndStaffCannotRead() throws Exception {for(String role:List.of("MEMBER","RECEPTIONIST")){mvc.perform(get(url).with(authentication(actor(role)))).andExpect(status().isForbidden());}verifyNoInteractions(service);}
 @Test void coachAndManagerReachOwnershipService() throws Exception {for(String role:List.of("COACH","CENTER_MANAGER")){mvc.perform(get(url).with(authentication(actor(role)))).andExpect(status().isOk());verify(service).get(eq(1L),eq(java.time.LocalDate.of(2026,10,26)),eq(20L),eq(role));}}

}
