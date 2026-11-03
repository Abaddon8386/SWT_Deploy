package com.swp391.scms.ai.service;

import com.swp391.scms.ai.client.AiChatProvider;
import com.swp391.scms.ai.dto.AiChatMessageCreateDto;
import com.swp391.scms.ai.dto.AiChatMessageDto;
import com.swp391.scms.ai.dto.AiChatReplyDto;
import com.swp391.scms.ai.dto.AiChatSessionCreateDto;
import com.swp391.scms.ai.dto.AiChatSessionDto;
import com.swp391.scms.ai.entity.AiChatMessage;
import com.swp391.scms.ai.entity.AiChatSession;
import com.swp391.scms.ai.repository.AiChatMessageRepository;
import com.swp391.scms.ai.repository.AiChatSessionRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;

/**
 * Service managing 24/7 AI Chatbot sessions and messages for SCMS members (SCRUM-118).
 */
@Service
public class AiChatService {

    public static final String SYSTEM_PROMPT = """
            Bạn là Trợ lý Tư vấn Thể thao & Dinh dưỡng 24/7 của Trung tâm SCMS (Sports Center Management System).
            Nhiệm vụ của bạn:
            1. Tư vấn các bộ môn thể thao tại trung tâm (Gym là bộ môn chính; bộ môn phụ gồm Bơi lội, Boxing, Tennis, Cầu lông, Yoga), lịch tập luyện và phương pháp phục hồi.
            2. Cung cấp lời khuyên dinh dưỡng thể thao cơ bản, tính toán cân đối calo/macro an toàn.
            3. Tuyệt đối bảo mật dữ liệu cá nhân của các hội viên khác.
            4. Từ chối lịch sự mọi câu hỏi ngoài phạm vi thể thao, sức khỏe, dinh dưỡng hoặc dịch vụ trung tâm SCMS.
            5. Không suy đoán bảng giá, lịch lớp, trạng thái gói tập hay dữ liệu cá nhân khi chưa có dữ liệu xác thực; hướng dẫn hội viên tra cứu các màn hình portal tương ứng.
            6. Trả lời bằng văn bản thuần (plain text) dễ đọc: KHÔNG dùng ký hiệu Markdown như **, *, #, hay ```; chỉ xuống dòng và dùng dấu • khi liệt kê ngắn gọn (tối đa 3-5 câu).
            """;

    private static final int MAX_CONTEXT_MESSAGES = 6;

    private final AiChatSessionRepository sessionRepository;
    private final AiChatMessageRepository messageRepository;
    private final MemberRepository memberRepository;
    private final MessageService messageService;
    private final AiChatProvider chatProvider;
    private final AiRagContextService ragContextService;
    private final TransactionTemplate writeTx;
    private final TransactionTemplate readOnlyTx;

    public AiChatService(AiChatSessionRepository sessionRepository,
                         AiChatMessageRepository messageRepository,
                         MemberRepository memberRepository,
                         MessageService messageService) {
        this(sessionRepository, messageRepository, memberRepository, messageService, null, null, null);
    }

    public AiChatService(AiChatSessionRepository sessionRepository,
                         AiChatMessageRepository messageRepository,
                         MemberRepository memberRepository,
                         MessageService messageService,
                         AiChatProvider chatProvider) {
        this(sessionRepository, messageRepository, memberRepository, messageService, chatProvider, null, null);
    }

    public AiChatService(AiChatSessionRepository sessionRepository,
                         AiChatMessageRepository messageRepository,
                         MemberRepository memberRepository,
                         MessageService messageService,
                         AiChatProvider chatProvider,
                         AiRagContextService ragContextService) {
        this(sessionRepository, messageRepository, memberRepository, messageService, chatProvider, ragContextService, null);
    }

    @Autowired
    public AiChatService(AiChatSessionRepository sessionRepository,
                         AiChatMessageRepository messageRepository,
                         MemberRepository memberRepository,
                         MessageService messageService,
                         AiChatProvider chatProvider,
                         @Autowired(required = false) AiRagContextService ragContextService,
                         @Autowired(required = false) PlatformTransactionManager txManager) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.memberRepository = memberRepository;
        this.messageService = messageService;
        this.chatProvider = chatProvider;
        this.ragContextService = ragContextService;
        if (txManager != null) {
            this.writeTx = new TransactionTemplate(txManager);
            this.readOnlyTx = new TransactionTemplate(txManager);
            this.readOnlyTx.setReadOnly(true);
        } else {
            this.writeTx = null;
            this.readOnlyTx = null;
        }
    }

    private <T> T inReadOnlyTx(Supplier<T> action) {
        return readOnlyTx != null ? readOnlyTx.execute(status -> action.get()) : action.get();
    }

    private <T> T inWriteTx(Supplier<T> action) {
        return writeTx != null ? writeTx.execute(status -> action.get()) : action.get();
    }

    /**
     * Creates a new AI chat session for a member.
     */
    @Transactional
    public AiChatSessionDto createSession(AiChatSessionCreateDto dto, Long currentUserId, String currentRole) {
        Member member = resolveTargetMember(dto != null ? dto.memberId() : null, currentUserId, currentRole);

        AiChatSession session = new AiChatSession();
        session.setMember(member);
        String topic = (dto != null && dto.topic() != null && !dto.topic().isBlank())
                ? dto.topic().trim()
                : "Tư vấn Thể thao & Dinh dưỡng SCMS";
        session.setTopic(topic);
        session.setStartedAt(LocalDateTime.now());

        AiChatSession saved = sessionRepository.save(session);
        return toSessionDto(saved);
    }

    /**
     * Lists chat sessions for the current member.
     */
    @Transactional(readOnly = true)
    public List<AiChatSessionDto> getMySessions(Long currentUserId) {
        Member member = memberRepository.findById(currentUserId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", currentUserId));
        return sessionRepository.findByMemberUserIdOrderByStartedAtDesc(member.getUserId())
                .stream()
                .map(this::toSessionDto)
                .toList();
    }

    /**
     * Quick-send message flow: if dto.sessionId() is provided, appends to that session;
     * otherwise reuses the member's most recent active session or auto-creates one.
     */
    public AiChatReplyDto sendQuickMessage(AiChatMessageCreateDto dto, Long currentUserId, String currentRole) {
        if (dto == null || dto.message() == null || dto.message().isBlank()) {
            throw new BadRequestException(msg("validation.ai.chat.message.required"));
        }
        Long sessionId = dto.sessionId();
        if (sessionId == null) {
            sessionId = inWriteTx(() -> {
                // Serialize a member's quick sends so two messages at once share one new session.
                if ("MEMBER".equalsIgnoreCase(currentRole)) {
                    memberRepository.findByUserIdForUpdate(currentUserId);
                }
                List<AiChatSession> existing = sessionRepository.findByMemberUserIdOrderByStartedAtDesc(currentUserId);
                if (!existing.isEmpty() && existing.get(0).getEndedAt() == null) {
                    return existing.get(0).getId();
                }
                String derivedTopic = deriveTopicFromMessage(dto.topic(), dto.message());
                AiChatSessionDto created = createSession(
                        new AiChatSessionCreateDto(currentUserId, derivedTopic),
                        currentUserId,
                        currentRole);
                return created.id();
            });
        }
        return sendMessage(sessionId, dto, currentUserId, currentRole);
    }

    private String deriveTopicFromMessage(String explicitTopic, String rawMessage) {
        if (explicitTopic != null && !explicitTopic.isBlank()) {
            return explicitTopic.trim();
        }
        String cleaned = rawMessage != null ? rawMessage.trim().replaceAll("\\s+", " ") : "";
        if (cleaned.isEmpty()) {
            return null;
        }
        return cleaned.length() <= 60 ? cleaned : cleaned.substring(0, 57) + "...";
    }

    private record PreparedChatRequest(
            AiChatSession session,
            String effectiveSystemPrompt,
            List<AiChatProvider.Turn> turns,
            String userMessage
    ) {}

    /**
     * Sends a member message in an existing chat session, generates the AI reply with session context,
     * and persists both messages in chronological order without holding a DB connection during the AI call.
     */
    public AiChatReplyDto sendMessage(Long sessionId,
                                      AiChatMessageCreateDto dto,
                                      Long currentUserId,
                                      String currentRole) {
        if (dto == null || dto.message() == null || dto.message().isBlank()) {
            throw new BadRequestException(msg("validation.ai.chat.message.required"));
        }
        String trimmedUserMessage = dto.message().trim();

        // Phase 1: short read-only transaction (check ownership, load history, build RAG context String)
        PreparedChatRequest prepared = inReadOnlyTx(() -> {
            AiChatSession session = getAuthorizedSession(sessionId, currentUserId, currentRole);
            List<AiChatMessage> existingHistory = messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(sessionId);
            if (chatProvider == null) {
                throw new com.swp391.scms.common.exception.ServiceUnavailableException(
                        "AI_CHAT_NOT_CONFIGURED", "ai.chat.provider.not_configured", null,
                        "The AI assistant is not configured.");
            }
            String effectiveSystemPrompt = SYSTEM_PROMPT;
            if (ragContextService != null) {
                String retrievedContext = ragContextService.buildRagContext(session.getMember(), trimmedUserMessage);
                if (retrievedContext != null && !retrievedContext.isBlank()) {
                    effectiveSystemPrompt = SYSTEM_PROMPT + "\n\n" + retrievedContext;
                }
            }
            var turns = new java.util.ArrayList<AiChatProvider.Turn>();
            existingHistory.subList(Math.max(0, existingHistory.size() - MAX_CONTEXT_MESSAGES), existingHistory.size())
                    .forEach(message -> turns.add(new AiChatProvider.Turn(
                            "ai".equals(message.getSender()) ? "assistant" : "user", message.getMessage())));
            turns.add(new AiChatProvider.Turn("user", trimmedUserMessage));
            return new PreparedChatRequest(session, effectiveSystemPrompt, List.copyOf(turns), trimmedUserMessage);
        });

        // Phase 2: call AI provider outside transaction (no DB connection held)
        String aiReplyText = stripMarkdown(chatProvider.generate(prepared.effectiveSystemPrompt(), prepared.turns()));

        // Phase 3: short write transaction to persist user & AI messages
        return inWriteTx(() -> {
            // Re-check ownership: the AI call ran without a transaction, so the session is read again before writing.
            AiChatSession targetSession = getAuthorizedSession(sessionId, currentUserId, currentRole);
            LocalDateTime now = LocalDateTime.now();

            AiChatMessage memberMsg = new AiChatMessage();
            memberMsg.setSession(targetSession);
            memberMsg.setSender("member");
            memberMsg.setMessage(prepared.userMessage());
            memberMsg.setCreatedAt(now);
            AiChatMessage savedMemberMsg = messageRepository.save(memberMsg);

            AiChatMessage aiMsg = new AiChatMessage();
            aiMsg.setSession(targetSession);
            aiMsg.setSender("ai");
            aiMsg.setMessage(aiReplyText);
            aiMsg.setCreatedAt(now.plusNanos(1_000_000));
            AiChatMessage savedAiMsg = messageRepository.save(aiMsg);

            return new AiChatReplyDto(
                    targetSession.getId(),
                    toMessageDto(savedMemberMsg),
                    toMessageDto(savedAiMsg),
                    savedAiMsg.getMessage()
            );
        });
    }

    /**
     * Retrieves chronological chat history for a session.
     */
    @Transactional(readOnly = true)
    public List<AiChatMessageDto> getSessionHistory(Long sessionId, Long currentUserId, String currentRole) {
        AiChatSession session = getAuthorizedSession(sessionId, currentUserId, currentRole);
        return messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(session.getId())
                .stream()
                .map(this::toMessageDto)
                .toList();
    }

    private AiChatSession getAuthorizedSession(Long sessionId, Long currentUserId, String currentRole) {
        AiChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("error.ai.chat.session.not_found", sessionId));

        if ("MEMBER".equalsIgnoreCase(currentRole)) {
            Long ownerUserId = session.getMember() != null ? session.getMember().getUserId() : null;
            if (ownerUserId == null || !ownerUserId.equals(currentUserId)) {
                throw new AccessDeniedException(msg("coaching.plan.not_owner"));
            }
        }
        return session;
    }

    private Member resolveTargetMember(Long requestedMemberId, Long currentUserId, String currentRole) {
        boolean isMember = "MEMBER".equalsIgnoreCase(currentRole);
        if (isMember && requestedMemberId != null && currentUserId != null && !requestedMemberId.equals(currentUserId)) {
            throw new AccessDeniedException(msg("coaching.plan.not_owner"));
        }
        Long targetId = isMember
                ? (currentUserId != null ? currentUserId : requestedMemberId)
                : (requestedMemberId != null ? requestedMemberId : currentUserId);
        return memberRepository.findById(targetId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", targetId));
    }

    private String generateContextualReply(Member member,
                                           List<AiChatMessage> history,
                                           String userMessage) {
        if (chatProvider == null) {
            throw new com.swp391.scms.common.exception.ServiceUnavailableException(
                    "AI_CHAT_NOT_CONFIGURED", "ai.chat.provider.not_configured", null,
                    "The AI assistant is not configured.");
        }
        String effectiveSystemPrompt = SYSTEM_PROMPT;
        if (ragContextService != null) {
            String retrievedContext = ragContextService.buildRagContext(member, userMessage);
            if (retrievedContext != null && !retrievedContext.isBlank()) {
                effectiveSystemPrompt = SYSTEM_PROMPT + "\n\n" + retrievedContext;
            }
        }
        var turns = new java.util.ArrayList<AiChatProvider.Turn>();
        history.subList(Math.max(0, history.size() - MAX_CONTEXT_MESSAGES), history.size())
                .forEach(message -> turns.add(new AiChatProvider.Turn(
                        "ai".equals(message.getSender()) ? "assistant" : "user", message.getMessage())));
        turns.add(new AiChatProvider.Turn("user", userMessage));
        return stripMarkdown(chatProvider.generate(effectiveSystemPrompt, turns));
    }

    private static String stripMarkdown(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        return raw.replaceAll("(?m)^[ \\t]*#{1,6}[ \\t]+", "")
                .replaceAll("(?m)^[ \\t]*[*+-][ \\t]+", "• ")
                .replaceAll("\\*\\*([^*]+)\\*\\*", "$1")
                .replaceAll("__([^_]+)__", "$1")
                .replaceAll("`([^`\\n]+)`", "$1")
                .trim();
    }

    private AiChatSessionDto toSessionDto(AiChatSession session) {
        return new AiChatSessionDto(
                session.getId(),
                session.getMember() != null ? session.getMember().getUserId() : null,
                session.getTopic(),
                session.getStartedAt(),
                session.getEndedAt()
        );
    }

    private AiChatMessageDto toMessageDto(AiChatMessage message) {
        return new AiChatMessageDto(
                message.getId(),
                message.getSession() != null ? message.getSession().getId() : null,
                message.getSender(),
                message.getMessage(),
                message.getCreatedAt()
        );
    }

    private String msg(String key, Object... args) {
        if (messageService == null) {
            return key;
        }
        return messageService.getMessage(key, args);
    }
}
