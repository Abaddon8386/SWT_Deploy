package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.SessionEvaluationCreateDto;
import com.swp391.scms.coaching.dto.SessionEvaluationDto;
import com.swp391.scms.coaching.entity.SessionEvaluation;
import com.swp391.scms.coaching.repository.SessionEvaluationRepository;
import com.swp391.scms.coaching.service.SessionEvaluationService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionEvaluationServiceTest {

    @Mock
    private SessionEvaluationRepository evaluationRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private ClassSessionRepository classSessionRepository;

    @Mock private com.swp391.scms.notifications.NotificationService notifications;
    private SessionEvaluationService evaluationService;
    private Member member;
    private Coach coach;

    @BeforeEach
    void setUp() {
        evaluationService = new SessionEvaluationService(
                evaluationRepository, memberRepository, coachRepository, classSessionRepository);

        ReflectionTestUtils.setField(evaluationService, "notificationService", notifications);
        member = new Member();
        member.setUserId(101L);
        member.setMembershipCode("MEM-101");

        coach = new Coach();
        coach.setUserId(202L);
    }

    @Test
    void createEvaluation_WithValidScore_SavesAndReturnsDto() {
        when(memberRepository.findById(101L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(202L)).thenReturn(Optional.of(coach));
        when(evaluationRepository.save(any(SessionEvaluation.class))).thenAnswer(inv -> {
            SessionEvaluation e = inv.getArgument(0);
            ReflectionTestUtils.setField(e, "id", 10L);
            return e;
        });

        SessionEvaluationCreateDto request = new SessionEvaluationCreateDto(
                null, 101L, 202L, new BigDecimal("88.5"), "Tập trung tốt, giữ chuẩn form Squat", "Tiếp tục tăng tạ tuần tới", null
        );

        SessionEvaluationDto result = evaluationService.createEvaluation(request, 202L, "COACH");

        assertNotNull(result);
        assertEquals(10L, result.id());
        assertEquals(101L, result.memberId());
        assertEquals(202L, result.coachId());
        assertEquals(new BigDecimal("88.5"), result.progressScore());
        verify(evaluationRepository).save(any(SessionEvaluation.class));
        verify(notifications).notifyEvaluation(101L);
    }

    @Test
    void createEvaluation_WithOutOfRangeScore_ThrowsBadRequest() {
        SessionEvaluationCreateDto request = new SessionEvaluationCreateDto(
                null, 101L, 202L, new BigDecimal("105.0"), "Notes", "Feedback", null
        );

        assertThrows(BadRequestException.class,
                () -> evaluationService.createEvaluation(request, 202L, "COACH"));
    }

    @Test
    void getMemberEvaluations_WhenOtherMember_ThrowsForbidden() {
        assertThrows(ForbiddenException.class,
                () -> evaluationService.getMemberEvaluations(101L, 999L, "MEMBER"));
    }

    @Test
    void getMyEvaluations_ForMember_ReturnsEvaluations() {
        SessionEvaluation eval = new SessionEvaluation();
        ReflectionTestUtils.setField(eval, "id", 15L);
        eval.setMember(member);
        eval.setCoach(coach);
        eval.setProgressScore(new BigDecimal("92.0"));
        when(evaluationRepository.findByMemberUserIdOrderByEvaluatedAtDesc(101L)).thenReturn(List.of(eval));

        List<SessionEvaluationDto> list = evaluationService.getMyEvaluations(101L, "MEMBER");

        assertEquals(1, list.size());
        assertEquals(new BigDecimal("92.0"), list.get(0).progressScore());
    }
}
