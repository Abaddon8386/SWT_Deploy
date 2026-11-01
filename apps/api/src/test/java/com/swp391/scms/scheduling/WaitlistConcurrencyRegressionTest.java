package com.swp391.scms.scheduling;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.*;
import com.swp391.scms.scheduling.repository.*;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.scheduling.service.WaitlistService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** State/ordering regressions with mocked repositories, NOT proof of PostgreSQL locking. */
class WaitlistConcurrencyRegressionTest {
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-01T03:00:00Z"), ZoneOffset.UTC);
    private final LocalDateTime now = LocalDateTime.now(clock);
    private final AuthenticatedPrincipal actor = new AuthenticatedPrincipal(12L, "member", "MEMBER");
    private final ClassEnrollmentRepository bookings = mock(ClassEnrollmentRepository.class);
    private final ClassWaitlistRepository waits = mock(ClassWaitlistRepository.class);
    private final ClassSessionRepository sessions = mock(ClassSessionRepository.class);
    private final GymClassRepository classes = mock(GymClassRepository.class);
    private final MembershipSubscriptionRepository subscriptions = mock(MembershipSubscriptionRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final EnrollmentService service = new EnrollmentService(bookings, sessions, waits, classes,
            subscriptions, members, notifications, null, clock, events);
    private final WaitlistService waitlist = new WaitlistService(waits, bookings, sessions, subscriptions,
            members, classes, clock, service);
    private final GymClass gymClass = new GymClass();
    private final Member member = new Member();

    WaitlistConcurrencyRegressionTest() {
        ReflectionTestUtils.setField(gymClass, "id", 5L);
        gymClass.setName("Swimming");
        gymClass.setStatus("active");
        gymClass.setCapacity(1);
        member.setUserId(actor.id());
        when(classes.findByIdForUpdate(5L)).thenReturn(Optional.of(gymClass));
        when(members.findById(actor.id())).thenReturn(Optional.of(member));
        when(members.findByUserIdForUpdate(actor.id())).thenReturn(Optional.of(member));
        when(subscriptions.hasActiveMembership(any(), any())).thenReturn(true);
        when(subscriptions.hasActiveMembershipCoveringSession(any(), any(), any())).thenReturn(true);
        ClassSession session = new ClassSession();
        session.setGymClass(gymClass);
        session.setSessionDate(LocalDate.of(2026, 11, 2));
        session.setStartTime(LocalTime.of(10, 0));
        session.setEndTime(LocalTime.of(11, 0));
        when(sessions.findById(9L)).thenReturn(Optional.of(session));
        when(bookings.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(waits.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    private ClassWaitlist entry(long id, String state) {
        ClassWaitlist entry = new ClassWaitlist();
        ReflectionTestUtils.setField(entry, "id", id);
        entry.setGymClass(gymClass);
        entry.setMember(member);
        entry.setStatus(state);
        entry.setRequestedAt(now.minusDays(2));
        entry.setNotifiedAt(now.minusHours(1));
        entry.setReservationExpiresAt(now.plusHours(23));
        return entry;
    }

    @Test
    void cancellationRereadsAfterClassLockAndCannotReleaseSameSeatTwice() {
        ClassEnrollment stale = new ClassEnrollment();
        stale.setGymClass(gymClass);
        stale.setMember(member);
        stale.setStatus("booked");
        ClassEnrollment current = new ClassEnrollment();
        current.setGymClass(gymClass);
        current.setMember(member);
        current.setStatus("booked");
        when(bookings.findById(21L)).thenAnswer(call -> Optional.of(stale));
        when(bookings.findClassIdById(21L)).thenReturn(Optional.of(5L));
        when(bookings.findByIdForUpdate(21L)).thenReturn(Optional.of(current));
        ClassWaitlist first = entry(31, "waiting");
        when(waits.findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(5L, "waiting"))
                .thenReturn(Optional.of(first));

        service.cancel(actor, 21L);
        assertThrows(AppException.class, () -> service.cancel(actor, 21L));

        assertEquals("cancelled", current.getStatus());
        verify(bookings, times(1)).saveAndFlush(current);
        verify(notifications, times(1)).send(eq(actor.id()), eq("notifications.booking.cancelled.title"),
                any(), any(), any(), any());
        var order = inOrder(classes, bookings);
        order.verify(classes).findByIdForUpdate(5L);
        order.verify(bookings).findByIdForUpdate(21L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"booked", "held"})
    void promotionCannotOverbookOrOverHold(String occupiedBy) {
        when(bookings.countByGymClassIdAndStatus(5L, "booked"))
                .thenReturn("booked".equals(occupiedBy) ? 1L : 0L);
        when(waits.countLiveOffers(eq(5L), any(), any()))
                .thenReturn("held".equals(occupiedBy) ? 1L : 0L);
        ClassWaitlist next = entry(31, "waiting");
        when(waits.findByGymClassIdAndStatusOrderByRequestedAtAsc(5L, "waiting")).thenReturn(List.of(next));

        service.promoteNextWaitlistEntry(5L, now);

        assertEquals("waiting", next.getStatus());
        verify(waits, never()).save(any());
        verify(waits, never()).saveAndFlush(any());
        verifyNoInteractions(notifications);
    }

    @Test
    void notifiedMemberCannotRejoinWaitlist() {
        when(waits.countLiveOffers(eq(5L), any(), any())).thenReturn(1L);
        when(waits.countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(eq(5L), eq("notified"), any()))
                .thenReturn(1L);
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenReturn(Optional.of(entry(31, "notified")));
        assertThrows(AppException.class, () -> waitlist.join(actor, 9L));
        verify(waits, never()).saveAndFlush(any());
    }

    @Test
    void offerAtExactExpiryCannotClaimEvenWithoutSchedulerBroadcast() {
        ClassWaitlist offer = entry(31, "notified");
        offer.setReservationExpiresAt(now);
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenReturn(Optional.of(offer));
        assertThrows(AppException.class, () -> service.enroll(actor, 9L));
        verify(bookings, never()).saveAndFlush(any());
        verifyNoInteractions(notifications);
    }

    @Test
    void explicitClaimCannotBecomeFreshBookingAfterSchedulerExpiredItsOffer() {
        ClassWaitlist expired = entry(31, "expired");
        when(waits.findClaimOfferForUpdate(31L, 5L, actor.id())).thenReturn(Optional.of(expired));
        assertEquals("SCHEDULING_WAITLIST_OFFER_NOT_ACTIVE", assertThrows(AppException.class,
                () -> service.enroll(actor, 9L, 31L)).getErrorCode());
        verify(bookings, never()).saveAndFlush(any());
        verifyNoInteractions(notifications, events);
    }

    @ParameterizedTest
    @ValueSource(strings = {"waiting", "expired"})
    void explicitClaimRequiresNotifiedOffer(String state) {
        when(waits.findClaimOfferForUpdate(31L, 5L, actor.id()))
                .thenReturn(Optional.of(entry(31, state)));
        assertThrows(AppException.class, () -> service.enroll(actor, 9L, 31L));
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test
    void explicitClaimOfAnotherMemberOrClassIsNotFoundAndNeverWrites() {
        when(waits.findClaimOfferForUpdate(31L, 5L, actor.id())).thenReturn(Optional.empty());
        var error = assertThrows(AppException.class, () -> service.enroll(actor, 9L, 31L));
        assertEquals(404, error.getStatus().value());
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test
    void explicitClaimUsesOnlyItsLiveOffer() {
        ClassWaitlist offer = entry(31, "notified");
        when(waits.findClaimOfferForUpdate(31L, 5L, actor.id())).thenReturn(Optional.of(offer));
        when(waits.countLiveOffers(eq(5L), any(), any())).thenReturn(1L);
        assertEquals("booked", service.enroll(actor, 9L, 31L).status());
        assertEquals("expired", offer.getStatus());
        verify(waits).save(offer);
    }

    @Test
    void explicitClaimRechecksDeadlineUnderLock() {
        ClassWaitlist offer = entry(31, "notified");
        offer.setReservationExpiresAt(now);
        when(waits.findClaimOfferForUpdate(31L, 5L, actor.id())).thenReturn(Optional.of(offer));
        assertEquals("SCHEDULING_WAITLIST_OFFER_EXPIRED", assertThrows(AppException.class,
                () -> service.enroll(actor, 9L, 31L)).getErrorCode());
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test
    void explicitClaimRejectsNonPositiveId() {
        assertEquals("SCHEDULING_WAITLIST_ID_INVALID", assertThrows(AppException.class,
                () -> service.enroll(actor, 9L, 0L)).getErrorCode());
        verifyNoInteractions(bookings, notifications, events);
    }

    @Test
    void offerWithoutAnyDeadlineCannotStealAnotherMembersLiveHold() {
        ClassWaitlist malformed = entry(31, "notified");
        malformed.setNotifiedAt(null);
        malformed.setReservationExpiresAt(null);
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenReturn(Optional.of(malformed));
        when(waits.countLiveOffers(eq(5L), any(), any())).thenReturn(1L);
        assertThrows(AppException.class, () -> service.enroll(actor, 9L));
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test
    void withdrawReadsCurrentStateAfterClassLock() {
        ClassWaitlist stale = entry(31, "waiting");
        ClassWaitlist promoted = entry(31, "notified");
        when(waits.findById(31L)).thenReturn(Optional.of(stale));
        when(waits.findClassIdById(31L)).thenReturn(Optional.of(5L));
        when(waits.findByIdForUpdate(31L)).thenReturn(Optional.of(promoted));

        waitlist.withdraw(actor, 31L);

        assertEquals("expired", promoted.getStatus());
        verify(waits).saveAndFlush(promoted);
        var order = inOrder(classes, waits);
        order.verify(classes).findByIdForUpdate(5L);
        order.verify(waits).findByIdForUpdate(31L);
    }

    @Test
    void repeatedExpiryJobsCannotExpireOrPromoteTwice() {
        ClassWaitlist overdue = entry(31, "notified");
        overdue.setReservationExpiresAt(now);
        ClassWaitlist next = entry(32, "waiting");
        when(waits.findExpiredOffers(eq(5L), any(), any())).thenAnswer(call ->
                "notified".equals(overdue.getStatus()) ? List.of(overdue) : List.of());
        when(waits.findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(5L, "waiting"))
                .thenReturn(Optional.of(next));
        assertEquals(1, service.processExpiredWaitlistReservations(5L, now));
        assertEquals(0, service.processExpiredWaitlistReservations(5L, now));
        assertEquals("expired", overdue.getStatus());
        assertEquals("notified", next.getStatus());
        assertEquals(now.plusHours(24), next.getReservationExpiresAt());
        verify(waits).saveAndFlush(overdue);
        verify(waits).saveAndFlush(next);
        verify(notifications, times(2)).send(any(), any(), any(), any(), any(), any());
        verify(events).publishEvent(any(Object.class));
    }

    @Test
    void aClaimedOfferIsNotExpiredAgainByAStaleCandidate() {
        ClassWaitlist claimed = entry(31, "expired");
        claimed.setReservationExpiresAt(now.minusSeconds(1));
        when(waits.findExpiredOffers(eq(5L), any(), any())).thenReturn(List.of(claimed));
        assertEquals(0, service.processExpiredWaitlistReservations(5L, now));
        verify(waits, never()).saveAndFlush(any());
        verifyNoInteractions(notifications, events);
    }

    @Test
    void validClaimConsumesOfferAndDoesNotPromoteAnotherMember() {
        ClassWaitlist offer = entry(31, "notified");
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenReturn(Optional.of(offer));
        when(waits.countLiveOffers(eq(5L), any(), any())).thenReturn(1L);
        assertEquals("booked", service.enroll(actor, 9L).status());
        assertEquals("expired", offer.getStatus());
        verify(waits, never()).findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(any(), any());
    }

    @Test
    void callerPromotedDuringExpiryCleanupCanImmediatelyClaimThatSeat() {
        ClassWaitlist overdue = entry(31, "notified");
        overdue.setReservationExpiresAt(now.minusSeconds(1));
        Member other = new Member();
        other.setUserId(99L);
        overdue.setMember(other);
        ClassWaitlist caller = entry(32, "waiting");
        when(waits.findExpiredOffers(eq(5L), any(), any())).thenReturn(List.of(overdue));
        when(waits.findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(5L, "waiting"))
                .thenReturn(Optional.of(caller));
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenAnswer(call -> "notified".equals(caller.getStatus()) ? Optional.of(caller) : Optional.empty());
        when(waits.countLiveOffers(eq(5L), any(), any()))
                .thenAnswer(call -> "notified".equals(caller.getStatus()) ? 1L : 0L);

        assertEquals("booked", service.enroll(actor, 9L).status());
        assertEquals("expired", caller.getStatus());
    }

    @Test
    void expiredOfferMayRejoinAtEndOfQueueWhenClassRemainsFull() {
        ClassWaitlist old = entry(31, "notified");
        old.setReservationExpiresAt(now.minusSeconds(1));
        when(bookings.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "notified"))
                .thenReturn(Optional.of(old));
        var result = waitlist.join(actor, 9L);
        assertEquals("waiting", result.status());
        assertEquals(now, result.requestedAt());
        assertEquals("expired", old.getStatus());
        verify(waits, times(2)).saveAndFlush(any());
    }

    @Test
    void waitingDuplicateRemainsRejected() {
        when(bookings.countByGymClassIdAndStatus(5L, "booked")).thenReturn(1L);
        when(waits.findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "waiting"))
                .thenReturn(Optional.of(entry(31, "waiting")));
        assertEquals("SCHEDULING_WAITLIST_DUPLICATE",
                assertThrows(AppException.class, () -> waitlist.join(actor, 9L)).getErrorCode());
    }

    @Test
    void failedCancellationDoesNotNotifyOrPromote() {
        ClassEnrollment current = new ClassEnrollment();
        current.setGymClass(gymClass);
        current.setMember(member);
        current.setStatus("booked");
        when(bookings.findClassIdById(21L)).thenReturn(Optional.of(5L));
        when(bookings.findByIdForUpdate(21L)).thenReturn(Optional.of(current));
        when(bookings.saveAndFlush(current)).thenThrow(new IllegalStateException("write failed"));
        assertThrows(IllegalStateException.class, () -> service.cancel(actor, 21L));
        verifyNoInteractions(notifications, events);
    }

    @Test
    void promotionEventWaitsForCommitAndIsNotPublishedOnRollback() {
        when(waits.findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(5L, "waiting"))
                .thenReturn(Optional.of(entry(31, "waiting")));
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.promoteNextWaitlistEntry(5L, now);
            verifyNoInteractions(events);
            var callbacks = TransactionSynchronizationManager.getSynchronizations();
            callbacks.forEach(callback -> callback.afterCompletion(
                    org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK));
            verifyNoInteractions(events);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void bulkCancellationLocksMemberThenAllClassesInAscendingOrder() {
        when(bookings.findBookedClassIdsByMemberId(actor.id())).thenReturn(List.of(9L, 5L));
        when(waits.findActiveClassIdsByMemberId(actor.id())).thenReturn(List.of(5L));
        GymClass second = new GymClass();
        ReflectionTestUtils.setField(second, "id", 9L);
        when(classes.findByIdForUpdate(9L)).thenReturn(Optional.of(second));
        assertEquals(0, service.cancelFutureEnrollmentsForMember(actor.id(), "hold"));
        var order = inOrder(members, classes, waits);
        order.verify(members).findByUserIdForUpdate(actor.id());
        order.verify(classes).findByIdForUpdate(5L);
        order.verify(classes).findByIdForUpdate(9L);
        order.verify(waits).findByGymClassIdAndMemberUserIdAndStatus(5L, actor.id(), "waiting");
    }
}
