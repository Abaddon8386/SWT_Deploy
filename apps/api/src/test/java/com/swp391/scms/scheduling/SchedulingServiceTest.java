package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateSessionRequest;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.service.ClassService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.core.MethodParameter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class SchedulingServiceTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 17);
    private static final AuthenticatedPrincipal MEMBER = new AuthenticatedPrincipal(12L, "member", "MEMBER");

    @Mock private ClassEnrollmentRepository enrollments;
    @Mock private ClassSessionRepository sessions;
    @Mock private GymClassRepository gymClasses;
    @Mock private MembershipSubscriptionRepository subscriptions;
    @Mock private MemberRepository members;
    @Mock private NotificationService notifications;
    @Mock private DisciplineRepository disciplines;
    @Mock private CoachRepository coaches;
    @Mock private RoomRepository rooms;
    @Spy private SchedulingMapper mapper = new SchedulingMapper();
    @Mock private Clock clock;
    @InjectMocks private EnrollmentService enrollmentService;
    @InjectMocks private ClassService classService;

    private GymClass gymClass;
    private ClassSession session;

    @BeforeEach
    void setUp() {
        // Noon at the center, independently of the UTC Clock zone.
        lenient().when(clock.instant()).thenReturn(Instant.parse("2026-10-17T05:00:00Z"));
        lenient().when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        Member member = new Member();
        member.setUserId(MEMBER.id());
        gymClass = new GymClass();
        ReflectionTestUtils.setField(gymClass, "id", 5L);
        gymClass.setName("Yoga");
        gymClass.setCapacity(1);
        session = new ClassSession();
        ReflectionTestUtils.setField(session, "id", 9L);
        session.setGymClass(gymClass);
        session.setSessionDate(TODAY.plusDays(1));
        session.setStartTime(LocalTime.of(13, 0));
        session.setEndTime(LocalTime.of(14, 0));
        lenient().when(members.findById(MEMBER.id())).thenReturn(Optional.of(member));
        lenient().when(members.findByUserIdForUpdate(MEMBER.id())).thenReturn(Optional.of(member));
        lenient().when(sessions.findById(9L)).thenReturn(Optional.of(session));
        lenient().when(gymClasses.findById(5L)).thenReturn(Optional.of(gymClass));
        lenient().when(gymClasses.findByIdForUpdate(5L)).thenReturn(Optional.of(gymClass));
        lenient().when(subscriptions.hasActiveMembership(MEMBER.id(), TODAY)).thenReturn(true);
        lenient().when(subscriptions.hasActiveMembershipCoveringSession(eq(MEMBER.id()), eq(TODAY), any()))
                .thenReturn(true);
        lenient().when(enrollments.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(sessions.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @ParameterizedTest
    @ValueSource(ints = {9, 12})
    void enrollmentRejectsSessionsThatAlreadyStartedToday(int hour) {
        session.setSessionDate(TODAY);
        session.setStartTime(LocalTime.of(hour, 0));

        assertThrows(BadRequestException.class, () -> enrollmentService.enroll(MEMBER, 9L));
        verify(enrollments, never()).saveAndFlush(any());
    }

    @ParameterizedTest
    @ValueSource(ints = {9, 12})
    void cannotScheduleSessionStartingInThePastOrNow(int hour) {
        var request = new CreateSessionRequest(TODAY, LocalTime.of(hour, 0), LocalTime.of(hour + 1, 0));

        assertThrows(BadRequestException.class, () -> classService.createSession(5L, request));
        verify(sessions, never()).saveAndFlush(any());
    }

    @Test
    void fullClassRejectsBooking() {
        when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        ConflictException ex = assertThrows(ConflictException.class, () -> enrollmentService.enroll(MEMBER, 9L));
        assertEquals("SCHEDULING_CLASS_FULL", ex.getErrorCode());
        verify(enrollments, never()).saveAndFlush(any());
    }

    @Test
    void memberWithoutActiveMembershipCannotBook() {
        when(subscriptions.hasActiveMembership(MEMBER.id(), TODAY)).thenReturn(false);

        assertThrows(ForbiddenException.class, () -> enrollmentService.enroll(MEMBER, 9L));
        verify(enrollments, never()).saveAndFlush(any());
    }

    @Test
    void laterTodayRemainsBookable() {
        session.setSessionDate(TODAY);

        assertEquals("booked", enrollmentService.enroll(MEMBER, 9L).status());
    }

    @Test
    void laterTodayRemainsSchedulable() {
        var request = new CreateSessionRequest(TODAY, LocalTime.of(13, 0), LocalTime.of(14, 0));

        assertEquals(TODAY, classService.createSession(5L, request).sessionDate());
    }

    @Test
    void lockWaitCannotAdmitMemberAfterSessionHasStarted() {
        session.setSessionDate(TODAY);
        when(gymClasses.findByIdForUpdate(5L)).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-10-17T14:00:00Z"));
            return Optional.of(gymClass);
        });

        assertThrows(BadRequestException.class, () -> enrollmentService.enroll(MEMBER, 9L));
    }

    @Test
    void myEnrollmentsReturnsOnlyAuthenticatedMembersBookings() throws Exception {
        Member owner = new Member();
        owner.setUserId(MEMBER.id());
        ClassEnrollment ownBooking = new ClassEnrollment();
        ownBooking.setGymClass(gymClass);
        ownBooking.setMember(owner);
        ReflectionTestUtils.setField(ownBooking, "id", 21L);
        lenient().when(enrollments.findByMemberUserId(MEMBER.id())).thenReturn(List.of(ownBooking));
        var principalResolver = new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.getParameterType() == AuthenticatedPrincipal.class;
            }

            @Override
            public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                          NativeWebRequest request, WebDataBinderFactory factory) {
                return MEMBER;
            }
        };
        var mvc = MockMvcBuilders.standaloneSetup(new EnrollmentController(enrollmentService))
                .setCustomArgumentResolvers(principalResolver).build();

        mvc.perform(get("/api/v1/classes/enrollments/my").param("memberId", "999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].memberId").value(MEMBER.id()))
                .andExpect(jsonPath("$.data[0].id").value(21));
        verify(enrollments).findByMemberUserId(MEMBER.id());
    }

    @Test
    void enrollRejectsWhenMemberAlreadyBookedOverlappingSession() {
        GymClass otherClass = new GymClass();
        ReflectionTestUtils.setField(otherClass, "id", 88L);
        otherClass.setName("Boxing Burn");

        ClassSession otherSession = new ClassSession();
        ReflectionTestUtils.setField(otherSession, "id", 99L);
        otherSession.setGymClass(otherClass);
        otherSession.setSessionDate(TODAY.plusDays(1));
        otherSession.setStartTime(LocalTime.of(13, 30));
        otherSession.setEndTime(LocalTime.of(14, 30));
        otherSession.setStatus("scheduled");

        ClassEnrollment existingBooked = new ClassEnrollment();
        existingBooked.setGymClass(otherClass);
        existingBooked.setStatus("booked");

        when(enrollments.findByMemberUserId(MEMBER.id()))
                .thenReturn(List.of(existingBooked));
        when(sessions.findByGymClassIdOrderBySessionDateAscStartTimeAsc(88L))
                .thenReturn(List.of(otherSession));

        ConflictException ex = assertThrows(ConflictException.class, () -> enrollmentService.enroll(MEMBER, 9L));
        assertEquals("SCHEDULING_MEMBER_TIME_OVERLAP", ex.getErrorCode());
    }
}
