package com.swp391.scms.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.users.dto.UserCreateDto;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.users.mapper.UserMapper;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock UserRepository userRepository;
    @Mock RoleRepository roleRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock UserMapper userMapper;
    @Mock ReceptionistRepository receptionistRepository;
    @Mock com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptionRepository;

    private Clock clock = Clock.systemUTC();
    private UserService service;

    @Test
    void lastActiveAdminCannotBeLockedDeletedOrDemoted() {
        var role = new com.swp391.scms.users.entity.Role();
        role.setCode("ADMIN");
        var admin = new User();
        admin.setId(1L);
        admin.setRole(role);
        admin.setStatus("active");
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(admin));
        var otherRole = new com.swp391.scms.users.entity.Role();
        otherRole.setCode("CENTER_MANAGER");
        when(roleRepository.findById(2L)).thenReturn(Optional.of(otherRole));
        var update = new com.swp391.scms.users.dto.UserUpdateDto();
        update.setRoleId(2L);
        assertThrows(ConflictException.class, () -> service.setStatus(1L, "locked"));
        assertThrows(ConflictException.class, () -> service.deleteUser(1L));
        assertThrows(ConflictException.class, () -> service.updateUser(1L, update));
        assertEquals("active", admin.getStatus());
        assertEquals("ADMIN", admin.getRole().getCode());
        org.mockito.Mockito.verify(userRepository, never()).save(any());
    }

    @Test
    void adminCanBeLockedWhenAnotherActiveAdminRemains() {
        var role = new com.swp391.scms.users.entity.Role();
        role.setCode("ADMIN");
        var admin = new User();
        admin.setRole(role);
        admin.setStatus("active");
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(admin));
        when(userRepository.countByRole_CodeAndDeletedAtIsNullAndStatus("ADMIN", "active")).thenReturn(2L);
        service.setStatus(1L, "locked");
        verify(roleRepository).lockByCode("ADMIN");
        assertEquals("locked", admin.getStatus());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.NullAndEmptySource
    @org.junit.jupiter.params.provider.ValueSource(strings = {"ADMIN", "CENTER_MANAGER", "MANAGER", "MEMBER"})
    void staffProvisioningRejectsEveryOtherRole(String code) {
        var request = new com.swp391.scms.users.dto.StaffAccountCreateDto("Staff", "staff@gmail.com", null, "Secret123", "other", code);
        assertThrows(BadRequestException.class, () -> service.createStaffAccount(request));
        org.mockito.Mockito.verifyNoInteractions(userRepository, roleRepository);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void staffProvisioningResolvesOnlyAllowedRoleAndSavesItsProfile(String code) {
        var role = new com.swp391.scms.users.entity.Role();
        role.setId(3L);
        role.setCode(code);
        when(roleRepository.findByCode(code)).thenReturn(Optional.of(role));
        when(roleRepository.findById(3L)).thenReturn(Optional.of(role));
        when(userRepository.saveAndFlush(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(31L);
            return user;
        });
        service.createStaffAccount(new com.swp391.scms.users.dto.StaffAccountCreateDto("Staff", "staff@gmail.com", null, "Secret123", "other", code));
        var saved = org.mockito.ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals(code, saved.getValue().getRole().getCode());
        assertEquals(null, saved.getValue().getMember());
        assertNotNull("COACH".equals(code) ? saved.getValue().getCoach() : saved.getValue().getReceptionist());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void provisioningCreatesStaffProfile(String code) {
        var role = new com.swp391.scms.users.entity.Role();
        role.setId(2L);
        role.setCode(code);
        var dto = new UserCreateDto();
        dto.setEmail(" Staff@gmail.com ");
        dto.setFullName(" Staff ");
        dto.setPassword("secret123");
        dto.setRoleId(2L);
        when(roleRepository.findById(2L)).thenReturn(Optional.of(role));
        when(userRepository.saveAndFlush(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            user.setId(12L);
            return user;
        });
        var captured = org.mockito.ArgumentCaptor.forClass(User.class);

        service.createUser(dto);

        verify(userRepository).save(captured.capture());
        User created = captured.getValue();
        assertEquals("staff@gmail.com", created.getEmail());
        assertEquals(code, created.getRole().getCode());
        if ("COACH".equals(code)) {
            assertNotNull(created.getCoach());
            assertEquals(created, created.getCoach().getUser());
        } else {
            assertNotNull(created.getReceptionist());
            assertEquals(created, created.getReceptionist().getUser());
        }
    }

    @BeforeEach
    void setUp() {
        service = new UserService(userRepository, roleRepository, passwordEncoder, userMapper, receptionistRepository, subscriptionRepository, clock);
    }

    @Test
    void createUserRejectsDuplicateEmail() {
        UserCreateDto dto = new UserCreateDto();
        dto.setEmail("a@b.com");
        when(userRepository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(new User()));

        assertThrows(ConflictException.class, () -> service.createUser(dto));
        verify(userRepository, never()).save(any());
    }

    @Test
    void createUserRejectsDuplicatePhone() {
        UserCreateDto dto = new UserCreateDto();
        dto.setEmail("a@b.com");
        dto.setPhone("0900000000");
        when(userRepository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.empty());
        when(userRepository.findByPhone("0900000000")).thenReturn(Optional.of(new User()));

        assertThrows(ConflictException.class, () -> service.createUser(dto));
    }

    @Test
    void setStatusLocksAccount() {
        User user = new User();
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        service.setStatus(1L, "locked");

        assertEquals("locked", user.getStatus());
    }

    @Test
    void setStatusRejectsUnknownStatus() {
        assertThrows(BadRequestException.class, () -> service.setStatus(1L, "banned"));
    }

    @Test
    void deleteUserIsSoftDelete() {
        User user = new User();
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(user));

        service.deleteUser(1L);

        assertNotNull(user.getDeletedAt());
        verify(userRepository, never()).delete(any());
    }

    @Test
    void getUserByIdHidesDeletedUsers() {
        when(userRepository.findByIdAndDeletedAtIsNull(9L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.getUserById(9L));
    }

    @Test
    void findActiveUserThrowsWhenMissing() {
        when(userRepository.findByIdAndDeletedAtIsNull(99L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.setStatus(99L, "locked"));
    }

    @Test
    void updateReceptionistShiftUpdatesShiftForReceptionist() {
        User user = new User();
        user.setId(5L);
        com.swp391.scms.users.entity.Role role = new com.swp391.scms.users.entity.Role();
        role.setCode("RECEPTIONIST");
        user.setRole(role);
        when(userRepository.findByIdAndDeletedAtIsNull(5L)).thenReturn(Optional.of(user));
        when(receptionistRepository.findById(5L)).thenReturn(Optional.empty());

        service.updateReceptionistShift(5L, new com.swp391.scms.users.dto.ReceptionistProfileUpdateDto("Morning"));

        verify(receptionistRepository).save(any());
    }

    @Test
    void updateReceptionistShiftRejectsNonReceptionistRole() {
        User user = new User();
        user.setId(5L);
        com.swp391.scms.users.entity.Role role = new com.swp391.scms.users.entity.Role();
        role.setCode("MEMBER");
        user.setRole(role);
        when(userRepository.findByIdAndDeletedAtIsNull(5L)).thenReturn(Optional.of(user));

        assertThrows(BadRequestException.class, () ->
                service.updateReceptionistShift(5L, new com.swp391.scms.users.dto.ReceptionistProfileUpdateDto("Morning")));
    }

    @Test
    void cleanupInactiveUsersDeletesInactiveUsersExceptFrozenSubscriptions() {
        // User 1: Inactive > 6 months, not frozen -> SHOULD BE DELETED
        User user1 = new User();
        user1.setId(10L);
        com.swp391.scms.users.entity.Role roleMember = new com.swp391.scms.users.entity.Role();
        roleMember.setCode("MEMBER");
        user1.setRole(roleMember);
        user1.setLastLoginAt(java.time.LocalDateTime.now().minusMonths(7));

        // User 2: Inactive > 6 months, but has FROZEN subscription -> MUST BE PRESERVED
        User user2 = new User();
        user2.setId(20L);
        user2.setRole(roleMember);
        user2.setLastLoginAt(java.time.LocalDateTime.now().minusMonths(8));

        // User 3: CENTER_MANAGER inactive > 6 months -> MUST BE PRESERVED
        User user3 = new User();
        user3.setId(30L);
        com.swp391.scms.users.entity.Role roleAdmin = new com.swp391.scms.users.entity.Role();
        roleAdmin.setCode("CENTER_MANAGER");
        user3.setRole(roleAdmin);
        user3.setLastLoginAt(java.time.LocalDateTime.now().minusMonths(9));

        when(userRepository.findAllByDeletedAtIsNullOrderByIdAsc()).thenReturn(java.util.List.of(user1, user2, user3));
        when(subscriptionRepository.existsEntitlementEndingOnOrAfter(org.mockito.ArgumentMatchers.eq(10L), any())).thenReturn(false);
        when(subscriptionRepository.existsEntitlementEndingOnOrAfter(org.mockito.ArgumentMatchers.eq(20L), any())).thenReturn(true);

        int deletedCount = service.cleanupInactiveUsers();

        assertEquals(1, deletedCount);
        assertNotNull(user1.getDeletedAt());
        org.junit.jupiter.api.Assertions.assertNull(user2.getDeletedAt());
        org.junit.jupiter.api.Assertions.assertNull(user3.getDeletedAt());
        verify(userRepository).save(user1);
        verify(userRepository, never()).save(user2);
        verify(userRepository, never()).save(user3);
    }

    @Test
    void cleanupKeepsStaffAndMembersWhoScanInOrPayWithoutSigningIn() {
        var memberRole = new com.swp391.scms.users.entity.Role();
        memberRole.setCode("MEMBER");
        var coachRole = new com.swp391.scms.users.entity.Role();
        coachRole.setCode("COACH");
        User gateOnly = new User();
        gateOnly.setId(40L);
        gateOnly.setRole(memberRole);
        gateOnly.setLastLoginAt(java.time.LocalDateTime.now().minusYears(1));
        User payer = new User();
        payer.setId(50L);
        payer.setRole(memberRole);
        payer.setLastLoginAt(java.time.LocalDateTime.now().minusYears(1));
        User coach = new User();
        coach.setId(60L);
        coach.setRole(coachRole);
        coach.setLastLoginAt(java.time.LocalDateTime.now().minusYears(1));
        var checkins = org.mockito.Mockito.mock(com.swp391.scms.attendance.repository.CenterCheckinRepository.class);
        var payments = org.mockito.Mockito.mock(com.swp391.scms.finance.repository.PaymentRepository.class);
        service.checkinRepository = checkins;
        service.paymentRepository = payments;
        when(userRepository.findAllByDeletedAtIsNullOrderByIdAsc()).thenReturn(java.util.List.of(gateOnly, payer, coach));
        when(checkins.existsByMemberUserIdAndCheckInTimeGreaterThanEqual(org.mockito.ArgumentMatchers.eq(40L), any())).thenReturn(true);
        when(payments.existsByMemberUserIdAndPaidAtGreaterThanEqual(org.mockito.ArgumentMatchers.eq(50L), any())).thenReturn(true);

        assertEquals(0, service.cleanupInactiveUsers());
        org.junit.jupiter.api.Assertions.assertNull(gateOnly.getDeletedAt());
        org.junit.jupiter.api.Assertions.assertNull(payer.getDeletedAt());
        org.junit.jupiter.api.Assertions.assertNull(coach.getDeletedAt());
        verify(userRepository, never()).save(any());
    }

    @Test
    void deletingMemberWithMembershipOrCoachWithClassesIsBlocked() {
        var memberRole = new com.swp391.scms.users.entity.Role();
        memberRole.setCode("MEMBER");
        User member = new User();
        member.setId(5L);
        member.setRole(memberRole);
        when(userRepository.findByIdAndDeletedAtIsNull(5L)).thenReturn(Optional.of(member));
        when(subscriptionRepository.existsByMemberUserIdAndStatusInAndEndDateGreaterThanEqual(
                org.mockito.ArgumentMatchers.eq(5L), any(), any())).thenReturn(true);
        var memberError = assertThrows(ConflictException.class, () -> service.deleteUser(5L));
        assertEquals("users.blocked.membership", memberError.getMessageKey());

        var coachRole = new com.swp391.scms.users.entity.Role();
        coachRole.setCode("COACH");
        User coach = new User();
        coach.setId(6L);
        coach.setRole(coachRole);
        when(userRepository.findByIdAndDeletedAtIsNull(6L)).thenReturn(Optional.of(coach));
        var sessions = org.mockito.Mockito.mock(com.swp391.scms.scheduling.repository.ClassSessionRepository.class);
        service.classSessionRepository = sessions;
        when(sessions.existsScheduledForCoachFrom(org.mockito.ArgumentMatchers.eq(6L), any())).thenReturn(true);
        var coachError = assertThrows(ConflictException.class, () -> service.deleteUser(6L));
        assertEquals("users.blocked.coach_classes", coachError.getMessageKey());

        org.junit.jupiter.api.Assertions.assertNull(member.getDeletedAt());
        org.junit.jupiter.api.Assertions.assertNull(coach.getDeletedAt());
        verify(userRepository, never()).save(any());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"ADMIN", "CENTER_MANAGER", "MEMBER"})
    void managerStatusChangeRejectsNonStaffTargets(String code) {
        var role = new com.swp391.scms.users.entity.Role();
        role.setCode(code);
        var target = new User();
        target.setRole(role);
        target.setStatus("active");
        when(userRepository.findByIdAndDeletedAtIsNull(7L)).thenReturn(Optional.of(target));
        assertThrows(BadRequestException.class, () -> service.setStaffStatus(7L, "locked"));
        assertEquals("active", target.getStatus());
        verify(userRepository, never()).save(any());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void managerCanLockAndUnlockStaff(String code) {
        var role = new com.swp391.scms.users.entity.Role();
        role.setCode(code);
        var target = new User();
        target.setRole(role);
        target.setStatus("active");
        when(userRepository.findByIdAndDeletedAtIsNull(7L)).thenReturn(Optional.of(target));
        when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        service.setStaffStatus(7L, "locked");
        assertEquals("locked", target.getStatus());
        service.setStaffStatus(7L, "active");
        assertEquals("active", target.getStatus());
    }
}
