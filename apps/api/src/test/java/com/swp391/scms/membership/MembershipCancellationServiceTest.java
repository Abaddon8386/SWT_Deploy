package com.swp391.scms.membership;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.membership.dto.CancellationDtos;
import com.swp391.scms.membership.entity.MembershipCancellationRequest;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipCancellationRequestRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.membership.service.MembershipCancellationService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MembershipCancellationServiceTest {
    @Mock MembershipCancellationRequestRepository requests;
    @Mock MembershipSubscriptionRepository subscriptions;
    @Mock MemberRepository members;
    @Mock UserRepository users;
    @Mock EnrollmentService enrollments;
    @Mock MessageService messages;
    @Mock PaymentRepository payments;
    MembershipCancellationService service;
    Member member;
    MembershipSubscription active;
    MembershipCancellationRequest pending;
    AuthenticatedPrincipal owner = new AuthenticatedPrincipal(10L, "member", "MEMBER");
    AuthenticatedPrincipal manager = new AuthenticatedPrincipal(20L, "manager", "CENTER_MANAGER");

    @BeforeEach
    void setup() {
        Clock clock = Clock.fixed(Instant.parse("2026-10-22T08:00:00Z"), ZoneOffset.UTC);
        service = new MembershipCancellationService(requests, subscriptions, members, users, enrollments, messages, clock, payments, null);
        member = new Member(); member.setUserId(10L);
        User user = new User(); user.setId(10L); user.setFullName("Member"); member.setUser(user);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L); pack.setName("Essential");
        active = new MembershipSubscription(); active.setId(100L); active.setMember(member);
        active.setMembershipPackage(pack); active.setStatus("active");
        active.setStartDate(LocalDate.of(2026, 10, 1)); active.setEndDate(LocalDate.of(2026, 11, 1));
        pending = new MembershipCancellationRequest(); pending.setId(7L); pending.setMember(member);
        pending.setSubscription(active); pending.setReason("Moving"); pending.setStatus("PENDING");
        lenient().when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
    }

    @Test
    void requestKeepsMembershipActiveAndRejectsDuplicate() {
        when(subscriptions.findByIdForUpdate(100L)).thenReturn(Optional.of(active));
        when(requests.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        CancellationDtos.Response result = service.request(owner, 100L, new CancellationDtos.Request(" Moving "));
        assertThat(result.reason()).isEqualTo("Moving");
        assertThat(active.getStatus()).isEqualTo("active");
        verifyNoInteractions(enrollments);
        when(requests.existsBySubscriptionIdAndStatus(100L, "PENDING")).thenReturn(true);
        assertThatThrownBy(() -> service.request(owner, 100L, new CancellationDtos.Request("Moving")))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void requestSuggestsUnusedShareOfWhatWasPaidNotTheCatalogPrice() {
        // Bought for 320,000; the manager has since raised the package to 500,000.
        active.getMembershipPackage().setPrice(new java.math.BigDecimal("500000"));
        com.swp391.scms.finance.entity.Payment paid = new com.swp391.scms.finance.entity.Payment();
        paid.setSubscriptionId(100L);
        paid.setAmount(new java.math.BigDecimal("320000"));
        paid.setStatus("success");
        when(payments.findAllBySubscriptionId(100L)).thenReturn(List.of(paid));
        when(subscriptions.findByIdForUpdate(100L)).thenReturn(Optional.of(active));
        when(requests.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CancellationDtos.Response result = service.request(owner, 100L, new CancellationDtos.Request("Moving"));

        // 01/10–01/11 is 32 days; on 22/10, 11 days are left: 320,000 × 11/32 = 110,000.
        assertThat(result.refundAmount()).isEqualByComparingTo("110000");
    }

    @Test
    void requestRequiresOwnerAndNonblankReason() {
        when(subscriptions.findByIdForUpdate(100L)).thenReturn(Optional.of(active));
        assertThatThrownBy(() -> service.request(new AuthenticatedPrincipal(11L, "other", "MEMBER"),
                100L, new CancellationDtos.Request("reason")))
                .isInstanceOf(com.swp391.scms.common.exception.ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.request(owner, 100L, new CancellationDtos.Request("   ")))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void approvalEndsOnlySoleMembershipAndFutureBookingInSameTransaction() {
        stubDecision();
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(active));
        when(messages.getMessage("scheduling.enrollment.cancelled_by_membership")).thenReturn("Membership cancelled");
        User managerUser = new User(); managerUser.setId(20L);
        when(users.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(managerUser));
        when(requests.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        service.decide(manager, 7L, true, new CancellationDtos.Decision("No refund"));
        assertThat(active.getStatus()).isEqualTo("cancelled");
        assertThat(pending.getStatus()).isEqualTo("APPROVED");
        verify(enrollments).cancelFutureEnrollmentsForMember(eq(10L), any());
    }

    @Test
    void approvalPreservesSeparatelyPaidUpcomingClass() {
        stubDecision();
        when(payments.hasUnsettledUpcomingEnrollmentPayment(eq(10L), any(), any())).thenReturn(true);

        assertThatThrownBy(() -> service.decide(manager, 7L, true, new CancellationDtos.Decision(null)))
                .isInstanceOf(ConflictException.class);
        assertThat(active.getStatus()).isEqualTo("active");
        assertThat(pending.getStatus()).isEqualTo("PENDING");
        verifyNoInteractions(enrollments);
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    void approvalRejectsPaidFutureOrOtherEntitlementWithoutMutation() {
        stubDecision();
        MembershipSubscription future = new MembershipSubscription(); future.setId(101L);
        future.setStatus("active"); future.setStartDate(LocalDate.of(2026, 11, 2));
        future.setEndDate(LocalDate.of(2026, 12, 2)); future.setPreviousSubscription(active);
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(active, future));
        assertThatThrownBy(() -> service.decide(manager, 7L, true, new CancellationDtos.Decision(null)))
                .isInstanceOf(ConflictException.class);
        assertThat(active.getStatus()).isEqualTo("active");
        assertThat(pending.getStatus()).isEqualTo("PENDING");
        verifyNoInteractions(enrollments);
    }

    @Test
    void rejectionPreservesMembershipAndAllowsNewRequest() {
        when(requests.findById(7L)).thenReturn(Optional.of(pending));
        when(requests.findByIdForUpdate(7L)).thenReturn(Optional.of(pending));
        User managerUser = new User(); managerUser.setId(20L);
        when(users.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(managerUser));
        when(requests.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        service.decide(manager, 7L, false, new CancellationDtos.Decision("Keep active"));
        assertThat(active.getStatus()).isEqualTo("active");
        assertThat(pending.getStatus()).isEqualTo("REJECTED");
        verifyNoInteractions(enrollments);
    }

    @Test
    void memberCannotDecideAndRetryDoesNotRepeatCancellation() {
        assertThatThrownBy(() -> service.decide(owner, 7L, true, new CancellationDtos.Decision(null)))
                .isInstanceOf(ForbiddenException.class);
        pending.setStatus("APPROVED");
        when(requests.findById(7L)).thenReturn(Optional.of(pending));
        when(requests.findByIdForUpdate(7L)).thenReturn(Optional.of(pending));
        assertThatThrownBy(() -> service.decide(manager, 7L, true, new CancellationDtos.Decision(null)))
                .isInstanceOf(ConflictException.class);
        verifyNoInteractions(enrollments);
    }

    @Test
    void requestAndApproveRejectWhenHoldRequestIsPending() {
        active.setHoldStatus("PENDING");
        when(subscriptions.findByIdForUpdate(100L)).thenReturn(Optional.of(active));
        assertThatThrownBy(() -> service.request(owner, 100L, new CancellationDtos.Request("Moving")))
                .isInstanceOf(ConflictException.class);

        stubDecision();
        assertThatThrownBy(() -> service.decide(manager, 7L, true, new CancellationDtos.Decision(null)))
                .isInstanceOf(ConflictException.class);
        assertThat(active.getStatus()).isEqualTo("active");
        assertThat(pending.getStatus()).isEqualTo("PENDING");
        verifyNoInteractions(enrollments);
    }

    private void stubDecision() {
        when(requests.findById(7L)).thenReturn(Optional.of(pending));
        when(requests.findByIdForUpdate(7L)).thenReturn(Optional.of(pending));
        when(subscriptions.findByIdForUpdate(100L)).thenReturn(Optional.of(active));
    }

    @Test
    void all_UsesFindAllForManagerQueryInsteadOfFindAll() {
        when(requests.findAllForManager()).thenReturn(List.of(pending));
        var list = service.all();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).memberName()).isEqualTo("Member");
        verify(requests).findAllForManager();
        verify(requests, never()).findAll();
    }
}
