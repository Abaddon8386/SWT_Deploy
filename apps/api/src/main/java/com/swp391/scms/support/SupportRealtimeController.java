package com.swp391.scms.support;

import com.swp391.scms.chat.dto.ChatRealtimeSession;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/support/requests")
public class SupportRealtimeController {
    private final SupportRealtimeService service;
    private final MessageService messages;
    public SupportRealtimeController(SupportRealtimeService service) { this(service, null); }
    @Autowired public SupportRealtimeController(SupportRealtimeService service, MessageService messages) {
        this.service = service; this.messages = messages;
    }
    private ResponseEntity<ApiResponse<ChatRealtimeSession>> response(ChatRealtimeSession session) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.ok(
                messages == null ? "support.realtime.ready" : messages.getMessage("support.realtime.ready"), session));
    }
    @PostMapping("/{id}/realtime-session")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<ApiResponse<ChatRealtimeSession>> ticket(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedPrincipal actor) {
        return response(service.ticket(id, actor));
    }
    @PostMapping("/realtime-session")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<ApiResponse<ChatRealtimeSession>> inbox(@AuthenticationPrincipal AuthenticatedPrincipal actor) {
        return response(service.inbox(actor));
    }
}
