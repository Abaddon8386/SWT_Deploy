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

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final ReceptionistRepository receptionistRepository;
    private final com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptionRepository;
    private final Clock clock;

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
        if (dto.getPhone() != null && userRepository.findByPhone(dto.getPhone().trim()).isPresent()) {
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
        user.setStatus("active");
        user.setCreatedAt(LocalDateTime.now(clock));
        user.setUpdatedAt(LocalDateTime.now(clock));

        User saved = userRepository.saveAndFlush(user);
        if ("MEMBER".equalsIgnoreCase(role.getCode())) {
            Member member = new Member();
            member.setUser(saved);
            member.setMembershipCode("MEM-" + saved.getId());
            member.setJoinDate(LocalDate.now(clock));
            member.setFitnessLevel("beginner");
            saved.setMember(member);
            userRepository.save(saved);
        }
        return userMapper.toDto(saved);
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
            user.setRole(newRole);
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
        user.setStatus(status);
        user.setUpdatedAt(LocalDateTime.now(clock));
        return userMapper.toDto(userRepository.save(user));
    }

    private Role findRole(Long roleId) {
        return roleRepository.findById(roleId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.role", roleId));
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
            // Không bao giờ tự động xóa Quản lý trung tâm
            if (user.getRole() != null && "CENTER_MANAGER".equalsIgnoreCase(user.getRole().getCode())) {
                continue;
            }

            LocalDateTime refTime = user.getLastLoginAt() != null ? user.getLastLoginAt() : user.getCreatedAt();
            if (refTime != null && refTime.isBefore(sixMonthsAgo)) {
                boolean isFrozen = false;
                if (subscriptionRepository != null && user.getId() != null) {
                    isFrozen = subscriptionRepository.existsByMemberUserIdAndStatus(user.getId(), "frozen");
                }

                // Nếu không đang trong thời gian bảo lưu tập -> tự động xóa mềm
                if (!isFrozen) {
                    LocalDateTime now = LocalDateTime.now(clock);
                    user.setDeletedAt(now);
                    user.setUpdatedAt(now);
                    userRepository.save(user);
                    count++;
                }
            }
        }
        return count;
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
