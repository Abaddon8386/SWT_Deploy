package com.swp391.scms.scheduling.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
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
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
    private static final String ENROLLMENT_BOOKED = "booked";

    private final GymClassRepository gymClasses;
    private final ClassSessionRepository sessions;
    private final ClassEnrollmentRepository enrollments;
    private final ClassWaitlistRepository waitlists;
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
        this(gymClasses, sessions, enrollments, null, disciplines, coaches, rooms, mapper, clock);
    }

    public ClassService(GymClassRepository gymClasses,
                        ClassSessionRepository sessions,
                        ClassEnrollmentRepository enrollments,
                        ClassWaitlistRepository waitlists,
                        DisciplineRepository disciplines,
                        CoachRepository coaches,
                        RoomRepository rooms,
                        SchedulingMapper mapper,
                        Clock clock) {
        this(gymClasses, sessions, enrollments, waitlists, disciplines, coaches, rooms, mapper, clock, null);
    }

    @Autowired
    public ClassService(GymClassRepository gymClasses,
                        ClassSessionRepository sessions,
                        ClassEnrollmentRepository enrollments,
                        ClassWaitlistRepository waitlists,
                        DisciplineRepository disciplines,
                        CoachRepository coaches,
                        RoomRepository rooms,
                        SchedulingMapper mapper,
                        Clock clock,
                        CourtBookingRepository courtBookings) {
        this.gymClasses = gymClasses;
        this.sessions = sessions;
        this.enrollments = enrollments;
        this.waitlists = waitlists;
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

        long bookedCount = enrollments.countByGymClassIdAndStatus(classId, ENROLLMENT_BOOKED);
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
     * SCRUM-131 AC: Manager deletes a class (after double confirmation on UI).
     */
    @Transactional
    @Audited(action = "CLASS_DELETE", entity = "classes")
    public void deleteClass(Long classId) {
        GymClass gymClass = gymClasses.findById(classId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", classId));

        if (waitlists != null) {
            waitlists.deleteByGymClassId(classId);
        }
        enrollments.deleteByGymClassId(classId);
        sessions.deleteByGymClassId(classId);
        gymClasses.delete(gymClass);
        gymClasses.flush();
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
     * for the same room or the same coach.
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
        return enrollments.findByGymClassId(classId).stream()
                .filter(e -> !"cancelled".equalsIgnoreCase(e.getStatus()))
                .map(this::toStudentDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<EnrolledStudentDto> getSessionStudents(Long sessionId) {
        ClassSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.class_session", sessionId));
        return getClassStudents(session.getGymClass().getId());
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

    private long countBooked(ClassSession session) {
        return enrollments.countByGymClassIdAndStatus(session.getGymClass().getId(), ENROLLMENT_BOOKED);
    }
}
