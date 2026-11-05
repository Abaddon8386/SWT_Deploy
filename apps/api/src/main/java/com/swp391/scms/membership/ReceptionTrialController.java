package com.swp391.scms.membership;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.dto.ReceptionTrialDto;
import com.swp391.scms.membership.dto.TrialRejectRequest;
import com.swp391.scms.membership.service.MemberTrialService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Reception Trial Approvals", description = "Lễ tân xác minh CCCD/Hộ chiếu và phê duyệt/từ chối gói trải nghiệm 3 ngày")
@RestController
@RequestMapping({"/api/v1/reception/trials", "/api/v1/memberships/trial/requests"})
@PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST', 'ADMIN')")
public class ReceptionTrialController {

    private final MemberTrialService trialService;
    private final MessageService messageService;

    @Autowired
    public ReceptionTrialController(MemberTrialService trialService, MessageService messageService) {
        this.trialService = trialService;
        this.messageService = messageService;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    @Operation(summary = "Lấy danh sách đơn đăng ký gói trải nghiệm 3 ngày")
    @GetMapping
    public ApiResponse<List<ReceptionTrialDto>> listTrials(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search
    ) {
        List<ReceptionTrialDto> list = trialService.listTrials(status, search);
        return ApiResponse.ok(msg("trial.list.loaded"), list);
    }

    @Operation(summary = "Phê duyệt đơn đăng ký gói trải nghiệm (kích hoạt gói 3 ngày & đồng bộ họ tên tài khoản theo CCCD/Hộ chiếu)")
    @PostMapping("/{id}/approve")
    public ApiResponse<ReceptionTrialDto> approveTrial(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id
    ) {
        ReceptionTrialDto result = trialService.approveTrial(principal, id);
        return ApiResponse.ok(msg("trial.approved.success"), result);
    }

    @Operation(summary = "Từ chối đơn đăng ký gói trải nghiệm kèm lý do")
    @PostMapping("/{id}/reject")
    public ApiResponse<ReceptionTrialDto> rejectTrial(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody(required = false) TrialRejectRequest request
    ) {
        String reason = request != null ? request.reason() : null;
        ReceptionTrialDto result = trialService.rejectTrial(principal, id, reason);
        return ApiResponse.ok(msg("trial.rejected.success"), result);
    }
}

