package com.swp391.scms.support;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.dto.CreateSupportRequestDto;
import com.swp391.scms.support.dto.EscalateSupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestMessageDto;
import com.swp391.scms.support.dto.UpdateSupportRequestStatusDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Support", description = "Quản lý các yêu cầu khiếu nại, hỗ trợ (Tickets)")
@RestController
@RequestMapping("/api/v1/support/requests")
public class SupportRequestController {

    private final SupportRequestService supportRequestService;
    private final MessageService messageService;

    public SupportRequestController(SupportRequestService supportRequestService) {
        this(supportRequestService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SupportRequestController(SupportRequestService supportRequestService, MessageService messageService) {
        this.supportRequestService = supportRequestService;
        this.messageService = messageService;
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public ApiResponse<SupportRequestDto> getRequest(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ApiResponse.ok(msg("support.list.success"), supportRequestService.getRequest(id, principal.id(), principal.role()));
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Tạo yêu cầu hỗ trợ mới (Member)")
    @PostMapping
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<SupportRequestDto> createRequest(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CreateSupportRequestDto request) {
        SupportRequestDto result = supportRequestService.createRequest(principal.id(), request);
        return ApiResponse.ok(msg("support.create.success"), result);
    }

    @Operation(summary = "Xem lịch sử yêu cầu của bản thân (Member)")
    @GetMapping("/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Page<SupportRequestDto>> getMyRequests(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<SupportRequestDto> requests = supportRequestService.getMyRequests(principal.id(), pageable);
        return ApiResponse.ok(msg("support.list.success"), requests);
    }

    @Operation(summary = "Hộp thư khiếu nại: lễ tân thấy toàn bộ, quản lý chỉ thấy phần đã chuyển lên")
    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<Page<SupportRequestDto>> getAllRequests(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<SupportRequestDto> requests = supportRequestService.getAllRequests(status, pageable, principal.role());
        return ApiResponse.ok(msg("support.list.success"), requests);
    }

    @Operation(summary = "Cập nhật trạng thái và người phụ trách (lễ tân trước khi chuyển cấp, quản lý sau khi được chuyển lên)")
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<SupportRequestDto> updateStatus(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody UpdateSupportRequestStatusDto request) {
        SupportRequestDto result = supportRequestService.updateStatus(id, request, principal.role());
        return ApiResponse.ok(msg("support.update_status.success"), result);
    }

    @Operation(summary = "Lễ tân chuyển khiếu nại không tự xử lý được lên quản lý")
    @PostMapping("/{id}/escalate")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public ApiResponse<SupportRequestDto> escalate(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody EscalateSupportRequestDto request) {
        SupportRequestDto result = supportRequestService.escalate(id, principal.id(), principal.role(), request);
        return ApiResponse.ok(msg("support.escalate.success"), result);
    }

    @Operation(summary = "Gửi tin nhắn mới vào yêu cầu hỗ trợ (SCRUM-106)")
    @PostMapping("/{id}/messages")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public ApiResponse<SupportRequestMessageDto> sendMessage(
            @PathVariable Long id,
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CreateSupportMessageDto request) {
        SupportRequestMessageDto result = supportRequestService.sendMessage(id, principal.id(), principal.role(), request);
        return ApiResponse.ok(msg("support.message.send.success"), result);
    }

    @Operation(summary = "Lấy lịch sử hội thoại trong yêu cầu hỗ trợ theo thời gian (SCRUM-106)")
    @GetMapping("/{id}/messages")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public ApiResponse<List<SupportRequestMessageDto>> getMessages(
            @PathVariable Long id,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<SupportRequestMessageDto> result = supportRequestService.getMessages(id, principal.id(), principal.role());
        return ApiResponse.ok(msg("support.messages.list.success"), result);
    }
}
