package com.swp391.scms.membership;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.dto.SubscriptionResponses.SubscriptionDto;
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

@Tag(name = "Member Trial Redemptions", description = "Đăng ký nhận gói tập thử 3 ngày Gold miễn phí dựa trên CCCD")
@RestController
@RequestMapping("/api/v1/memberships/trial")
@PreAuthorize("hasRole('MEMBER')")
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

    @Operation(summary = "Kiểm tra điều kiện nhận gói thử 3 ngày Gold")
    @GetMapping("/status")
    public ApiResponse<TrialStatusDto> getTrialStatus(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        TrialStatusDto status = trialService.getTrialStatus(principal.id());
        return ApiResponse.ok(msg("trial.status.loaded"), status);
    }

    @Operation(summary = "Xác minh CCCD và kích hoạt 3 ngày tập miễn phí đặc quyền Gold")
    @PostMapping("/claim")
    public ResponseEntity<ApiResponse<SubscriptionDto>> claimGoldTrial(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody TrialClaimRequest request
    ) {
        SubscriptionDto subscription = trialService.claimGoldTrial(principal, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("trial.claimed.success"), subscription));
    }
}

