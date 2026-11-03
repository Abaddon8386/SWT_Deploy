package com.swp391.scms.security;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.swp391.scms.health.HealthMetricController;
import com.swp391.scms.health.HealthMetricService;
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
@WebMvcTest(HealthMetricController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,JsonAuthenticationEntryPoint.class,JsonAccessDeniedHandler.class})
class HealthMetricWriteSecurityTest {
 @Autowired MockMvc mvc;
 @MockitoBean HealthMetricService service;
 @MockitoBean JwtService jwt;
 @MockitoBean UserRepository users;
 @MockitoBean MessageService messages;
 private static UsernamePasswordAuthenticationToken actor(String role){return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(20L,"test-coach",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role)));}

 private final String payload="{\"memberId\":10,\"metricName\":\"weight\",\"metricValue\":70,\"unit\":\"kg\"}";
 @Test void anonymousCannotWrite() throws Exception {mvc.perform(post("/api/v1/health/metrics").contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isUnauthorized());}
 @Test void memberAndStaffCannotWriteEitherRoute() throws Exception {for(String role:List.of("MEMBER")){for(String url:List.of("/api/v1/health/metrics","/api/v1/members/10/health-metrics")){mvc.perform(post(url).with(authentication(actor(role))).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());}}verifyNoInteractions(service);}
 @Test void receptionistOnlyReachesAppendService() throws Exception {
 mvc.perform(post("/api/v1/health/metrics").with(authentication(actor("RECEPTIONIST"))).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk());
 mvc.perform(put("/api/v1/members/10/health-metrics/1").with(authentication(actor("RECEPTIONIST"))).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());
 mvc.perform(delete("/api/v1/members/10/health-metrics/1").with(authentication(actor("RECEPTIONIST")))).andExpect(status().isForbidden());
 verify(service).recordMetric(any(),eq(20L),eq("RECEPTIONIST"));
 }
 @Test void coachReachesGuardedService() throws Exception {mvc.perform(post("/api/v1/health/metrics").with(authentication(actor("COACH"))).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk());verify(service).recordMetric(any(),eq(20L),eq("COACH"));}

}
