package com.swp391.scms.membership;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.dto.CancellationDtos;
import com.swp391.scms.membership.service.MembershipCancellationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/memberships/cancellations")
public class MembershipCancellationController {
    private final MembershipCancellationService service;
    private final MessageService messages;

    public MembershipCancellationController(MembershipCancellationService service) {
        this(service, null);
    }

    @Autowired
    public MembershipCancellationController(MembershipCancellationService service, MessageService messages) {
        this.service = service;
        this.messages = messages;
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<List<CancellationDtos.Response>> mine(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ApiResponse.ok(msg("membership.cancellation.list"), service.mine(principal));
    }

    @PostMapping("/staff-request")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ApiResponse<CancellationDtos.Response> staffRequest(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CancellationDtos.StaffRequest body) {
        return ApiResponse.ok(msg("membership.cancellation.requested"), service.staffRequest(principal, body));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<List<CancellationDtos.Response>> all() {
        return ApiResponse.ok(msg("membership.cancellation.list"), service.all());
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ApiResponse<CancellationDtos.Response> approve(@AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id, @Valid @RequestBody(required = false) CancellationDtos.Decision body) {
        return ApiResponse.ok(msg("membership.cancellation.approved"),
                service.decide(principal, id, true, body != null ? body : new CancellationDtos.Decision(null)));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ApiResponse<CancellationDtos.Response> reject(@AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id, @Valid @RequestBody(required = false) CancellationDtos.Decision body) {
        return ApiResponse.ok(msg("membership.cancellation.rejected"),
                service.decide(principal, id, false, body != null ? body : new CancellationDtos.Decision(null)));
    }

    private String msg(String key) {
        return messages != null ? messages.getMessage(key) : key;
    }
}
