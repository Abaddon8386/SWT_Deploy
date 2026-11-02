package com.swp391.scms.support;

import com.swp391.scms.chat.service.ChatRealtimeService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.entity.*;
import com.swp391.scms.users.*;
import com.swp391.scms.users.entity.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SupportRealtimeServiceTest {
    final String secret = "unit-supabase-chat-key-with-at-least-32-bytes";
    final SupportRequestRepository tickets = mock(SupportRequestRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final SupportRequestMessageRepository messages = mock(SupportRequestMessageRepository.class);
    final SupportRequestMapper mapper = mock(SupportRequestMapper.class);
    final SupportRequestService support = new SupportRequestService(tickets, mapper, mock(MemberRepository.class), users, messages);
    final ChatRealtimeService signer = new ChatRealtimeService(null, "https://test.supabase.co", "sb_publishable_test", secret);
    final SupportRealtimeService realtime = new SupportRealtimeService(support, signer);
    final AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "private", "MEMBER");

    User actor(Long id, String role) {
        User u = new User(); u.setId(id); u.setStatus("active");
        Role r = new Role(); r.setCode(role); u.setRole(r);
        when(users.findByIdAndDeletedAtIsNull(id)).thenReturn(Optional.of(u)); return u;
    }
    SupportRequest ticket() {
        Member m = new Member(); m.setUserId(10L);
        SupportRequest t = new SupportRequest(m, "secret", "private"); t.setId(7L); return t;
    }
    @Test void ticketTokenHasExactTopicNoChatScopeAndFiveMinuteExpiry() {
        actor(10L, "MEMBER"); when(tickets.findById(7L)).thenReturn(Optional.of(ticket()));
        var session = realtime.ticket(7L, principal);
        var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(session.token()).getPayload();
        assertThat(session.topic()).isEqualTo("scms:support:ticket:7");
        assertThat(claims.get("scms_support_topic")).isEqualTo(session.topic());
        assertThat(claims.get("scms_support_scope")).isEqualTo("receive");
        assertThat(claims).doesNotContainKeys("scms_chat_scope", "scms_chat_user_id", "username", "email");
        assertThat(claims.getExpiration().getTime()-claims.getIssuedAt().getTime()).isEqualTo(300000);
    }
    @Test void memberCannotSubscribeToInboxOrAnotherTicketAndInactiveActorCannotSubscribe() {
        User actor = actor(10L, "MEMBER");
        assertThatThrownBy(() -> realtime.inbox(principal)).isInstanceOf(ForbiddenException.class);
        var other = ticket(); other.getMember().setUserId(99L);
        when(tickets.findById(7L)).thenReturn(Optional.of(other));
        assertThatThrownBy(() -> realtime.ticket(7L, principal)).isInstanceOf(ForbiddenException.class);
        actor.setStatus("inactive");
        assertThatThrownBy(() -> realtime.ticket(7L, principal)).isInstanceOf(ForbiddenException.class);
    }
    @Test void staffReceivesOnlyInboxCapability() {
        actor(20L, "CENTER_MANAGER");
        assertThat(realtime.inbox(new AuthenticatedPrincipal(20L, "staff", "CENTER_MANAGER")).topic()).isEqualTo("scms:support:inbox");
    }
    @Test void idempotentReplayReturnsOriginalEvenAfterCloseWithoutAnotherWrite() {
        var actor = actor(10L, "MEMBER"); var ticket = ticket(); ticket.setStatus("closed");
        var key = UUID.randomUUID(); var message = new SupportRequestMessage(ticket, actor, "hello");
        when(tickets.findByIdForUpdate(7L)).thenReturn(Optional.of(ticket));
        when(messages.findBySupportRequestIdAndSenderIdAndClientMessageId(7L,10L,key)).thenReturn(Optional.of(message));
        support.sendMessage(7L,10L,"MEMBER",new CreateSupportMessageDto("hello",key));
        verify(messages,never()).save(any()); verify(mapper).toMessageDto(message);
        assertThatThrownBy(() -> support.sendMessage(7L,10L,"MEMBER",new CreateSupportMessageDto("different",key)))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class);
    }
    @Test void closedTicketRejectsNewKeyUnderTicketLock() {
        actor(10L,"MEMBER");var ticket=ticket();ticket.setStatus("closed");
        when(tickets.findByIdForUpdate(7L)).thenReturn(Optional.of(ticket));
        assertThatThrownBy(() -> support.sendMessage(7L,10L,"MEMBER",new CreateSupportMessageDto("hello",UUID.randomUUID())))
                .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
        verify(messages,never()).save(any());
    }
    @Test void sessionResponsesCannotBeCached() {
        var mockService = mock(SupportRealtimeService.class);
        var controller = new SupportRealtimeController(mockService);
        assertThat(controller.ticket(7L,principal).getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(controller.inbox(principal).getHeaders().getCacheControl()).isEqualTo("no-store");
    }
    @Test void sourceUsesPrivateTransactionalInvalidationsAndRestrictivePolicies() throws Exception {
        String sql = new String(getClass().getResourceAsStream("/db/triggers/postgresql-triggers.sql").readAllBytes(),StandardCharsets.UTF_8);
        assertThat(sql).contains("trg_support_request_realtime AFTER INSERT OR UPDATE", "trg_support_message_realtime AFTER INSERT",
            "realtime.send('{}'::jsonb, 'changed', 'scms:support:ticket:' || ticket_id::text, true)",
            "scms_support_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO PUBLIC",
            "scms_support_send_guard ON realtime.messages AS RESTRICTIVE FOR INSERT TO PUBLIC",
            "realtime.topic() = (auth.jwt() ->> 'scms_support_topic')");
    }
}
