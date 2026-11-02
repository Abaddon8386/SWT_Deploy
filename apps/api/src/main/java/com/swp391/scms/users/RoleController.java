package com.swp391.scms.users;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.dto.PermissionDto;
import com.swp391.scms.users.dto.RoleDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;

@Tag(name = "Users & RBAC", description = "Quản lý vai trò và phân quyền ma trận RBAC")
@PreAuthorize("hasRole('ADMIN')")
@RestController
@RequestMapping("/api/v1/roles")
public class RoleController {

    private final RoleService roleService;

    private final MessageService messageService;

    public RoleController(RoleService roleService) {
        this(roleService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public RoleController(RoleService roleService, MessageService messageService) {
        this.roleService = roleService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Grant a permission to a role")
    @PutMapping("/{id}/permissions/{permissionId}")
    public ApiResponse<PermissionDto> grantPermission(@PathVariable Long id, @PathVariable Long permissionId) {
        return ApiResponse.ok(msg("rbac.permission.granted"), roleService.grantPermission(id, permissionId));
    }

    @Operation(summary = "Revoke a permission from a role")
    @DeleteMapping("/{id}/permissions/{permissionId}")
    public ApiResponse<PermissionDto> revokePermission(@PathVariable Long id, @PathVariable Long permissionId) {
        return ApiResponse.ok(msg("rbac.permission.revoked"), roleService.revokePermission(id, permissionId));
    }

    @Operation(summary = "Lấy danh sách vai trò", description = "Danh sách tất cả vai trò (Role) trong hệ thống")
    @GetMapping
    public ApiResponse<List<RoleDto>> getAllRoles() {
        return ApiResponse.ok(msg("users.role.list.success"), roleService.getAllRoles());
    }

    @Operation(summary = "Lấy danh sách quyền hạn", description = "Danh sách tất cả quyền (Permission) trong hệ thống")
    @GetMapping("/permissions")
    public ApiResponse<List<PermissionDto>> getAllPermissions() {
        return ApiResponse.ok(msg("users.permission.list.success"), roleService.getAllPermissions());
    }

    @Operation(summary = "Lấy danh sách quyền theo Role ID", description = "Xem chi tiết ma trận phân quyền của một vai trò cụ thể")
    @GetMapping("/{id}/permissions")
    public ApiResponse<List<PermissionDto>> getPermissionsByRoleId(@PathVariable Long id) {
        return ApiResponse.ok(msg("users.role.permissions.success"), roleService.getPermissionsByRoleId(id));
    }
}

