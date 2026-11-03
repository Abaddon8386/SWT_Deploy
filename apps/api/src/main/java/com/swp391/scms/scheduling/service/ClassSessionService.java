package com.swp391.scms.scheduling.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.notifications.event.SessionCancelledEvent;
import com.swp391.scms.scheduling.dto.CancelSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * SCRUM-113: Class session lifecycle and cancellation notifications.
 */
@Service
public class ClassSessionService {

    private static final Logger log = LoggerFactory.getLogger(ClassSessionService.class);

    private final ClassSessionRepository sessionRepository;
    private final ClassEnrollmentRepository enrollmentRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher eventPublisher;
    private final MessageService messageService;

    @org.springframework.beans.factory.annotation.Autowired
    public ClassSessionService(ClassSessionRepository sessionRepository,
                               ClassEnrollmentRepository enrollmentRepository,
                               NotificationService notificationService,
                               ApplicationEventPublisher eventPublisher,
                               MessageService messageService) {
        this.sessionRepository = sessionRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.notificationService = notificationService;
        this.eventPublisher = eventPublisher;
        this.messageService = messageService;
    }

    public ClassSessionService(ClassSessionRepository sessionRepository,
                               ClassEnrollmentRepository enrollmentRepository,
                               NotificationService notificationService,
                               ApplicationEventPublisher eventPublisher) {
        this(sessionRepository, enrollmentRepository, notificationService, eventPublisher, null);
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    /**
     * Cancel one session and notify enrolled members. Enrollments belong to the class,
     * so they remain valid for the other sessions.
     */
    @Transactional
    public ClassSessionDto cancelSession(Long sessionId, CancelSessionRequest request, AuthenticatedPrincipal principal) {
        ClassSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));

        if ("cancelled".equalsIgnoreCase(session.getStatus())) {
            throw new ConflictException(
                    "SCHEDULING_SESSION_ALREADY_CANCELLED",
                    "error.scheduling.session_already_cancelled",
                    null,
                    "This class session has already been cancelled"
            );
        }

        validateCancellationPermission(session, principal);

        session.setStatus("cancelled");
        session.setCancelReason(request.reason());
        ClassSession savedSession = sessionRepository.saveAndFlush(session);

        Long classId = session.getGymClass().getId();
        List<ClassEnrollment> bookedEnrollments = enrollmentRepository.findByGymClassId(classId).stream()
                .filter(e -> "booked".equalsIgnoreCase(e.getStatus()))
                .toList();

        List<Long> affectedMemberUserIds = new ArrayList<>();
        String className = session.getGymClass().getName();
        String sessionDateStr = session.getSessionDate().toString();

        for (ClassEnrollment enrollment : bookedEnrollments) {
            Member member = enrollment.getMember();
            if (member != null && member.getUserId() != null) {
                Long memberId = member.getUserId();
                affectedMemberUserIds.add(memberId);

                // Send in-app notification of type schedule_change
                notificationService.send(
                        memberId,
                        msg("notifications.session.cancelled.title"),
                        msg("notifications.session.cancelled.body", className, sessionDateStr, request.reason()),
                        "schedule_change",
                        "class_session",
                        sessionId
                );
            }
        }
        if (sessionBookings != null) {
            for (com.swp391.scms.scheduling.entity.SessionBooking booking : sessionBookings.findBySessionIdAndStatus(sessionId, "booked")) {
                booking.setStatus("cancelled");
                booking.setCancelledAt(java.time.LocalDateTime.now());
                booking.setCancelReason(request.reason());
                sessionBookings.save(booking);
                Member member = booking.getMember();
                if (member != null && member.getUserId() != null) {
                    if (!affectedMemberUserIds.contains(member.getUserId())) {
                        affectedMemberUserIds.add(member.getUserId());
                    }
                    notificationService.send(
                            member.getUserId(),
                            msg("notifications.session.cancelled.title"),
                            msg("notifications.session.cancelled.body", className, sessionDateStr, request.reason()),
                            "schedule_change",
                            "class_session",
                            sessionId
                    );
                }
            }
        }
        // Emit SessionCancelledEvent for decoupled listeners
        SessionCancelledEvent event = new SessionCancelledEvent(
                sessionId,
                classId,
                className,
                session.getSessionDate(),
                session.getStartTime(),
                request.reason(),
                affectedMemberUserIds
        );
        eventPublisher.publishEvent(event);

        log.info("Session {} cancelled successfully. Notified {} members.", sessionId, affectedMemberUserIds.size());

        return toDto(savedSession);
    }

    private void validateCancellationPermission(ClassSession session, AuthenticatedPrincipal principal) {
        if (principal == null) {
            throw new ForbiddenException("SCHEDULING_FORBIDDEN", "error.forbidden", null, "Unauthenticated");
        }

        String role = principal.role();
        if ("CENTER_MANAGER".equalsIgnoreCase(role)
                || "MANAGER".equalsIgnoreCase(role)
                || "STAFF".equalsIgnoreCase(role)
                || "RECEPTIONIST".equalsIgnoreCase(role)) {
            return;
        }

        if ("COACH".equalsIgnoreCase(role)) {
            Coach sessionCoach = session.getGymClass().getCoach();
            if (sessionCoach != null && principal.id().equals(sessionCoach.getUserId())) {
                return;
            }
            throw new ForbiddenException(
                    "SCHEDULING_FORBIDDEN_COACH",
                    "error.forbidden",
                    null,
                    "Only the assigned coach or management staff can cancel this session"
            );
        }

        throw new ForbiddenException("SCHEDULING_FORBIDDEN", "error.forbidden", null, "Insufficient permissions to cancel session");
    }

    public ClassSessionDto toDto(ClassSession session) {
        GymClass gymClass = session.getGymClass();
        Coach coach = gymClass != null ? gymClass.getCoach() : null;
        long booked = gymClass != null
                ? enrollmentRepository.countByGymClassIdAndStatus(gymClass.getId(), "booked")
                + (sessionBookings != null && session.getId() != null
                    ? sessionBookings.countBySessionIdAndStatus(session.getId(), "booked") : 0)
                : 0;

        return new ClassSessionDto(
                session.getId(),
                gymClass != null ? gymClass.getId() : null,
                gymClass != null ? gymClass.getName() : null,
                gymClass != null && gymClass.getDiscipline() != null ? gymClass.getDiscipline().getId() : null,
                gymClass != null && gymClass.getDiscipline() != null ? gymClass.getDiscipline().getName() : null,
                coach != null ? coach.getUserId() : null,
                coach != null && coach.getUser() != null ? coach.getUser().getFullName() : null,
                gymClass != null && gymClass.getRoom() != null ? gymClass.getRoom().getId() : null,
                gymClass != null && gymClass.getRoom() != null ? gymClass.getRoom().getName() : null,
                session.getSessionDate(),
                session.getStartTime(),
                session.getEndTime(),
                session.getStatus(),
                session.getCancelReason(),
                gymClass != null ? gymClass.getCapacity() : 0,
                booked
        );
    }
}
