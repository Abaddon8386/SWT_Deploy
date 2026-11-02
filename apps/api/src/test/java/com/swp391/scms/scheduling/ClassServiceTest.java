package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.RescheduleSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.UpdateClassRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.dto.SchedulingResponses.GymClassDto;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.service.ClassService;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.entity.Coach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClassServiceTest {

    @Mock
    private GymClassRepository gymClasses;
    @Mock
    private ClassSessionRepository sessions;
    @Mock
    private ClassEnrollmentRepository enrollments;
    @Mock
    private ClassWaitlistRepository waitlists;
    @Mock
    private DisciplineRepository disciplines;
    @Mock
    private CoachRepository coaches;
    @Mock
    private RoomRepository rooms;

    private final SchedulingMapper mapper = new SchedulingMapper();
    // Fixed clock: 2026-10-16 10:00:00 UTC
    // 10:00 Vietnam time; session dates/times represent the center's wall time.
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-16T03:00:00Z"), ZoneId.of("UTC"));

    private ClassService service;
    private GymClass gymClass;

    @Test
    void sessionCreationChecksCourtBookingsEvenWhenThereAreNoOtherClasses() {
        var courts = org.mockito.Mockito.mock(com.swp391.scms.courts.repository.CourtBookingRepository.class);
        service = new ClassService(gymClasses, sessions, enrollments, waitlists, disciplines, coaches, rooms,
                mapper, clock, courts);
        Room room = new Room();
        org.springframework.test.util.ReflectionTestUtils.setField(room, "id", 4L);
        gymClass.setRoom(room);
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        var date = LocalDate.of(2026, 10, 17);
        var start = LocalTime.of(10, 0);
        var end = LocalTime.of(11, 0);
        when(courts.existsRoomOverlap(4L, date, start, end)).thenReturn(true);

        assertThatThrownBy(() -> service.createSession(1L, new CreateSessionRequest(date, start, end)))
                .isInstanceOf(ConflictException.class)
                .satisfies(error -> assertThat(((ConflictException) error).getErrorCode())
                        .isEqualTo("COURT_BOOKING_SLOT_TAKEN"));
        org.mockito.Mockito.verify(sessions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @BeforeEach
    void setUp() {
        service = new ClassService(gymClasses, sessions, enrollments, waitlists, disciplines, coaches, rooms, mapper, clock);

        gymClass = new GymClass();
        gymClass.setName("Yoga Flow");
        gymClass.setCapacity(20);
        gymClass.setStatus("active");
    }

    @Test
    @DisplayName("createSession rejects when sessionDate is in the past")
    void createSession_rejectsPastSessionDate() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));

        CreateSessionRequest request = new CreateSessionRequest(
                LocalDate.of(2026, 10, 15),
                LocalTime.of(14, 0),
                LocalTime.of(15, 0)
        );

        assertThatThrownBy(() -> service.createSession(1L, request))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Session must start in the future");
    }

    @Test
    @DisplayName("createSession rejects when session is today but start time has already passed")
    void createSession_rejectsPastStartTimeToday() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));

        // Clock is at 10:00:00, session is at 09:00:00 today
        CreateSessionRequest request = new CreateSessionRequest(
                LocalDate.of(2026, 10, 16),
                LocalTime.of(9, 0),
                LocalTime.of(10, 0)
        );

        assertThatThrownBy(() -> service.createSession(1L, request))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Session must start in the future");
    }

    @Test
    @DisplayName("createSession allows session today when start time is in the future")
    void createSession_allowsFutureStartTimeToday() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(sessions.saveAndFlush(any(ClassSession.class))).thenAnswer(i -> {
            ClassSession s = i.getArgument(0);
            return s;
        });

        // Clock is at 10:00:00, session is at 11:00:00 today
        CreateSessionRequest request = new CreateSessionRequest(
                LocalDate.of(2026, 10, 16),
                LocalTime.of(11, 0),
                LocalTime.of(12, 0)
        );

        ClassSessionDto result = service.createSession(1L, request);
        assertThat(result).isNotNull();
        assertThat(result.startTime()).isEqualTo(LocalTime.of(11, 0));
        assertThat(result.endTime()).isEqualTo(LocalTime.of(12, 0));
    }

    @Test
    @DisplayName("createSession allows two adjacent sessions (end time of first equals start time of second)")
    void createSession_allowsAdjacentSessions() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(sessions.saveAndFlush(any(ClassSession.class))).thenAnswer(i -> i.getArgument(0));

        // Session 1: 14:00 - 15:00
        CreateSessionRequest session1Req = new CreateSessionRequest(
                LocalDate.of(2026, 10, 16),
                LocalTime.of(14, 0),
                LocalTime.of(15, 0)
        );
        ClassSessionDto session1 = service.createSession(1L, session1Req);
        assertThat(session1.startTime()).isEqualTo(LocalTime.of(14, 0));
        assertThat(session1.endTime()).isEqualTo(LocalTime.of(15, 0));

        // Session 2: 15:00 - 16:00 (adjacent immediately after Session 1)
        CreateSessionRequest session2Req = new CreateSessionRequest(
                LocalDate.of(2026, 10, 16),
                LocalTime.of(15, 0),
                LocalTime.of(16, 0)
        );
        ClassSessionDto session2 = service.createSession(1L, session2Req);
        assertThat(session2.startTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(session2.endTime()).isEqualTo(LocalTime.of(16, 0));

        // Verify adjacency: session1.endTime equals session2.startTime
        assertThat(session1.endTime()).isEqualTo(session2.startTime());
    }

    @Test
    @DisplayName("createSession rejects when end time is before or equal to start time")
    void createSession_rejectsInvalidTimeRange() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));

        CreateSessionRequest request = new CreateSessionRequest(
                LocalDate.of(2026, 10, 16),
                LocalTime.of(15, 0),
                LocalTime.of(14, 0)
        );

        assertThatThrownBy(() -> service.createSession(1L, request))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("End time must be after start time");
    }

    @Test
    @DisplayName("SCRUM-131: updateClass updates class info when capacity is valid")
    void updateClass_updatesFieldsSuccessfully() {
        Discipline d = new Discipline();
        d.setName("Pilates");

        Coach coach = new Coach();
        coach.setUserId(10L);
        coach.setEmploymentStatus("active");

        Room room = new Room();
        room.setName("Studio B");
        room.setStatus("available");

        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(disciplines.findById(2L)).thenReturn(Optional.of(d));
        when(coaches.findById(10L)).thenReturn(Optional.of(coach));
        when(rooms.findById(3L)).thenReturn(Optional.of(room));
        when(enrollments.countByGymClassIdAndStatus(1L, "booked")).thenReturn(5L);
        when(gymClasses.saveAndFlush(any(GymClass.class))).thenAnswer(i -> i.getArgument(0));

        UpdateClassRequest req = new UpdateClassRequest(
                "Pilates Pro", 2L, 10L, 3L, 15, "intermediate", "Bring grip socks", "active");

        GymClassDto updated = service.updateClass(1L, req);
        assertThat(updated.name()).isEqualTo("Pilates Pro");
        assertThat(updated.capacity()).isEqualTo(15);
        assertThat(updated.level()).isEqualTo("intermediate");
    }

    @Test
    @DisplayName("SCRUM-131: updateClass rejects when new capacity is below booked student count")
    void updateClass_rejectsCapacityBelowBooked() {
        Discipline d = new Discipline();
        Coach coach = new Coach();
        coach.setUserId(10L);
        coach.setEmploymentStatus("active");
        Room room = new Room();
        room.setStatus("available");

        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(disciplines.findById(2L)).thenReturn(Optional.of(d));
        when(coaches.findById(10L)).thenReturn(Optional.of(coach));
        when(rooms.findById(3L)).thenReturn(Optional.of(room));
        when(enrollments.countByGymClassIdAndStatus(1L, "booked")).thenReturn(12L);

        UpdateClassRequest req = new UpdateClassRequest(
                "Pilates Pro", 2L, 10L, 3L, 8, "all", null, "active");

        assertThatThrownBy(() -> service.updateClass(1L, req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Capacity cannot be less than current booked students");
    }

    @Test
    @DisplayName("SCRUM-131: rescheduleSession updates date and time of scheduled session")
    void rescheduleSession_updatesDateAndTime() throws Exception {
        var idField = GymClass.class.getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(gymClass, 1L);

        ClassSession session = new ClassSession();
        session.setGymClass(gymClass);
        session.setSessionDate(LocalDate.of(2026, 10, 17));
        session.setStartTime(LocalTime.of(8, 0));
        session.setEndTime(LocalTime.of(9, 0));
        session.setStatus("scheduled");

        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(sessions.findById(100L)).thenReturn(Optional.of(session));
        when(sessions.saveAndFlush(any(ClassSession.class))).thenAnswer(i -> i.getArgument(0));

        RescheduleSessionRequest req = new RescheduleSessionRequest(
                LocalDate.of(2026, 10, 20),
                LocalTime.of(18, 0),
                LocalTime.of(19, 30)
        );

        ClassSessionDto dto = service.rescheduleSession(1L, 100L, req);
        assertThat(dto.sessionDate()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(dto.startTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(dto.endTime()).isEqualTo(LocalTime.of(19, 30));
    }

    @Test
    @DisplayName("SCRUM-131: deleteClass removes child waitlists, enrollments, sessions and the class")
    void deleteClass_removesClassAndChildren() {
        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));

        service.deleteClass(1L);

        verify(waitlists).deleteByGymClassId(1L);
        verify(enrollments).deleteByGymClassId(1L);
        verify(sessions).deleteByGymClassId(1L);
        verify(gymClasses).delete(gymClass);
        verify(gymClasses).flush();
    }

    @Test
    @DisplayName("SCRUM-132: createSession rejects when another class overlaps in the same room")
    void createSession_rejectsRoomConflictWhenOverlapping() throws Exception {
        Room sharedRoom = new Room();
        sharedRoom.setName("Studio A");
        var roomIdField = Room.class.getDeclaredField("id");
        roomIdField.setAccessible(true);
        roomIdField.set(sharedRoom, 5L);

        Coach coach1 = new Coach();
        coach1.setUserId(10L);
        Coach coach2 = new Coach();
        coach2.setUserId(20L);

        gymClass.setRoom(sharedRoom);
        gymClass.setCoach(coach1);

        GymClass otherClass = new GymClass();
        otherClass.setName("Pilates Core");
        otherClass.setRoom(sharedRoom);
        otherClass.setCoach(coach2);

        ClassSession existingSession = new ClassSession();
        existingSession.setGymClass(otherClass);
        existingSession.setSessionDate(LocalDate.of(2026, 10, 18));
        existingSession.setStartTime(LocalTime.of(8, 0));
        existingSession.setEndTime(LocalTime.of(9, 30));
        existingSession.setStatus("scheduled");

        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(sessions.searchSessions(LocalDate.of(2026, 10, 18), LocalDate.of(2026, 10, 18), null, null))
                .thenReturn(java.util.List.of(existingSession));

        CreateSessionRequest overlappingReq = new CreateSessionRequest(
                LocalDate.of(2026, 10, 18),
                LocalTime.of(9, 0),
                LocalTime.of(10, 0)
        );

        assertThatThrownBy(() -> service.createSession(1L, overlappingReq))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Schedule conflict: Room Studio A")
                .extracting("errorCode")
                .isEqualTo("SCHEDULING_ROOM_CONFLICT");
    }

    @Test
    @DisplayName("SCRUM-132: createSession rejects when the same coach is assigned to two overlapping classes")
    void createSession_rejectsCoachConflictWhenOverlapping() throws Exception {
        Room room1 = new Room();
        room1.setName("Studio A");
        var roomIdField = Room.class.getDeclaredField("id");
        roomIdField.setAccessible(true);
        roomIdField.set(room1, 5L);

        Room room2 = new Room();
        room2.setName("Studio B");
        roomIdField.set(room2, 6L);

        Coach sharedCoach = new Coach();
        sharedCoach.setUserId(10L);

        gymClass.setRoom(room1);
        gymClass.setCoach(sharedCoach);

        GymClass otherClass = new GymClass();
        otherClass.setName("Boxing Burn");
        otherClass.setRoom(room2);
        otherClass.setCoach(sharedCoach);

        ClassSession existingSession = new ClassSession();
        existingSession.setGymClass(otherClass);
        existingSession.setSessionDate(LocalDate.of(2026, 10, 18));
        existingSession.setStartTime(LocalTime.of(18, 0));
        existingSession.setEndTime(LocalTime.of(19, 30));
        existingSession.setStatus("scheduled");

        when(gymClasses.findById(1L)).thenReturn(Optional.of(gymClass));
        when(sessions.searchSessions(LocalDate.of(2026, 10, 18), LocalDate.of(2026, 10, 18), null, null))
                .thenReturn(java.util.List.of(existingSession));

        CreateSessionRequest overlappingReq = new CreateSessionRequest(
                LocalDate.of(2026, 10, 18),
                LocalTime.of(18, 30),
                LocalTime.of(20, 0)
        );

        assertThatThrownBy(() -> service.createSession(1L, overlappingReq))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Schedule conflict: Coach")
                .extracting("errorCode")
                .isEqualTo("SCHEDULING_COACH_CONFLICT");
    }
}
