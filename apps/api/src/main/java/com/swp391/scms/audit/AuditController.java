package com.swp391.scms.audit;

import com.swp391.scms.audit.dto.AuditLogDto;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller for viewing system Audit Logs (SCRUM-109).
 * Strictly restricted to CENTER_MANAGER.
 */
@RestController
@RequestMapping("/api/v1/admin/audit-logs")
@Tag(name = "Admin Audit Logs", description = "Endpoints for viewing and querying system audit logs (SCRUM-109)")
@SecurityRequirement(name = "bearerAuth")
public class AuditController {

    private final AuditService auditService;
    private final MessageService messageService;

    @Autowired
    public AuditController(AuditService auditService, @Autowired(required = false) MessageService messageService) {
        this.auditService = auditService;
        this.messageService = messageService;
    }

    public AuditController(AuditService auditService) {
        this(auditService, null);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @Operation(summary = "Get audit logs with filters", description = "Restricted to CENTER_MANAGER and MANAGER. Supports filtering by userId, entityType, action, from, to.")
    public ApiResponse<Page<AuditLogDto>> getAuditLogs(
            @RequestParam(name = "user_id", required = false) Long userId,
            @RequestParam(name = "entity_type", required = false) String entityType,
            @RequestParam(name = "action", required = false) String action,
            @RequestParam(name = "from", required = false) String from,
            @RequestParam(name = "to", required = false) String to,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        int boundedSize = Math.min(Math.max(size, 1), 100);
        int boundedPage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(boundedPage, boundedSize, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<AuditLogDto> result = auditService.getAuditLogs(userId, entityType, action, from, to, pageable);

        String message = (messageService != null)
                ? messageService.getMessage("audit.list.success")
                : "Lấy danh sách nhật ký kiểm toán thành công";

        return ApiResponse.ok(message, result);
    }
}
