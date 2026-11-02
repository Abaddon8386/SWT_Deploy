package com.swp391.scms.users;

import com.swp391.scms.users.entity.Permission;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds five core roles and an optional Admin. Managers are provisioned by an authenticated Admin.
 */
@Component
@Order(0)
public class IdentitySeeder implements ApplicationRunner {

    private static final List<String[]> PERMISSIONS = List.of(
            new String[]{"USER_MANAGE", "Quản lý tài khoản", "identity"},
            new String[]{"ROLE_MANAGE", "Phân quyền vai trò", "identity"},
            new String[]{"PROFILE_SELF", "Xem và sửa hồ sơ cá nhân", "identity"},
            new String[]{"CATALOG_MANAGE", "Quản lý bộ môn, phòng, gói tập", "catalog"},
            new String[]{"MEMBER_LOOKUP", "Tra cứu nhanh hội viên", "operations"},
            new String[]{"PAYMENT_MANAGE", "Ghi nhận thanh toán và hóa đơn", "finance"});

    private static final Map<String, List<String>> GRANTS = Map.of(
            "ADMIN", List.of("USER_MANAGE", "ROLE_MANAGE", "PROFILE_SELF"),
            "CENTER_MANAGER", List.of("PROFILE_SELF", "CATALOG_MANAGE", "MEMBER_LOOKUP", "PAYMENT_MANAGE"),
            "RECEPTIONIST", List.of("PROFILE_SELF", "MEMBER_LOOKUP", "PAYMENT_MANAGE"),
            "COACH", List.of("PROFILE_SELF"),
            "MEMBER", List.of("PROFILE_SELF"));

    private static final Map<String, String> ROLE_NAMES = Map.of(
            "ADMIN", "Quản trị hệ thống",
            "CENTER_MANAGER", "Quản lý trung tâm",
            "RECEPTIONIST", "Lễ tân / Thu ngân",
            "COACH", "Huấn luyện viên",
            "MEMBER", "Hội viên");

    private final RoleRepository roles;
    private final PermissionRepository permissions;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;

    public IdentitySeeder(RoleRepository roles, PermissionRepository permissions, UserRepository users,
                          PasswordEncoder passwordEncoder,
                          @Value("${app.bootstrap.admin.email:}") String adminEmail,
                          @Value("${app.bootstrap.admin.password:}") String adminPassword) {
        this.roles = roles;
        this.permissions = permissions;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        PERMISSIONS.forEach(p -> permissions.findByCode(p[0]).orElseGet(() -> {
            Permission permission = new Permission();
            permission.setCode(p[0]);
            permission.setName(p[1]);
            permission.setModule(p[2]);
            return permissions.save(permission);
        }));

        ROLE_NAMES.forEach((code, name) -> {
            Role role = roles.findByCode(code).orElseGet(() -> {
                Role created = new Role();
                created.setCode(code);
                created.setName(name);
                created.setPermissions(new HashSet<>());
                return roles.save(created);
            });
            if (role.getPermissions().isEmpty()) {
                Set<Permission> granted = new HashSet<>();
                GRANTS.get(code).forEach(permCode -> permissions.findByCode(permCode).ifPresent(granted::add));
                role.setPermissions(granted);
                roles.save(role);
            }
            if ("CENTER_MANAGER".equals(code) && role.getPermissions().removeIf(
                    permission -> Set.of("USER_MANAGE", "ROLE_MANAGE").contains(permission.getCode()))) {
                roles.save(role);
            }
        });

        seedAdmin();
    }

    private void seedAdmin() {
        if (adminEmail.isBlank() || adminPassword.isBlank()
                || users.findByEmailIgnoreCase(adminEmail.trim()).isPresent()) {
            return;
        }
        User manager = new User();
        manager.setRole(roles.findByCode("ADMIN").orElseThrow());
        manager.setFullName("System Admin");
        manager.setEmail(adminEmail.trim().toLowerCase(Locale.ROOT));
        manager.setPasswordHash(passwordEncoder.encode(adminPassword));
        manager.setStatus("active");
        LocalDateTime now = LocalDateTime.now();
        manager.setCreatedAt(now);
        manager.setUpdatedAt(now);
        users.save(manager);
    }
}
