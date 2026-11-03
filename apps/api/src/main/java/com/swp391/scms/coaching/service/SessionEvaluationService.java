package com.swp391.scms.coaching.service;

import com.swp391.scms.coaching.dto.SessionEvaluationCreateDto;
import com.swp391.scms.coaching.dto.SessionEvaluationDto;
import com.swp391.scms.coaching.entity.SessionEvaluation;
import com.swp391.scms.coaching.repository.SessionEvaluationRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Service handling session evaluations by coaches and progress tracking for members (SCRUM-119).
 */
@Service
@Transactional
public class SessionEvaluationService {

    private static final BigDecimal MIN_SCORE = new BigDecimal("1.0");
    private static final BigDecimal MAX_SCORE = new BigDecimal("100.0");

    private final SessionEvaluationRepository evaluationRepository;
    private final MemberRepository memberRepository;
    private final CoachRepository coachRepository;
    private final ClassSessionRepository classSessionRepository;
    private final Clock clock;

    public SessionEvaluationService(SessionEvaluationRepository evaluationRepository,
                                    MemberRepository memberRepository,
                                    CoachRepository coachRepository,
                                    ClassSessionRepository classSessionRepository) {
        this(evaluationRepository, memberRepository, coachRepository, classSessionRepository, Clock.systemDefaultZone());
    }

    private final com.swp391.scms.notifications.NotificationService notificationService;

    public SessionEvaluationService(SessionEvaluationRepository evaluationRepository,
                                    MemberRepository memberRepository,
                                    CoachRepository coachRepository,
                                    @Autowired(required = false) ClassSessionRepository classSessionRepository,
                                    @Autowired(required = false) Clock clock) {
        this(evaluationRepository, memberRepository, coachRepository, classSessionRepository, clock, null);
    }

    @Autowired
    public SessionEvaluationService(SessionEvaluationRepository evaluationRepository, MemberRepository memberRepository,
            CoachRepository coachRepository, ClassSessionRepository classSessionRepository, Clock clock,
            com.swp391.scms.notifications.NotificationService notificationService) {
        this.notificationService = notificationService;
        this.evaluationRepository = evaluationRepository;
        this.memberRepository = memberRepository;
        this.coachRepository = coachRepository;
        this.classSessionRepository = classSessionRepository;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
    }

    public SessionEvaluationDto createEvaluation(SessionEvaluationCreateDto request,
                                                 Long currentUserId,
                                                 String currentRole) {
        if (request.progressScore() == null
                || request.progressScore().compareTo(MIN_SCORE) < 0
                || request.progressScore().compareTo(MAX_SCORE) > 0) {
            throw new BadRequestException("INVALID_PROGRESS_SCORE",
                    "validation.coaching.progress_score.range", null,
                    "Progress score must be between 1.0 and 100.0");
        }

        Member member = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", request.memberId()));

        Long targetCoachId = resolveCoachId(request.coachId(), currentUserId, currentRole);
        Coach coach = coachRepository.findById(targetCoachId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", targetCoachId));

        ClassSession session = null;
        if (request.sessionId() != null && classSessionRepository != null) {
            session = classSessionRepository.findById(request.sessionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.session", request.sessionId()));
        }

        LocalDateTime now = LocalDateTime.now(clock);
        SessionEvaluation evaluation = new SessionEvaluation();
        evaluation.setSession(session);
        evaluation.setMember(member);
        evaluation.setCoach(coach);
        evaluation.setProgressScore(request.progressScore());
        evaluation.setPerformanceNotes(request.performanceNotes());
        evaluation.setFeedback(request.feedback());
        evaluation.setEvaluatedAt(request.evaluatedAt() != null ? request.evaluatedAt() : now);
        evaluation.setCreatedAt(now);

        SessionEvaluation saved = evaluationRepository.save(evaluation);
        if (notificationService != null) notificationService.notifyEvaluation(member.getUserId());
        return toDto(saved);
    }

    @Transactional(readOnly = true)
    public List<SessionEvaluationDto> getMyEvaluations(Long currentUserId, String currentRole) {
        if ("COACH".equalsIgnoreCase(currentRole)) {
            return evaluationRepository.findByCoachUserIdOrderByEvaluatedAtDesc(currentUserId)
                    .stream()
                    .map(this::toDto)
                    .toList();
        }
        return evaluationRepository.findByMemberUserIdOrderByEvaluatedAtDesc(currentUserId)
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SessionEvaluationDto> getMemberEvaluations(Long memberId, Long currentUserId, String currentRole) {
        if ("MEMBER".equalsIgnoreCase(currentRole) && !memberId.equals(currentUserId)) {
            throw new ForbiddenException("FORBIDDEN", "coaching.plan.not_owner", null, null);
        }
        if (coachMemberAccess != null) {
            coachMemberAccess.requireAccess(currentUserId, currentRole, memberId);
        }
        if (!memberRepository.existsById(memberId)) {
            throw new ResourceNotFoundException("resource.member", memberId);
        }
        return evaluationRepository.findByMemberUserIdOrderByEvaluatedAtDesc(memberId)
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SessionEvaluationDto> getSessionEvaluations(Long sessionId) {
        return evaluationRepository.findBySessionIdOrderByEvaluatedAtDesc(sessionId)
                .stream()
                .map(this::toDto)
                .toList();
    }

    private Long resolveCoachId(Long requestedCoachId, Long currentUserId, String currentRole) {
        if ("COACH".equalsIgnoreCase(currentRole)) {
            if (requestedCoachId != null && currentUserId != null && !requestedCoachId.equals(currentUserId)) {
                throw new ForbiddenException("FORBIDDEN", "coaching.plan.not_owner", null, null);
            }
            return currentUserId != null ? currentUserId : requestedCoachId;
        }
        Long targetCoachId = requestedCoachId != null ? requestedCoachId : currentUserId;
        if (targetCoachId == null) {
            throw new BadRequestException("COACH_REQUIRED", "coaching.plan.coach_required", null, null);
        }
        return targetCoachId;
    }

    private SessionEvaluationDto toDto(SessionEvaluation e) {
        return new SessionEvaluationDto(
                e.getId(),
                e.getSession() != null ? e.getSession().getId() : null,
                e.getMember() != null ? e.getMember().getUserId() : null,
                e.getMember() != null ? e.getMember().getMembershipCode() : null,
                e.getCoach() != null ? e.getCoach().getUserId() : null,
                e.getPerformanceNotes(),
                e.getProgressScore(),
                e.getFeedback(),
                e.getEvaluatedAt(),
                e.getCreatedAt()
        );
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.coaching.service.CoachMemberAccess coachMemberAccess;
}
