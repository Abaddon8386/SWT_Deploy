package com.swp391.scms.users;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.users.dto.UserCreateDto;
import com.swp391.scms.users.dto.UserDto;
import com.swp391.scms.users.dto.UserUpdateDto;
import com.swp391.scms.users.mapper.UserMapper;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
public class UserService {
    @Transactional(readOnly = true)
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('CENTER_MANAGER', 'ADMIN')")
    public List<UserDto> getStaffAccounts() {
        return userRepository.findAllByDeletedAtIsNullAndRole_CodeInOrderByIdAsc(List.of("COACH", "RECEPTIONIST"))
                .stream().map(userMapper::toDto).toList();
    }

    @Transactional
    @Audited(action = "STAFF_ACCOUNT_CREATE", entity = "users")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('CENTER_MANAGER', 'ADMIN')")
    public UserDto createStaffAccount(com.swp391.scms.users.dto.StaffAccountCreateDto request) {
        if (request.roleCode() == null || !List.of("COACH", "RECEPTIONIST").contains(request.roleCode())) {
            throw new BadRequestException("INVALID_STAFF_ROLE", "validation.users.staff_role", null, null);
        }
        Role role = roleRepository.findByCode(request.roleCode())
                .orElseThrow(() -> new ResourceNotFoundException("resource.role", request.roleCode()));
        UserCreateDto dto = new UserCreateDto();
        dto.setFullName(request.fullName());
        dto.setEmail(request.email());
        dto.setPhone(request.phone());
        dto.setPassword(request.password());
        dto.setGender(request.gender());
        dto.setRoleId(role.getId());
        return createUser(dto);
    }

    /** Manager-level lock/unlock, limited to the Coach and Receptionist accounts a manager provisions. */
    @Transactional
    @Audited(action = "STAFF_ACCOUNT_STATUS_CHANGE", entity = "users")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('CENTER_MANAGER', 'ADMIN')")
    public UserDto setStaffStatus(Long id, String status) {
        User user = findActiveUser(id);
        String code = user.getRole() == null ? "" : user.getRole().getCode().toUpperCase(Locale.ROOT);
        if (!List.of("COACH", "RECEPTIONIST").contains(code)) {
            throw new BadRequestException("INVALID_STAFF_ROLE", "validation.users.staff_role", null, null);
        }
        return setStatus(id, status);
    }

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final ReceptionistRepository receptionistRepository;
    private final com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptionRepository;
    private final Clock clock;

    /** Roles whose accounts are managed by people, never by the inactivity sweep. */
    private static final java.util.Set<String> NEVER_AUTO_DELETED =
            java.util.Set.of("ADMIN", "CENTER_MANAGER", "MANAGER", "COACH", "RECEPTIONIST", "STAFF");

    // Optional activity sources; a member who scans in at the gate or pays at the desk is active
    // even if they never sign in to the app.
    @Autowired(required = false)
    com.swp391.scms.attendance.repository.CenterCheckinRepository checkinRepository;

    @Autowired(required = false)
    com.swp391.scms.finance.repository.PaymentRepository paymentRepository;

    // Commitment sources checked before an account is removed or changes role.
    @Autowired(required = false)
    com.swp391.scms.scheduling.repository.ClassEnrollmentRepository classEnrollmentRepository;

    @Autowired(required = false)
    com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookingRepository;

    @Autowired(required = false)
    com.swp391.scms.scheduling.repository.ClassSessionRepository classSessionRepository;

    @Autowired(required = false)
    com.swp391.scms.coaching.repository.CoachBookingRepository coachBookingRepository;

    @Autowired(required = false)
    com.swp391.scms.courts.repository.CourtBookingRepository courtBookingRepository;

    public UserService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, UserMapper userMapper,
                       ReceptionistRepository receptionistRepository) {
        this(userRepository, roleRepository, passwordEncoder, userMapper, receptionistRepository, null, Clock.systemDefaultZone());
    }

    public UserService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, UserMapper userMapper,
                       ReceptionistRepository receptionistRepository,
                       com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptionRepository) {
        this(userRepository, roleRepository, passwordEncoder, userMapper, receptionistRepository, subscriptionRepository, Clock.systemDefaultZone());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public UserService(UserRepository userRepository, RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder, UserMapper userMapper,
                       ReceptionistRepository receptionistRepository,
                       @org.springframework.beans.factory.annotation.Autowired(required = false)
                       com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptionRepository,
                       @org.springframework.beans.factory.annotation.Autowired(required = false)
                       Clock clock) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.userMapper = userMapper;
        this.receptionistRepository = receptionistRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
    }

    @Transactional(readOnly = true)
    public List<UserDto> getAllUsers() {
        return userRepository.findAllByDeletedAtIsNullOrderByIdAsc().stream()
                .map(u -> {
                    UserDto dto = userMapper.toDto(u);
                    if (subscriptionRepository != null && u.getRole() != null && "MEMBER".equalsIgnoreCase(u.getRole().getCode())) {
                        dto.setSubscriptionFrozen(subscriptionRepository.existsByMemberUserIdAndStatus(u.getId(), "frozen"));
                    }
                    return dto;
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public UserDto getUserById(Long id) {
        User u = findActiveUser(id);
        UserDto dto = userMapper.toDto(u);
        if (subscriptionRepository != null && u.getRole() != null && "MEMBER".equalsIgnoreCase(u.getRole().getCode())) {
            dto.setSubscriptionFrozen(subscriptionRepository.existsByMemberUserIdAndStatus(u.getId(), "frozen"));
        }
        return dto;
    }

    @Transactional
    @Audited(action = "USER_CREATE", entity = "users")
    public UserDto createUser(UserCreateDto dto) {
        if (userRepository.findByEmailIgnoreCase(dto.getEmail().trim()).isPresent()) {
            throw new ConflictException("EMAIL_EXISTS", "users.email_exists", null, null);
        }
        if (dto.getPhone() != null && !dto.getPhone().isBlank() && userRepository.findByPhone(dto.getPhone().trim()).isPresent()) {
            throw new ConflictException("PHONE_EXISTS", "users.phone_exists", null, null);
        }

        Role role = findRole(dto.getRoleId());

        User user = new User();
        user.setRole(role);
        user.setFullName(dto.getFullName().trim());
        user.setEmail(dto.getEmail().trim().toLowerCase(Locale.ROOT));
        user.setPhone(dto.getPhone() == null || dto.getPhone().isBlank() ? null : dto.getPhone().trim());
        user.setPasswordHash(passwordEncoder.encode(dto.getPassword()));
        user.setGender(dto.getGender() != null && !dto.getGender().isBlank()
                ? dto.getGender().trim().toLowerCase(Locale.ROOT)
                : null);
        user.setAvatarUrl(User.DEFAULT_AVATAR_URL);
        user.setStatus("active");
        user.setCreatedAt(LocalDateTime.now(clock));
        user.setUpdatedAt(LocalDateTime.now(clock));

        User saved = userRepository.saveAndFlush(user);
        initializeStaffProfile(saved);
        if ("MEMBER".equalsIgnoreCase(role.getCode())) {
            Member member = new Member();
            member.setUser(saved);
            member.setMembershipCode("MEM-" + saved.getId());
            member.setJoinDate(LocalDate.now(clock));
            member.setFitnessLevel("beginner");
            saved.setMember(member);
            userRepository.save(saved);
        }
        if (saved.getCoach() != null || saved.getReceptionist() != null) {
            userRepository.save(saved);
        }
        return userMapper.toDto(saved);
    }

    private void initializeStaffProfile(User user) {
        if ("COACH".equalsIgnoreCase(user.getRole().getCode()) && user.getCoach() == null) {
            var coach = new com.swp391.scms.users.entity.Coach();
            coach.setUser(user);
            coach.setHireDate(LocalDate.now(clock));
            user.setCoach(coach);
        }
        if ("RECEPTIONIST".equalsIgnoreCase(user.getRole().getCode()) && user.getReceptionist() == null) {
            var receptionist = new com.swp391.scms.users.entity.Receptionist();
            receptionist.setUser(user);
            receptionist.setHireDate(LocalDate.now(clock));
            user.setReceptionist(receptionist);
        }
    }

    @Transactional
    @Audited(action = "USER_UPDATE", entity = "users")
    public UserDto updateUser(Long id, UserUpdateDto dto) {
        User user = findActiveUser(id);

        if (dto.getFullName() != null) {
            user.setFullName(dto.getFullName().trim());
        }
        if (dto.getPhone() != null) {
            String phone = dto.getPhone().isBlank() ? null : dto.getPhone().trim();
            if (phone != null) {
                userRepository.findByPhone(phone)
                        .filter(existing -> !existing.getId().equals(id))
                        .ifPresent(existing -> { throw new ConflictException("PHONE_EXISTS", "users.phone_exists", null, null); });
            }
            user.setPhone(phone);
        }
        if (dto.getGender() != null && !dto.getGender().isBlank()) {
            user.setGender(dto.getGender().trim().toLowerCase(Locale.ROOT));
        }
        if (dto.getRoleId() != null) {
            Role newRole = findRole(dto.getRoleId());
            if (!"ADMIN".equalsIgnoreCase(newRole.getCode())) {
                protectLastActiveAdmin(user);
            }
            if (user.getRole() == null || !newRole.getCode().equalsIgnoreCase(user.getRole().getCode())) {
                ensureNoOpenCommitments(user);
            }
            user.setRole(newRole);
            initializeStaffProfile(user);
            if ("MEMBER".equalsIgnoreCase(newRole.getCode()) && user.getMember() == null) {
                Member member = new Member();
                member.setUser(user);
                member.setMembershipCode("MEM-" + user.getId());
                member.setJoinDate(LocalDate.now(clock));
                member.setFitnessLevel("beginner");
                user.setMember(member);
            }
        }
        user.setUpdatedAt(LocalDateTime.now(clock));
        return userMapper.toDto(userRepository.save(user));
    }

    @Transactional
    @Audited(action = "USER_DELETE", entity = "users")
    public void deleteUser(Long id) {
        User user = findActiveUser(id);
        protectLastActiveAdmin(user);
        ensureNoOpenCommitments(user);
        LocalDateTime now = LocalDateTime.now(clock);
        user.setDeletedAt(now);
        user.setUpdatedAt(now);
        userRepository.save(user);
    }

    @Transactional
    @Audited(action = "USER_STATUS_CHANGE", entity = "users")
    public UserDto setStatus(Long id, String status) {
        if (!"active".equals(status) && !"locked".equals(status)) {
            throw new BadRequestException("INVALID_USER_STATUS", "users.invalid_status", null, null);
        }
        User user = findActiveUser(id);
        if (!"active".equals(status)) protectLastActiveAdmin(user);
        user.setStatus(status);
        user.setUpdatedAt(LocalDateTime.now(clock));
        return userMapper.toDto(userRepository.save(user));
    }

    /**
     * A member who still holds a membership or upcoming bookings, or a coach who still teaches upcoming classes or
     * 1:1 sessions, keeps their account and role until a manager has settled those first.
     */
    private void ensureNoOpenCommitments(User user) {
        if (user.getRole() == null || user.getId() == null) return;
        String role = user.getRole().getCode().toUpperCase(Locale.ROOT);
        Long id = user.getId();
        LocalDate today = LocalDate.now(clock);
        if ("MEMBER".equals(role)) {
            if (subscriptionRepository != null && subscriptionRepository.existsByMemberUserIdAndStatusInAndEndDateGreaterThanEqual(
                    id, List.of("active", "frozen", "pending_payment"), today)) {
                throw new ConflictException("USER_HAS_OPEN_COMMITMENTS", "users.blocked.membership", null, null);
            }
            if ((classEnrollmentRepository != null && classEnrollmentRepository.existsUpcomingBookedForMember(id, today))
                    || (sessionBookingRepository != null && sessionBookingRepository.existsUpcomingBookedForMember(id, today))
                    || (coachBookingRepository != null && coachBookingRepository.existsUpcomingForMember(id, today))
                    || (courtBookingRepository != null && courtBookingRepository.existsUpcomingForMember(id, today))) {
                throw new ConflictException("USER_HAS_OPEN_COMMITMENTS", "users.blocked.bookings", null, null);
            }
        } else if ("COACH".equals(role)) {
            if (classSessionRepository != null && classSessionRepository.existsScheduledForCoachFrom(id, today)) {
                throw new ConflictException("USER_HAS_OPEN_COMMITMENTS", "users.blocked.coach_classes", null, null);
            }
            if (coachBookingRepository != null && coachBookingRepository.existsUpcomingForCoach(id, today)) {
                throw new ConflictException("USER_HAS_OPEN_COMMITMENTS", "users.blocked.coach_sessions", null, null);
            }
        }
    }

    private Role findRole(Long roleId) {
        return roleRepository.findById(roleId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.role", roleId));
    }

    private void protectLastActiveAdmin(User user) {
        if (user.getRole() != null && "ADMIN".equalsIgnoreCase(user.getRole().getCode())
                && "active".equalsIgnoreCase(user.getStatus())) {
            // Serialize removals against the shared role row so concurrent requests cannot remove both Admins.
            roleRepository.lockByCode("ADMIN");
            if (userRepository.countByRole_CodeAndDeletedAtIsNullAndStatus("ADMIN", "active") <= 1) {
                throw new ConflictException("LAST_ACTIVE_ADMIN", "users.last_active_admin", null, null);
            }
        }
    }

    private User findActiveUser(Long id) {
        return userRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", id));
    }

    @Transactional
    @Audited(action = "RECEPTIONIST_PROFILE_UPDATE", entity = "receptionists")
    public void updateReceptionistShift(Long userId, com.swp391.scms.users.dto.ReceptionistProfileUpdateDto request) {
        User user = findActiveUser(userId);
        if (!"RECEPTIONIST".equalsIgnoreCase(user.getRole().getCode())) {
            throw new com.swp391.scms.common.exception.BadRequestException("INVALID_ROLE", "users.not_receptionist", null, null);
        }
        com.swp391.scms.users.entity.Receptionist receptionist = receptionistRepository.findById(userId).orElseGet(() -> {
            com.swp391.scms.users.entity.Receptionist newReceptionist = new com.swp391.scms.users.entity.Receptionist();
            newReceptionist.setUser(user);
            return newReceptionist;
        });
        receptionist.setShift(request.shift());
        receptionistRepository.save(receptionist);
    }

    /**
     * Tự động xóa mềm tài khoản không đăng nhập quá 6 tháng (180 ngày).
     * Ngoại trừ: Tài khoản Quản lý trung tâm (CENTER_MANAGER) và các tài khoản hội viên đang có gói bảo lưu tập (frozen).
     */
    @Transactional
    @Audited(action = "USER_CLEANUP_INACTIVE", entity = "users")
    public int cleanupInactiveUsers() {
        LocalDateTime sixMonthsAgo = LocalDateTime.now(clock).minusMonths(6);
        List<User> users = userRepository.findAllByDeletedAtIsNullOrderByIdAsc();
        int count = 0;
        for (User user : users) {
            // Staff accounts are retired by a manager, never by the sweep; an unknown role is not guessed at.
            if (user.getRole() == null || user.getRole().getCode() == null
                    || NEVER_AUTO_DELETED.contains(user.getRole().getCode().toUpperCase(Locale.ROOT))) {
                continue;
            }

            LocalDateTime refTime = user.getLastLoginAt() != null ? user.getLastLoginAt() : user.getCreatedAt();
            if (refTime == null || !refTime.isBefore(sixMonthsAgo)) {
                continue;
            }
            if (user.getId() == null || hasRecentUseOrEntitlement(user.getId(), sixMonthsAgo)) {
                continue;
            }
            LocalDateTime now = LocalDateTime.now(clock);
            user.setDeletedAt(now);
            user.setUpdatedAt(now);
            userRepository.save(user);
            count++;
        }
        return count;
    }

    /**
     * True when the member still holds (or recently held) a membership, or scanned in or paid within the window.
     * Without the subscription source nothing can be verified, so the account is kept.
     */
    private boolean hasRecentUseOrEntitlement(Long userId, LocalDateTime since) {
        if (subscriptionRepository == null
                || subscriptionRepository.existsEntitlementEndingOnOrAfter(userId, since.toLocalDate())) {
            return true;
        }
        if (checkinRepository != null && checkinRepository.existsByMemberUserIdAndCheckInTimeGreaterThanEqual(userId, since)) {
            return true;
        }
        return paymentRepository != null && paymentRepository.existsByMemberUserIdAndPaidAtGreaterThanEqual(userId, since);
    }

    /**
     * Tác vụ tự động quét dọn dẹp chạy định kỳ hàng ngày vào 02:00 sáng.
     */
    @Transactional
    @Audited(action = "USER_CLEANUP_INACTIVE", entity = "users")
    @org.springframework.scheduling.annotation.Scheduled(cron = "${app.users.cleanup.cron:0 0 2 * * ?}")
    public void scheduleInactiveUsersCleanup() {
        cleanupInactiveUsers();
    }
}
