package com.swp391.scms.security;

import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JsonAuthenticationEntryPoint authenticationEntryPoint;
    private final JsonAccessDeniedHandler accessDeniedHandler;
    private final RateLimitingFilter rateLimitingFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
            JsonAuthenticationEntryPoint authenticationEntryPoint,
            JsonAccessDeniedHandler accessDeniedHandler) {
        this(jwtAuthenticationFilter, authenticationEntryPoint, accessDeniedHandler, new RateLimitingFilter());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
            JsonAuthenticationEntryPoint authenticationEntryPoint,
            JsonAccessDeniedHandler accessDeniedHandler,
            @org.springframework.beans.factory.annotation.Autowired(required = false) RateLimitingFilter rateLimitingFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
        this.rateLimitingFilter = rateLimitingFilter != null ? rateLimitingFilter : new RateLimitingFilter();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(errors -> errors
                    .authenticationEntryPoint(authenticationEntryPoint)
                    .accessDeniedHandler(accessDeniedHandler))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers(HttpMethod.GET, "/api/v1/public/catalog").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/auth/me").authenticated()
                    .requestMatchers("/api/v1/auth/**", "/api/v1/health", "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                    // Profile extensions (SCRUM-66)
                    .requestMatchers(HttpMethod.PUT, "/api/v1/profile/coach").hasRole("COACH")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/profile/receptionist").hasRole("RECEPTIONIST")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/users/*/receptionist").hasRole("ADMIN")

                    // Notifications & Support Requests (SCRUM-67, SCRUM-68)
                    .requestMatchers("/api/v1/notifications/**").authenticated()
                    .requestMatchers(HttpMethod.POST, "/api/v1/support/requests").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/support/requests/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/support/requests").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST", "COACH")
                    .requestMatchers(HttpMethod.PATCH, "/api/v1/support/requests/*/status").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST", "COACH")
                    .requestMatchers(HttpMethod.POST, "/api/v1/support/requests/*/messages").hasAnyRole("MEMBER", "CENTER_MANAGER", "RECEPTIONIST", "COACH")
                    .requestMatchers(HttpMethod.GET, "/api/v1/support/requests/*/messages").hasAnyRole("MEMBER", "CENTER_MANAGER", "RECEPTIONIST", "COACH")

                    // Attendance & Check-in (SCRUM-75)
                    .requestMatchers(HttpMethod.POST, "/api/v1/check-in/scan").hasAnyRole("RECEPTIONIST", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/check-in/*/checkout", "/api/v1/check-in/checkout").hasAnyRole("RECEPTIONIST", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/check-in/history").hasAnyRole("RECEPTIONIST", "CENTER_MANAGER", "MEMBER")
                    .requestMatchers("/api/v1/attendance/sessions/**").hasAnyRole("COACH", "CENTER_MANAGER", "RECEPTIONIST", "STAFF")

                    // Payments & Invoices (SCRUM-76, 77, 78)
                    .requestMatchers(HttpMethod.POST, "/api/v1/payments/*/refund").hasRole("CENTER_MANAGER")
                    .requestMatchers(HttpMethod.PATCH, "/api/v1/payments/*/status").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.GET, "/api/v1/payments/my/**").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/invoices/my/by-payment/*").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/invoices/my/by-payment/*/download").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/payments").hasAnyRole("MEMBER", "CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST, "/api/v1/payments/process").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.GET, "/api/v1/payments/*", "/api/v1/payments/member/**").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers("/api/v1/payments/**", "/api/v1/invoices/**").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")

                    // Reports (SCRUM-79)
                    .requestMatchers("/api/v1/reports/**").hasRole("CENTER_MANAGER")
                    .requestMatchers("/api/v1/admin/audit-logs/**", "/api/v1/admin/audit-logs").hasRole("CENTER_MANAGER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/training-plans/my", "/api/v1/training-plans/my").hasRole("MEMBER")
                    .requestMatchers("/api/v1/coaching/training-completions/my", "/api/v1/coaching/training-completions/my/*").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/training-plans/*", "/api/v1/training-plans/*").hasAnyRole("COACH", "CENTER_MANAGER", "MEMBER")
                    .requestMatchers("/api/v1/coaching/training-plans/**", "/api/v1/coaching/training-plans",
                            "/api/v1/training-plans/**", "/api/v1/training-plans").hasAnyRole("COACH", "CENTER_MANAGER")
                    .requestMatchers("/api/v1/ai/generate-workout-plan", "/api/v1/ai/recommend",
                            "/api/v1/ai/recommendations/**").hasAnyRole("COACH", "CENTER_MANAGER")
                    .requestMatchers("/api/v1/ai/chat/**").hasAnyRole("MEMBER", "COACH", "CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST, "/api/v1/coaching/evaluations").hasAnyRole("COACH", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/evaluations/**").hasAnyRole("MEMBER", "COACH", "CENTER_MANAGER")
                    .requestMatchers("/api/v1/health/metrics/**").hasAnyRole("MEMBER", "COACH", "CENTER_MANAGER")

                    // Coach Reviews & Monthly Leaderboard (SCRUM-134)
                    .requestMatchers(HttpMethod.POST, "/api/v1/coaching/reviews").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/reviews/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/reviews/**").authenticated()
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/leaderboard").authenticated()
                    .requestMatchers(HttpMethod.GET, "/api/v1/coaching/monthly-reviews/my").hasRole("COACH")
                    .requestMatchers("/api/v1/coaching/monthly-reviews/**").hasAnyRole("CENTER_MANAGER", "MANAGER")

                    // Internal Staff Requests (SCRUM-135)
                    .requestMatchers(HttpMethod.POST, "/api/v1/operations/requests").hasAnyRole("STAFF", "COACH", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.GET, "/api/v1/operations/requests/my").hasAnyRole("STAFF", "COACH", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/operations/requests/*/cancel").hasAnyRole("STAFF", "COACH", "RECEPTIONIST")
                    .requestMatchers("/api/v1/operations/requests/**").hasAnyRole("CENTER_MANAGER", "MANAGER")

                    // Membership Subscriptions (SCRUM-71)
                    .requestMatchers(HttpMethod.GET,
                            "/api/v1/memberships/subscriptions/pending", "/api/v1/subscriptions/pending",
                            "/api/v1/memberships/subscriptions/holds/pending", "/api/v1/subscriptions/holds/pending")
                            .hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST,
                            "/api/v1/memberships/subscriptions/*/hold/approve", "/api/v1/subscriptions/*/hold/approve",
                            "/api/v1/memberships/subscriptions/*/hold/reject", "/api/v1/subscriptions/*/hold/reject")
                            .hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    // POS: nhân viên mua mới/gia hạn thay hội viên; phải đứng trước matcher MEMBER bên dưới
                    .requestMatchers(HttpMethod.GET,
                            "/api/v1/memberships/subscriptions/members/*/renewal-candidates",
                            "/api/v1/subscriptions/members/*/renewal-candidates")
                            .hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST,
                            "/api/v1/memberships/subscriptions/members/*/renew/*",
                            "/api/v1/subscriptions/members/*/renew/*")
                            .hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST,
                            "/api/v1/memberships/subscriptions/*/cancel", "/api/v1/subscriptions/*/cancel")
                            .hasAnyRole("MEMBER", "CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers("/api/v1/memberships/subscriptions/**", "/api/v1/memberships/subscriptions",
                            "/api/v1/subscriptions/**", "/api/v1/subscriptions").hasRole("MEMBER")

                    // Scheduling, Enrollments & Waitlists (SCRUM-72, 73, 74, 131)
                    .requestMatchers(HttpMethod.GET, "/api/v1/classes/enrollments/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/classes/sessions/*/enroll").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.DELETE, "/api/v1/classes/enrollments/*").hasAnyRole("MEMBER", "CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.POST, "/api/v1/classes/sessions/*/waitlist").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.DELETE, "/api/v1/classes/waitlists/*").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/classes/waitlists/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/classes/sessions/*/cancel").hasAnyRole("COACH", "CENTER_MANAGER", "RECEPTIONIST", "STAFF")
                    .requestMatchers(HttpMethod.POST, "/api/v1/classes/*/sessions", "/api/v1/classes", "/api/v1/classes/**").hasRole("CENTER_MANAGER")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/classes/*/sessions/*", "/api/v1/classes/*", "/api/v1/classes/**").hasRole("CENTER_MANAGER")
                    .requestMatchers(HttpMethod.DELETE, "/api/v1/classes/*", "/api/v1/classes/**").hasRole("CENTER_MANAGER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/classes/sessions/**", "/api/v1/classes/sessions", "/api/v1/classes", "/api/v1/classes/**").authenticated()

                    // Court booking roles are enforced here and at controller boundaries.
                    .requestMatchers(HttpMethod.GET, "/api/v1/courts", "/api/v1/courts/**").hasAnyRole("MEMBER", "RECEPTIONIST", "STAFF", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/court-bookings/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/court-bookings").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/court-bookings").hasAnyRole("RECEPTIONIST", "STAFF", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.PATCH, "/api/v1/court-bookings/*/cancel").hasAnyRole("MEMBER", "RECEPTIONIST", "STAFF", "CENTER_MANAGER")
                    .requestMatchers("/api/v1/court-bookings/**", "/api/v1/courts/**").denyAll()

                    // 1:1 Coach Bookings & Favorite Disciplines (SCRUM-133)
                    .requestMatchers(HttpMethod.GET, "/api/v1/coach-bookings/coaches").authenticated()
                    .requestMatchers(HttpMethod.GET, "/api/v1/coach-bookings/available-slots").authenticated()
                    .requestMatchers(HttpMethod.GET, "/api/v1/coach-bookings/quota-status").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coach-bookings/coach-schedule").hasAnyRole("COACH", "CENTER_MANAGER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/coach-bookings").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.GET, "/api/v1/coach-bookings/my").hasRole("MEMBER")
                    .requestMatchers(HttpMethod.DELETE, "/api/v1/coach-bookings/*").hasAnyRole("MEMBER", "COACH", "CENTER_MANAGER")
                    .requestMatchers("/api/v1/members/me/favorite-disciplines/**", "/api/v1/members/me/favorite-disciplines").hasRole("MEMBER")

                    // Users, Roles, Member Lookup & Facilities Catalog
                    .requestMatchers("/api/v1/staff-accounts", "/api/v1/staff-accounts/**").hasAnyRole("CENTER_MANAGER", "ADMIN")
                    .requestMatchers("/api/v1/users", "/api/v1/users/**", "/api/v1/roles", "/api/v1/roles/**").hasRole("ADMIN")
                    .requestMatchers(HttpMethod.GET, "/api/v1/members/lookup").hasAnyRole("CENTER_MANAGER", "RECEPTIONIST")
                    .requestMatchers(HttpMethod.GET, "/api/v1/disciplines/**", "/api/v1/rooms/**", "/api/v1/packages/**").authenticated()
                    .requestMatchers("/api/v1/disciplines/**", "/api/v1/rooms/**", "/api/v1/packages/**").hasRole("CENTER_MANAGER")
                    .anyRequest().authenticated())
            .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
