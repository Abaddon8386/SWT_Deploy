package com.swp391.scms.chat.service;

import com.swp391.scms.chat.dto.ChatRealtimeSession;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class ChatRealtimeService {
    private final ChatService chat;
    private final String url;
    private final String publishableKey;
    private final SecretKey signingKey;

    public ChatRealtimeService(ChatService chat, @Value("${app.supabase.url:}") String url,
            @Value("${app.supabase.publishable-key:}") String publishableKey,
            @Value("${app.supabase.chat-jwt-secret:}") String secret) {
        this.chat = chat;
        this.url = url.replaceAll("/+$", "");
        this.publishableKey = publishableKey;
        if (!url.isBlank() && !this.url.matches("https://[A-Za-z0-9.-]+(?::[0-9]+)?"))
            throw new IllegalArgumentException("SUPABASE_URL must be an HTTPS origin");
        if (!publishableKey.isBlank() && !publishableKey.startsWith("sb_publishable_"))
            throw new IllegalArgumentException("SUPABASE_PUBLISHABLE_KEY must be a publishable key");
        if (!secret.isBlank() && secret.getBytes(StandardCharsets.UTF_8).length < 32)
            throw new IllegalArgumentException("SUPABASE_CHAT_JWT_SECRET must contain at least 32 bytes");
        this.signingKey = secret.isBlank() ? null : Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    @Transactional(readOnly = true)
    public ChatRealtimeSession open(AuthenticatedPrincipal principal) {
        chat.requireActor(principal);
        if (url.isBlank() || publishableKey.isBlank() || signingKey == null)
            return new ChatRealtimeSession(false, principal.id(), null, null, null, null, null);
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expires = now.plusSeconds(300);
        String userId = principal.id().toString();
        String subject = UUID.nameUUIDFromBytes(("scms-chat:" + userId).getBytes(StandardCharsets.UTF_8)).toString();
        String token = Jwts.builder().issuer(url + "/auth/v1").subject(subject).audience().add("authenticated").and()
                .claim("role", "authenticated").claim("scms_chat_scope", "receive").claim("scms_chat_user_id", userId)
                .issuedAt(Date.from(now)).expiration(Date.from(expires)).signWith(signingKey, Jwts.SIG.HS256).compact();
        return new ChatRealtimeSession(true, principal.id(), url, publishableKey, "scms:chat:" + userId, token, expires);
    }
    /** Signs a support capability after the support service authorizes its exact topic. */
    public ChatRealtimeSession supportSession(Long actorId, String topic) {
        if (url.isBlank() || publishableKey.isBlank() || signingKey == null)
            return new ChatRealtimeSession(false, actorId, null, null, null, null, null);
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expires = now.plusSeconds(300);
        String subject = UUID.nameUUIDFromBytes(("scms-support:" + actorId).getBytes(StandardCharsets.UTF_8)).toString();
        String token = Jwts.builder().issuer(url + "/auth/v1").subject(subject).audience().add("authenticated").and()
                .claim("role", "authenticated").claim("scms_support_scope", "receive").claim("scms_support_topic", topic)
                .issuedAt(Date.from(now)).expiration(Date.from(expires)).signWith(signingKey, Jwts.SIG.HS256).compact();
        return new ChatRealtimeSession(true, actorId, url, publishableKey, topic, token, expires);
    }
}
