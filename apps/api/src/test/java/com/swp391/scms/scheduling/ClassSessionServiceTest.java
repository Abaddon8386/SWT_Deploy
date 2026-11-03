package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.notifications.event.SessionCancelledEvent;
import com.swp391.scms.scheduling.dto.CancelSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.service.ClassSessionService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ClassSessionServiceTest {

    @Mock private ClassSessionRepository sessionRepository;
    @Mock private ClassEnrollmentRepository enrollmentRepository;
    @Mock private NotificationService notificationService;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private MessageService messageService;

    @InjectMocks
    private ClassSessionService sessionService;

    private ClassSession session;
    private GymClass gymClass;
    private Coach coach;
    private Member member;
    private ClassEnrollment enrollment;
    private AuthenticatedPrincipal coachPrincipal;
    private AuthenticatedPrincipal managerPrincipal;

    @BeforeEach
    void setUp() {
        coachPrincipal = new AuthenticatedPrincipal(10L, "coach@test.com", "COACH");
        managerPrincipal = new AuthenticatedPrincipal(1L, "manager@test.com", "CENTER_MANAGER");

        User coachUser = new User();
        ReflectionTestUtils.setField(coachUser, "id", 10L);
        coachUser.setFullName("Coach Mike");

        coach = new Coach();
        coach.setUserId(10L);
        coach.setUser(coachUser);

        User memberUser = new User();
        ReflectionTestUtils.setField(memberUser, "id", 20L);
        memberUser.setFullName("Student Alice");

        member = new Member();
        member.setUserId(20L);
        member.setUser(memberUser);

        Discipline discipline = new Discipline();
        ReflectionTestUtils.setField(discipline, "id", 3L);
        discipline.setName("Fitness");

        Room room = new Room();
        ReflectionTestUtils.setField(room, "id", 4L);
        room.setName("Main Hall");

        gymClass = new GymClass();
        ReflectionTestUtils.setField(gymClass, "id", 5L);
        gymClass.setName("Cardio HIIT");
        gymClass.setCoach(coach);
        gymClass.setDiscipline(discipline);
        gymClass.setRoom(room);
        gymClass.setCapacity(20);

        session = new ClassSession();
        ReflectionTestUtils.setField(session, "id", 100L);
        session.setGymClass(gymClass);
        session.setSessionDate(LocalDate.of(2026, 10, 26));
        session.setStartTime(LocalTime.of(10, 0));
        session.setEndTime(LocalTime.of(11, 0));
        session.setStatus("scheduled");

        enrollment = new ClassEnrollment();
        ReflectionTestUtils.setField(enrollment, "id", 200L);
        enrollment.setGymClass(gymClass);
        enrollment.setMember(member);
        enrollment.setStatus("booked");
    }

    @Test
    void cancelSession_byAssignedCoach_success() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        when(sessionRepository.saveAndFlush(any(ClassSession.class))).thenAnswer(i -> i.getArgument(0));
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of(enrollment));

        CancelSessionRequest request = new CancelSessionRequest("Coach has medical emergency");

        ClassSessionDto dto = sessionService.cancelSession(100L, request, coachPrincipal);

        assertNotNull(dto);
        assertEquals("cancelled", dto.status());
        assertEquals("Coach has medical emergency", dto.cancelReason());
        assertEquals("booked", enrollment.getStatus());
        verify(enrollmentRepository, never()).save(any(ClassEnrollment.class));

        // Verify notification sent
        verify(notificationService, times(1)).send(
                eq(20L), any(), any(), eq("schedule_change"), eq("class_session"), eq(100L));

        // Verify event published
        ArgumentCaptor<SessionCancelledEvent> captor = ArgumentCaptor.forClass(SessionCancelledEvent.class);
        verify(eventPublisher, times(1)).publishEvent(captor.capture());
        assertEquals(100L, captor.getValue().sessionId());
        assertEquals(List.of(20L), captor.getValue().affectedMemberUserIds());
    }

    @Test
    void cancelSession_alreadyCancelled_throwsConflictException() {
        session.setStatus("cancelled");
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));

        CancelSessionRequest request = new CancelSessionRequest("Weather issue");

        assertThrows(ConflictException.class, () -> sessionService.cancelSession(100L, request, coachPrincipal));
    }

    @Test
    void cancelSession_byUnassignedCoach_throwsForbiddenException() {
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        AuthenticatedPrincipal otherCoach = new AuthenticatedPrincipal(99L, "other@coach.com", "COACH");

        CancelSessionRequest request = new CancelSessionRequest("Should fail");

        assertThrows(ForbiddenException.class, () -> sessionService.cancelSession(100L, request, otherCoach));
    }

    @Test
    void cancelSession_notFound_throwsResourceNotFoundException() {
        when(sessionRepository.findById(999L)).thenReturn(Optional.empty());

        CancelSessionRequest request = new CancelSessionRequest("Should fail");

        assertThrows(ResourceNotFoundException.class, () -> sessionService.cancelSession(999L, request, managerPrincipal));
    }

    @Test
    void cancelSession_alsoReleasesPerSessionBookingsWithoutNotifyingAMemberTwice() {
        com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings = org.mockito.Mockito.mock(com.swp391.scms.scheduling.repository.SessionBookingRepository.class);
        ReflectionTestUtils.setField(sessionService, "sessionBookings", sessionBookings);
        Member other = new Member();
        other.setUserId(30L);
        com.swp391.scms.scheduling.entity.SessionBooking byOther = new com.swp391.scms.scheduling.entity.SessionBooking();
        byOther.setMember(other);
        byOther.setStatus("booked");
        com.swp391.scms.scheduling.entity.SessionBooking bySameMember = new com.swp391.scms.scheduling.entity.SessionBooking();
        bySameMember.setMember(member);
        bySameMember.setStatus("booked");
        when(sessionRepository.findById(100L)).thenReturn(Optional.of(session));
        when(sessionRepository.saveAndFlush(any(ClassSession.class))).thenAnswer(i -> i.getArgument(0));
        when(enrollmentRepository.findByGymClassId(5L)).thenReturn(List.of(enrollment));
        when(sessionBookings.findBySessionIdAndStatus(100L, "booked")).thenReturn(List.of(byOther, bySameMember));

        sessionService.cancelSession(100L, new CancelSessionRequest("Mưa bão"), coachPrincipal);

        assertEquals("cancelled", byOther.getStatus());
        assertEquals("cancelled", bySameMember.getStatus());
        assertEquals("Mưa bão", byOther.getCancelReason());
        verify(sessionBookings, times(2)).save(any(com.swp391.scms.scheduling.entity.SessionBooking.class));
        ArgumentCaptor<SessionCancelledEvent> captor = ArgumentCaptor.forClass(SessionCancelledEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        assertEquals(List.of(20L, 30L), captor.getValue().affectedMemberUserIds());
    }
}
