package com.swp391.scms.chat.controller;

import com.swp391.scms.chat.dto.*;
import com.swp391.scms.chat.service.ChatService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/chat")
@PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'COACH')")
public class ChatController {
    private final ChatService service;
    private final MessageService messages;
    public ChatController(ChatService service) { this(service, null); }
    @Autowired public ChatController(ChatService service, MessageService messages) { this.service = service; this.messages = messages; }
    private String msg(String key) { return messages == null ? key : messages.getMessage(key); }

    @GetMapping("/contacts") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Page<ChatContactDto>> contacts(@AuthenticationPrincipal AuthenticatedPrincipal p,
            @RequestParam(defaultValue = "") String query, @RequestParam(defaultValue = "0") int page) {
        return ApiResponse.ok(msg("chat.contacts.success"), service.contacts(p, query, page));
    }
    @GetMapping("/conversations")
    public ApiResponse<Page<ChatConversationDto>> list(@AuthenticationPrincipal AuthenticatedPrincipal p,
            @RequestParam(defaultValue = "0") int page) {
        return ApiResponse.ok(msg("chat.list.success"), service.list(p, page));
    }
    @PostMapping("/conversations") @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<ChatConversationDto> open(@AuthenticationPrincipal AuthenticatedPrincipal p, @Valid @RequestBody OpenChatConversation input) {
        return ApiResponse.ok(msg("chat.open.success"), service.open(p, input.contactId()));
    }
    @GetMapping("/unread-count")
    public ApiResponse<ChatUnreadCount> unread(@AuthenticationPrincipal AuthenticatedPrincipal p) {
        return ApiResponse.ok(msg("chat.unread.success"), service.unreadCount(p));
    }
    @PostMapping("/conversations/{id}/read")
    public ApiResponse<ChatUnreadCount> read(@AuthenticationPrincipal AuthenticatedPrincipal p, @PathVariable Long id,
            @Valid @RequestBody MarkChatRead input) {
        return ApiResponse.ok(msg("chat.read.success"), service.markRead(p, id, input));
    }
    @GetMapping("/conversations/{id}/messages")
    public ApiResponse<ChatHistory> history(@AuthenticationPrincipal AuthenticatedPrincipal p, @PathVariable Long id,
            @RequestParam(required = false) Long beforeId, @RequestParam(required = false) Long afterId) {
        return ApiResponse.ok(msg("chat.history.success"), service.history(p, id, beforeId, afterId));
    }
    @PostMapping("/conversations/{id}/messages")
    public ApiResponse<ChatMessageDto> send(@AuthenticationPrincipal AuthenticatedPrincipal p, @PathVariable Long id,
            @Valid @RequestBody SendChatMessage input) {
        return ApiResponse.ok(msg("chat.send.success"), service.send(p, id, input));
    }
}
