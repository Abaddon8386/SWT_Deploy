package com.swp391.scms.membership;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.dto.TrialClaimRequest;
import com.swp391.scms.membership.dto.TrialStatusDto;
import com.swp391.scms.membership.service.MemberTrialService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Member Trial Redemptions", description = "Đăng ký nhận gói trải nghiệm 3 ngày miễn phí dựa trên CCCD hoặc Hộ chiếu")
@RestController
@RequestMapping("/api/v1/memberships/trial")
public class MemberTrialController {

    private final MemberTrialService trialService;
    private final MessageService messageService;

    @Autowired
    public MemberTrialController(MemberTrialService trialService, MessageService messageService) {
        this.trialService = trialService;
        this.messageService = messageService;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    @Operation(summary = "Kiểm tra điều kiện nhận gói trải nghiệm 3 ngày")
    @GetMapping("/status")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<TrialStatusDto> getTrialStatus(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        TrialStatusDto status = trialService.getTrialStatus(principal.id());
        return ApiResponse.ok(msg("trial.status.loaded"), status);
    }

    @Operation(summary = "Gửi đơn đăng ký gói trải nghiệm 3 ngày (chờ xác minh CCCD/Hộ chiếu tại quầy Lễ tân)")
    @PostMapping(path = {"/claim", "/request"})
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<TrialStatusDto>> claimTrial(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody TrialClaimRequest request
    ) {
        TrialStatusDto status = trialService.requestTrial(principal, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("trial.request.submitted"), status));
    }
}
