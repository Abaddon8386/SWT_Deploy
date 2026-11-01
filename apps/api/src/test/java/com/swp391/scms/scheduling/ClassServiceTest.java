package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
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

    @BeforeEach
    void setUp() {
        service = new ClassService(gymClasses, sessions, enrollments, disciplines, coaches, rooms, mapper, clock);

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
}
