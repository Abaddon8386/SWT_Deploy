package com.swp391.scms.users;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.dto.StaffAccountCreateDto;
import com.swp391.scms.users.dto.UserDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/staff-accounts")
@PreAuthorize("hasAnyRole('CENTER_MANAGER', 'ADMIN')")
public class StaffAccountController {
    private final UserService users;
    private final MessageService messages;

    public StaffAccountController(UserService users, MessageService messages) {
        this.users = users;
        this.messages = messages;
    }

    @GetMapping
    public ApiResponse<List<UserDto>> list() {
        return ApiResponse.ok(messages.getMessage("users.list.success"), users.getStaffAccounts());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UserDto> create(@Valid @RequestBody StaffAccountCreateDto request) {
        return ApiResponse.created(messages.getMessage("users.created.success"), users.createStaffAccount(request));
    }

    @PatchMapping("/{id}/lock")
    public ApiResponse<UserDto> lock(@PathVariable Long id) {
        return ApiResponse.ok(messages.getMessage("users.locked.success"), users.setStaffStatus(id, "locked"));
    }

    @PatchMapping("/{id}/unlock")
    public ApiResponse<UserDto> unlock(@PathVariable Long id) {
        return ApiResponse.ok(messages.getMessage("users.unlocked.success"), users.setStaffStatus(id, "active"));
    }
}
