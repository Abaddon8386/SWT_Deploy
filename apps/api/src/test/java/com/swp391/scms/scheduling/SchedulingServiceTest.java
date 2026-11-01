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
import com.swp391.scms.scheduling.entity.ClassWaitlist;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.scheduling.service.ClassService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.scheduling.service.WaitlistService;
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
    @Mock private ClassWaitlistRepository waitlists;
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
    private WaitlistService waitlistService;
    @InjectMocks private ClassService classService;

    private GymClass gymClass;
    private ClassSession session;

    @BeforeEach
    void setUp() {
        waitlistService = new WaitlistService(waitlists, enrollments, sessions, subscriptions, members, gymClasses,
                clock, enrollmentService);
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
        lenient().when(sessions.findById(9L)).thenReturn(Optional.of(session));
        lenient().when(gymClasses.findById(5L)).thenReturn(Optional.of(gymClass));
        lenient().when(gymClasses.findByIdForUpdate(5L)).thenReturn(Optional.of(gymClass));
        lenient().when(subscriptions.hasActiveMembership(MEMBER.id(), TODAY)).thenReturn(true);
        lenient().when(subscriptions.hasActiveMembershipCoveringSession(eq(MEMBER.id()), eq(TODAY), any()))
                .thenReturn(true);
        lenient().when(enrollments.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(waitlists.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(sessions.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @ParameterizedTest
    @ValueSource(strings = {"cancelled", "completed"})
    void waitlistRejectsClosedSessions(String status) {
        session.setStatus(status);
        lenient().when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> waitlistService.join(MEMBER, 9L));
        verify(waitlists, never()).saveAndFlush(any());
    }

    @Test
    void waitlistRejectsPastDate() {
        session.setSessionDate(TODAY.minusDays(1));
        lenient().when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> waitlistService.join(MEMBER, 9L));
    }

    @ParameterizedTest
    @ValueSource(ints = {9, 12})
    void waitlistRejectsSessionsThatAlreadyStartedToday(int hour) {
        session.setSessionDate(TODAY);
        session.setStartTime(LocalTime.of(hour, 0));
        lenient().when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> waitlistService.join(MEMBER, 9L));
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
    void bookingClosesExistingWaitlistEntry() {
        ClassWaitlist waiting = waitingEntry();
        lenient().when(waitlists.findByGymClassIdAndMemberUserIdAndStatus(5L, MEMBER.id(), "waiting"))
                .thenReturn(Optional.of(waiting));

        var result = enrollmentService.enroll(MEMBER, 9L);

        assertEquals("booked", result.status());
        assertEquals("expired", waiting.getStatus());
    }

    @Test
    void rejectedBookingPreservesWaitlistEntry() {
        ClassWaitlist waiting = waitingEntry();
        when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        assertThrows(ConflictException.class, () -> enrollmentService.enroll(MEMBER, 9L));

        assertEquals("waiting", waiting.getStatus());
        verify(waitlists, never()).saveAndFlush(any());
    }

    @Test
    void futureSubscriptionCannotJoinWaitlist() {
        when(subscriptions.hasActiveMembership(MEMBER.id(), TODAY)).thenReturn(false);
        lenient().when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);

        assertThrows(ForbiddenException.class, () -> waitlistService.join(MEMBER, 9L));
        verify(waitlists, never()).saveAndFlush(any());
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

    @ParameterizedTest
    @ValueSource(strings = {"enroll", "waitlist"})
    void lockWaitCannotAdmitMemberAfterSessionHasStarted(String action) {
        session.setSessionDate(TODAY);
        when(gymClasses.findByIdForUpdate(5L)).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-10-17T14:00:00Z"));
            return Optional.of(gymClass);
        });
        if ("waitlist".equals(action)) {
            lenient().when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);
        }

        assertThrows(BadRequestException.class, () -> {
            if ("enroll".equals(action)) {
                enrollmentService.enroll(MEMBER, 9L);
            } else {
                waitlistService.join(MEMBER, 9L);
            }
        });
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

    private ClassWaitlist waitingEntry() {
        ClassWaitlist waiting = new ClassWaitlist();
        waiting.setGymClass(gymClass);
        waiting.setStatus("waiting");
        return waiting;
    }

    @Test
    void cancellationGrants15MinReservationWindowToNextWaitlistMember() {
        ClassEnrollment enrollment = new ClassEnrollment();
        ReflectionTestUtils.setField(enrollment, "id", 101L);
        enrollment.setGymClass(gymClass);
        enrollment.setStatus("booked");
        Member owner = new Member();
        owner.setUserId(MEMBER.id());
        enrollment.setMember(owner);

        ClassWaitlist waiting = waitingEntry();
        Member waitlistMember = new Member();
        waitlistMember.setUserId(99L);
        waiting.setMember(waitlistMember);

        when(enrollments.findById(101L)).thenReturn(Optional.of(enrollment));
        when(waitlists.findByGymClassIdAndStatusOrderByRequestedAtAsc(5L, "waiting"))
                .thenReturn(List.of(waiting));

        enrollmentService.cancel(MEMBER, 101L);

        assertEquals("cancelled", enrollment.getStatus());
        assertEquals("notified", waiting.getStatus());
        assertNotNull(waiting.getNotifiedAt());
        assertNotNull(waiting.getReservationExpiresAt());
        assertEquals(waiting.getNotifiedAt().plusHours(24), waiting.getReservationExpiresAt());
        verify(waitlists).save(waiting);
    }

    @Test
    void withdrawingReservationNotifiesTheNextMember() {
        ClassWaitlist reserved = waitingEntry();
        reserved.setStatus("notified");
        Member owner = new Member();
        owner.setUserId(MEMBER.id());
        reserved.setMember(owner);
        ClassWaitlist next = waitingEntry();
        Member nextMember = new Member();
        nextMember.setUserId(99L);
        next.setMember(nextMember);
        when(waitlists.findById(30L)).thenReturn(Optional.of(reserved));
        when(waitlists.findByGymClassIdAndStatusOrderByRequestedAtAsc(5L, "waiting")).thenReturn(List.of(next));

        waitlistService.withdraw(MEMBER, 30L);

        assertEquals("notified", next.getStatus());
        verify(notifications).send(eq(99L), any(), any(), eq("schedule_change"), eq("class_session"), any());
    }

    @Test
    void outsiderBlockedFromBookingWhenActiveWaitlistReservationHoldsVirtualSeat() {
        // Lớp capacity = 1, booked = 0 nhưng có 1 slot ảo đang giữ (active reservation = 1)
        when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(0L);
        when(waitlists.countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(eq(5L), eq("notified"), any()))
                .thenReturn(1L);
        when(waitlists.findByGymClassIdAndMemberUserIdAndStatus(5L, MEMBER.id(), "notified"))
                .thenReturn(Optional.empty());

        assertThrows(ConflictException.class, () -> enrollmentService.enroll(MEMBER, 9L));
    }

    @Test
    void notifiedMemberCanClaimReservedSeat() {
        ClassWaitlist holdingReservation = waitingEntry();
        holdingReservation.setStatus("notified");
        holdingReservation.setReservationExpiresAt(LocalDateTime.of(2026, 10, 17, 12, 15));

        when(enrollments.countByGymClassIdAndStatus(5L, "booked")).thenReturn(0L);
        when(waitlists.countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(eq(5L), eq("notified"), any()))
                .thenReturn(1L);
        when(waitlists.findByGymClassIdAndMemberUserIdAndStatus(5L, MEMBER.id(), "notified"))
                .thenReturn(Optional.of(holdingReservation));

        var result = enrollmentService.enroll(MEMBER, 9L);

        assertEquals("booked", result.status());
        assertEquals("expired", holdingReservation.getStatus());
    }
}
