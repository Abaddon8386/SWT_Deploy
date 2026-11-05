package com.swp391.scms.chat.service;

import com.swp391.scms.chat.dto.*;
import com.swp391.scms.chat.entity.*;
import com.swp391.scms.chat.repository.*;
import com.swp391.scms.common.exception.*;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.entity.User;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class ChatService {
    private static final Set<String> STAFF = Set.of("RECEPTIONIST", "COACH");
    private final ChatConversationRepository conversations;
    private final ChatMessageRepository messages;
    private final ChatContactRepository contacts;

    public ChatService(ChatConversationRepository conversations, ChatMessageRepository messages, ChatContactRepository contacts) {
        this.conversations = conversations; this.messages = messages; this.contacts = contacts;
    }

    public User requireActor(AuthenticatedPrincipal principal) {
        if (principal == null) throw forbidden();
        User actor = contacts.findUser(principal.id()).orElseThrow(ChatService::forbidden);
        checkActor(actor, principal);
        return actor;
    }

    public Page<ChatContactDto> contacts(AuthenticatedPrincipal principal, String query, int page) {
        requireMember(principal);
        if (query == null || query.length() > 80) throw invalid("validation.chat.query");
        return contacts.search(query.trim(), page(page)).map(u -> contact(u, true));
    }

    public Page<ChatConversationDto> list(AuthenticatedPrincipal principal, int page) {
        requireActor(principal);
        Long userId = principal.id();
        Page<ChatConversation> rows = conversations.forUser(userId, page(page));
        List<Long> ids = rows.getContent().stream().map(ChatConversation::getId).toList();
        if (ids.isEmpty()) return rows.map(c -> conversation(c, userId));
        Map<Long, ChatMessage> latest = new HashMap<>();
        for (ChatMessage m : messages.latestIn(ids)) latest.put(m.getConversation().getId(), m);
        Map<Long, Long> unread = new HashMap<>();
        for (Object[] row : messages.unreadIn(userId, ids)) unread.put((Long) row[0], (Long) row[1]);
        return rows.map(c -> conversation(c, userId, latest.get(c.getId()), unread.getOrDefault(c.getId(), 0L)));
    }

    public ChatUnreadCount unreadCount(AuthenticatedPrincipal principal) {
        requireActor(principal);
        return new ChatUnreadCount(messages.unreadTotal(principal.id()));
    }

    @Transactional
    public ChatUnreadCount markRead(AuthenticatedPrincipal principal, Long id, MarkChatRead input) {
        User actor = requireActor(principal);
        if (input == null || input.lastMessageId() == null || input.lastMessageId() <= 0) throw invalid("validation.chat.cursor");
        ChatConversation c = conversations.lockById(id).orElseThrow(() -> missing(id));
        participant(c, actor);
        // Không cho đánh dấu vượt quá tin thật sự có trong hội thoại.
        messages.latestId(id).ifPresent(latestId -> c.markRead(actor.getId(), Math.min(latestId, input.lastMessageId())));
        return new ChatUnreadCount(messages.unreadTotal(actor.getId()));
    }

    @Transactional
    public ChatConversationDto open(AuthenticatedPrincipal principal, Long contactId) {
        requireMember(principal);
        if (contactId == null || contactId <= 0 || contactId.equals(principal.id())) throw invalid("validation.chat.contact");
        // Serialize pair creation on the same Member row across all API instances.
        User member = contacts.lockUser(principal.id()).orElseThrow(ChatService::forbidden);
        checkActor(member, principal);
        User staff = contacts.findUser(contactId).filter(ChatService::active)
                .orElseThrow(() -> new ResourceNotFoundException("resource.chat.contact", contactId));
        if (!STAFF.contains(role(staff))) throw invalid("validation.chat.contact");
        ChatConversation c = conversations.findByMemberIdAndStaffId(member.getId(), contactId)
                .orElseGet(() -> conversations.save(new ChatConversation(member, staff, Instant.now())));
        return conversation(c, principal.id());
    }

    public ChatHistory history(AuthenticatedPrincipal principal, Long id, Long before, Long after) {
        User actor = requireActor(principal);
        ChatConversation c = conversations.findById(id).orElseThrow(() -> missing(id));
        participant(c, actor);
        if ((before != null && after != null) || (before != null && before <= 0) || (after != null && after < 0))
            throw invalid("validation.chat.cursor");
        List<ChatMessage> rows = after == null ? messages.older(id, before, PageRequest.of(0, 51))
                : messages.newer(id, after, PageRequest.of(0, 51));
        boolean more = rows.size() > 50;
        var selected = new ArrayList<>(rows.subList(0, Math.min(50, rows.size())));
        if (after == null) Collections.reverse(selected);
        return new ChatHistory(selected.stream().map(m -> message(m, actor.getId())).toList(), more);
    }

    @Transactional
    public ChatMessageDto send(AuthenticatedPrincipal principal, Long id, SendChatMessage input) {
        User actor = requireActor(principal);
        ChatConversation c = conversations.lockById(id).orElseThrow(() -> missing(id));
        participant(c, actor);
        if (input == null || input.clientMessageId() == null || input.message() == null
                || input.message().isBlank() || input.message().length() > 2000) throw invalid("validation.chat.message");
        String text = input.message().strip();
        var previous = messages.findByConversationIdAndSenderIdAndClientMessageId(id, actor.getId(), input.clientMessageId());
        if (previous.isPresent()) {
            if (!previous.get().getMessage().equals(text)) throw new ConflictException("CHAT_RETRY_CONFLICT", "chat.retry.conflict", null, null);
            return message(previous.get(), actor.getId());
        }
        User peer = peer(c, actor.getId());
        if (!availablePeer(c, peer)) throw new ConflictException("CHAT_PEER_UNAVAILABLE", "chat.peer.unavailable", null, null);
        Instant now = Instant.now();
        var saved = messages.save(new ChatMessage(c, actor, input.clientMessageId(), text, now));
        c.touch(now);
        // Người gửi đã thấy toàn bộ hội thoại tới tin của chính mình.
        if (saved.getId() != null) c.markRead(actor.getId(), saved.getId());
        return message(saved, actor.getId());
    }

    private User requireMember(AuthenticatedPrincipal p) {
        User user = requireActor(p);
        if (!"MEMBER".equals(role(user))) throw forbidden();
        return user;
    }
    private static void checkActor(User u, AuthenticatedPrincipal p) {
        String role = role(u);
        if (!active(u) || !role.equals(p.role()) || !("MEMBER".equals(role) || STAFF.contains(role))) throw forbidden();
    }
    private static void participant(ChatConversation c, User u) {
        boolean member = c.getMember().getId().equals(u.getId()) && "MEMBER".equals(role(u));
        boolean staff = c.getStaff().getId().equals(u.getId()) && STAFF.contains(role(u));
        if (!member && !staff) throw forbidden();
    }
    private static User peer(ChatConversation c, Long id) { return c.getMember().getId().equals(id) ? c.getStaff() : c.getMember(); }
    private static boolean availablePeer(ChatConversation c, User u) {
        return active(u) && (u.getId().equals(c.getMember().getId()) ? "MEMBER".equals(role(u)) : STAFF.contains(role(u)));
    }
    private static ChatConversationDto conversation(ChatConversation c, Long userId) { return conversation(c, userId, null, 0); }
    private static ChatConversationDto conversation(ChatConversation c, Long userId, ChatMessage latest, long unread) {
        User other = peer(c, userId);
        String preview = latest == null ? null : preview(latest.getMessage());
        boolean mine = latest != null && latest.getSender().getId().equals(userId);
        return new ChatConversationDto(c.getId(), contact(other, availablePeer(c, other)), c.getCreatedAt(), c.getLastActivityAt(),
                preview, mine, unread);
    }
    private static String preview(String text) {
        String flat = text.replaceAll("\\s+", " ").strip();
        return flat.length() <= 120 ? flat : flat.substring(0, 119) + "…";
    }
    private static ChatContactDto contact(User u, boolean available) {
        return new ChatContactDto(u.getId(), u.getFullName(), role(u), available, u.getAvatarUrl());
    }
    private static ChatMessageDto message(ChatMessage m, Long userId) {
        return new ChatMessageDto(m.getId(), m.getConversation().getId(), m.getClientMessageId(), m.getSender().getId(),
                m.getSender().getId().equals(userId), m.getMessage(), m.getCreatedAt());
    }
    private static String role(User u) { return u.getRole() == null ? "" : u.getRole().getCode(); }
    private static boolean active(User u) { return u.getDeletedAt() == null && "active".equals(u.getStatus()); }
    private static PageRequest page(int page) {
        if (page < 0 || page > 100000) throw invalid("validation.chat.page");
        return PageRequest.of(page, 20);
    }
    private static BadRequestException invalid(String key) { return new BadRequestException("CHAT_INVALID_INPUT", key, null, null); }
    private static ForbiddenException forbidden() { return new ForbiddenException("CHAT_FORBIDDEN", "chat.forbidden", null, null); }
    private static ResourceNotFoundException missing(Long id) { return new ResourceNotFoundException("resource.chat.conversation", id); }
}
