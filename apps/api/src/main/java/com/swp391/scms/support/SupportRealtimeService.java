package com.swp391.scms.support;

import com.swp391.scms.chat.dto.ChatRealtimeSession;
import com.swp391.scms.chat.service.ChatRealtimeService;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SupportRealtimeService {
    private final SupportRequestService support;
    private final ChatRealtimeService realtime;
    public SupportRealtimeService(SupportRequestService support, ChatRealtimeService realtime) {
        this.support = support; this.realtime = realtime;
    }
    public ChatRealtimeSession ticket(Long id, AuthenticatedPrincipal actor) {
        support.requireTicket(id, actor.id(), actor.role());
        return realtime.supportSession(actor.id(), "scms:support:ticket:" + id);
    }
    public ChatRealtimeSession inbox(AuthenticatedPrincipal actor) {
        support.requireActor(actor.id(), actor.role());
        if (!"CENTER_MANAGER".equals(actor.role()) && !"RECEPTIONIST".equals(actor.role()))
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        return realtime.supportSession(actor.id(), "scms:support:inbox");
    }
}
