package com.swp391.scms.auth;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.exception.TooManyRequestsException;
import com.swp391.scms.common.exception.UnauthorizedException;
import com.swp391.scms.auth.dto.AuthTokenResponse;
import com.swp391.scms.auth.dto.GoogleLoginRequest;
import com.swp391.scms.auth.dto.GoogleOAuthCallbackRequest;
import com.swp391.scms.auth.dto.GoogleOAuthResult;
import com.swp391.scms.auth.dto.GoogleUserInfo;
import com.swp391.scms.auth.dto.RegistrationResponse;
import com.swp391.scms.security.JwtService;
import com.swp391.scms.users.RoleRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.common.i18n.MessageService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OtpService otpService;
    private final OtpDeliveryPort otpDeliveryPort;
    private final boolean debugOtpEnabled;
    private final Clock clock;
    private final MessageService messageService;
    private final GoogleTokenVerifierPort googleTokenVerifierPort;

    public AuthService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       OtpService otpService, OtpDeliveryPort otpDeliveryPort, Clock clock,
                       @org.springframework.beans.factory.annotation.Value("${app.auth.debug-otp-enabled:false}") boolean debugOtpEnabled) {
        this(userRepository, roleRepository, passwordEncoder, jwtService, otpService, otpDeliveryPort, clock, debugOtpEnabled, null, null);
    }

    public AuthService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       OtpService otpService, OtpDeliveryPort otpDeliveryPort, Clock clock,
                       @org.springframework.beans.factory.annotation.Value("${app.auth.debug-otp-enabled:false}") boolean debugOtpEnabled,
                       MessageService messageService) {
        this(userRepository, roleRepository, passwordEncoder, jwtService, otpService, otpDeliveryPort, clock, debugOtpEnabled, messageService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AuthService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       OtpService otpService, OtpDeliveryPort otpDeliveryPort, Clock clock,
                       @org.springframework.beans.factory.annotation.Value("${app.auth.debug-otp-enabled:false}") boolean debugOtpEnabled,
                       MessageService messageService,
                       @org.springframework.beans.factory.annotation.Autowired(required = false) GoogleTokenVerifierPort googleTokenVerifierPort) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.otpService = otpService;
        this.otpDeliveryPort = otpDeliveryPort;
        this.debugOtpEnabled = debugOtpEnabled;
        this.clock = clock;
        this.messageService = messageService;
        this.googleTokenVerifierPort = googleTokenVerifierPort;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Transactional
    public AuthTokenResponse login(LoginRequest request) {
        User user = userRepository.findActiveByIdentifier(normalize(request.username()))
                .orElseThrow(() -> new UnauthorizedException("INVALID_CREDENTIALS", "auth.login.invalid_credentials", null, null));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("INVALID_CREDENTIALS", "auth.login.invalid_credentials", null, null);
        }
        if (!"active".equalsIgnoreCase(user.getStatus())) {
            throw new ForbiddenException("ACCOUNT_INACTIVE", "auth.account.inactive", null, null);
        }

        user.setLastLoginAt(LocalDateTime.now(clock));
        return issueTokenForUser(user);
    }

    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        String username = normalize(request.username());
        String email = normalize(request.email());
        if (userRepository.findByUsernameIgnoreCase(username).isPresent()) {
            throw new ConflictException("USERNAME_EXISTS", "auth.register.username_exists", null, null);
        }
        if (userRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new ConflictException("EMAIL_EXISTS", "auth.register.email_exists", null, null);
        }
        String phone = null;
        if (request.phone() != null && !request.phone().isBlank()) {
            phone = request.phone().trim();
            if (userRepository.findByPhone(phone).isPresent()) {
                throw new ConflictException("PHONE_EXISTS", "users.phone_exists", null, null);
            }
        }

        User user = createPendingMemberUser(username, email, phone, request.password());
        return new RegistrationResponse(
                msg("auth.register.success"),
                user.getId(), username);
    }

    @Transactional
    public OtpService.Status verifyOtp(VerifyOtpRequest request) {
        OtpService.Status status = verifyOtpChallenge(request.target(), request.otpCode());
        activateAccount(request.target());
        return status;
    }

    @Transactional(readOnly = true)
    public User findOtpTarget(String target) {
        String normalizedTarget = normalize(target);
        return (normalizedTarget.contains("@")
                ? userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull(normalizedTarget)
                : userRepository.findByPhoneAndDeletedAtIsNull(normalizedTarget))
                .orElseThrow(() -> new ResourceNotFoundException("resource.account", target));
    }

    public String generateOtp(String target) {
        findPendingUser(target);
        return issueAndSendOtp(normalize(target));
    }

    private void activateAccount(String target) {
        User user = findPendingUser(target);
        user.setStatus("active");
        user.setUpdatedAt(LocalDateTime.now(clock));
        userRepository.save(user);
    }

    private User findPendingUser(String target) {
        User user = findOtpTarget(target);
        if (!"inactive".equalsIgnoreCase(user.getStatus())) {
            throw new BadRequestException("ACCOUNT_NOT_PENDING", "auth.account.not_pending", null, null);
        }
        return user;
    }

    @Transactional
    public String requestGoogleOtp(String rawEmail) {
        if (!isValidEmail(rawEmail)) {
            throw new BadRequestException("INVALID_EMAIL", "auth.register.invalid_email", null, null);
        }
        String email = normalize(rawEmail);

        Optional<User> userOpt = userRepository.findByEmailIgnoreCase(email);
        if (userOpt.isEmpty()) {
            String username = generateUniqueUsernameFromEmail(email);
            createPendingMemberUser(username, email, null, UUID.randomUUID().toString());
        } else {
            User user = userOpt.get();
            ensureGoogleOtpAccountAllowed(user);
        }

        return issueAndSendOtp(email);
    }

    /**
     * Handles Google OAuth callback (via ID Token, OAuth2 Access Token, or Authorization Code):
     * verifies identity and account restrictions, signs in active members, or sends activation OTP to pending members.
     */
    @Transactional
    public GoogleOAuthResult authenticateGoogle(GoogleOAuthCallbackRequest request) {
        if (request == null) {
            throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Google OAuth payload is missing");
        }
        if (googleTokenVerifierPort == null) {
            throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Google Token Verifier is not available");
        }

        GoogleUserInfo googleUser;
        if (request.idToken() != null && !request.idToken().isBlank()) {
            googleUser = googleTokenVerifierPort.verify(request.idToken());
        } else if (request.accessToken() != null && !request.accessToken().isBlank()) {
            googleUser = googleTokenVerifierPort.verifyAccessToken(request.accessToken());
        } else if (request.code() != null && !request.code().isBlank()) {
            googleUser = googleTokenVerifierPort.verifyAuthorizationCode(request.code(), request.redirectUri());
        } else {
            throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Google OAuth token or authorization code is missing");
        }

        if (googleUser == null || !googleUser.emailVerified()) {
            throw new UnauthorizedException("GOOGLE_EMAIL_NOT_VERIFIED", "auth.google.email_not_verified", null, "Google email is not verified");
        }

        User user = resolveOrCreateGoogleUser(googleUser, "inactive", true);
        ensureGoogleOtpAccountAllowed(user);

        if ("active".equalsIgnoreCase(user.getStatus())) {
            LocalDateTime now = LocalDateTime.now(clock);
            user.setLastLoginAt(now);
            user.setUpdatedAt(now);
            userRepository.save(user);
            return new GoogleOAuthResult(normalize(user.getEmail()), null, issueTokenForUser(user));
        }

        String accountEmail = normalize(user.getEmail());
        String otpCode = issueAndSendOtp(accountEmail);
        return new GoogleOAuthResult(accountEmail, otpCode);
    }

    @Transactional
    public AuthTokenResponse verifyGoogleOtp(String rawEmail, String otpCode) {
        if (!isValidEmail(rawEmail)) {
            throw new BadRequestException("INVALID_EMAIL", "auth.register.invalid_email", null, null);
        }
        if (otpCode == null || otpCode.isBlank()) {
            throw new BadRequestException("INVALID_OTP", "validation.auth.otp.not_blank", null, null);
        }
        String email = normalize(rawEmail);
        verifyOtpChallenge(email, otpCode.trim());

        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResourceNotFoundException("resource.account", email));
        ensureGoogleOtpAccountAllowed(user);

        LocalDateTime now = LocalDateTime.now(clock);
        if (!"active".equalsIgnoreCase(user.getStatus())) {
            user.setStatus("active");
        }
        user.setLastLoginAt(now);
        user.setUpdatedAt(now);
        userRepository.save(user);

        return issueTokenForUser(user);
    }

    private String generateUniqueUsernameFromEmail(String email) {
        String baseUsername = email.substring(0, email.indexOf('@')).replaceAll("[^a-zA-Z0-9_]", "");
        if (baseUsername.length() < 3) {
            baseUsername = "user_" + baseUsername;
        }
        if (baseUsername.length() > 40) {
            baseUsername = baseUsername.substring(0, 40);
        }
        String username = baseUsername;
        int suffix = 1;
        while (userRepository.findByUsernameIgnoreCase(username).isPresent()) {
            username = baseUsername + suffix++;
        }
        return username;
    }

    private User createPendingMemberUser(String username, String email, String phone, String rawPassword) {
        return createMemberAccount(username, username, email, phone, rawPassword, null, null, "inactive");
    }

    private User createMemberAccount(
            String username,
            String fullName,
            String email,
            String phone,
            String rawPassword,
            String googleSub,
            String avatarUrl,
            String initialStatus) {
        Role memberRole = roleRepository.findByCodeIgnoreCase("MEMBER")
                .orElseThrow(() -> new ResourceNotFoundException("resource.role_member", "MEMBER"));

        User user = new User();
        user.setUsername(username);
        user.setRole(memberRole);
        user.setFullName(fullName != null && !fullName.isBlank() ? fullName : username);
        user.setEmail(email);
        user.setPhone(phone);
        user.setGoogleSub(googleSub);
        user.setAvatarUrl(avatarUrl);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setStatus(initialStatus);
        LocalDateTime now = LocalDateTime.now(clock);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userRepository.saveAndFlush(user);

        Member member = new Member();
        member.setUser(user);
        member.setMembershipCode("MEM-" + user.getId());
        member.setJoinDate(LocalDate.now(clock));
        member.setFitnessLevel("beginner");
        user.setMember(member);
        userRepository.save(user);
        return user;
    }

    private User resolveOrCreateGoogleUser(
            GoogleUserInfo googleUser,
            String initialStatusForNewUser,
            boolean saveImmediatelyOnEmailLink) {
        String email = normalize(googleUser.email());
        String googleSub = googleUser.sub();

        Optional<User> bySub = (googleSub != null && !googleSub.isBlank())
                ? userRepository.findByGoogleSub(googleSub)
                : Optional.empty();
        Optional<User> byEmail = userRepository.findByEmailIgnoreCase(email);

        if (bySub.isPresent()) {
            return bySub.get();
        }
        if (byEmail.isPresent()) {
            User user = byEmail.get();
            String linkedSub = user.getGoogleSub();
            if (linkedSub != null && !linkedSub.isBlank() && !linkedSub.equals(googleSub)) {
                throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, null);
            }
            boolean googleManagedEmail = email.endsWith("@gmail.com")
                    || (googleUser.hostedDomain() != null && !googleUser.hostedDomain().isBlank());
            if ((linkedSub == null || linkedSub.isBlank()) && !googleManagedEmail) {
                throw new UnauthorizedException("GOOGLE_ACCOUNT_LINK_REQUIRED", "auth.google.link_required", null, null);
            }
            user.setGoogleSub(googleSub);
            if (googleUser.picture() != null && (user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())) {
                user.setAvatarUrl(googleUser.picture());
            }
            if (googleUser.name() != null && !googleUser.name().isBlank()
                    && (user.getFullName() == null || user.getFullName().equals(user.getUsername()))) {
                user.setFullName(googleUser.name());
            }
            user.setUpdatedAt(LocalDateTime.now(clock));
            if (saveImmediatelyOnEmailLink) {
                userRepository.save(user);
            }
            return user;
        }

        String username = generateUniqueUsernameFromEmail(email);
        return createMemberAccount(
                username,
                googleUser.name(),
                email,
                null,
                UUID.randomUUID().toString(),
                googleSub,
                googleUser.picture(),
                initialStatusForNewUser);
    }

    private String issueAndSendOtp(String normalizedTarget) {
        String code = otpService.generateOtp(normalizedTarget);
        if (!debugOtpEnabled) {
            try {
                otpDeliveryPort.send(normalizedTarget, code);
            } catch (RuntimeException deliveryFailure) {
                otpService.invalidate(normalizedTarget);
                throw deliveryFailure;
            }
        }
        return code;
    }

    @Transactional
    public AuthTokenResponse loginWithGoogle(GoogleLoginRequest request) {
        if (request == null || request.idToken() == null || request.idToken().isBlank()) {
            throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Google ID Token is missing");
        }

        if (googleTokenVerifierPort == null) {
            throw new UnauthorizedException("INVALID_GOOGLE_TOKEN", "auth.google.invalid_token", null, "Google Token Verifier is not available");
        }

        // BR-01: Verify token signature, aud, iss, exp
        GoogleUserInfo googleUser = googleTokenVerifierPort.verify(request.idToken());

        // BR-02: Only accept email_verified = true
        if (!googleUser.emailVerified()) {
            throw new UnauthorizedException("GOOGLE_EMAIL_NOT_VERIFIED", "auth.google.email_not_verified", null, "Google email is not verified");
        }

        // BR-03 & BR-04: Match by googleSub/email or auto-create active MEMBER account
        User user = resolveOrCreateGoogleUser(googleUser, "active", false);

        // Existing staff accounts retain the database role; new Google accounts are always Members.
        ensureGoogleOtpAccountAllowed(user);

        // BR-06: Locked / inactive / deleted accounts rejected
        if (user.getDeletedAt() != null || !"active".equalsIgnoreCase(user.getStatus())) {
            throw new ForbiddenException("ACCOUNT_INACTIVE", "auth.account.inactive", null, "Account is deactivated or locked");
        }

        // BR-07: Issue standard JWT token and update last login time
        user.setLastLoginAt(LocalDateTime.now(clock));
        user.setUpdatedAt(LocalDateTime.now(clock));
        userRepository.save(user);

        return issueTokenForUser(user);
    }

    private OtpService.Status verifyOtpChallenge(String target, String otpCode) {
        OtpService.Status status = otpService.verifyOtp(target, otpCode);
        return switch (status.result()) {
            case EXPIRED_OR_NOT_FOUND -> throw new BadRequestException("OTP_EXPIRED", "auth.otp.expired", null, null);
            case MAX_ATTEMPTS_EXCEEDED -> throw new TooManyRequestsException("MAX_ATTEMPTS", "auth.otp.max_attempts", null, null);
            case INVALID_CODE -> throw new BadRequestException("INVALID_OTP", "auth.otp.invalid",
                    new Object[]{status.remainingAttempts()}, null);
            case SUCCESS -> status;
        };
    }

    private void ensureGoogleOtpAccountAllowed(User user) {
        if (user.getRole() == null || !java.util.Set.of("MEMBER", "COACH", "RECEPTIONIST")
                .contains(user.getRole().getCode().toUpperCase(Locale.ROOT))) {
            throw new ForbiddenException("STAFF_GOOGLE_NOT_ALLOWED", "auth.google.staff_not_allowed", null, null);
        }
        String status = user.getStatus();
        boolean allowedStatus = "active".equalsIgnoreCase(status)
                || ("MEMBER".equalsIgnoreCase(user.getRole().getCode()) && "inactive".equalsIgnoreCase(status));
        if (user.getDeletedAt() != null || !allowedStatus) {
            throw new ForbiddenException("ACCOUNT_INACTIVE", "auth.account.inactive", null, null);
        }
    }

    private AuthTokenResponse issueTokenForUser(User user) {
        String username = user.getUsername() == null ? user.getEmail() : user.getUsername();
        String role = user.getRole().getCode();
        return new AuthTokenResponse(jwtService.generateToken(user.getId(), username, role), username, role);
    }

    private boolean isValidEmail(String rawEmail) {
        if (rawEmail == null) {
            return false;
        }
        String trimmed = rawEmail.trim();
        return !trimmed.isEmpty() && trimmed.length() <= 150 && trimmed.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    }

    private String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
