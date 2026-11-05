package com.swp391.scms.attendance;

import com.swp391.scms.attendance.dto.BatchAttendanceRequest;
import com.swp391.scms.attendance.dto.BatchAttendanceRequest.AttendanceItem;
import com.swp391.scms.attendance.dto.SessionAttendanceResponse;
import com.swp391.scms.attendance.dto.SessionAttendanceResponse.MemberAttendanceItem;
import com.swp391.scms.attendance.entity.SessionAttendance;
import com.swp391.scms.attendance.repository.SessionAttendanceRepository;
import com.swp391.scms.attendance.service.SessionAttendanceService;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SessionAttendanceServiceTest {

    @Mock private SessionAttendanceRepository attendanceRepository;
    @Mock private ClassSessionRepository sessionRepository;
    @Mock private ClassEnrollmentRepository enrollmentRepository;
    @Mock private CoachRepository coachRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private MessageService messageService;
    @Mock private Clock clock;

    @InjectMocks
    private SessionAttendanceService service;

    private ClassSession session;
    private GymClass gymClass;
    private Coach coach;
    private Member member;
    private User memberUser;
    private AuthenticatedPrincipal coachPrincipal;

    @BeforeEach
    void setUp() {
        coachPrincipal = new AuthenticatedPrincipal(10L, "coach@test.com", "COACH");

        User coachUser = new User();
        ReflectionTestUtils.setField(coachUser, "id", 10L);
        coachUser.setFullName("Coach John");

        coach = new Coach();
        coach.setUserId(10L);
        coach.setUser(coachUser);

        memberUser = new User();
        ReflectionTestUtils.setField(memberUser, "id", 20L);
        memberUser.setFullName("Jane Doe");
        memberUser.setEmail("jane@test.com");

        member = new Member();
        member.setUserId(20L);
        member.setUser(memberUser);
        member.setMembershipCode("MEM-20");

        Room room = new Room();
        room.setName("Studio 1");

        gymClass = new GymClass();
        ReflectionTestUtils.setField(gymClass, "id", 5L);
        gymClass.setName("Pilates Morning");
        gymClass.setCoach(coach);
        gymClass.setRoom(room);

        session = new ClassSession();
        ReflectionTestUtils.setField(session, "id", 100L);
        session.setGymClass(gymClass);
        session.setSessionDate(LocalDate.of(2026, 10, 25));
        session.setStartTime(LocalTime.of(9, 0));
        session.setEndTime(LocalTime.of(10, 0));

        lenient().when(clock.instant()).thenReturn(Instant.parse("2026-10-25T09:05:00Z"));
        lenient().when(clock.getZone()).thenReturn(ZoneOffset.UTC);
    }

    @Test
    void getSessionAttendanceRoster_success() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));

        ClassEnrollment enrollment = new ClassEnrollment();
        enrollment.setGymClass(gymClass);
        enrollment.setMember(member);
        enrollment.setStatus("booked");
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of(enrollment));

        SessionAttendance att = new SessionAttendance();
        att.setSession(session);
        att.setMember(member);
        att.setStatus("present");
        att.setCheckedInAt(LocalDateTime.of(2026, 10, 25, 9, 2));
        att.setRecordedBy(coach);
        when(attendanceRepository.findBySessionIdWithDetails(100L)).thenReturn(List.of(att));

        SessionAttendanceResponse response = service.getSessionAttendanceRoster(100L);

        assertNotNull(response);
        assertEquals(100L, response.sessionId());
        assertEquals("Pilates Morning", response.className());
        assertEquals(1, response.totalBooked());
        assertEquals(1, response.totalPresent());
        assertEquals(1, response.members().size());
        assertEquals("present", response.members().get(0).attendanceStatus());
        assertEquals("Coach John", response.members().get(0).recordedByCoachName());
    }

    @Test
    void getSessionAttendanceRoster_notFound_throwsException() {
        when(sessionRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.getSessionAttendanceRoster(999L));
    }

    @Test
    void recordBatchAttendance_success() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        stubBookedEnrollment();
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach));
        when(memberRepository.findById(20L)).thenReturn(Optional.of(member));
        when(attendanceRepository.findBySessionIdAndMemberUserId(100L, 20L)).thenReturn(Optional.empty());

        SessionAttendance saved = new SessionAttendance();
        saved.setSession(session);
        saved.setMember(member);
        saved.setStatus("present");
        saved.setCheckedInAt(LocalDateTime.of(2026, 10, 25, 9, 5));
        saved.setRecordedBy(coach);
        when(attendanceRepository.saveAndFlush(any(SessionAttendance.class))).thenReturn(saved);

        BatchAttendanceRequest request = new BatchAttendanceRequest(List.of(
                new AttendanceItem(20L, "present", "On time")
        ));

        List<MemberAttendanceItem> items = service.recordBatchAttendance(100L, request, coachPrincipal);

        assertEquals(1, items.size());
        assertEquals("present", items.get(0).attendanceStatus());
        assertEquals("booked", items.get(0).enrollmentStatus());
        assertEquals(20L, items.get(0).memberId());
        verify(attendanceRepository, times(1)).saveAndFlush(any(SessionAttendance.class));
    }

    @Test
    void recordBatchAttendance_duplicateKey_throwsConflictException() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        stubBookedEnrollment();
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach));
        when(memberRepository.findById(20L)).thenReturn(Optional.of(member));
        when(attendanceRepository.findBySessionIdAndMemberUserId(100L, 20L)).thenReturn(Optional.empty());
        when(attendanceRepository.saveAndFlush(any(SessionAttendance.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

        BatchAttendanceRequest request = new BatchAttendanceRequest(List.of(
                new AttendanceItem(20L, "present", "On time")
        ));

        assertThrows(ConflictException.class, () -> service.recordBatchAttendance(100L, request, coachPrincipal));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void evaluationNotificationsOnlyWhenCoachPublishes(boolean publish) {
        var evaluations = org.mockito.Mockito.mock(com.swp391.scms.coaching.repository.SessionEvaluationRepository.class);
        var notifications = org.mockito.Mockito.mock(com.swp391.scms.notifications.NotificationService.class);
        ReflectionTestUtils.setField(service, "evaluationRepository", evaluations);
        ReflectionTestUtils.setField(service, "notificationService", notifications);
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        stubBookedEnrollment();
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach));
        when(memberRepository.findById(20L)).thenReturn(Optional.of(member));
        when(attendanceRepository.saveAndFlush(any(SessionAttendance.class))).thenAnswer(inv -> inv.getArgument(0));
        var request = new BatchAttendanceRequest(List.of(new AttendanceItem(20L, "present", "Good form", 85)), publish);
        service.recordBatchAttendance(100L, request, coachPrincipal);
        verify(evaluations, times(publish ? 1 : 0)).save(any(com.swp391.scms.coaching.entity.SessionEvaluation.class));
        verify(notifications, times(publish ? 1 : 0)).notifyEvaluation(20L);
    }

    private void stubBookedEnrollment() {
        ClassEnrollment enrollment = new ClassEnrollment();
        enrollment.setGymClass(gymClass);
        enrollment.setMember(member);
        enrollment.setStatus("booked");
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of(enrollment));
    }

    @Test
    void recordBatchAttendance_rejectsMemberWithoutBooking() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach));
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of());
        BatchAttendanceRequest request = new BatchAttendanceRequest(List.of(new AttendanceItem(20L, "present", null)));

        var error = assertThrows(com.swp391.scms.common.exception.BadRequestException.class,
                () -> service.recordBatchAttendance(100L, request, coachPrincipal));
        assertEquals("ATTENDANCE_MEMBER_NOT_ENROLLED", error.getErrorCode());
        verify(attendanceRepository, never()).saveAndFlush(any());
    }

    @Test
    void recordBatchAttendance_rejectsCancelledAndNotYetStartedSessions() {
        when(coachRepository.findById(10L)).thenReturn(Optional.of(coach));
        BatchAttendanceRequest request = new BatchAttendanceRequest(List.of(new AttendanceItem(20L, "present", null)));

        session.setStatus("cancelled");
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        assertThrows(ConflictException.class, () -> service.recordBatchAttendance(100L, request, coachPrincipal));

        session.setStatus("scheduled");
        session.setStartTime(LocalTime.of(10, 0));
        var error = assertThrows(com.swp391.scms.common.exception.BadRequestException.class,
                () -> service.recordBatchAttendance(100L, request, coachPrincipal));
        assertEquals("ATTENDANCE_SESSION_NOT_STARTED", error.getErrorCode());
        verify(attendanceRepository, never()).saveAndFlush(any());
    }

    @Test
    void getSessionAttendanceRoster_includesMembersWhoBookedOnlyThisSession() {
        com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings = org.mockito.Mockito.mock(com.swp391.scms.scheduling.repository.SessionBookingRepository.class);
        ReflectionTestUtils.setField(service, "sessionBookings", sessionBookings);
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        ClassEnrollment classWide = new ClassEnrollment();
        classWide.setGymClass(gymClass);
        classWide.setMember(member);
        classWide.setStatus("booked");
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of(classWide));
        Member sessionOnly = new Member();
        sessionOnly.setUserId(21L);
        com.swp391.scms.scheduling.entity.SessionBooking booking = new com.swp391.scms.scheduling.entity.SessionBooking();
        booking.setMember(sessionOnly);
        booking.setStatus("booked");
        com.swp391.scms.scheduling.entity.SessionBooking duplicate = new com.swp391.scms.scheduling.entity.SessionBooking();
        duplicate.setMember(member);
        duplicate.setStatus("booked");
        when(sessionBookings.findBySessionIdAndStatus(100L, "booked")).thenReturn(List.of(booking, duplicate));
        when(attendanceRepository.findBySessionIdWithDetails(100L)).thenReturn(List.of());

        SessionAttendanceResponse response = service.getSessionAttendanceRoster(100L);

        assertEquals(2, response.totalBooked());
        assertEquals(List.of(20L, 21L), response.members().stream().map(m -> m.memberId()).toList());
    }
}
