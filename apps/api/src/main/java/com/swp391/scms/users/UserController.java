package com.swp391.scms.users;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.dto.UserCreateDto;
import com.swp391.scms.users.dto.UserDto;
import com.swp391.scms.users.dto.UserUpdateDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;

@Tag(name = "Users & RBAC", description = "Quản trị người dùng, trạng thái khóa/mở khóa và phân quyền vai trò")
@PreAuthorize("hasRole('ADMIN')")
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;
    private final MessageService messageService;

    public UserController(UserService userService) {
        this(userService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public UserController(UserService userService, MessageService messageService) {
        this.userService = userService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Lấy danh sách người dùng", description = "Trả về danh sách tất cả người dùng chưa bị xóa mềm")
    @GetMapping
    public ApiResponse<List<UserDto>> getAllUsers() {
        return ApiResponse.ok(msg("users.list.success"), userService.getAllUsers());
    }

    @Operation(summary = "Xem chi tiết người dùng", description = "Lấy thông tin người dùng theo User ID")
    @GetMapping("/{id}")
    public ApiResponse<UserDto> getUserById(@PathVariable Long id) {
        return ApiResponse.ok(msg("users.detail.success"), userService.getUserById(id));
    }

    @Operation(summary = "Tạo mới người dùng", description = "Tạo tài khoản người dùng mới kèm vai trò")
    @PostMapping
    public ResponseEntity<ApiResponse<UserDto>> createUser(@Valid @RequestBody UserCreateDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("users.created.success"), userService.createUser(dto)));
    }

    @Operation(summary = "Cập nhật người dùng", description = "Cập nhật thông tin tài khoản người dùng theo ID")
    @PutMapping("/{id}")
    public ApiResponse<UserDto> updateUser(@PathVariable Long id, @Valid @RequestBody UserUpdateDto dto) {
        return ApiResponse.ok(msg("users.updated.success"), userService.updateUser(id, dto));
    }

    @Operation(summary = "Xóa mềm người dùng", description = "Đánh dấu xóa mềm người dùng (deleted_at)")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ApiResponse.ok(msg("users.deleted.success"), null);
    }

    @Operation(summary = "Khóa tài khoản", description = "Chuyển trạng thái người dùng sang 'locked'")
    @PatchMapping("/{id}/lock")
    public ApiResponse<UserDto> lockUser(@PathVariable Long id) {
        return ApiResponse.ok(msg("users.locked.success"), userService.setStatus(id, "locked"));
    }

    @Operation(summary = "Mở khóa tài khoản", description = "Chuyển trạng thái người dùng sang 'active'")
    @PatchMapping("/{id}/unlock")
    public ApiResponse<UserDto> unlockUser(@PathVariable Long id) {
        return ApiResponse.ok(msg("users.unlocked.success"), userService.setStatus(id, "active"));
    }

    @Operation(summary = "Cập nhật hồ sơ Lễ tân", description = "Quản lý cập nhật ca làm việc cho Lễ tân")
    @PutMapping("/{id}/receptionist")
    public ApiResponse<Void> updateReceptionistProfile(
            @PathVariable Long id,
            @Valid @RequestBody com.swp391.scms.users.dto.ReceptionistProfileUpdateDto request) {
        userService.updateReceptionistShift(id, request);
        return ApiResponse.ok(msg("users.profile.receptionist.update.success"), null);
    }

    @Operation(summary = "Tự động dọn dẹp tài khoản không hoạt động > 6 tháng",
               description = "Xóa mềm các tài khoản không đăng nhập quá 6 tháng (ngoại trừ hội viên đang bảo lưu tập)")
    @PostMapping("/cleanup-inactive")
    public ApiResponse<java.util.Map<String, Object>> cleanupInactiveUsers() {
        int count = userService.cleanupInactiveUsers();
        return ApiResponse.ok(msg("users.cleanup.success"), java.util.Map.of("deletedCount", count));
    }
}

