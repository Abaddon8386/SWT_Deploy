package com.swp391.scms.users;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.dto.ProfileDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Profile", description = "Hồ sơ cá nhân của người dùng")
@RestController
@RequestMapping("/api/v1/profile")
public class ProfileController {

    public record AvatarUploadRequest(@Size(max = 2800000) String avatarUrl) {}

    private final ProfileService profileService;
    private final MessageService messageService;

    public ProfileController(ProfileService profileService) {
        this(profileService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ProfileController(ProfileService profileService, MessageService messageService) {
        this.profileService = profileService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Xem hồ sơ cá nhân", description = "Lấy thông tin cá nhân của người dùng hiện tại từ JWT")
    @GetMapping
    public ApiResponse<ProfileDto> getMyProfile(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ApiResponse.ok(msg("users.profile.get.success"), profileService.getProfile(principal.id()));
    }

    @Operation(summary = "Cập nhật hồ sơ cá nhân", description = "Chỉnh sửa thông tin cá nhân, mục tiêu tập luyện của người dùng")
    @PutMapping
    public ApiResponse<ProfileDto> updateMyProfile(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                   @Valid @RequestBody ProfileDto request) {
        return ApiResponse.ok(msg("users.profile.update.success"), profileService.updateProfile(principal.id(), request));
    }

    @Operation(summary = "Cập nhật ảnh đại diện", description = "Tải lên hoặc xóa ảnh đại diện (hỗ trợ JPG, PNG, WebP tối đa 2MB)")
    @PostMapping("/avatar")
    public ApiResponse<ProfileDto> updateMyAvatar(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                  @Valid @RequestBody AvatarUploadRequest request) {
        return ApiResponse.ok(msg("users.profile.update.success"), profileService.updateAvatar(principal.id(), request.avatarUrl()));
    }

    @Operation(summary = "Cập nhật hồ sơ Coach", description = "Dành riêng cho HLV cập nhật chuyên môn")
    @PutMapping("/coach")
    @PreAuthorize("hasRole('COACH')")
    public ApiResponse<Void> updateCoachProfile(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                @Valid @RequestBody com.swp391.scms.users.dto.CoachProfileUpdateDto request) {
        profileService.updateCoachProfile(principal.id(), principal.role(), request);
        return ApiResponse.ok(msg("users.profile.coach.update.success"), null);
    }

    @Operation(summary = "Cập nhật hồ sơ Lễ tân", description = "Dành cho Lễ tân tự cập nhật ca làm việc của mình. Quản lý dùng endpoint ở UserController.")
    @PutMapping("/receptionist")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public ApiResponse<Void> updateReceptionistProfile(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                       @Valid @RequestBody com.swp391.scms.users.dto.ReceptionistProfileUpdateDto request) {
        profileService.updateReceptionistProfile(principal.id(), principal.role(), request);
        return ApiResponse.ok(msg("users.profile.receptionist.update.success"), null);
    }
}
