package com.swp391.scms.users;

import com.swp391.scms.users.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class IdentitySeederTest {
    @Test
    void seedsFiveRolesAndOnlyBootstrapAdminWithoutPromotingExistingManagers() {
        RoleRepository roles = mock(RoleRepository.class);
        PermissionRepository permissions = mock(PermissionRepository.class);
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        Map<String, Role> stored = new HashMap<>();
        Map<String, Permission> catalog = new HashMap<>();
        Role manager = new Role();
        manager.setCode("CENTER_MANAGER");
        var manageUsers = new Permission();
        manageUsers.setCode("USER_MANAGE");
        manager.setPermissions(new HashSet<>(Set.of(manageUsers)));
        stored.put("CENTER_MANAGER", manager);
        when(roles.findByCode(any())).thenAnswer(call -> Optional.ofNullable(stored.get(call.getArgument(0))));
        when(roles.save(any())).thenAnswer(call -> {
            Role role = call.getArgument(0);
            stored.put(role.getCode(), role);
            return role;
        });
        when(permissions.findByCode(any())).thenAnswer(call -> Optional.ofNullable(catalog.get(call.getArgument(0))));
        when(permissions.save(any())).thenAnswer(call -> {
            Permission permission = call.getArgument(0);
            catalog.put(permission.getCode(), permission);
            return permission;
        });
        when(encoder.encode("Secret123")).thenReturn("hashed-secret");
        var seeder = new IdentitySeeder(roles, permissions, users, encoder, "owner@example.com", "Secret123");
        seeder.run(null);
        assertEquals(Set.of("MEMBER", "COACH", "RECEPTIONIST", "CENTER_MANAGER", "ADMIN"), stored.keySet());
        assertTrue(manager.getPermissions().stream().noneMatch(p -> "USER_MANAGE".equals(p.getCode())));
        var created = org.mockito.ArgumentCaptor.forClass(User.class);
        verify(users).save(created.capture());
        assertEquals("ADMIN", created.getValue().getRole().getCode());
        assertEquals("owner@example.com", created.getValue().getEmail());
        assertEquals("hashed-secret", created.getValue().getPasswordHash());

        when(users.findByEmailIgnoreCase("owner@example.com")).thenReturn(Optional.of(created.getValue()));
        seeder.run(null);
        verify(users, times(1)).save(any());
        assertEquals(5, stored.size());
    }
}
