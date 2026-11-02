package com.swp391.scms.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.swp391.scms.auth.dto.AuthTokenResponse;
import com.swp391.scms.auth.dto.GoogleLoginRequest;
import com.swp391.scms.auth.dto.GoogleOAuthCallbackRequest;
import com.swp391.scms.auth.dto.GoogleOAuthResult;
import com.swp391.scms.auth.dto.GoogleUserInfo;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.UnauthorizedException;
import com.swp391.scms.security.JwtService;
import com.swp391.scms.users.RoleRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.util.Optional;

@ExtendWith(MockitoExtension.class)
class GoogleAuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RoleRepository roleRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock OtpService otpService;
    @Mock OtpDeliveryPort otpDeliveryPort;
    @Mock GoogleTokenVerifierPort googleTokenVerifierPort;

    private AuthService authService;
    private com.swp391.scms.audit.AuditLogRepository auditRepository;

    @org.junit.jupiter.api.AfterEach
    void authenticationCredentialsNeverReachAuditPersistence() {
        verifyNoInteractions(auditRepository);
    }


    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepository,
                roleRepository,
                passwordEncoder,
                jwtService,
                otpService,
                otpDeliveryPort,
                Clock.systemUTC(),
                false,
                null,
                googleTokenVerifierPort
        );
        auditRepository = mock(com.swp391.scms.audit.AuditLogRepository.class);
        var proxyFactory = new org.springframework.aop.aspectj.annotation.AspectJProxyFactory(authService);
        proxyFactory.addAspect(new com.swp391.scms.audit.AuditAspect(auditRepository, new com.fasterxml.jackson.databind.ObjectMapper()));
        authService = proxyFactory.getProxy();
    }

    private Role createRole(String code) {
        Role role = new Role();
        role.setCode(code);
        role.setName(code);
        return role;
    }

    @Test
    void rejectsReplacingExistingGoogleIdentity() {
        var existing = new User();
        existing.setGoogleSub("original-sub");
        when(googleTokenVerifierPort.verify("token")).thenReturn(
                new GoogleUserInfo("different-sub", "member@gmail.com", true, "Member", null));
        when(userRepository.findByEmailIgnoreCase("member@gmail.com")).thenReturn(Optional.of(existing));
        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(new GoogleLoginRequest("token")));
        assertEquals("original-sub", existing.getGoogleSub());
        verify(userRepository, never()).save(any());
        verifyNoInteractions(jwtService);
    }

    @Test
    void requiresAdditionalVerificationToLinkThirdPartyEmail() {
        var existing = new User();
        when(googleTokenVerifierPort.verify("token")).thenReturn(
                new GoogleUserInfo("new-sub", "member@example.com", true, "Member", null));
        when(userRepository.findByEmailIgnoreCase("member@example.com")).thenReturn(Optional.of(existing));
        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(new GoogleLoginRequest("token")));
        assertNull(existing.getGoogleSub());
        verify(userRepository, never()).save(any());
        verifyNoInteractions(jwtService);
    }

    @Test
    @DisplayName("Case 1: Token hợp lệ - Người dùng mới -> Tự tạo tài khoản MEMBER active và cấp JWT")
    void testGoogleLogin_ValidToken_NewUser() {
        GoogleUserInfo googleUser = new GoogleUserInfo(
                "sub-12345",
                "newuser@gmail.com",
                true,
                "New Google User",
                "https://avatar.com/pic.jpg"
        );
        when(googleTokenVerifierPort.verify("valid-id-token")).thenReturn(googleUser);
        when(userRepository.findByGoogleSub("sub-12345")).thenReturn(Optional.empty());
        when(userRepository.findByEmailIgnoreCase("newuser@gmail.com")).thenReturn(Optional.empty());
        when(roleRepository.findByCodeIgnoreCase("MEMBER")).thenReturn(Optional.of(createRole("MEMBER")));
        when(userRepository.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        when(passwordEncoder.encode(any())).thenReturn("hashed-pwd");
        when(userRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(99L);
            return u;
        });
        when(jwtService.generateToken(any(), any(), eq("MEMBER"))).thenReturn("jwt-token-xyz");

        AuthTokenResponse response = authService.loginWithGoogle(new GoogleLoginRequest("valid-id-token"));

        assertNotNull(response);
        assertEquals("jwt-token-xyz", response.token());
        assertEquals("MEMBER", response.role());
        verify(userRepository, atLeastOnce()).save(any(User.class));
    }

    @Test
    @DisplayName("Case 2: Token hợp lệ - Email đã tồn tại vai trò MEMBER -> Đăng nhập và liên kết google_sub")
    void testGoogleLogin_ValidToken_ExistingUser() {
        GoogleUserInfo googleUser = new GoogleUserInfo(
                "sub-67890",
                "member@gmail.com",
                true,
                "Member Existing",
                null
        );
        when(googleTokenVerifierPort.verify("valid-token-existing")).thenReturn(googleUser);
        when(userRepository.findByGoogleSub("sub-67890")).thenReturn(Optional.empty());

        User existingUser = new User();
        existingUser.setId(10L);
        existingUser.setEmail("member@gmail.com");
        existingUser.setUsername("existing_member");
        existingUser.setStatus("active");
        existingUser.setRole(createRole("MEMBER"));

        when(userRepository.findByEmailIgnoreCase("member@gmail.com")).thenReturn(Optional.of(existingUser));
        when(jwtService.generateToken(10L, "existing_member", "MEMBER")).thenReturn("jwt-existing");

        AuthTokenResponse response = authService.loginWithGoogle(new GoogleLoginRequest("valid-token-existing"));

        assertNotNull(response);
        assertEquals("jwt-existing", response.token());
        assertEquals("MEMBER", response.role());
        assertEquals("sub-67890", existingUser.getGoogleSub());
        verify(userRepository).save(existingUser);
    }

    @Test
    @DisplayName("Case 3: Token sai / Chữ ký không hợp lệ / Hết hạn -> Ném lỗi UnauthorizedException (401)")
    void testGoogleLogin_InvalidToken() {
        when(googleTokenVerifierPort.verify("invalid-token"))
                .thenThrow(new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Invalid"));

        assertThrows(UnauthorizedException.class,
                () -> authService.loginWithGoogle(new GoogleLoginRequest("invalid-token")));
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("Case 4: Email chưa được Google xác minh (email_verified = false) -> Ném lỗi UnauthorizedException (401)")
    void testGoogleLogin_EmailNotVerified() {
        GoogleUserInfo unverifiedUser = new GoogleUserInfo(
                "sub-unverified",
                "unverified@gmail.com",
                false, // not verified
                "Unverified User",
                null
        );
        when(googleTokenVerifierPort.verify("token-unverified")).thenReturn(unverifiedUser);

        UnauthorizedException ex = assertThrows(UnauthorizedException.class,
                () -> authService.loginWithGoogle(new GoogleLoginRequest("token-unverified")));
        assertEquals("GOOGLE_EMAIL_NOT_VERIFIED", ex.getErrorCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("Manager vẫn dùng đăng nhập thường")
    void testGoogleLogin_StaffNotAllowed() {
        GoogleUserInfo coachGoogleUser = new GoogleUserInfo(
                "sub-coach",
                "coach@center.com",
                true,
                "Head Coach",
                null
        );
        when(googleTokenVerifierPort.verify("coach-token")).thenReturn(coachGoogleUser);

        User coachUser = new User();
        coachUser.setId(20L);
        coachUser.setEmail("coach@center.com");
        coachUser.setUsername("head_coach");
        coachUser.setStatus("active");
        coachUser.setRole(createRole("CENTER_MANAGER"));

        when(userRepository.findByGoogleSub("sub-coach")).thenReturn(Optional.of(coachUser));

        ForbiddenException ex = assertThrows(ForbiddenException.class,
                () -> authService.loginWithGoogle(new GoogleLoginRequest("coach-token")));
        assertEquals("STAFF_GOOGLE_NOT_ALLOWED", ex.getErrorCode());
        verify(jwtService, never()).generateToken(any(), any(), any());
    }

    @Test
    @DisplayName("Case 6: Tài khoản bị khóa (locked hoặc inactive) -> Ném lỗi ForbiddenException (403)")
    void testGoogleLogin_LockedAccount() {
        GoogleUserInfo googleUser = new GoogleUserInfo(
                "sub-locked",
                "locked@gmail.com",
                true,
                "Locked User",
                null
        );
        when(googleTokenVerifierPort.verify("locked-token")).thenReturn(googleUser);

        User lockedUser = new User();
        lockedUser.setId(30L);
        lockedUser.setEmail("locked@gmail.com");
        lockedUser.setUsername("locked_member");
        lockedUser.setStatus("locked"); // Locked status!
        lockedUser.setRole(createRole("MEMBER"));

        when(userRepository.findByGoogleSub("sub-locked")).thenReturn(Optional.of(lockedUser));

        ForbiddenException ex = assertThrows(ForbiddenException.class,
                () -> authService.loginWithGoogle(new GoogleLoginRequest("locked-token")));
        assertEquals("ACCOUNT_INACTIVE", ex.getErrorCode());
        verify(jwtService, never()).generateToken(any(), any(), any());
    }

    @Test
    @DisplayName("OAuth Callback -> Xác thực Google thành công, gửi mã OTP về email thay vì cấp JWT ngay")
    void testRequestGoogleOAuthOtp_SendsEmailOtpInsteadOfImmediateJwt() {
        GoogleUserInfo googleUser = new GoogleUserInfo(
                "sub-oauth-999",
                "oauthmember@gmail.com",
                true,
                "OAuth Member",
                "https://avatar.com/oauth.jpg"
        );
        when(googleTokenVerifierPort.verifyAuthorizationCode("oauth-code-123", "http://localhost:8080/api/v1/auth/google/callback"))
                .thenReturn(googleUser);
        when(userRepository.findByGoogleSub("sub-oauth-999")).thenReturn(Optional.empty());
        when(userRepository.findByEmailIgnoreCase("oauthmember@gmail.com")).thenReturn(Optional.empty());
        when(roleRepository.findByCodeIgnoreCase("MEMBER")).thenReturn(Optional.of(createRole("MEMBER")));
        when(userRepository.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        when(passwordEncoder.encode(any())).thenReturn("hashed-pwd");
        when(userRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(105L);
            return u;
        });
        when(otpService.generateOtp("oauthmember@gmail.com")).thenReturn("482910");

        GoogleOAuthResult challenge = authService.authenticateGoogle(
                new GoogleOAuthCallbackRequest(null, null, "oauth-code-123", "http://localhost:8080/api/v1/auth/google/callback")
        );

        assertNotNull(challenge);
        assertEquals("oauthmember@gmail.com", challenge.email());
        assertEquals("482910", challenge.otpCode());
        verify(otpDeliveryPort).send("oauthmember@gmail.com", "482910");
        verifyNoInteractions(jwtService);
    }
    @Test
    void renamedGoogleEmailKeepsOtpBoundToResolvedLocalAccount() {
        User member = new User();
        member.setEmail("original@example.com");
        member.setGoogleSub("stable-sub");
        member.setStatus("inactive");
        member.setRole(createRole("MEMBER"));
        when(googleTokenVerifierPort.verify("renamed-token")).thenReturn(
                new GoogleUserInfo("stable-sub", "renamed@example.com", true, "Member", null, "example.com"));
        when(userRepository.findByGoogleSub("stable-sub")).thenReturn(Optional.of(member));
        when(otpService.generateOtp("original@example.com")).thenReturn("123456");
        var challenge = authService.authenticateGoogle(new GoogleOAuthCallbackRequest("renamed-token"));
        assertEquals("original@example.com", challenge.email());
        verify(otpDeliveryPort).send("original@example.com", "123456");
        verifyNoInteractions(jwtService);
    }

    @Test
    void activeReturningGoogleMemberSignsInWithoutSendingAnotherOtp() {
        User member = new User();
        member.setId(77L);
        member.setUsername("returning-member");
        member.setEmail("member@gmail.com");
        member.setGoogleSub("known-sub");
        member.setStatus("active");
        member.setRole(createRole("MEMBER"));
        when(googleTokenVerifierPort.verify("known-token")).thenReturn(
                new GoogleUserInfo("known-sub", "member@gmail.com", true, "Member", null));
        when(userRepository.findByGoogleSub("known-sub")).thenReturn(Optional.of(member));
        when(jwtService.generateToken(77L, "returning-member", "MEMBER")).thenReturn("member-jwt");
        var result = authService.authenticateGoogle(new GoogleOAuthCallbackRequest("known-token"));
        assertEquals("member-jwt", result.authentication().token());
        assertNull(result.otpCode());
        verify(jwtService).generateToken(77L, "returning-member", "MEMBER");
        verifyNoInteractions(otpService, otpDeliveryPort);
        assertNotNull(member.getLastLoginAt());
    }

    @Test
    void activeExistingEmailCanLinkTrustedGoogleIdentityWithoutAnotherOtp() {
        var member = new User();
        member.setId(80L);
        member.setUsername("existing-member");
        member.setEmail("existing@gmail.com");
        member.setRole(createRole("MEMBER"));
        member.setStatus("active");
        when(googleTokenVerifierPort.verify("link-token")).thenReturn(
                new GoogleUserInfo("new-google-sub", "existing@gmail.com", true, "Member", null));
        when(userRepository.findByEmailIgnoreCase("existing@gmail.com")).thenReturn(Optional.of(member));
        when(jwtService.generateToken(80L, "existing-member", "MEMBER")).thenReturn("existing-jwt");
        var result = authService.authenticateGoogle(new GoogleOAuthCallbackRequest("link-token"));
        assertEquals("existing-jwt", result.authentication().token());
        assertEquals("new-google-sub", member.getGoogleSub());
        verifyNoInteractions(otpService, otpDeliveryPort);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"locked,MEMBER,false", "locked,COACH,false", "active,CENTER_MANAGER,false", "active,ADMIN,false", "active,RECEPTIONIST,true", "active,MEMBER,true"})
    void googleCallbackStillRejectsLockedStaffAndDeletedAccounts(String status, String role, boolean deleted) {
        var member = new User();
        member.setEmail("blocked@gmail.com");
        member.setStatus(status);
        member.setRole(createRole(role));
        if (deleted) member.setDeletedAt(java.time.LocalDateTime.now());
        when(googleTokenVerifierPort.verify("blocked-token")).thenReturn(
                new GoogleUserInfo("blocked-sub", "blocked@gmail.com", true, "Blocked", null));
        when(userRepository.findByGoogleSub("blocked-sub")).thenReturn(Optional.of(member));
        assertThrows(ForbiddenException.class, () -> authService.authenticateGoogle(new GoogleOAuthCallbackRequest("blocked-token")));
        verifyNoInteractions(jwtService, otpService, otpDeliveryPort);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void provisionedStaffGoogleCallbackLinksByEmailAndKeepsRole(String role) {
        User staff = new User();
        staff.setId(81L);
        staff.setEmail("staff@gmail.com");
        staff.setStatus("active");
        staff.setRole(createRole(role));
        when(googleTokenVerifierPort.verify("staff-token")).thenReturn(
                new GoogleUserInfo("staff-sub", "STAFF@gmail.com", true, "Staff", null));
        when(userRepository.findByEmailIgnoreCase("staff@gmail.com")).thenReturn(Optional.of(staff));
        when(jwtService.generateToken(81L, "staff@gmail.com", role)).thenReturn("staff-jwt");

        var result = authService.authenticateGoogle(new GoogleOAuthCallbackRequest("staff-token"));

        assertEquals(role, result.authentication().role());
        assertEquals("staff-jwt", result.authentication().token());
        assertEquals("staff-sub", staff.getGoogleSub());
        verify(userRepository, never()).saveAndFlush(any());
        verifyNoInteractions(roleRepository, otpService, otpDeliveryPort);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void linkedStaffDirectGoogleLoginKeepsDatabaseRole(String role) {
        User staff = new User();
        staff.setId(82L);
        staff.setEmail("staff@gmail.com");
        staff.setStatus("active");
        staff.setRole(createRole(role));
        staff.setGoogleSub("staff-sub");
        when(googleTokenVerifierPort.verify("staff-token")).thenReturn(
                new GoogleUserInfo("staff-sub", "staff@gmail.com", true, "Staff", null));
        when(userRepository.findByGoogleSub("staff-sub")).thenReturn(Optional.of(staff));
        when(jwtService.generateToken(82L, "staff@gmail.com", role)).thenReturn("staff-jwt");
        assertEquals(role, authService.loginWithGoogle(new GoogleLoginRequest("staff-token")).role());
        verifyNoInteractions(roleRepository);
    }

}
