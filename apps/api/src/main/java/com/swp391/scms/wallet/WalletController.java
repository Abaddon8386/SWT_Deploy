package com.swp391.scms.wallet;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/wallet")
public class WalletController {

    private final WalletService walletService;
    private final MessageService messageService;

    public WalletController(WalletService walletService) {
        this(walletService, null);
    }

    @Autowired
    public WalletController(WalletService walletService, MessageService messageService) {
        this.walletService = walletService;
        this.messageService = messageService;
    }

    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<WalletDto> getMyWallet(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        String msg = messageService != null ? messageService.getMessage("wallet.get.success") : "Lấy thông tin Ví thành công";
        return ApiResponse.ok(msg, walletService.getMyWallet(principal.id()));
    }
}
