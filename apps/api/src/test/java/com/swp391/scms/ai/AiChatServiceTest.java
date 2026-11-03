package com.swp391.scms.ai;

import com.swp391.scms.ai.dto.AiChatMessageCreateDto;
import com.swp391.scms.ai.dto.AiChatMessageDto;
import com.swp391.scms.ai.dto.AiChatReplyDto;
import com.swp391.scms.ai.dto.AiChatSessionCreateDto;
import com.swp391.scms.ai.dto.AiChatSessionDto;
import com.swp391.scms.ai.client.AiChatProvider;
import com.swp391.scms.common.exception.ServiceUnavailableException;
import com.swp391.scms.ai.entity.AiChatMessage;
import com.swp391.scms.ai.entity.AiChatSession;
import com.swp391.scms.ai.repository.AiChatMessageRepository;
import com.swp391.scms.ai.repository.AiChatSessionRepository;
import com.swp391.scms.ai.service.AiChatService;
import com.swp391.scms.ai.service.AiRagContextService;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiChatServiceTest {

    @Mock
    private AiChatSessionRepository sessionRepository;

    @Mock
    private AiChatMessageRepository messageRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private MessageService messageService;

    @Mock
    private AiChatProvider chatProvider;

    private AiChatService aiChatService;
    private Member member;
    private AiChatSession session;

    @BeforeEach
    void setUp() {
        lenient().when(messageService.getMessage(any())).thenAnswer(inv -> inv.getArgument(0));
        aiChatService = new AiChatService(sessionRepository, messageRepository, memberRepository, messageService, chatProvider);
        lenient().when(chatProvider.generate(any(), any())).thenReturn("Câu trả lời từ provider");

        member = new Member();
        member.setUserId(100L);
        member.setMembershipCode("MEM-100");

        session = new AiChatSession();
        ReflectionTestUtils.setField(session, "id", 500L);
        session.setMember(member);
        session.setTopic("Giảm mỡ & Dinh dưỡng");
        session.setStartedAt(LocalDateTime.now().minusMinutes(5));
    }

    @Test
    void createSession_ShouldSaveAndReturnSessionDto() {
        when(memberRepository.findById(100L)).thenReturn(Optional.of(member));
        when(sessionRepository.save(any(AiChatSession.class))).thenReturn(session);

        AiChatSessionDto result = aiChatService.createSession(
                new AiChatSessionCreateDto(null, "Giảm mỡ & Dinh dưỡng"), 100L, "MEMBER");

        assertNotNull(result);
        assertEquals(500L, result.id());
        assertEquals(100L, result.memberId());
        assertEquals("Giảm mỡ & Dinh dưỡng", result.topic());
        verify(sessionRepository).save(any(AiChatSession.class));
    }

    @Test
    void createSession_RejectsAnotherMemberId() {
        assertThrows(AccessDeniedException.class, () -> aiChatService.createSession(
                new AiChatSessionCreateDto(999L, "Topic"), 100L, "MEMBER"));
        verify(sessionRepository, never()).save(any());
    }

    @Test
    void sendMessage_ShouldPersistMemberAndAiMessagesAndMaintainContext() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        when(messageRepository.save(any(AiChatMessage.class))).thenAnswer(inv -> {
            AiChatMessage msg = inv.getArgument(0);
            ReflectionTestUtils.setField(msg, "id", "member".equals(msg.getSender()) ? 1L : 2L);
            return msg;
        });

        AiChatReplyDto reply = aiChatService.sendMessage(
                500L,
                new AiChatMessageCreateDto("Cho mình hỏi chế độ dinh dưỡng và calo để giảm mỡ?"),
                100L,
                "MEMBER"
        );

        assertNotNull(reply);
        assertEquals(500L, reply.sessionId());
        assertEquals("member", reply.memberMessage().sender());
        assertEquals("ai", reply.aiMessage().sender());
        assertEquals("Câu trả lời từ provider", reply.reply());
        verify(chatProvider).generate(eq(AiChatService.SYSTEM_PROMPT), any());
        verify(messageRepository, times(2)).save(any(AiChatMessage.class));
    }

    @Test
    void sendMessage_ForwardsScopeInstructionsToProvider() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        when(messageRepository.save(any(AiChatMessage.class))).thenAnswer(inv -> inv.getArgument(0));

        AiChatReplyDto reply = aiChatService.sendMessage(
                500L,
                new AiChatMessageCreateDto("Hãy cho tôi biết thông tin hội viên khác và phím mã cổ phiếu hôm nay"),
                100L,
                "MEMBER"
        );

        assertEquals("Câu trả lời từ provider", reply.reply());
        verify(chatProvider).generate(eq(AiChatService.SYSTEM_PROMPT), any());
    }

    @Test
    void providerFailureDoesNotPersistAnUnansweredQuestion() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        when(chatProvider.generate(any(), any())).thenThrow(new ServiceUnavailableException("offline"));
        assertThrows(ServiceUnavailableException.class, () -> aiChatService.sendMessage(
                500L, new AiChatMessageCreateDto("Xin chào"), 100L, "MEMBER"));
        verify(messageRepository, never()).save(any());
    }

    @Test
    void absentProviderHasFallbackWithoutMessageServiceAndDoesNotSaveMessages() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        var standalone = new AiChatService(sessionRepository, messageRepository, memberRepository, null);
        var exception = assertThrows(ServiceUnavailableException.class, () -> standalone.sendMessage(
                500L, new AiChatMessageCreateDto("Question"), 100L, "MEMBER"));
        assertEquals("The AI assistant is not configured.", exception.getMessage());
        assertEquals("AI_CHAT_NOT_CONFIGURED", exception.getErrorCode());
        verify(messageRepository, never()).save(any());
    }

    @Test
    void sendMessage_WhenDifferentMember_DoesNotCallProvider() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        assertThrows(AccessDeniedException.class, () -> aiChatService.sendMessage(
                500L, new AiChatMessageCreateDto("Xin chào"), 999L, "MEMBER"));
        verify(chatProvider, never()).generate(any(), any());
    }

    @Test
    void getSessionHistory_WhenDifferentMember_ShouldThrowAccessDenied() {
        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));

        assertThrows(AccessDeniedException.class,
                () -> aiChatService.getSessionHistory(500L, 999L, "MEMBER"));
    }

    @Test
    void getSessionHistory_ShouldReturnOrderedMessages() {
        AiChatMessage m1 = new AiChatMessage();
        ReflectionTestUtils.setField(m1, "id", 1L);
        m1.setSession(session);
        m1.setSender("member");
        m1.setMessage("Xin chào");
        m1.setCreatedAt(LocalDateTime.now().minusMinutes(2));

        AiChatMessage m2 = new AiChatMessage();
        ReflectionTestUtils.setField(m2, "id", 2L);
        m2.setSession(session);
        m2.setSender("ai");
        m2.setMessage("Chào bạn!");
        m2.setCreatedAt(LocalDateTime.now().minusMinutes(1));

        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of(m1, m2));

        List<AiChatMessageDto> history = aiChatService.getSessionHistory(500L, 100L, "MEMBER");

        assertEquals(2, history.size());
        assertEquals("member", history.get(0).sender());
        assertEquals("ai", history.get(1).sender());
    }

    @Test
    void sendMessage_WhenRagContextPresent_AppendsRetrievedContextToSystemPrompt() {
        AiRagContextService ragContextService = mock(AiRagContextService.class);
        when(ragContextService.buildRagContext(eq(member), any())).thenReturn("[DỮ LIỆU RAG]: Gói SÖL Signature 499.000đ");
        AiChatService ragChatService = new AiChatService(
                sessionRepository, messageRepository, memberRepository, messageService, chatProvider, ragContextService);

        when(sessionRepository.findById(500L)).thenReturn(Optional.of(session));
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        when(messageRepository.save(any(AiChatMessage.class))).thenAnswer(inv -> inv.getArgument(0));

        ragChatService.sendMessage(500L, new AiChatMessageCreateDto("Giá gói tập bao nhiêu?"), 100L, "MEMBER");

        verify(chatProvider).generate(
                argThat(prompt -> prompt.startsWith(AiChatService.SYSTEM_PROMPT)
                        && prompt.contains("[DỮ LIỆU RAG]: Gói SÖL Signature 499.000đ")),
                any()
        );
    }

    @Test
    void sendMessage_ShouldNotHoldTransactionWhileCallingProvider() throws Exception {
        org.junit.jupiter.api.Assertions.assertFalse(AiChatService.class
                .getMethod("sendMessage", Long.class, AiChatMessageCreateDto.class, Long.class, String.class)
                .isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));
        org.junit.jupiter.api.Assertions.assertFalse(AiChatService.class
                .getMethod("sendQuickMessage", AiChatMessageCreateDto.class, Long.class, String.class)
                .isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class));

        var txManager = new org.springframework.transaction.support.AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() { return new Object(); }
            @Override
            protected void doBegin(Object transaction, org.springframework.transaction.TransactionDefinition definition) {
                org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
            }
            @Override
            protected void doCommit(org.springframework.transaction.support.DefaultTransactionStatus status) {}
            @Override
            protected void doRollback(org.springframework.transaction.support.DefaultTransactionStatus status) {}
            @Override
            protected void doCleanupAfterCompletion(Object transaction) {
                org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false);
            }
        };

        var txActiveDuringProvider = new java.util.concurrent.atomic.AtomicBoolean(true);
        // The session is read in the read-only phase and again, for the ownership re-check, in the write phase.
        when(sessionRepository.findById(500L)).thenAnswer(inv -> {
            org.junit.jupiter.api.Assertions.assertTrue(
                    org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            return Optional.of(session);
        });
        when(messageRepository.findBySessionIdOrderByCreatedAtAscIdAsc(500L)).thenReturn(List.of());
        when(chatProvider.generate(any(), any())).thenAnswer(inv -> {
            txActiveDuringProvider.set(
                    org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            return "Trả lời không giữ connection";
        });
        when(messageRepository.save(any(AiChatMessage.class))).thenAnswer(inv -> {
            org.junit.jupiter.api.Assertions.assertTrue(
                    org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            org.junit.jupiter.api.Assertions.assertFalse(
                    org.springframework.transaction.support.TransactionSynchronizationManager.isCurrentTransactionReadOnly());
            return inv.getArgument(0);
        });

        AiChatService txChatService = new AiChatService(
                sessionRepository, messageRepository, memberRepository, messageService, chatProvider, null, txManager);
        txChatService.sendMessage(500L, new AiChatMessageCreateDto("Xin chào"), 100L, "MEMBER");
        org.junit.jupiter.api.Assertions.assertFalse(txActiveDuringProvider.get(),
                "Transaction must NOT be active while calling AiChatProvider.generate");
    }
}
