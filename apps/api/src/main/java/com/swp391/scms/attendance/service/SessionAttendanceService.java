package com.swp391.scms.attendance.service;

import com.swp391.scms.attendance.dto.BatchAttendanceRequest;
import com.swp391.scms.attendance.dto.SessionAttendanceResponse;
import com.swp391.scms.attendance.dto.SessionAttendanceResponse.MemberAttendanceItem;
import com.swp391.scms.attendance.entity.SessionAttendance;
import com.swp391.scms.attendance.repository.SessionAttendanceRepository;
import com.swp391.scms.coaching.entity.SessionEvaluation;
import com.swp391.scms.coaching.repository.SessionEvaluationRepository;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * SCRUM-111: Session attendance service for retrieving rosters and batch recording attendance.
 */
@Service
public class SessionAttendanceService {

    private static final Logger log = LoggerFactory.getLogger(SessionAttendanceService.class);

    private final SessionAttendanceRepository attendanceRepository;
    private final ClassSessionRepository sessionRepository;
    private final ClassEnrollmentRepository enrollmentRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;
    private final CoachRepository coachRepository;
    private final MemberRepository memberRepository;
    private final MessageService messageService;
    private final Clock clock;

    @Autowired(required = false)
    private SessionEvaluationRepository evaluationRepository;

    private final com.swp391.scms.notifications.NotificationService notificationService;

    public SessionAttendanceService(SessionAttendanceRepository attendanceRepository,
                                  ClassSessionRepository sessionRepository,
                                  ClassEnrollmentRepository enrollmentRepository,
                                  CoachRepository coachRepository,
                                  MemberRepository memberRepository,
                                  MessageService messageService,
                                  Clock clock) {
        this(attendanceRepository, sessionRepository, enrollmentRepository, coachRepository, memberRepository, messageService, clock, null);
    }

    @Autowired
    public SessionAttendanceService(SessionAttendanceRepository attendanceRepository, ClassSessionRepository sessionRepository,
            ClassEnrollmentRepository enrollmentRepository, CoachRepository coachRepository, MemberRepository memberRepository,
            MessageService messageService, Clock clock, com.swp391.scms.notifications.NotificationService notificationService) {
        this.notificationService = notificationService;
        this.attendanceRepository = attendanceRepository;
        this.sessionRepository = sessionRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.coachRepository = coachRepository;
        this.memberRepository = memberRepository;
        this.messageService = messageService;
        this.clock = clock;
    }

    public SessionAttendanceService(SessionAttendanceRepository attendanceRepository,
                                  ClassSessionRepository sessionRepository,
                                  ClassEnrollmentRepository enrollmentRepository,
                                  CoachRepository coachRepository,
                                  MemberRepository memberRepository) {
        this(attendanceRepository, sessionRepository, enrollmentRepository, coachRepository, memberRepository, null, Clock.systemUTC());
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    private record RosterEntry(Member member, String status) {}

    /** Everyone with a seat in this session: class-wide enrollments plus members who booked this session. */
    private List<RosterEntry> rosterFor(ClassSession session) {
        Map<Long, RosterEntry> roster = new java.util.LinkedHashMap<>();
        for (ClassEnrollment e : enrollmentRepository.findByGymClassId(session.getGymClass().getId())) {
            if ("booked".equalsIgnoreCase(e.getStatus()) && e.getMember() != null) {
                roster.putIfAbsent(e.getMember().getUserId(), new RosterEntry(e.getMember(), e.getStatus()));
            }
        }
        if (sessionBookings != null) {
            for (com.swp391.scms.scheduling.entity.SessionBooking b : sessionBookings.findBySessionIdAndStatus(session.getId(), "booked")) {
                if (b.getMember() != null) {
                    roster.putIfAbsent(b.getMember().getUserId(), new RosterEntry(b.getMember(), b.getStatus()));
                }
            }
        }
        return new ArrayList<>(roster.values());
    }

    /**
     * SCRUM-111 AC: GET /api/v1/attendance/sessions/{id}
     * Returns list of enrolled students for the session with their attendance records if recorded.
     */
    @Transactional(readOnly = true)
    public SessionAttendanceResponse getSessionAttendanceRoster(Long sessionId) {
        ClassSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));

        Long classId = session.getGymClass().getId();
        List<RosterEntry> enrollments = rosterFor(session);

        List<SessionAttendance> attendances = attendanceRepository.findBySessionIdWithDetails(sessionId);
        Map<Long, SessionAttendance> attendanceMap = attendances.stream()
                .filter(a -> a.getMember() != null)
                .collect(Collectors.toMap(a -> a.getMember().getUserId(), a -> a, (first, second) -> first));

        Map<Long, Integer> scoreMap = new HashMap<>();
        if (evaluationRepository != null) {
            List<SessionEvaluation> evaluations = evaluationRepository.findBySessionIdOrderByEvaluatedAtDesc(sessionId);
            if (evaluations != null) {
                for (SessionEvaluation eval : evaluations) {
                    if (eval.getMember() != null && eval.getMember().getUserId() != null && eval.getProgressScore() != null) {
                        scoreMap.putIfAbsent(eval.getMember().getUserId(), eval.getProgressScore().intValue());
                    }
                }
            }
        }

        List<MemberAttendanceItem> memberItems = new ArrayList<>();
        int presentCount = 0;
        int absentCount = 0;
        int lateCount = 0;
        int excusedCount = 0;

        for (RosterEntry enrollment : enrollments) {
            Member member = enrollment.member();
            if (member == null) {
                continue;
            }
            User user = member.getUser();
            SessionAttendance att = attendanceMap.get(member.getUserId());

            String attStatus = att != null ? att.getStatus() : null;
            LocalDateTime checkInTime = att != null ? att.getCheckedInAt() : null;
            Long coachId = (att != null && att.getRecordedBy() != null) ? att.getRecordedBy().getUserId() : null;
            String coachName = (att != null && att.getRecordedBy() != null && att.getRecordedBy().getUser() != null)
                    ? att.getRecordedBy().getUser().getFullName()
                    : null;
            String notes = att != null ? att.getNotes() : null;

            if (attStatus != null) {
                switch (attStatus.toLowerCase()) {
                    case "present" -> presentCount++;
                    case "absent" -> absentCount++;
                    case "late" -> lateCount++;
                    case "excused" -> excusedCount++;
                }
            }

            memberItems.add(new MemberAttendanceItem(
                    member.getUserId(),
                    member.getMembershipCode(),
                    user != null ? user.getFullName() : null,
                    user != null ? user.getEmail() : null,
                    user != null ? user.getPhone() : null,
                    user != null ? user.getAvatarUrl() : null,
                    enrollment.status(),
                    attStatus,
                    checkInTime,
                    coachId,
                    coachName,
                    notes,
                    scoreMap.get(member.getUserId())
            ));
        }

        Coach sessionCoach = session.getGymClass().getCoach();
        return new SessionAttendanceResponse(
                session.getId(),
                classId,
                session.getGymClass().getName(),
                session.getSessionDate(),
                session.getStartTime(),
                session.getEndTime(),
                sessionCoach != null ? sessionCoach.getUserId() : null,
                sessionCoach != null && sessionCoach.getUser() != null ? sessionCoach.getUser().getFullName() : null,
                session.getGymClass().getRoom() != null ? session.getGymClass().getRoom().getName() : null,
                enrollments.size(),
                presentCount,
                absentCount,
                lateCount,
                excusedCount,
                memberItems
        );
    }

    /**
     * SCRUM-111 AC: POST /api/v1/attendance/sessions/{id}/batch
     * Transactional batch attendance recording (and optional progress evaluation) by authenticated coach / staff.
     */
    @Transactional
    public List<MemberAttendanceItem> recordBatchAttendance(Long sessionId,
                                                           BatchAttendanceRequest request,
                                                           AuthenticatedPrincipal principal) {
        ClassSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));

        Coach recordingCoach = resolveRecordingCoach(principal, session);
        LocalDateTime now = LocalDateTime.now(clock);
        List<MemberAttendanceItem> result = new ArrayList<>();

        if ("cancelled".equalsIgnoreCase(session.getStatus())) {
            throw new ConflictException("ATTENDANCE_SESSION_CANCELLED", "attendance.error.session_cancelled",
                    new Object[]{sessionId}, "Attendance cannot be recorded for a cancelled session");
        }
        if (session.getSessionDate() != null && session.getStartTime() != null
                && LocalDateTime.of(session.getSessionDate(), session.getStartTime()).isAfter(now)) {
            throw new com.swp391.scms.common.exception.BadRequestException("ATTENDANCE_SESSION_NOT_STARTED",
                    "attendance.error.session_not_started", new Object[]{sessionId},
                    "Attendance can be recorded once the session has started");
        }
        // Only members holding a booking for this class (or one already completed) are on the roster.
        Map<Long, String> enrollmentStatus = new HashMap<>();
        for (ClassEnrollment enrollment : enrollmentRepository.findByGymClassId(session.getGymClass().getId())) {
            if (enrollment.getMember() != null && ("booked".equalsIgnoreCase(enrollment.getStatus())
                    || "completed".equalsIgnoreCase(enrollment.getStatus()))) {
                enrollmentStatus.putIfAbsent(enrollment.getMember().getUserId(), enrollment.getStatus().toLowerCase());
            }
        }
        if (sessionBookings != null) {
            for (com.swp391.scms.scheduling.entity.SessionBooking booking : sessionBookings.findBySessionIdAndStatus(sessionId, "booked")) {
                if (booking.getMember() != null) {
                    enrollmentStatus.putIfAbsent(booking.getMember().getUserId(), "booked");
                }
            }
        }

        Map<Long, SessionEvaluation> existingEvalMap = new HashMap<>();
        if (evaluationRepository != null) {
            List<SessionEvaluation> existingEvals = evaluationRepository.findBySessionIdOrderByEvaluatedAtDesc(sessionId);
            if (existingEvals != null) {
                for (SessionEvaluation eval : existingEvals) {
                    if (eval.getMember() != null && eval.getMember().getUserId() != null) {
                        existingEvalMap.putIfAbsent(eval.getMember().getUserId(), eval);
                    }
                }
            }
        }

        try {
            for (BatchAttendanceRequest.AttendanceItem item : request.records()) {
                if (!enrollmentStatus.containsKey(item.memberId())) {
                    throw new com.swp391.scms.common.exception.BadRequestException("ATTENDANCE_MEMBER_NOT_ENROLLED",
                            "attendance.error.not_enrolled", new Object[]{item.memberId()},
                            "Member is not enrolled in this class");
                }
                Member member = memberRepository.findById(item.memberId())
                        .orElseThrow(() -> new ResourceNotFoundException("resource.member", item.memberId()));

                String normalizedStatus = item.status().trim().toLowerCase();
                Optional<SessionAttendance> existingOpt = attendanceRepository
                        .findBySessionIdAndMemberUserId(sessionId, item.memberId());

                SessionAttendance attendance;
                if (existingOpt.isPresent()) {
                    attendance = existingOpt.get();
                    attendance.setStatus(normalizedStatus);
                    if ("present".equals(normalizedStatus) || "late".equals(normalizedStatus)) {
                        if (attendance.getCheckedInAt() == null) {
                            attendance.setCheckedInAt(now);
                        }
                    } else {
                        attendance.setCheckedInAt(null);
                    }
                    attendance.setRecordedBy(recordingCoach);
                    attendance.setNotes(item.notes());
                } else {
                    attendance = new SessionAttendance();
                    attendance.setSession(session);
                    attendance.setMember(member);
                    attendance.setStatus(normalizedStatus);
                    if ("present".equals(normalizedStatus) || "late".equals(normalizedStatus)) {
                        attendance.setCheckedInAt(now);
                    }
                    attendance.setRecordedBy(recordingCoach);
                    attendance.setNotes(item.notes());
                }

                SessionAttendance saved = attendanceRepository.saveAndFlush(attendance);

                if (Boolean.TRUE.equals(request.publishEvaluations()) && item.progressScore() != null && evaluationRepository != null) {
                    SessionEvaluation eval = existingEvalMap.getOrDefault(member.getUserId(), new SessionEvaluation());
                    eval.setSession(session);
                    eval.setMember(member);
                    eval.setCoach(recordingCoach);
                    eval.setProgressScore(BigDecimal.valueOf(item.progressScore()));
                    eval.setPerformanceNotes(item.notes());
                    eval.setEvaluatedAt(now);
                    if (eval.getCreatedAt() == null) {
                        eval.setCreatedAt(now);
                    }
                    evaluationRepository.save(eval);
                    if (notificationService != null) notificationService.notifyEvaluation(member.getUserId());
                }

                User user = member.getUser();
                result.add(new MemberAttendanceItem(
                        member.getUserId(),
                        member.getMembershipCode(),
                        user != null ? user.getFullName() : null,
                        user != null ? user.getEmail() : null,
                        user != null ? user.getPhone() : null,
                        user != null ? user.getAvatarUrl() : null,
                        enrollmentStatus.get(member.getUserId()),
                        saved.getStatus(),
                        saved.getCheckedInAt(),
                        recordingCoach.getUserId(),
                        recordingCoach.getUser() != null ? recordingCoach.getUser().getFullName() : null,
                        saved.getNotes(),
                        item.progressScore()
                ));
            }
        } catch (DataIntegrityViolationException ex) {
            log.error("Duplicate key violation during batch attendance for session {}: {}", sessionId, ex.getMessage());
            throw new ConflictException(
                    "ATTENDANCE_DUPLICATE_KEY",
                    "attendance.error.duplicate_key",
                    new Object[]{sessionId},
                    "Attendance duplicate entry constraint violated for this session"
            );
        }

        log.info("Batch attendance recorded successfully for session {} with {} records by coach/user {}",
                sessionId, request.records().size(), principal != null ? principal.id() : null);
        return result;
    }

    private Coach resolveRecordingCoach(AuthenticatedPrincipal principal, ClassSession session) {
        Coach sessionCoach = session.getGymClass() != null ? session.getGymClass().getCoach() : null;
        if (principal == null) {
            if (sessionCoach != null) return sessionCoach;
            throw new ForbiddenException("ATTENDANCE_UNAUTHENTICATED", "error.unauthorized", null, "Unauthenticated");
        }

        if ("COACH".equalsIgnoreCase(principal.role())
                && sessionCoach != null
                && sessionCoach.getUserId() != null
                && !sessionCoach.getUserId().equals(principal.id())) {
            throw new ForbiddenException(
                    "ATTENDANCE_NOT_COACH",
                    "attendance.forbidden.not_coach",
                    null,
                    "Only the assigned coach or authorized staff may record session attendance"
            );
        }

        Optional<Coach> coachOpt = coachRepository.findById(principal.id());
        if (coachOpt.isPresent()) {
            return coachOpt.get();
        }

        // If the caller is staff/manager/receptionist, use the session's designated coach
        if (sessionCoach != null) {
            return sessionCoach;
        }

        throw new ForbiddenException(
                "ATTENDANCE_NOT_COACH",
                "attendance.forbidden.not_coach",
                null,
                "Only an assigned coach or authorized staff may record session attendance"
        );
    }
}
