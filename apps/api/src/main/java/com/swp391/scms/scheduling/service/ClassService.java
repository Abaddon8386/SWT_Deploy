package com.swp391.scms.scheduling.service;

import com.swp391.scms.attendance.repository.SessionAttendanceRepository;
import com.swp391.scms.audit.Audited;
import com.swp391.scms.coaching.repository.CoachReviewRepository;
import com.swp391.scms.coaching.repository.SessionEvaluationRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.notifications.event.SessionCancelledEvent;
import com.swp391.scms.operations.repository.StaffInternalRequestRepository;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateClassRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.RescheduleSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.UpdateClassRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.dto.SchedulingResponses.CoachOptionDto;
import com.swp391.scms.scheduling.dto.SchedulingResponses.EnrolledStudentDto;
import com.swp391.scms.scheduling.dto.SchedulingResponses.GymClassDto;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.entity.SessionBooking;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * SCRUM-72, SCRUM-131 & SCRUM-132: class and class-session management.
 *
 * <p>Schedule-conflict (Trigger P3) is enforced both in the service layer (with detailed
 * room vs. coach conflict messages) and at the database level via trigger.
 */
@Service
public class ClassService {

    private static final String ROOM_AVAILABLE = "available";
    private static final String COACH_ACTIVE = "active";
    private static final String SESSION_SCHEDULED = "scheduled";
    private static final String CLASS_ACTIVE = "active";
    private static final String CLASS_INACTIVE = "inactive";
    private static final String ENROLLMENT_BOOKED = "booked";
    private static final String CLASS_DEACTIVATED_REASON = "Lớp học ngừng hoạt động";

    private final GymClassRepository gymClasses;
    private final ClassSessionRepository sessions;
    private final ClassEnrollmentRepository enrollments;

    @Autowired(required = false)
    private SessionBookingRepository sessionBookings;
    @Autowired(required = false)
    private SessionAttendanceRepository sessionAttendances;
    @Autowired(required = false)
    private SessionEvaluationRepository sessionEvaluations;
    @Autowired(required = false)
    private CoachReviewRepository coachReviews;
    @Autowired(required = false)
    private PaymentRepository payments;
    @Autowired(required = false)
    private StaffInternalRequestRepository staffInternalRequestRepository;
    @Autowired(required = false)
    private NotificationService notificationService;
    @Autowired(required = false)
    private ApplicationEventPublisher eventPublisher;
    @Autowired(required = false)
    private MessageService messageService;
    @Autowired(required = false)
    private EntityManager entityManager;

    private final DisciplineRepository disciplines;
    private final CoachRepository coaches;
    private final RoomRepository rooms;
    private final SchedulingMapper mapper;
    private final Clock clock;
    private final CourtBookingRepository courtBookings;

    public ClassService(GymClassRepository gymClasses,
                        ClassSessionRepository sessions,
                        ClassEnrollmentRepository enrollments,
                        DisciplineRepository disciplines,
                        CoachRepository coaches,
                        RoomRepository rooms,
                        SchedulingMapper mapper,
                        Clock clock) {
        this(gymClasses, sessions, enrollments, disciplines, coaches, rooms, mapper, clock, null);
    }

    @Autowired
    public ClassService(GymClassRepository gymClasses,
                        ClassSessionRepository sessions,
                        ClassEnrollmentRepository enrollments,
                        DisciplineRepository disciplines,
                        CoachRepository coaches,
                        RoomRepository rooms,
                        SchedulingMapper mapper,
                        Clock clock,
                        CourtBookingRepository courtBookings) {
        this.gymClasses = gymClasses;
        this.sessions = sessions;
        this.enrollments = enrollments;
        this.disciplines = disciplines;
        this.coaches = coaches;
        this.rooms = rooms;
        this.mapper = mapper;
        this.clock = clock;
        this.courtBookings = courtBookings;
    }

    /**
     * SCRUM-72 BR-01..BR-02, BR-05 & SCRUM-132: create a class. Disciplines/coach/room must exist,
     * capacity &gt; 0, the room must be available and the coach must be active.
     * If sessionDate, startTime, and endTime are provided, validates room/coach conflicts first
     * and schedules the first session atomically.
     */
    @Transactional
    @Audited(action = "CLASS_CREATE", entity = "classes")
    public GymClassDto createClass(CreateClassRequest request) {
        Discipline discipline = disciplines.findById(request.disciplineId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.discipline", request.disciplineId()));

        Coach coach = coaches.findById(request.coachId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", request.coachId()));
        if (!COACH_ACTIVE.equalsIgnoreCase(coach.getEmploymentStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_COACH_INACTIVE",
                    "error.scheduling.coach_inactive",
                    null,
                    "Coach is not active");
        }

        Room room = rooms.findById(request.roomId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.room", request.roomId()));
        if (!ROOM_AVAILABLE.equalsIgnoreCase(room.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_ROOM_UNAVAILABLE",
                    "error.scheduling.room_unavailable",
                    null,
                    "Room is not available for scheduling");
        }

        if (request.sessionDate() != null && request.startTime() != null && request.endTime() != null) {
            if (!request.endTime().isAfter(request.startTime())) {
                throw new BadRequestException(
                        "SCHEDULING_INVALID_TIME_RANGE",
                        "error.scheduling.invalid_time_range",
                        null,
                        "End time must be after start time");
            }
            SessionEligibility.ensureFuture(request.sessionDate(), request.startTime(), clock);
            ensureNoSessionConflict(
                    coach.getUserId(),
                    room.getId(),
                    request.sessionDate(),
                    request.startTime(),
                    request.endTime(),
                    null,
                    null);
        }

        GymClass gymClass = new GymClass();
        gymClass.setName(request.name());
        gymClass.setDiscipline(discipline);
        gymClass.setCoach(coach);
        gymClass.setRoom(room);
        gymClass.setCapacity(request.capacity());
        gymClass.setLevel(request.level() != null ? request.level() : "all");
        gymClass.setDescription(request.description());
        gymClass.setStatus(CLASS_ACTIVE);

        GymClass savedClass = gymClasses.save(gymClass);

        if (request.sessionDate() != null && request.startTime() != null && request.endTime() != null) {
            ClassSession initialSession = new ClassSession();
            initialSession.setGymClass(savedClass != null ? savedClass : gymClass);
            initialSession.setSessionDate(request.sessionDate());
            initialSession.setStartTime(request.startTime());
            initialSession.setEndTime(request.endTime());
            initialSession.setStatus(SESSION_SCHEDULED);
            initialSession.setCreatedAt(LocalDateTime.now(clock));
            initialSession.setUpdatedAt(LocalDateTime.now(clock));
            sessions.saveAndFlush(initialSession);
        }

        return mapper.toDto(savedClass != null ? savedClass : gymClass);
    }

    /**
     * SCRUM-131 & SCRUM-132: Manager updates an existing class.
     */
    @Transactional
    @Audited(action = "CLASS_UPDATE", entity = "classes")
    public GymClassDto updateClass(Long classId, UpdateClassRequest request) {
        GymClass gymClass = gymClasses.findById(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));

        Discipline discipline = disciplines.findById(request.disciplineId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.discipline", request.disciplineId()));

        Coach coach = coaches.findById(request.coachId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", request.coachId()));
        if (!COACH_ACTIVE.equalsIgnoreCase(coach.getEmploymentStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_COACH_INACTIVE",
                    "error.scheduling.coach_inactive",
                    null,
                    "Coach is not active");
        }

        Room room = rooms.findById(request.roomId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.room", request.roomId()));
        if (!ROOM_AVAILABLE.equalsIgnoreCase(room.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_ROOM_UNAVAILABLE",
                    "error.scheduling.room_unavailable",
                    null,
                    "Room is not available for scheduling");
        }

        long bookedCount = enrollments.countByGymClassIdAndStatus(classId, ENROLLMENT_BOOKED) + busiestSession(classId);
        if (request.capacity() < bookedCount) {
            throw new BadRequestException(
                    "SCHEDULING_CAPACITY_BELOW_BOOKED",
                    "error.scheduling.capacity_below_booked",
                    new Object[]{bookedCount},
                    "Capacity cannot be less than current booked students (" + bookedCount + ")");
        }

        Long oldCoachId = gymClass.getCoach() != null ? gymClass.getCoach().getUserId() : null;
        Long oldRoomId = gymClass.getRoom() != null ? gymClass.getRoom().getId() : null;

        if (!Objects.equals(oldCoachId, coach.getUserId()) || !Objects.equals(oldRoomId, room.getId())) {
            List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(classId);
            if (classSessions != null) {
                for (ClassSession s : classSessions) {
                    if (SESSION_SCHEDULED.equalsIgnoreCase(s.getStatus())) {
                        ensureNoSessionConflict(
                                coach.getUserId(),
                                room.getId(),
                                s.getSessionDate(),
                                s.getStartTime(),
                                s.getEndTime(),
                                s.getId(),
                                null);
                    }
                }
            }
        }

        gymClass.setName(request.name().trim());
        gymClass.setDiscipline(discipline);
        gymClass.setCoach(coach);
        gymClass.setRoom(room);
        gymClass.setCapacity(request.capacity());
        gymClass.setLevel(request.level() != null ? request.level() : "all");
        gymClass.setDescription(request.description());
        if (request.status() != null && !request.status().isBlank()) {
            gymClass.setStatus(request.status());
        }
        gymClass.setUpdatedAt(LocalDateTime.now(clock));

        GymClass savedClass = gymClasses.saveAndFlush(gymClass);

        if (!Objects.equals(oldCoachId, coach.getUserId()) || !Objects.equals(oldRoomId, room.getId())) {
            List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(classId);
            if (classSessions != null) {
                for (ClassSession s : classSessions) {
                    if (SESSION_SCHEDULED.equalsIgnoreCase(s.getStatus())) {
                        s.setUpdatedAt(LocalDateTime.now(clock));
                        sessions.saveAndFlush(s);
                    }
                }
            }
        }

        return mapper.toDto(savedClass != null ? savedClass : gymClass);
    }

    /**
     * SCRUM-131 AC & A4: Manager deletes a class (after double confirmation on UI).
     * If historical/dependent records exist, soft-deactivates the class, cancels upcoming
     * scheduled sessions with reason "Lớp học ngừng hoạt động", and notifies booked members.
     */
    @Transactional
    @Audited(action = "CLASS_DELETE", entity = "classes")
    public void deleteClass(Long classId) {
        GymClass gymClass = gymClasses.findById(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));

        List<ClassEnrollment> classEnrollments = enrollments.findByGymClassId(classId);
        List<ClassSession> classSessions = sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(classId);

        if (hasDependentRecords(classId, classEnrollments, classSessions)) {
            LocalDateTime now = LocalDateTime.now(clock);
            String className = gymClass.getName() != null ? gymClass.getName() : "";

            if (classSessions != null) {
                for (ClassSession session : classSessions) {
                    if (session == null || !SESSION_SCHEDULED.equalsIgnoreCase(session.getStatus())) {
                        continue;
                    }
                    session.setStatus("cancelled");
                    session.setCancelReason(CLASS_DEACTIVATED_REASON);
                    session.setUpdatedAt(now);
                    sessions.saveAndFlush(session);

                    List<Long> affectedMemberUserIds = new ArrayList<>();
                    String sessionDateStr = session.getSessionDate() != null ? session.getSessionDate().toString() : "";

                    if (classEnrollments != null) {
                        for (ClassEnrollment enrollment : classEnrollments) {
                            if (enrollment != null && ENROLLMENT_BOOKED.equalsIgnoreCase(enrollment.getStatus())
                                    && enrollment.getMember() != null && enrollment.getMember().getUserId() != null) {
                                Long memberId = enrollment.getMember().getUserId();
                                affectedMemberUserIds.add(memberId);
                                if (notificationService != null) {
                                    notificationService.send(
                                            memberId,
                                            msg("notifications.session.cancelled.title"),
                                            msg("notifications.session.cancelled.body", className, sessionDateStr, CLASS_DEACTIVATED_REASON),
                                            "schedule_change",
                                            "class_session",
                                            session.getId());
                                }
                            }
                        }
                    }

                    if (sessionBookings != null && session.getId() != null) {
                        for (SessionBooking booking : sessionBookings.findBySessionIdAndStatus(session.getId(), ENROLLMENT_BOOKED)) {
                            booking.setStatus("cancelled");
                            booking.setCancelledAt(now);
                            booking.setCancelReason(CLASS_DEACTIVATED_REASON);
                            sessionBookings.save(booking);
                            Member member = booking.getMember();
                            if (member != null && member.getUserId() != null) {
                                if (!affectedMemberUserIds.contains(member.getUserId())) {
                                    affectedMemberUserIds.add(member.getUserId());
                                }
                                if (notificationService != null) {
                                    notificationService.send(
                                            member.getUserId(),
                                            msg("notifications.session.cancelled.title"),
                                            msg("notifications.session.cancelled.body", className, sessionDateStr, CLASS_DEACTIVATED_REASON),
                                            "schedule_change",
                                            "class_session",
                                            session.getId());
                                }
                            }
                        }
                    }

                    if (eventPublisher != null) {
                        eventPublisher.publishEvent(new SessionCancelledEvent(
                                session.getId(),
                                classId,
                                className,
                                session.getSessionDate(),
                                session.getStartTime(),
                                CLASS_DEACTIVATED_REASON,
                                affectedMemberUserIds));
                    }
                }
            }

            if (classEnrollments != null) {
                for (ClassEnrollment enrollment : classEnrollments) {
                    if (enrollment != null && ENROLLMENT_BOOKED.equalsIgnoreCase(enrollment.getStatus())) {
                        enrollment.setStatus("cancelled");
                        enrollment.setCancelledAt(now);
                        enrollment.setCancelReason(CLASS_DEACTIVATED_REASON);
                        enrollments.save(enrollment);
                    }
                }
            }

            gymClass.setStatus(CLASS_INACTIVE);
            gymClass.setUpdatedAt(now);
            gymClasses.save(gymClass);
            gymClasses.flush();
            return;
        }

        enrollments.deleteByGymClassId(classId);
        sessions.deleteByGymClassId(classId);
        gymClasses.delete(gymClass);
        gymClasses.flush();
    }

    private boolean hasDependentRecords(Long classId,
                                        List<ClassEnrollment> classEnrollments,
                                        List<ClassSession> classSessions) {
        if (classEnrollments != null && !classEnrollments.isEmpty()) {
            return true;
        }
        if (sessionBookings != null && !sessionBookings.findBookedByClassId(classId).isEmpty()) {
            return true;
        }
        if (classSessions != null) {
            for (ClassSession s : classSessions) {
                if (s == null) {
                    continue;
                }
                if (s.getStatus() != null && !SESSION_SCHEDULED.equalsIgnoreCase(s.getStatus())) {
                    return true;
                }
                Long sid = s.getId();
                if (sid != null) {
                    if (sessionBookings != null && (
                            !sessionBookings.findBySessionIdAndStatus(sid, ENROLLMENT_BOOKED).isEmpty()
                                    || !sessionBookings.findBySessionIdAndStatus(sid, "cancelled").isEmpty())) {
                        return true;
                    }
                    if (sessionAttendances != null && !sessionAttendances.findBySessionId(sid).isEmpty()) {
                        return true;
                    }
                    if (sessionEvaluations != null && !sessionEvaluations.findBySessionIdOrderByEvaluatedAtDesc(sid).isEmpty()) {
                        return true;
                    }
                }
            }
        }
        if (entityManager != null) {
            if (countQuery("SELECT COUNT(sb) FROM SessionBooking sb WHERE sb.session.gymClass.id = :cid", classId) > 0
                    || countQuery("SELECT COUNT(ce) FROM ClassEnrollment ce WHERE ce.gymClass.id = :cid", classId) > 0
                    || countQuery("SELECT COUNT(sa) FROM SessionAttendance sa WHERE sa.session.gymClass.id = :cid", classId) > 0
                    || countQuery("SELECT COUNT(se) FROM SessionEvaluation se WHERE se.session.gymClass.id = :cid", classId) > 0
                    || countQuery("SELECT COUNT(cr) FROM CoachReview cr WHERE cr.classSession.gymClass.id = :cid", classId) > 0) {
                return true;
            }
        }
        return false;
    }

    private long countQuery(String jpql, Long classId) {
        try {
            Long count = entityManager.createQuery(jpql, Long.class)
                    .setParameter("cid", classId)
                    .getSingleResult();
            return count != null ? count : 0L;
        } catch (RuntimeException ignored) {
            return 0L;
        }
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    /**
     * SCRUM-72 BR-03 & SCRUM-132: schedule a session. End time must be after start time and the
     * session may not be placed in the past. Pre-checks room and coach conflicts before saving.
     */
    @Transactional
    @Audited(action = "SESSION_CREATE", entity = "class_sessions")
    public ClassSessionDto createSession(Long classId, CreateSessionRequest request) {
        GymClass gymClass = gymClasses.findById(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));

        if (gymClass.getStatus() != null && !CLASS_ACTIVE.equalsIgnoreCase(gymClass.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_CLASS_INACTIVE",
                    "error.scheduling.class_inactive",
                    null,
                    "Class is currently inactive");
        }

        if (!request.endTime().isAfter(request.startTime())) {
            throw new BadRequestException(
                    "SCHEDULING_INVALID_TIME_RANGE",
                    "error.scheduling.invalid_time_range",
                    null,
                    "End time must be after start time");
        }

        SessionEligibility.ensureFuture(request.sessionDate(), request.startTime(), clock);

        Long coachId = gymClass.getCoach() != null ? gymClass.getCoach().getUserId() : null;
        Long roomId = gymClass.getRoom() != null ? gymClass.getRoom().getId() : null;
        ensureNoSessionConflict(
                coachId,
                roomId,
                request.sessionDate(),
                request.startTime(),
                request.endTime(),
                null,
                classId);

        List<ClassSession> existingOnDate = sessions.searchSessions(request.sessionDate(), request.sessionDate(), null, null);
        if (existingOnDate != null) {
            Optional<ClassSession> sameSession = existingOnDate.stream()
                    .filter(s -> s.getGymClass() != null
                            && classId.equals(s.getGymClass().getId())
                            && request.sessionDate().equals(s.getSessionDate())
                            && request.startTime().equals(s.getStartTime())
                            && request.endTime().equals(s.getEndTime())
                            && SESSION_SCHEDULED.equalsIgnoreCase(s.getStatus()))
                    .findFirst();
            if (sameSession.isPresent()) {
                return mapper.toDto(sameSession.get(), countBooked(sameSession.get()));
            }
        }

        ClassSession session = new ClassSession();
        session.setGymClass(gymClass);
        session.setSessionDate(request.sessionDate());
        session.setStartTime(request.startTime());
        session.setEndTime(request.endTime());
        session.setStatus(SESSION_SCHEDULED);
        session.setCreatedAt(LocalDateTime.now(clock));
        session.setUpdatedAt(LocalDateTime.now(clock));

        ClassSession saved = sessions.saveAndFlush(session);
        return mapper.toDto(saved, countBooked(saved));
    }

    /**
     * SCRUM-131 & SCRUM-132: Manager reschedules an existing class session.
     * Pre-checks room and coach conflicts and enforces Trigger P3 at the database.
     */
    @Transactional
    @Audited(action = "SESSION_RESCHEDULE", entity = "class_sessions")
    public ClassSessionDto rescheduleSession(Long classId, Long sessionId, RescheduleSessionRequest request) {
        GymClass gymClass = gymClasses.findById(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));

        ClassSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));

        if (session.getGymClass() == null || !classId.equals(session.getGymClass().getId())) {
            throw new ResourceNotFoundException("resource.class_session", sessionId);
        }

        if ("cancelled".equalsIgnoreCase(session.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_SESSION_CANCELLED",
                    "error.scheduling.session_cancelled",
                    null,
                    "This session has been cancelled");
        }

        if (gymClass.getStatus() != null && !CLASS_ACTIVE.equalsIgnoreCase(gymClass.getStatus())) {
            throw new BadRequestException(
                    "SCHEDULING_CLASS_INACTIVE",
                    "error.scheduling.class_inactive",
                    null,
                    "Class is currently inactive");
        }

        if (!request.endTime().isAfter(request.startTime())) {
            throw new BadRequestException(
                    "SCHEDULING_INVALID_TIME_RANGE",
                    "error.scheduling.invalid_time_range",
                    null,
                    "End time must be after start time");
        }

        SessionEligibility.ensureFuture(request.sessionDate(), request.startTime(), clock);

        Long coachId = gymClass.getCoach() != null ? gymClass.getCoach().getUserId() : null;
        Long roomId = gymClass.getRoom() != null ? gymClass.getRoom().getId() : null;
        ensureNoSessionConflict(
                coachId,
                roomId,
                request.sessionDate(),
                request.startTime(),
                request.endTime(),
                sessionId,
                null);

        session.setSessionDate(request.sessionDate());
        session.setStartTime(request.startTime());
        session.setEndTime(request.endTime());
        session.setUpdatedAt(LocalDateTime.now(clock));

        ClassSession saved = sessions.saveAndFlush(session);
        return mapper.toDto(saved != null ? saved : session, countBooked(saved != null ? saved : session));
    }

    /**
     * SCRUM-132: Pre-check that no scheduled session on the same date overlaps in time
     * for the same room or the same coach, and the coach is not on approved leave.
     */
    private void ensureNoSessionConflict(Long coachId,
                                         Long roomId,
                                         LocalDate sessionDate,
                                         LocalTime startTime,
                                         LocalTime endTime,
                                         Long excludeSessionId,
                                         Long idempotentClassId) {
        if (sessionDate == null || startTime == null || endTime == null) {
            return;
        }
        if (staffInternalRequestRepository != null && coachId != null
                && staffInternalRequestRepository.existsApprovedLeaveOn(coachId, sessionDate)) {
            throw new ConflictException(
                    "COACH_ON_LEAVE",
                    "error.coach_booking.coach_on_leave",
                    new Object[]{sessionDate},
                    "The coach is on approved leave that day.");
        }
        if (courtBookings != null && roomId != null
                && courtBookings.existsRoomOverlap(roomId, sessionDate, startTime, endTime)) {
            throw new ConflictException("COURT_BOOKING_SLOT_TAKEN", "error.courts.slot_taken", null, null);
        }
        List<ClassSession> existingOnDate = sessions.searchSessions(sessionDate, sessionDate, null, null);
        if (existingOnDate == null || existingOnDate.isEmpty()) {
            return;
        }
        for (ClassSession existing : existingOnDate) {
            if (existing == null || !SESSION_SCHEDULED.equalsIgnoreCase(existing.getStatus())) {
                continue;
            }
            if (excludeSessionId != null && Objects.equals(excludeSessionId, existing.getId())) {
                continue;
            }
            GymClass existingClass = existing.getGymClass();
            if (idempotentClassId != null
                    && existingClass != null
                    && Objects.equals(idempotentClassId, existingClass.getId())
                    && Objects.equals(sessionDate, existing.getSessionDate())
                    && Objects.equals(startTime, existing.getStartTime())
                    && Objects.equals(endTime, existing.getEndTime())) {
                continue;
            }
            if (existing.getStartTime() == null || existing.getEndTime() == null) {
                continue;
            }
            boolean overlaps = startTime.isBefore(existing.getEndTime()) && endTime.isAfter(existing.getStartTime());
            if (!overlaps) {
                continue;
            }

            String className = existingClass != null && existingClass.getName() != null ? existingClass.getName() : "";
            String rangeStart = formatTime(existing.getStartTime());
            String rangeEnd = formatTime(existing.getEndTime());

            if (roomId != null && existingClass != null && existingClass.getRoom() != null
                    && Objects.equals(roomId, existingClass.getRoom().getId())) {
                String roomName = existingClass.getRoom().getName() != null
                        ? existingClass.getRoom().getName()
                        : ("#" + roomId);
                throw new ConflictException(
                        "SCHEDULING_ROOM_CONFLICT",
                        "error.scheduling.room_conflict",
                        new Object[]{roomName, className, rangeStart, rangeEnd},
                        "Schedule conflict: Room " + roomName + " is already booked for class " + className
                                + " (" + rangeStart + " - " + rangeEnd + ")");
            }

            if (coachId != null && existingClass != null && existingClass.getCoach() != null
                    && Objects.equals(coachId, existingClass.getCoach().getUserId())) {
                Coach existingCoach = existingClass.getCoach();
                String coachName = existingCoach.getUser() != null && existingCoach.getUser().getFullName() != null
                        ? existingCoach.getUser().getFullName()
                        : ("#" + coachId);
                throw new ConflictException(
                        "SCHEDULING_COACH_CONFLICT",
                        "error.scheduling.coach_conflict",
                        new Object[]{coachName, className, rangeStart, rangeEnd},
                        "Schedule conflict: Coach " + coachName + " is already teaching class " + className
                                + " (" + rangeStart + " - " + rangeEnd + ")");
            }
        }
    }

    private static String formatTime(LocalTime time) {
        if (time == null) return "";
        String raw = time.toString();
        return raw.length() >= 5 ? raw.substring(0, 5) : raw;
    }

    /**
     * SCRUM-72 BR-06: schedule lookup for any authenticated role with optional filters.
     */
    @Transactional(readOnly = true)
    public List<ClassSessionDto> searchSessions(LocalDate fromDate,
                                                LocalDate toDate,
                                                Long disciplineId,
                                                Long coachId) {
        return sessions.searchSessions(fromDate, toDate, disciplineId, coachId).stream()
                .map(session -> mapper.toDto(session, countBooked(session)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<GymClassDto> listClasses() {
        return gymClasses.findAllByOrderByIdDesc().stream()
                .map(mapper::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CoachOptionDto> listActiveCoaches() {
        return coaches.findActiveWithUser().stream()
                .map(c -> new CoachOptionDto(
                        c.getUserId(),
                        c.getUser().getFullName(),
                        c.getUser().getEmail(),
                        c.getUser().getPhone(),
                        c.getEmploymentStatus(),
                        c.getUser().getGender()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<EnrolledStudentDto> getClassStudents(Long classId) {
        if (!gymClasses.existsById(classId)) {
            throw new ResourceNotFoundException("resource.gym_class", classId);
        }
        List<EnrolledStudentDto> students = new java.util.ArrayList<>(enrollments.findByGymClassId(classId).stream()
                .filter(e -> !"cancelled".equalsIgnoreCase(e.getStatus()))
                .map(this::toStudentDto)
                .toList());
        if (sessionBookings != null) {
            java.util.Set<Long> seen = new java.util.HashSet<>();
            students.forEach(s -> seen.add(s.memberId()));
            for (SessionBooking booking : sessionBookings.findBookedByClassId(classId)) {
                if (booking.getMember() != null && seen.add(booking.getMember().getUserId())) {
                    students.add(toStudentDto(booking));
                }
            }
        }
        return students;
    }

    @Transactional(readOnly = true)
    public List<EnrolledStudentDto> getSessionStudents(Long sessionId) {
        ClassSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));
        List<EnrolledStudentDto> students = new java.util.ArrayList<>(enrollments.findByGymClassId(session.getGymClass().getId()).stream()
                .filter(e -> !"cancelled".equalsIgnoreCase(e.getStatus()))
                .map(this::toStudentDto)
                .toList());
        if (sessionBookings != null) {
            java.util.Set<Long> seen = new java.util.HashSet<>();
            students.forEach(s -> seen.add(s.memberId()));
            for (SessionBooking booking : sessionBookings.findBySessionIdAndStatus(sessionId, "booked")) {
                if (booking.getMember() != null && seen.add(booking.getMember().getUserId())) {
                    students.add(toStudentDto(booking));
                }
            }
        }
        return students;
    }

    private EnrolledStudentDto toStudentDto(ClassEnrollment enrollment) {
        Member member = enrollment.getMember();
        User user = member != null ? member.getUser() : null;
        return new EnrolledStudentDto(
                enrollment.getId(),
                member != null ? member.getUserId() : null,
                member != null ? member.getMembershipCode() : null,
                user != null ? user.getFullName() : null,
                user != null ? user.getEmail() : null,
                user != null ? user.getPhone() : null,
                user != null ? user.getAvatarUrl() : null,
                member != null && member.getFitnessGoal() != null ? member.getFitnessGoal() : "",
                member != null && member.getHealthNotes() != null ? member.getHealthNotes() : "",
                member != null && member.getFitnessLevel() != null ? member.getFitnessLevel() : "beginner",
                member != null ? member.getEmergencyContactName() : null,
                member != null ? member.getEmergencyContactPhone() : null,
                enrollment.getEnrolledAt(),
                enrollment.getStatus()
        );
    }

    /** Seats taken in one session: class-wide enrollments plus the members who booked this session. */
    private long countBooked(ClassSession session) {
        long classWide = enrollments.countByGymClassIdAndStatus(session.getGymClass().getId(), ENROLLMENT_BOOKED);
        return classWide + (sessionBookings != null && session.getId() != null
                ? sessionBookings.countBySessionIdAndStatus(session.getId(), ENROLLMENT_BOOKED) : 0);
    }

    /** Highest number of per-session bookings in any session of the class. */
    private long busiestSession(Long classId) {
        if (sessionBookings == null) return 0;
        return sessionBookings.countBookedGroupedBySession(classId).stream()
                .mapToLong(com.swp391.scms.scheduling.dto.SessionBookingCount::bookedCount).max().orElse(0);
    }

    private EnrolledStudentDto toStudentDto(SessionBooking booking) {
        Member member = booking.getMember();
        User user = member != null ? member.getUser() : null;
        return new EnrolledStudentDto(
                booking.getId(),
                member != null ? member.getUserId() : null,
                member != null ? member.getMembershipCode() : null,
                user != null ? user.getFullName() : null,
                user != null ? user.getEmail() : null,
                user != null ? user.getPhone() : null,
                user != null ? user.getAvatarUrl() : null,
                member != null && member.getFitnessGoal() != null ? member.getFitnessGoal() : "",
                member != null && member.getHealthNotes() != null ? member.getHealthNotes() : "",
                member != null && member.getFitnessLevel() != null ? member.getFitnessLevel() : "beginner",
                member != null ? member.getEmergencyContactName() : null,
                member != null ? member.getEmergencyContactPhone() : null,
                booking.getBookedAt(),
                booking.getStatus()
        );
    }
}
