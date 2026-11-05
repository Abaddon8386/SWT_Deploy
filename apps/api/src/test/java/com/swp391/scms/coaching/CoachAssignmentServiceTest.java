package com.swp391.scms.coaching;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.audit.AuditLog;
import com.swp391.scms.audit.AuditLogRepository;
import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.coaching.service.CoachAssignmentService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.operations.repository.StaffInternalRequestRepository;
import com.swp391.scms.scheduling.entity.*;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CoachAssignmentServiceTest {
    @Mock CoachRepository coaches;
    @Mock MemberRepository members;
    @Mock TrainingPlanRepository plans;
    @Mock CoachBookingRepository bookings;
    @Mock ClassEnrollmentRepository enrollments;
    @Mock SessionBookingRepository sessionBookings;
    @Mock ClassSessionRepository sessions;
    @Mock StaffInternalRequestRepository staffRequests;
    @Mock MembershipSubscriptionRepository subscriptions;
    @Mock NotificationService notifications;
    @Mock MessageService messages;
    @Mock AuditLogRepository audit;
    final Clock clock = Clock.fixed(Instant.parse("2026-11-04T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
    final LocalDate today = LocalDate.of(2026, 11, 4);
    CoachAssignmentService service;
    Coach from, to;
    Member member;

    @BeforeEach
    void setup() {
        service = new CoachAssignmentService(coaches, members, plans, bookings, enrollments, sessionBookings,
                sessions, staffRequests, subscriptions, notifications, messages, audit, new ObjectMapper(), clock);
        from = coach(10L, "Coach Alpha"); to = coach(20L, "Coach Beta");
        member = new Member(); member.setUserId(100L); member.setMembershipCode("SOL100");
        member.setUser(user(100L, "Member One"));
        lenient().when(messages.getMessage(anyString(), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach void clearSecurity() { SecurityContextHolder.clearContext(); }
    private User user(Long id, String name) { User u = new User(); u.setId(id); u.setFullName(name); u.setStatus("active"); return u; }
    private Coach coach(Long id, String name) { Coach c = new Coach(); c.setUserId(id); c.setUser(user(id, name)); c.setEmploymentStatus("active"); return c; }
    private TrainingPlan plan(Long id, String status) {
        TrainingPlan p = new TrainingPlan(); p.setId(id); p.setMember(member); p.setCoach(from); p.setStatus(status);
        p.setStartDate(today.minusDays(3)); p.setEndDate(today.plusDays(30)); p.setGoal("Gain strength"); return p;
    }
    private CoachBooking booking(Long id) {
        CoachBooking b = new CoachBooking(); b.setId(id); b.setMember(member); b.setCoach(from); b.setStatus("confirmed");
        b.setBookingDate(today.plusDays(1)); b.setStartTime(LocalTime.of(10, 0)); b.setEndTime(LocalTime.of(11, 0)); return b;
    }
    private CoachAssignmentAssignDto assign() { return new CoachAssignmentAssignDto(100L, 10L, "TRAINING_PLAN", "Strength", today, today.plusDays(30)); }
    private CoachAssignmentReassignDto transfer(String type, Long id) { return new CoachAssignmentReassignDto(100L, 10L, 20L, id, type, "Schedule adjustment"); }
    private void validAccounts() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); when(coaches.findById(20L)).thenReturn(Optional.of(to));
        when(members.findById(100L)).thenReturn(Optional.of(member)); when(subscriptions.hasActiveMembership(100L, today)).thenReturn(true);
    }

    @Test void assignsUsingCurrentActiveMembership() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); when(members.findById(100L)).thenReturn(Optional.of(member));
        when(subscriptions.hasActiveMembership(100L, today)).thenReturn(true);
        when(plans.save(any())).thenAnswer(inv -> { TrainingPlan p = inv.getArgument(0); p.setId(999L); return p; });
        var result = service.assignStudent(assign());
        assertThat(result.memberId()).isEqualTo(100L); assertThat(result.referenceId()).isEqualTo(999L); assertThat(result.status()).isEqualTo("active");
        verify(subscriptions, never()).existsEntitlementEndingOnOrAfter(anyLong(), any());
        verify(notifications, times(2)).send(anyLong(), anyString(), anyString(), eq("system"), eq("training_plan"), eq(999L), anyString());
    }

    @Test void rejectsFutureOrHeldMembershipThatIsNotCurrentlyActive() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); when(members.findById(100L)).thenReturn(Optional.of(member));
        assertThatThrownBy(() -> service.assignStudent(assign())).isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "NO_ACTIVE_SUBSCRIPTION");
        verify(plans, never()).save(any()); verifyNoInteractions(notifications);
    }

    @ParameterizedTest @ValueSource(strings = {"inactive", "pending", "locked"})
    void rejectsInactiveMemberAccount(String status) {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); when(members.findById(100L)).thenReturn(Optional.of(member));
        member.getUser().setStatus(status);
        assertThatThrownBy(() -> service.assignStudent(assign())).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "MEMBER_INACTIVE");
        verifyNoInteractions(plans, notifications);
    }

    @Test void rejectsDeletedMember() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); when(members.findById(100L)).thenReturn(Optional.of(member));
        member.getUser().setDeletedAt(LocalDateTime.now(clock));
        assertThatThrownBy(() -> service.assignStudent(assign())).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "MEMBER_INACTIVE");
    }

    @Test void rejectsUnavailableCoach() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); from.setEmploymentStatus("on_leave");
        assertThatThrownBy(() -> service.assignStudent(assign())).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "COACH_INACTIVE");
    }

    @Test void rejectsDeletedCoachAccount() {
        when(coaches.findById(10L)).thenReturn(Optional.of(from)); from.getUser().setDeletedAt(LocalDateTime.now(clock));
        assertThatThrownBy(() -> service.assignStudent(assign())).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "COACH_INACTIVE");
    }

    @Test void transfersOnlySelectedPlanAndRecordsBothCoachIdsAndActor() throws Exception {
        validAccounts(); TrainingPlan selected = plan(501L, "active"), untouched = plan(502L, "active");
        when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(70L, "manager", "CENTER_MANAGER"), null));
        service.reassignStudent(transfer("TRAINING_PLAN", 501L));
        assertThat(selected.getCoach()).isSameAs(to); assertThat(untouched.getCoach()).isSameAs(from);
        assertThat(selected.getStartDate()).isEqualTo(today.minusDays(3)); assertThat(selected.getStatus()).isEqualTo("active");
        verify(plans).save(selected); verify(plans, never()).findByMemberUserIdOrderByCreatedAtDesc(anyLong()); verifyNoInteractions(bookings);
        ArgumentCaptor<AuditLog> capture = ArgumentCaptor.forClass(AuditLog.class); verify(audit).save(capture.capture());
        var log = capture.getValue(); assertThat(log.getUserId()).isEqualTo(70L); assertThat(log.getAction()).isEqualTo("COACH_ASSIGNMENT_TRANSFER");
        var old = new ObjectMapper().readTree(log.getOldValue()); var next = new ObjectMapper().readTree(log.getNewValue());
        assertThat(old.get("coachId").asLong()).isEqualTo(10L); assertThat(next.get("coachId").asLong()).isEqualTo(20L);
        assertThat(old.get("referenceId").asLong()).isEqualTo(501L); assertThat(next.get("reason").asText()).isEqualTo("Schedule adjustment");
        verify(notifications, times(3)).send(anyLong(), anyString(), anyString(), eq("system"), eq("training_plan"), eq(501L), anyString());
    }

    @Test void rejectsClassTransferWithoutWritingOrNotifying() {
        assertThatThrownBy(() -> service.reassignStudent(transfer("CLASS", 701L))).isInstanceOf(BadRequestException.class);
        verifyNoInteractions(plans, bookings, audit, notifications);
    }

    @Test void requiresExplicitReference() {
        assertThatThrownBy(() -> service.reassignStudent(transfer("TRAINING_PLAN", null))).isInstanceOf(BadRequestException.class);
        verifyNoInteractions(plans, bookings, audit, notifications);
    }

    @Test void rejectsMemberRelationshipMismatch() {
        validAccounts(); TrainingPlan selected = plan(501L, "active"); Member other = new Member(); other.setUserId(200L); selected.setMember(other);
        when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        assertThatThrownBy(() -> service.reassignStudent(transfer("TRAINING_PLAN", 501L))).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "ASSIGNMENT_MISMATCH");
        assertThat(selected.getCoach()).isSameAs(from); verifyNoInteractions(audit, notifications); verify(plans, never()).save(any());
    }

    @Test void rejectsSourceCoachMismatch() {
        validAccounts(); TrainingPlan selected = plan(501L, "active"); selected.setCoach(to);
        when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        assertThatThrownBy(() -> service.reassignStudent(transfer("TRAINING_PLAN", 501L))).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "ASSIGNMENT_MISMATCH");
        verifyNoInteractions(audit, notifications); verify(plans, never()).save(any());
    }

    @Test void missingRelationshipNeverReturnsSuccessOrNotifies() {
        validAccounts();
        assertThatThrownBy(() -> service.reassignStudent(transfer("TRAINING_PLAN", 987L))).isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(audit, notifications);
    }

    @Test void transfersOnlySelectedFuturePt() {
        validAccounts(); CoachBooking selected = booking(601L), untouched = booking(602L);
        when(bookings.findByIdForUpdate(601L)).thenReturn(Optional.of(selected));
        when(subscriptions.hasActiveMembershipCoveringSession(100L, today, today.plusDays(1))).thenReturn(true);
        service.reassignStudent(transfer("PT_1_1", 601L));
        assertThat(selected.getCoach()).isSameAs(to); assertThat(untouched.getCoach()).isSameAs(from);
        verify(bookings).save(selected); verify(bookings, never()).findByMemberId(anyLong()); verifyNoInteractions(plans);
        verify(audit).save(any());
    }

    @Test void doesNotTransferEarlierTodayPt() {
        validAccounts(); CoachBooking selected = booking(601L); selected.setBookingDate(today); selected.setStartTime(LocalTime.of(9, 0));
        when(bookings.findByIdForUpdate(601L)).thenReturn(Optional.of(selected));
        assertThatThrownBy(() -> service.reassignStudent(transfer("PT_1_1", 601L))).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "ASSIGNMENT_NOT_CURRENT");
        assertThat(selected.getCoach()).isSameAs(from); verifyNoInteractions(notifications, audit);
    }

    @Test void rejectsTargetCoachApprovedLeave() {
        validAccounts(); CoachBooking selected = booking(601L); when(bookings.findByIdForUpdate(601L)).thenReturn(Optional.of(selected));
        when(subscriptions.hasActiveMembershipCoveringSession(100L, today, today.plusDays(1))).thenReturn(true);
        when(staffRequests.existsApprovedLeaveOn(20L, today.plusDays(1))).thenReturn(true);
        assertThatThrownBy(() -> service.reassignStudent(transfer("PT_1_1", 601L))).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "COACH_ON_LEAVE");
        assertThat(selected.getCoach()).isSameAs(from); verifyNoInteractions(notifications, audit);
    }

    @Test void rejectsTargetCoachClassConflict() {
        validAccounts(); CoachBooking selected = booking(601L); when(bookings.findByIdForUpdate(601L)).thenReturn(Optional.of(selected));
        when(subscriptions.hasActiveMembershipCoveringSession(100L, today, today.plusDays(1))).thenReturn(true);
        ClassSession busy = new ClassSession(); busy.setStartTime(LocalTime.of(10, 30)); busy.setEndTime(LocalTime.of(11, 30));
        when(sessions.findActiveByCoachAndDate(20L, today.plusDays(1))).thenReturn(List.of(busy));
        assertThatThrownBy(() -> service.reassignStudent(transfer("PT_1_1", 601L))).isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "COACH_SCHEDULE_CONFLICT");
        assertThat(selected.getCoach()).isSameAs(from); verifyNoInteractions(notifications, audit);
    }

    @Test void endingActiveAssignmentCancelsWithoutMarkingCompleted() {
        TrainingPlan selected = plan(501L, "active"); when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        service.removeAssignment(501L);
        assertThat(selected.getStatus()).isEqualTo("cancelled"); assertThat(selected.getEndDate()).isEqualTo(today.plusDays(30));
        assertThat(selected.getCoach()).isSameAs(from); assertThat(selected.getMember()).isSameAs(member);
    }

    @ParameterizedTest @ValueSource(strings = {"completed", "cancelled", "draft"})
    void endingCompletedAssignmentPreservesItsHistoricalStatus(String status) {
        TrainingPlan selected = plan(501L, status); when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        assertThatThrownBy(() -> service.removeAssignment(501L)).isInstanceOf(BadRequestException.class);
        assertThat(selected.getStatus()).isEqualTo(status); verify(plans, never()).save(any()); verifyNoInteractions(notifications);
    }

    @Test void cannotCancelExpiredActivePlan() {
        TrainingPlan selected = plan(501L, "active"); selected.setEndDate(today.minusDays(1)); when(plans.findByIdForUpdate(501L)).thenReturn(Optional.of(selected));
        assertThatThrownBy(() -> service.removeAssignment(501L)).isInstanceOf(BadRequestException.class);
        assertThat(selected.getStatus()).isEqualTo("active"); verify(plans, never()).save(any());
    }

    @Test void overviewUsesCurrentQueriesIncludesSessionMembersAndCountsDistinctStudents() {
        when(coaches.findActiveWithUser()).thenReturn(List.of(from, to));
        when(plans.findCurrentAssignments(10L, today)).thenReturn(List.of(plan(501L, "active"), plan(502L, "active")));
        GymClass group = new GymClass(); group.setId(701L); group.setName("Yoga");
        ClassSession session = new ClassSession(); session.setGymClass(group); session.setSessionDate(today.plusDays(1)); session.setStartTime(LocalTime.of(10, 0));
        SessionBooking seat = new SessionBooking(); seat.setId(801L); seat.setSession(session); seat.setMember(member); seat.setStatus("booked");
        when(sessionBookings.findCurrentCoachAssignments(eq(10L), eq(today), any())).thenReturn(List.of(seat));
        var overview = service.getOverview(10L, null, null);
        @SuppressWarnings("unchecked") List<CoachAssignmentOverviewDto> rows = (List<CoachAssignmentOverviewDto>) overview.get("coaches");
        assertThat(rows).hasSize(1); assertThat(rows.getFirst().students()).hasSize(3); assertThat(rows.getFirst().totalStudentsCount()).isEqualTo(1);
        assertThat(rows.getFirst().planStudentsCount()).isEqualTo(1); assertThat(rows.getFirst().classStudentsCount()).isEqualTo(1);
        var stats = (CoachAssignmentSummaryStatsDto) overview.get("stats"); assertThat(stats.totalAssignedStudents()).isEqualTo(1); assertThat(stats.totalPlanStudents()).isEqualTo(1);
        assertThat((List<?>) overview.get("availableCoaches")).hasSize(2);
        verify(plans, never()).findByCoachUserIdOrderByCreatedAtDesc(anyLong()); verify(bookings, never()).findByCoachId(anyLong());
        verify(bookings).findCurrentAssignments(10L, today, LocalTime.of(15, 0));
    }

    @Test void overviewCollapsesClassEnrollmentAndSessionSeatForSameMember() {
        when(coaches.findActiveWithUser()).thenReturn(List.of(from));
        GymClass group = new GymClass(); group.setId(701L); group.setName("Yoga");
        ClassEnrollment enrollment = new ClassEnrollment(); enrollment.setId(901L); enrollment.setGymClass(group); enrollment.setMember(member); enrollment.setStatus("booked");
        ClassSession session = new ClassSession(); session.setGymClass(group);
        SessionBooking seat = new SessionBooking(); seat.setSession(session); seat.setMember(member);
        when(enrollments.findCurrentCoachAssignments(eq(10L), eq(today), any())).thenReturn(List.of(enrollment));
        when(sessionBookings.findCurrentCoachAssignments(eq(10L), eq(today), any())).thenReturn(List.of(seat));
        var overview = service.getOverview(null, null, "CLASS");
        @SuppressWarnings("unchecked") var rows = (List<CoachAssignmentOverviewDto>) overview.get("coaches");
        assertThat(rows.getFirst().students()).hasSize(1); assertThat(rows.getFirst().classStudentsCount()).isEqualTo(1);
    }
}
