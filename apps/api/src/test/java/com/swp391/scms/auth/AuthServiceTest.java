package com.swp391.scms.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.TooManyRequestsException;
import com.swp391.scms.security.JwtService;
import com.swp391.scms.users.RoleRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RoleRepository roleRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock OtpService otpService;
    @Mock OtpDeliveryPort otpDeliveryPort;
    private AuthService service;

    @BeforeEach
    void setUp() {
        service = new AuthService(userRepository, roleRepository, passwordEncoder, jwtService, otpService,
                otpDeliveryPort, Clock.systemUTC(), false);
    }

    private User pendingUser() {
        User user = new User();
        user.setEmail("a@b.com");
        user.setStatus("inactive");
        return user;
    }

    @Test
    void registerRejectsDuplicateEmail() {
        when(userRepository.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
        when(userRepository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(new User()));

        assertThrows(ConflictException.class,
                () -> service.register(new RegisterRequest("newuser", "secret1", "a@b.com", null)));
        verify(userRepository, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void registerRejectsDuplicateUsername() {
        when(userRepository.findByUsernameIgnoreCase("taken")).thenReturn(Optional.of(new User()));

        assertThrows(ConflictException.class,
                () -> service.register(new RegisterRequest("taken", "secret1", "x@y.com", null)));
    }

    @Test
    void registerRejectsDuplicatePhone() {
        when(userRepository.findByUsernameIgnoreCase("newuser")).thenReturn(Optional.empty());
        when(userRepository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.empty());
        when(userRepository.findByPhone("0912345678")).thenReturn(Optional.of(new User()));

        assertThrows(ConflictException.class,
                () -> service.register(new RegisterRequest("newuser", "secret1", "a@b.com", "0912345678", null)));
        verify(userRepository, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void verifyOtpActivatesPendingAccount() {
        User user = pendingUser();
        when(otpService.verifyOtp("a@b.com", "123456"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.SUCCESS, 0));
        when(userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull("a@b.com")).thenReturn(Optional.of(user));

        service.verifyOtp(new VerifyOtpRequest("a@b.com", "123456"));

        assertEquals("active", user.getStatus());
        verify(userRepository).save(user);
    }

    @Test
    void verifyOtpMapsExpiredToBadRequest() {
        when(otpService.verifyOtp("a@b.com", "123456"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.EXPIRED_OR_NOT_FOUND, 0));

        assertThrows(BadRequestException.class, () -> service.verifyOtp(new VerifyOtpRequest("a@b.com", "123456")));
    }

    @Test
    void verifyOtpMapsInvalidCodeToBadRequest() {
        when(otpService.verifyOtp("a@b.com", "000000"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.INVALID_CODE, 2));

        assertThrows(BadRequestException.class, () -> service.verifyOtp(new VerifyOtpRequest("a@b.com", "000000")));
    }

    @Test
    void verifyOtpMapsLockoutToTooManyRequests() {
        when(otpService.verifyOtp("a@b.com", "000000"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.MAX_ATTEMPTS_EXCEEDED, 0));

        assertThrows(TooManyRequestsException.class, () -> service.verifyOtp(new VerifyOtpRequest("a@b.com", "000000")));
    }

    @Test
    void generateOtpRejectsAccountThatIsNotPending() {
        User active = pendingUser();
        active.setStatus("active");
        when(userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull("a@b.com")).thenReturn(Optional.of(active));

        assertThrows(BadRequestException.class, () -> service.generateOtp("a@b.com"));
    }

    @Test
    void requestGoogleOtpCreatesPendingMemberWhenEmailDoesNotExist() {
        Role memberRole = new Role();
        memberRole.setCode("MEMBER");
        when(userRepository.findByEmailIgnoreCase("new@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.findByUsernameIgnoreCase("new")).thenReturn(Optional.empty());
        when(roleRepository.findByCodeIgnoreCase("MEMBER")).thenReturn(Optional.of(memberRole));
        when(passwordEncoder.encode(any())).thenReturn("hashed");
        when(otpService.generateOtp("new@gmail.com")).thenReturn("123456");

        String code = service.requestGoogleOtp("New@gmail.com");

        assertEquals("123456", code);
        verify(userRepository).saveAndFlush(any(User.class));
        verify(otpDeliveryPort).send("new@gmail.com", "123456");
    }

    @Test
    void requestGoogleOtpRejectsLockedOrDeletedAccount() {
        User lockedUser = pendingUser();
        lockedUser.setStatus("locked");
        when(userRepository.findByEmailIgnoreCase("locked@gmail.com")).thenReturn(Optional.of(lockedUser));

        assertThrows(ForbiddenException.class, () -> service.requestGoogleOtp("locked@gmail.com"));

        User deletedUser = pendingUser();
        deletedUser.setDeletedAt(LocalDateTime.now());
        when(userRepository.findByEmailIgnoreCase("deleted@gmail.com")).thenReturn(Optional.of(deletedUser));

        assertThrows(ForbiddenException.class, () -> service.requestGoogleOtp("deleted@gmail.com"));
    }

    @Test
    void verifyGoogleOtpActivatesPendingUserAndIssuesJwt() {
        User user = pendingUser();
        user.setId(42L);
        user.setUsername("member42");
        user.setEmail("member42@gmail.com");
        Role role = new Role();
        role.setCode("MEMBER");
        user.setRole(role);

        when(otpService.verifyOtp("member42@gmail.com", "123456"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.SUCCESS, 0));
        when(userRepository.findByEmailIgnoreCase("member42@gmail.com")).thenReturn(Optional.of(user));
        when(jwtService.generateToken(42L, "member42", "MEMBER")).thenReturn("jwt-42");

        var res = service.verifyGoogleOtp("member42@gmail.com", "123456");

        assertEquals("active", user.getStatus());
        assertEquals("jwt-42", res.token());
        assertEquals("MEMBER", res.role());
        verify(userRepository).save(user);
    }

    @Test
    void verifyGoogleOtpRejectsLockedAccountWithoutReactivatingIt() {
        User locked = pendingUser();
        locked.setStatus("locked");
        when(otpService.verifyOtp("locked@gmail.com", "123456"))
                .thenReturn(new OtpService.Status(OtpService.VerifyResult.SUCCESS, 0));
        when(userRepository.findByEmailIgnoreCase("locked@gmail.com")).thenReturn(Optional.of(locked));

        assertThrows(ForbiddenException.class, () -> service.verifyGoogleOtp("locked@gmail.com", "123456"));
        assertEquals("locked", locked.getStatus());
        verify(userRepository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void requestGoogleOtpDefersSmtpDeliveryUntilAfterCommitAndInvalidatesOnFailure() {
        Role memberRole = new Role();
        memberRole.setCode("MEMBER");
        when(userRepository.findByEmailIgnoreCase("slow@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.findByUsernameIgnoreCase("slow")).thenReturn(Optional.empty());
        when(roleRepository.findByCodeIgnoreCase("MEMBER")).thenReturn(Optional.of(memberRole));
        when(passwordEncoder.encode(any())).thenReturn("hashed");
        when(otpService.generateOtp("slow@gmail.com")).thenReturn("654321");
        org.mockito.Mockito.doThrow(new RuntimeException("SMTP timeout"))
                .when(otpDeliveryPort).send("slow@gmail.com", "654321");

        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            String code = service.requestGoogleOtp("slow@gmail.com");
            assertEquals("654321", code);
            verify(otpDeliveryPort, org.mockito.Mockito.never()).send(any(), any());

            var syncs = org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations();
            var failure = org.junit.jupiter.api.Assertions.assertThrows(
                    com.swp391.scms.common.exception.ServiceUnavailableException.class,
                    () -> syncs.forEach(org.springframework.transaction.support.TransactionSynchronization::afterCommit));
            assertEquals("OTP_DELIVERY_FAILED", failure.getErrorCode());
            verify(otpDeliveryPort).send("slow@gmail.com", "654321");
            verify(otpService).invalidate("slow@gmail.com");
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
        }
    }
}