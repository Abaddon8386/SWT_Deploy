package com.swp391.scms.security;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.swp391.scms.coaching.CurrentCoachMembersController;
import com.swp391.scms.coaching.service.CurrentCoachMembers;
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
@WebMvcTest(CurrentCoachMembersController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,JsonAuthenticationEntryPoint.class,JsonAccessDeniedHandler.class})
class CurrentCoachMembersSecurityTest {
 @Autowired MockMvc mvc;
 @MockitoBean CurrentCoachMembers service;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean MessageService messages;
 private static UsernamePasswordAuthenticationToken actor(String role){return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(20L,"test-coach",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role)));}


 @Test void anonymousCannotEnumerate() throws Exception {mvc.perform(get("/api/v1/coaching/members")).andExpect(status().isUnauthorized());}
 @Test void membersAndReceptionistsCannotEnumerate() throws Exception {for(String role:List.of("MEMBER","RECEPTIONIST"))mvc.perform(get("/api/v1/coaching/members").with(authentication(actor(role)))).andExpect(status().isForbidden());verifyNoInteractions(service);}
 @Test void coachIdentityComesFromPrincipalNotQuery() throws Exception {mvc.perform(get("/api/v1/coaching/members?coachId=999").with(authentication(actor("COACH")))).andExpect(status().isOk());verify(service).list(20L,"COACH");}
}
