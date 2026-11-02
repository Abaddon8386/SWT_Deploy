package com.swp391.scms.auth;

import com.swp391.scms.auth.dto.AuthSessionResponse;
import com.swp391.scms.auth.dto.AuthTokenResponse;
import com.swp391.scms.auth.dto.GoogleLoginRequest;
import com.swp391.scms.auth.dto.GoogleOAuthCallbackRequest;
import com.swp391.scms.auth.dto.GoogleOAuthResult;
import com.swp391.scms.auth.dto.GoogleOAuthResponse;
import com.swp391.scms.auth.dto.GoogleHandoffRequest;
import com.swp391.scms.auth.dto.RegistrationResponse;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

@Tag(name = "Authentication", description = "Đăng ký tài khoản, đăng nhập JWT, Google OAuth và xác thực mã OTP")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final boolean debugOtpEnabled;
    private final MessageService messageService;
    private final GoogleOAuthRedirectService googleOAuthRedirectService;

    public AuthController(AuthService authService, boolean debugOtpEnabled) {
        this(authService, debugOtpEnabled, null, null);
    }

    public AuthController(AuthService authService, boolean debugOtpEnabled, MessageService messageService) {
        this(authService, debugOtpEnabled, messageService, null);
    }

    @Autowired
    public AuthController(AuthService authService,
                          @Value("${app.auth.debug-otp-enabled:false}") boolean debugOtpEnabled,
                          MessageService messageService, GoogleOAuthRedirectService googleOAuthRedirectService) {
        this.authService = authService;
        this.debugOtpEnabled = debugOtpEnabled;
        this.messageService = messageService;
        this.googleOAuthRedirectService = googleOAuthRedirectService;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    @Operation(summary = "Đăng nhập hệ thống", description = "Xác thực tài khoản và trả về JWT Token cùng vai trò người dùng")
    @PostMapping("/login")
    public ApiResponse<AuthTokenResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(msg("auth.login.success"), authService.login(request));
    }

    @Operation(summary = "Xác minh phiên hiện tại",
            description = "Trả về tên đăng nhập và vai trò hiện hành trong cơ sở dữ liệu để frontend đồng bộ phiên sau khi Admin đổi vai trò")
    @GetMapping("/me")
    public ApiResponse<AuthSessionResponse> me(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ApiResponse.ok(msg("auth.me.success"), new AuthSessionResponse(principal.username(), principal.role()));
    }

    @Operation(summary = "Đăng ký tài khoản", description = "Tạo tài khoản hội viên mới và gửi mã kích hoạt")
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<RegistrationResponse>> register(@Valid @RequestBody RegisterRequest request) {
        RegistrationResponse registered = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(registered.message(), registered));
    }

    @Operation(summary = "Gửi mã OTP", description = "Gửi mã OTP 6 chữ số đến email hoặc số điện thoại")
    @PostMapping("/send-otp")
    public ApiResponse<Map<String, Object>> sendOtp(@Valid @RequestBody OtpRequest request) {
        String target = request.target();
        if (target == null || target.isBlank()) {
            throw new BadRequestException("MISSING_TARGET", "auth.otp.missing_target", null, null);
        }
        String code = authService.generateOtp(target);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("destination", target);
        data.put("expiresInMinutes", 5);
        if (debugOtpEnabled) {
            data.put("debugOtp", code);
        }
        return ApiResponse.ok(msg("auth.otp.sent"), data);
    }

    @Operation(summary = "Xác thực mã OTP", description = "Xác thực mã OTP và kích hoạt tài khoản hội viên")
    @PostMapping("/verify-otp")
    public ApiResponse<Map<String, Object>> verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        authService.verifyOtp(request);
        return ApiResponse.ok(msg("auth.otp.verified"), Map.of("target", request.target(), "isVerified", true));
    }

    @Operation(summary = "Gửi mã OTP đăng nhập Google", description = "Tạo tài khoản nếu chưa có và gửi mã OTP xác nhận về Gmail")
    @PostMapping("/google/send-otp")
    public ApiResponse<Map<String, Object>> sendGoogleOtp(@Valid @RequestBody GoogleOtpRequest request) {
        String email = request.email() == null ? "" : request.email().trim();
        if (email.isBlank()) {
            throw new BadRequestException("MISSING_EMAIL", "auth.otp.missing_target", null, null);
        }
        String code = authService.requestGoogleOtp(email);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("email", email);
        data.put("message", msg("auth.google.otp.sent", email));
        data.put("expiresInMinutes", 5);
        if (debugOtpEnabled) {
            data.put("debugOtp", code);
        }
        return ApiResponse.ok(msg("auth.otp.sent"), data);
    }

    @Operation(summary = "Authenticate Google members or request activation OTP (SCRUM-89)",
            description = "Active members receive authentication immediately; pending members receive activation OTP. Authorization codes use the state-protected redirect callback.")
    @PostMapping("/google/oauth-callback")
    public ApiResponse<GoogleOAuthResponse> handleGoogleOAuthCallback(@Valid @RequestBody GoogleOAuthCallbackRequest request) {
        GoogleOAuthResult result = authService.authenticateGoogle(request);
        boolean requiresOtp = result.authentication() == null;
        String message = requiresOtp ? msg("auth.google.otp.sent", result.email()) : msg("auth.login.success");
        return ApiResponse.ok(message, new GoogleOAuthResponse(requiresOtp, result.email(), result.authentication(),
                message, requiresOtp ? 5 : null, requiresOtp && debugOtpEnabled ? result.otpCode() : null));
    }

    @PostMapping("/google/handoff")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> redeemGoogleHandoff(@Valid @RequestBody GoogleHandoffRequest request) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.ok(msg("auth.login.success"), googleOAuthRedirectService.redeem(request.code(), request.verifier())));
    }

    @GetMapping("/google/authorize")
    public ResponseEntity<Void> authorizeGoogleOAuth(
            @RequestParam(value = "redirect_uri", required = false) String redirectUri,
            @RequestParam("code_challenge") String challenge) {
        return redirect(googleOAuthRedirectService.entry(redirectUri, challenge));
    }

    @GetMapping("/google/authorize/start")
    public ResponseEntity<Void> startGoogleOAuth(HttpServletRequest request, @RequestParam("code_challenge") String challenge) {
        return redirect(googleOAuthRedirectService.authorize(request.getSession(true), challenge));
    }

    @GetMapping("/google/callback")
    public ResponseEntity<Void> googleOAuthRedirectCallback(HttpServletRequest request,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "error", required = false) String error,
            @RequestParam(value = "redirect_uri", required = false) String redirectUri) {
        return redirect(googleOAuthRedirectService.complete(request.getSession(false), state, code, error, redirectUri));
    }

    private ResponseEntity<Void> redirect(URI location) {
        return ResponseEntity.status(HttpStatus.FOUND).cacheControl(org.springframework.http.CacheControl.noStore()).location(location).build();
    }

    @Operation(summary = "Xác thực mã OTP Google và đăng nhập", description = "Xác thực mã OTP gửi về Gmail, kích hoạt tài khoản và trả về JWT Token")
    @PostMapping("/google/verify-otp")
    public ApiResponse<AuthTokenResponse> verifyGoogleOtp(@Valid @RequestBody GoogleVerifyOtpRequest request) {
        String email = request.email() == null ? "" : request.email().trim();
        String otpCode = request.otpCode() == null ? "" : request.otpCode().trim();
        if (email.isBlank() || otpCode.isBlank()) {
            throw new BadRequestException("MISSING_PARAMS", "auth.otp.missing_target", null, null);
        }
        AuthTokenResponse response = authService.verifyGoogleOtp(email, otpCode);
        return ApiResponse.ok(msg("auth.login.success"), response);
    }

    @Operation(summary = "Đăng nhập Google bằng ID Token (SCRUM-89)", description = "Xác thực Google ID Token, tự động liên kết hoặc tạo tài khoản MEMBER và cấp JWT")
    @PostMapping("/google")
    public ApiResponse<AuthTokenResponse> loginWithGoogle(@Valid @RequestBody GoogleLoginRequest request) {
        AuthTokenResponse response = authService.loginWithGoogle(request);
        return ApiResponse.ok(msg("auth.login.success"), response);
    }
}
