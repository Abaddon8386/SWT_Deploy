package com.swp391.scms.membership;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.membership.dto.SubscriptionRequests;
import com.swp391.scms.membership.dto.SubscriptionResponses.HoldRequestDto;
import com.swp391.scms.membership.dto.SubscriptionResponses.SubscriptionDto;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipCancellationRequestRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.membership.service.DynamicQrService;
import com.swp391.scms.membership.service.MembershipSubscriptionService;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MembershipSubscriptionServiceTest {

    @Mock
    private MembershipSubscriptionRepository subscriptions;

    @Mock
    private MembershipPackageRepository packages;

    @Mock
    private MemberRepository members;

    @Mock
    private EnrollmentService enrollmentService;

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private MembershipCancellationRequestRepository cancellationRequests;

    private Clock clock;
    private MembershipSubscriptionService service;

    private final AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member01", "MEMBER");
    private final AuthenticatedPrincipal staffPrincipal = new AuthenticatedPrincipal(2L, "staff01", "RECEPTIONIST");

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(Instant.parse("2026-10-11T10:00:00Z"), ZoneOffset.UTC);
        service = new MembershipSubscriptionService(
                subscriptions, packages, members, clock, new DynamicQrService(), enrollmentService, null, null, null);
        Member lockedMember = new Member();
        lockedMember.setUserId(10L);
        org.mockito.Mockito.lenient().when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(lockedMember));
    }

    @Test
    void create_rejectsPurchaseWhileSubscriptionIsFrozen() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setStatus("active");
        pack.setDurationDays(30);
        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserIdAndStatus(10L, "frozen")).thenReturn(true);

        assertThatThrownBy(() -> service.create(principal, new SubscriptionRequests.Create(1L)))
                .isInstanceOf(ConflictException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void resume_preservesPaidSubscriptionAndExtendsExpiryByFrozenDays() {
        MembershipSubscription frozen = frozenSubscription();
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(frozen));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.resume(principal, 7L);

        assertThat(result.id()).isEqualTo(7L);
        assertThat(result.status()).isEqualTo("active");
        assertThat(result.startDate()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(result.endDate()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(result.qrCode()).isEqualTo("paid-qr");
        assertThat(frozen.getHoldStatus()).isNull();
        org.mockito.Mockito.verifyNoInteractions(paymentRepository, packages, enrollmentService);
    }

    @Test
    void resume_rejectsAnotherMembersSubscription() {
        MembershipSubscription frozen = frozenSubscription();
        frozen.getMember().setUserId(99L);
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(frozen));
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(ForbiddenException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void resume_rejectsRepeatedRequestWithoutExtendingAgain() {
        MembershipSubscription frozen = frozenSubscription();
        frozen.setStatus("active");
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(frozen));
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(BadRequestException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void resume_requiresReliableHoldDateAndRemainingDays() {
        MembershipSubscription frozen = frozenSubscription();
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(frozen));
        frozen.setHoldResolvedAt(null);
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(BadRequestException.class);
        frozen.setHoldResolvedAt(LocalDate.of(2026, 10, 1).atStartOfDay());
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(BadRequestException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void resume_blocksPendingPurchaseOrAnotherActivePeriod() {
        MembershipSubscription frozen = frozenSubscription();
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(frozen));
        when(subscriptions.existsByMemberUserIdAndStatus(10L, "pending_payment")).thenReturn(true);
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(ConflictException.class);
        when(subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(10L, "active", LocalDate.now(clock)))
                .thenReturn(true);
        assertThatThrownBy(() -> service.resume(principal, 7L)).isInstanceOf(ConflictException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    private MembershipSubscription frozenSubscription() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        MembershipSubscription frozen = new MembershipSubscription();
        frozen.setId(7L);
        frozen.setMember(member);
        frozen.setMembershipPackage(pack);
        frozen.setStatus("frozen");
        frozen.setHoldStatus("APPROVED");
        frozen.setHoldResolvedAt(LocalDate.of(2026, 9, 21).atStartOfDay());
        frozen.setStartDate(LocalDate.of(2026, 9, 1));
        frozen.setEndDate(LocalDate.of(2026, 9, 30));
        frozen.setQrCode("paid-qr");
        return frozen;
    }

    @Test
    void create_success() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setStatus("active");
        pack.setDurationDays(30);
        pack.setPrice(new BigDecimal("199000"));

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(eq(10L), eq("active"), any()))
                .thenReturn(false);
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.create(principal, new SubscriptionRequests.Create(1L));

        assertThat(result.status()).isEqualTo("pending_payment");
        assertThat(result.startDate()).isEqualTo(LocalDate.now(clock));
        assertThat(result.endDate()).isEqualTo(LocalDate.now(clock).plusDays(29));
        assertThat(result.memberId()).isEqualTo(10L);
        // The price is fixed on the request, so a later catalog change does not alter what is collected.
        assertThat(result.quotedPrice()).isEqualByComparingTo("199000");
    }

    @Test
    void create_failsWhenMemberAlreadyHasActiveSubscription() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setStatus("active");
        pack.setDurationDays(30);

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(eq(10L), eq("active"), any()))
                .thenReturn(true);

        assertThatThrownBy(() -> service.create(principal, new SubscriptionRequests.Create(1L)))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void create_succeedsWhenMemberHasExpiredSubscriptionEvenWithActiveStatus() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setStatus("active");
        pack.setDurationDays(30);

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(eq(10L), eq("active"), any()))
                .thenReturn(false);
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.create(principal, new SubscriptionRequests.Create(1L));

        assertThat(result.status()).isEqualTo("pending_payment");
        assertThat(result.startDate()).isEqualTo(LocalDate.now(clock));
        assertThat(result.endDate()).isEqualTo(LocalDate.now(clock).plusDays(29));
    }

    @Test
    void create_failsWhenPackageInactive() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setStatus("inactive");

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));

        assertThatThrownBy(() -> service.create(principal, new SubscriptionRequests.Create(1L)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void create_failsWhenFirstTimeSubscriptionAndKycNotVerified() {
        Member member = new Member();
        member.setUserId(10L);
        member.setIdentityVerified(false);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setStatus("active");
        pack.setDurationDays(30);

        com.swp391.scms.membership.repository.MemberTrialRedemptionRepository trialRepo = 
                org.mockito.Mockito.mock(com.swp391.scms.membership.repository.MemberTrialRedemptionRepository.class);
        service.setTrialRedemptionRepository(trialRepo);

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRepo.findByMemberUserId(10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(principal, new SubscriptionRequests.Create(1L)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("error.membership.kyc_required");
    }

    @Test
    void create_succeedsWhenFirstTimeSubscriptionWithVerifiedKyc() {
        Member member = new Member();
        member.setUserId(10L);
        member.setIdentityVerified(true);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setStatus("active");
        pack.setDurationDays(30);

        com.swp391.scms.membership.repository.MemberTrialRedemptionRepository trialRepo = 
                org.mockito.Mockito.mock(com.swp391.scms.membership.repository.MemberTrialRedemptionRepository.class);
        service.setTrialRedemptionRepository(trialRepo);

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.existsByMemberUserId(10L)).thenReturn(false);
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.create(principal, new SubscriptionRequests.Create(1L));
        assertThat(result.status()).isEqualTo("pending_payment");
    }

    @Test
    void renew_extendsFromPreviousEndDateWhenNotExpired() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setStatus("active");
        pack.setDurationDays(30);

        MembershipSubscription prev = new MembershipSubscription();
        prev.setId(100L);
        prev.setMember(member);
        prev.setMembershipPackage(pack);
        prev.setStatus("active");
        prev.setStartDate(LocalDate.now(clock).minusDays(10));
        prev.setEndDate(LocalDate.now(clock).plusDays(10));

        when(subscriptions.findById(100L)).thenReturn(Optional.of(prev));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(prev));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.renew(principal, 100L);

        assertThat(result.status()).isEqualTo("pending_payment");
        assertThat(result.previousSubscriptionId()).isEqualTo(100L);
        assertThat(result.startDate()).isEqualTo(LocalDate.now(clock).plusDays(11));
        assertThat(result.endDate()).isEqualTo(LocalDate.now(clock).plusDays(40));
    }

    @Test
    void staffRenewalPreservesMemberAndPreviousSubscription() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L); pack.setStatus("active"); pack.setDurationDays(30);
        MembershipSubscription previous = new MembershipSubscription();
        previous.setId(100L); previous.setMember(member); previous.setMembershipPackage(pack);
        previous.setStatus("active"); previous.setStartDate(LocalDate.now(clock).minusDays(10));
        previous.setEndDate(LocalDate.now(clock).plusDays(10));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(previous));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(previous));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        var result = service.renewForMember(new AuthenticatedPrincipal(20L, "staff@test.com", "RECEPTIONIST"), 10L, 100L);

        assertThat(result.memberId()).isEqualTo(10L);
        assertThat(result.previousSubscriptionId()).isEqualTo(100L);
        assertThat(result.status()).isEqualTo("pending_payment");
    }

    @Test
    void staffRenewalRejectsOtherMemberAndUnauthorizedRole() {
        Member owner = new Member(); owner.setUserId(10L);
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(100L); previous.setMember(owner);
        when(subscriptions.findById(100L)).thenReturn(Optional.of(previous));
        assertThatThrownBy(() -> service.renewForMember(
                new AuthenticatedPrincipal(20L, "staff@test.com", "RECEPTIONIST"), 11L, 100L))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.renewForMember(
                new AuthenticatedPrincipal(20L, "coach@test.com", "COACH"), 10L, 100L))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void renew_startsFromTodayWhenPreviousAlreadyExpired() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setStatus("active");
        pack.setDurationDays(30);

        MembershipSubscription prev = new MembershipSubscription();
        prev.setId(100L);
        prev.setMember(member);
        prev.setMembershipPackage(pack);
        prev.setStatus("expired");
        prev.setStartDate(LocalDate.now(clock).minusDays(10));
        prev.setEndDate(LocalDate.now(clock).minusDays(5));

        when(subscriptions.findById(100L)).thenReturn(Optional.of(prev));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(prev));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.renew(principal, 100L);

        assertThat(result.startDate()).isEqualTo(LocalDate.now(clock));
        assertThat(result.endDate()).isEqualTo(LocalDate.now(clock).plusDays(29));
    }

    @Test
    void renew_failsWhenNotOwner() {
        Member otherMember = new Member();
        otherMember.setUserId(999L);

        MembershipSubscription prev = new MembershipSubscription();
        prev.setId(100L);
        prev.setMember(otherMember);

        when(subscriptions.findById(100L)).thenReturn(Optional.of(prev));

        assertThatThrownBy(() -> service.renew(principal, 100L))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void renew_failsWhenPreviousIsPendingOrCancelled() {
        Member member = new Member();
        member.setUserId(10L);

        for (String invalidStatus : List.of("pending_payment", "cancelled")) {
            MembershipSubscription prev = new MembershipSubscription();
            prev.setId(100L);
            prev.setMember(member);
            prev.setStatus(invalidStatus);

            when(subscriptions.findById(100L)).thenReturn(Optional.of(prev));

            assertThatThrownBy(() -> service.renew(principal, 100L))
                    .isInstanceOf(BadRequestException.class);
        }
    }

    @Test
    void upgrade_createsPendingSubscriptionForHigherPackage() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage basicPack = new MembershipPackage();
        basicPack.setId(1L);
        basicPack.setName("Gói 1 tháng");
        basicPack.setPrice(new BigDecimal("500000"));
        basicPack.setDurationDays(30);
        basicPack.setStatus("active");

        MembershipPackage vipPack = new MembershipPackage();
        vipPack.setId(2L);
        vipPack.setName("Gói VIP 3 tháng");
        vipPack.setPrice(new BigDecimal("1500000"));
        vipPack.setDurationDays(90);
        vipPack.setStatus("active");

        MembershipSubscription current = new MembershipSubscription();
        current.setId(100L);
        current.setMember(member);
        current.setMembershipPackage(basicPack);
        current.setStatus("active");
        current.setStartDate(LocalDate.now(clock).minusDays(5));
        current.setEndDate(LocalDate.now(clock).plusDays(25));

        com.swp391.scms.finance.entity.Payment paid = new com.swp391.scms.finance.entity.Payment();
        paid.setSubscriptionId(100L);
        paid.setAmount(new BigDecimal("500000"));
        paid.setStatus("success");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        when(paymentRepository.findAllBySubscriptionId(100L)).thenReturn(List.of(paid));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(packages.findById(2L)).thenReturn(Optional.of(vipPack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L));

        assertThat(result.status()).isEqualTo("pending_payment");
        assertThat(result.packageId()).isEqualTo(2L);
        assertThat(result.previousSubscriptionId()).isEqualTo(100L);
        assertThat(result.startDate()).isEqualTo(LocalDate.now(clock));
        assertThat(result.endDate()).isEqualTo(LocalDate.now(clock).plusDays(89));
        // 26 of 31 days left (today included): 500,000 × 26/31 = 419,354 -> 419,000 credited, rest of 1,500,000 due.
        assertThat(result.creditApplied()).isEqualByComparingTo("419000");
        assertThat(result.upgradeCharge()).isEqualByComparingTo("1081000");
    }

    @Test
    void upgrade_creditsWhatWasPaidNotTheRepricedCatalogPrice() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipPackage silver = new MembershipPackage();
        silver.setId(1L); silver.setPrice(new BigDecimal("199000")); silver.setDurationDays(30); silver.setStatus("active");
        MembershipPackage gold = new MembershipPackage();
        gold.setId(2L); gold.setPrice(new BigDecimal("299000")); gold.setDurationDays(30); gold.setStatus("active");
        MembershipSubscription current = new MembershipSubscription();
        current.setId(100L);
        current.setMember(member);
        current.setMembershipPackage(silver);
        current.setStatus("active");
        current.setStartDate(LocalDate.now(clock).minusDays(15));
        current.setEndDate(LocalDate.now(clock).plusDays(14));
        com.swp391.scms.finance.entity.Payment paid = new com.swp391.scms.finance.entity.Payment();
        paid.setSubscriptionId(100L);
        paid.setAmount(new BigDecimal("199000"));
        paid.setStatus("success");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        when(paymentRepository.findAllBySubscriptionId(100L)).thenReturn(List.of(paid));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(packages.findById(2L)).thenReturn(Optional.of(gold));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        // The manager raises the member's current package after it was bought: the credit must not grow with it.
        silver.setPrice(new BigDecimal("279000"));
        SubscriptionDto beforeTargetRaise = service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L));
        // 15 of 30 days left: 199,000 × 15/30 = 99,500 -> 99,000.
        assertThat(beforeTargetRaise.creditApplied()).isEqualByComparingTo("99000");
        assertThat(beforeTargetRaise.upgradeCharge()).isEqualByComparingTo("200000");

        // Raising the target package moves only the new price; the credit stays tied to what was paid.
        gold.setPrice(new BigDecimal("349000"));
        SubscriptionDto afterTargetRaise = service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L));
        assertThat(afterTargetRaise.creditApplied()).isEqualByComparingTo("99000");
        assertThat(afterTargetRaise.upgradeCharge()).isEqualByComparingTo("250000");
    }

    @Test
    void pendingRequestsKeepTheirQuotedPriceWhenTheCatalogChanges() {
        MembershipPackage pack = new MembershipPackage();
        pack.setPrice(new BigDecimal("199000"));
        MembershipSubscription pending = new MembershipSubscription();
        pending.setMembershipPackage(pack);
        pending.setQuotedPrice(new BigDecimal("199000"));

        pack.setPrice(new BigDecimal("249000"));
        assertThat(pending.payableAmount()).isEqualByComparingTo("199000");

        // Requests made before prices were fixed still follow the catalog.
        pending.setQuotedPrice(null);
        assertThat(pending.payableAmount()).isEqualByComparingTo("249000");
    }

    @Test
    void upgrade_rejectsWhenUnusedValueAlreadyCoversTheTargetPrice() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipPackage quarterly = new MembershipPackage();
        quarterly.setId(1L); quarterly.setPrice(new BigDecimal("549000")); quarterly.setDurationDays(90); quarterly.setStatus("active");
        MembershipPackage premiumMonth = new MembershipPackage();
        premiumMonth.setId(2L); premiumMonth.setPrice(new BigDecimal("599000")); premiumMonth.setDurationDays(30); premiumMonth.setStatus("active");
        MembershipSubscription current = new MembershipSubscription();
        current.setId(100L);
        current.setMember(member);
        current.setMembershipPackage(quarterly);
        current.setStatus("active");
        current.setStartDate(LocalDate.now(clock));
        current.setEndDate(LocalDate.now(clock).plusDays(89));
        com.swp391.scms.finance.entity.Payment paid = new com.swp391.scms.finance.entity.Payment();
        paid.setSubscriptionId(100L);
        // Bought before the manager cut the price to 549,000.
        paid.setAmount(new BigDecimal("649000"));
        paid.setStatus("success");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        when(paymentRepository.findAllBySubscriptionId(100L)).thenReturn(List.of(paid));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(packages.findById(2L)).thenReturn(Optional.of(premiumMonth));

        assertThatThrownBy(() -> service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L)))
                .isInstanceOfSatisfying(BadRequestException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo("MEMBERSHIP_UPGRADE_CREDIT_EXCEEDS"));
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    void upgrade_failsWhenTargetPackageIsLowerOrEqual() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage vipPack = new MembershipPackage();
        vipPack.setId(2L);
        vipPack.setName("Gói VIP 3 tháng");
        vipPack.setPrice(new BigDecimal("1500000"));
        vipPack.setDurationDays(90);
        vipPack.setStatus("active");

        MembershipPackage basicPack = new MembershipPackage();
        basicPack.setId(1L);
        basicPack.setName("Gói 1 tháng");
        basicPack.setPrice(new BigDecimal("500000"));
        basicPack.setDurationDays(30);
        basicPack.setStatus("active");

        MembershipSubscription current = new MembershipSubscription();
        current.setId(100L);
        current.setMember(member);
        current.setMembershipPackage(vipPack);
        current.setStatus("active");
        current.setStartDate(LocalDate.now(clock).minusDays(5));
        current.setEndDate(LocalDate.now(clock).plusDays(85));

        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(packages.findById(1L)).thenReturn(Optional.of(basicPack));

        assertThatThrownBy(() -> service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(1L)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void approveHold_rejectsPeriodThatExpiredWhileAwaitingApproval() {
        MembershipSubscription subscription = frozenSubscription();
        subscription.setStatus("active");
        subscription.setHoldStatus("PENDING");
        when(subscriptions.findById(7L)).thenReturn(Optional.of(subscription));
        assertThatThrownBy(() -> service.approveHold(staffPrincipal, 7L))
                .isInstanceOf(BadRequestException.class);
        verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void requestHold_and_approveHold_freezesSubscriptionAndCancelsFutureEnrollments() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setDurationDays(30);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(100L);
        sub.setMember(member);
        sub.setMembershipPackage(pack);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.now(clock).minusDays(5));
        sub.setEndDate(LocalDate.now(clock).plusDays(25));

        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(enrollmentService.cancelFutureEnrollmentsForMember(eq(10L), any())).thenReturn(3);

        SubscriptionDto holdRequested = service.requestHold(
                principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác nước ngoài"));

        assertThat(holdRequested.holdStatus()).isEqualTo("PENDING");
        assertThat(holdRequested.holdReason()).isEqualTo("Đi công tác nước ngoài");
        assertThat(holdRequested.status()).isEqualTo("active");

        HoldRequestDto approved = service.approveHold(staffPrincipal, 100L);

        assertThat(approved.status()).isEqualTo("frozen");
        assertThat(approved.holdStatus()).isEqualTo("APPROVED");
        assertThat(approved.cancelledEnrollmentsCount()).isEqualTo(3);
        verify(enrollmentService).cancelFutureEnrollmentsForMember(eq(10L), any());
    }

    @Test
    void rejectHold_keepsSubscriptionActiveAndMarksHoldRejected() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(100L);
        sub.setMember(member);
        sub.setMembershipPackage(pack);
        sub.setStatus("active");
        sub.setHoldStatus("PENDING");
        sub.setHoldReason("Nghỉ phép ngắn hạn");

        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        HoldRequestDto rejected = service.rejectHold(staffPrincipal, 100L);

        assertThat(rejected.status()).isEqualTo("active");
        assertThat(rejected.holdStatus()).isEqualTo("REJECTED");
        assertThat(rejected.cancelledEnrollmentsCount()).isZero();
    }

    @Test
    void cancelPending_cancelsPendingSubscriptionForOwnerOrStaff() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(150L);
        sub.setMember(member);
        sub.setMembershipPackage(pack);
        sub.setStatus("pending_payment");

        when(subscriptions.findById(150L)).thenReturn(Optional.of(sub));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByIdForUpdate(150L)).thenReturn(Optional.of(sub));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto cancelled = service.cancelPending(principal, 150L);

        assertThat(cancelled.status()).isEqualTo("cancelled");
        assertThat(cancelled.id()).isEqualTo(150L);
    }

    @Test
    void cancelPending_failsWhenAlreadyActive() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(150L);
        sub.setMember(member);
        sub.setStatus("active");

        when(subscriptions.findById(150L)).thenReturn(Optional.of(sub));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByIdForUpdate(150L)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.cancelPending(principal, 150L))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class);
    }

    @Test
    void cancelPending_rejectsUnsettledPaymentAndPreservesRequest() {
        Member member = new Member(); member.setUserId(10L);
        MembershipSubscription sub = new MembershipSubscription(); sub.setId(150L);
        sub.setMember(member); sub.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setStatus("pending");
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        when(subscriptions.findById(150L)).thenReturn(Optional.of(sub));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByIdForUpdate(150L)).thenReturn(Optional.of(sub));
        when(paymentRepository.findAllBySubscriptionId(150L)).thenReturn(List.of(payment));
        assertThatThrownBy(() -> service.cancelPending(principal, 150L)).isInstanceOf(ConflictException.class);
        assertThat(sub.getStatus()).isEqualTo("pending_payment");
    }

    @Test
    void cancelPending_memberWithdrawsUnpaidOnlineCheckoutOnceNoGatewayAttemptIsLive() {
        Member member = new Member(); member.setUserId(10L);
        MembershipSubscription sub = new MembershipSubscription(); sub.setId(150L);
        sub.setMember(member); sub.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setId(9L); payment.setStatus("pending"); payment.setMethod("online_wallet");
        var guard = org.mockito.Mockito.mock(com.swp391.scms.finance.service.VnpayPaymentGuard.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "vnpayGuard", guard);
        when(subscriptions.findById(150L)).thenReturn(Optional.of(sub));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByIdForUpdate(150L)).thenReturn(Optional.of(sub));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(paymentRepository.findAllBySubscriptionId(150L)).thenReturn(List.of(payment));

        assertThat(service.cancelPending(principal, 150L).status()).isEqualTo("cancelled");
        assertThat(payment.getStatus()).isEqualTo("failed");
        org.mockito.Mockito.verify(guard).subscription(150L);
    }

    @Test
    void cancelPending_staffCannotCancelWhileGatewayMayStillSettle() {
        Member member = new Member(); member.setUserId(10L);
        MembershipSubscription sub = new MembershipSubscription(); sub.setId(150L);
        sub.setMember(member); sub.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setId(9L); payment.setStatus("pending"); payment.setMethod("online_wallet");
        var guard = org.mockito.Mockito.mock(com.swp391.scms.finance.service.VnpayPaymentGuard.class);
        org.mockito.Mockito.doThrow(new ConflictException("VNPAY_AWAITING_CONFIRMATION", "finance.vnpay.awaiting_confirmation", null, null))
                .when(guard).subscription(150L);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "vnpayGuard", guard);
        when(subscriptions.findById(150L)).thenReturn(Optional.of(sub));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByIdForUpdate(150L)).thenReturn(Optional.of(sub));
        when(paymentRepository.findAllBySubscriptionId(150L)).thenReturn(List.of(payment));

        assertThatThrownBy(() -> service.cancelPending(new AuthenticatedPrincipal(2L, "desk", "RECEPTIONIST"), 150L))
                .isInstanceOf(ConflictException.class);
        assertThat(sub.getStatus()).isEqualTo("pending_payment");
        assertThat(payment.getStatus()).isEqualTo("pending");
    }

    @Test
    void mine_returnsListOrdered() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(100L);
        sub.setMember(member);
        sub.setMembershipPackage(pack);
        sub.setStatus("active");
        sub.setQrCode("QR-TEST-123");

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserIdOrderByCreatedAtDesc(10L)).thenReturn(List.of(sub));

        List<SubscriptionDto> list = service.mine(principal);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).qrCode()).isEqualTo("QR-TEST-123");
        assertThat(list.get(0).status()).isEqualTo("active");
    }

    @Test
    void current_reportsPaidThroughDateAcrossFourPeriodsWithoutChangingCurrentQrOrDates() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription first = period(100L, member, pack, null, today, today.plusDays(29));
        first.setQrCode("current-qr");
        MembershipSubscription second = period(101L, member, pack, first, today.plusDays(30), today.plusDays(59));
        MembershipSubscription third = period(102L, member, pack, second, today.plusDays(60), today.plusDays(89));
        MembershipSubscription fourth = period(103L, member, pack, third, today.plusDays(90), today.plusDays(119));
        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", today, today)).thenReturn(Optional.of(first));
        when(subscriptions.findByMemberUserId(10L))
                .thenReturn(List.of(third, first, fourth, second));
        SubscriptionDto result = service.current(principal);
        assertThat(result.paidThroughDate()).isEqualTo(today.plusDays(119));
        assertThat(result.endDate()).isEqualTo(today.plusDays(29));
        assertThat(result.qrCode()).isEqualTo("current-qr");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"pending_payment", "cancelled", "frozen", "expired", "gap", "branch", "different_package"})
    void current_doesNotExtendPaidThroughDateForUnavailableOrBrokenRenewals(String scenario) {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription first = period(100L, member, pack, null, today, today.plusDays(29));
        MembershipSubscription next = period(101L, member, pack, first, today.plusDays(30), today.plusDays(59));
        List<MembershipSubscription> history = List.of(first, next);
        if ("gap".equals(scenario)) next.setStartDate(today.plusDays(31));
        else if ("branch".equals(scenario)) history = List.of(first, next,
                period(102L, member, pack, first, today.plusDays(30), today.plusDays(59)));
        else if ("different_package".equals(scenario)) {
            MembershipPackage other = new MembershipPackage(); other.setId(2L); next.setMembershipPackage(other);
        } else next.setStatus(scenario);
        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", today, today)).thenReturn(Optional.of(first));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(history);
        assertThat(service.current(principal).paidThroughDate()).isEqualTo(first.getEndDate());
    }

    @Test
    void current_returnsActiveSubscription_whenValidAndUnexpired() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(100L);
        sub.setMember(member);
        sub.setMembershipPackage(pack);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.now(clock).minusDays(5));
        sub.setEndDate(LocalDate.now(clock).plusDays(25));
        sub.setQrCode("QR-TEST-123");

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", LocalDate.now(clock), LocalDate.now(clock)))
                .thenReturn(Optional.of(sub));

        SubscriptionDto result = service.current(principal);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(100L);
        assertThat(result.qrCode()).isEqualTo("QR-TEST-123");
    }

    @Test
    void current_returnsNull_whenNoActiveSubscriptionExists() {
        Member member = new Member();
        member.setUserId(10L);

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", LocalDate.now(clock), LocalDate.now(clock)))
                .thenReturn(Optional.empty());

        SubscriptionDto result = service.current(principal);

        assertThat(result).isNull();
    }

    @Test
    void current_ignoresFutureRenewalSubscription_returnsCurrentlyActiveOnly() {
        Member member = new Member();
        member.setUserId(10L);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");

        MembershipSubscription currentSub = new MembershipSubscription();
        currentSub.setId(100L);
        currentSub.setMember(member);
        currentSub.setMembershipPackage(pack);
        currentSub.setStatus("active");
        currentSub.setStartDate(LocalDate.now(clock).minusDays(10));
        currentSub.setEndDate(LocalDate.now(clock).plusDays(20));
        currentSub.setQrCode("QR-CURRENT-ACTIVE");

        when(members.findById(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", LocalDate.now(clock), LocalDate.now(clock)))
                .thenReturn(Optional.of(currentSub));

        SubscriptionDto result = service.current(principal);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(100L);
        assertThat(result.qrCode()).isEqualTo("QR-CURRENT-ACTIVE");
    }

    @Test
    void listPending_excludesSoftDeletedMembers() {
        com.swp391.scms.users.entity.User activeUser = new com.swp391.scms.users.entity.User();
        activeUser.setId(10L);
        activeUser.setFullName("Active Member");
        activeUser.setDeletedAt(null);

        Member activeMember = new Member();
        activeMember.setUserId(10L);
        activeMember.setUser(activeUser);

        com.swp391.scms.users.entity.User deletedUser = new com.swp391.scms.users.entity.User();
        deletedUser.setId(11L);
        deletedUser.setFullName("Deleted Member");
        deletedUser.setDeletedAt(java.time.LocalDateTime.now(clock));

        Member deletedMember = new Member();
        deletedMember.setUserId(11L);
        deletedMember.setUser(deletedUser);

        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L);
        pack.setName("Gói 1 tháng");
        pack.setDurationDays(30);

        MembershipSubscription activeSub = new MembershipSubscription();
        activeSub.setId(201L);
        activeSub.setMember(activeMember);
        activeSub.setMembershipPackage(pack);
        activeSub.setStatus("pending_payment");

        MembershipSubscription deletedSub = new MembershipSubscription();
        deletedSub.setId(202L);
        deletedSub.setMember(deletedMember);
        deletedSub.setMembershipPackage(pack);
        deletedSub.setStatus("pending_payment");

        when(subscriptions.findByStatusOrderByCreatedAtDesc("pending_payment"))
                .thenReturn(List.of(activeSub, deletedSub));

        var result = service.listPending();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).id()).isEqualTo(201L);
        assertThat(result.get(0).memberName()).isEqualTo("Active Member");
    }

    @Test
    void renew_findsPaidTailAndCreatesFourthPeriod() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L); pack.setStatus("active"); pack.setDurationDays(30);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription first = period(100L, member, pack, null, today, today.plusDays(29));
        MembershipSubscription second = period(101L, member, pack, first, today.plusDays(30), today.plusDays(59));
        MembershipSubscription third = period(102L, member, pack, second, today.plusDays(60), today.plusDays(89));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(first));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(first, second, third));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        SubscriptionDto result = service.renew(principal, 100L);
        assertThat(result.previousSubscriptionId()).isEqualTo(102L);
        assertThat(result.startDate()).isEqualTo(today.plusDays(90));
        assertThat(result.endDate()).isEqualTo(today.plusDays(119));
        assertThat(result.status()).isEqualTo("pending_payment");
    }

    @Test
    void renew_blocksPendingAndBranchedSuccessors() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription first = period(100L, member, pack, null, today, today.plusDays(29));
        MembershipSubscription second = period(101L, member, pack, first, today.plusDays(30), today.plusDays(59));
        MembershipSubscription other = period(102L, member, pack, first, today.plusDays(30), today.plusDays(59));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(first));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(first, second, other));
        assertThatThrownBy(() -> service.renew(principal, 100L)).isInstanceOf(ConflictException.class);
        second.setStatus("pending_payment");
        assertThatThrownBy(() -> service.renew(principal, 100L)).isInstanceOf(ConflictException.class);
    }

    private MembershipSubscription period(long id, Member member, MembershipPackage pack,
            MembershipSubscription previous, LocalDate start, LocalDate end) {
        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(id); sub.setMember(member); sub.setMembershipPackage(pack);
        sub.setPreviousSubscription(previous); sub.setStatus("active");
        sub.setStartDate(start); sub.setEndDate(end);
        return sub;
    }

    @Test
    void renew_ignoresCancelledAttemptButNeverRewritesEarlierPeriods() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L); pack.setStatus("active"); pack.setDurationDays(30);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription first = period(100L, member, pack, null, today, today.plusDays(29));
        MembershipSubscription failed = period(101L, member, pack, first, today.plusDays(30), today.plusDays(59));
        failed.setStatus("cancelled");
        when(subscriptions.findById(100L)).thenReturn(Optional.of(first));
        when(members.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(first, failed));
        when(packages.findById(1L)).thenReturn(Optional.of(pack));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        SubscriptionDto result = service.renew(principal, 100L);
        assertThat(result.previousSubscriptionId()).isEqualTo(100L);
        assertThat(result.startDate()).isEqualTo(today.plusDays(30));
        assertThat(first.getEndDate()).isEqualTo(today.plusDays(29));
        assertThat(failed.getStatus()).isEqualTo("cancelled");
    }

    @Test
    void upgrade_blocksPaidFutureRenewalWithoutChangingIt() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage basic = new MembershipPackage();
        basic.setId(1L); basic.setStatus("active"); basic.setDurationDays(30); basic.setPrice(new BigDecimal("500000"));
        MembershipPackage vip = new MembershipPackage();
        vip.setId(2L); vip.setStatus("active"); vip.setDurationDays(90); vip.setPrice(new BigDecimal("1500000"));
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription current = period(100L, member, basic, null, today.minusDays(5), today.plusDays(24));
        MembershipSubscription future = period(101L, member, basic, current, today.plusDays(25), today.plusDays(54));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(current, future));

        assertThatThrownBy(() -> service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L)))
                .isInstanceOf(ConflictException.class);
        assertThat(future.getStatus()).isEqualTo("active");
        assertThat(future.getStartDate()).isEqualTo(today.plusDays(25));
        org.mockito.Mockito.verify(subscriptions, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    @Test
    void approveHold_blocksPaidFutureRenewalWithoutFreezingOrCancellingBookings() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription current = period(100L, member, pack, null, today.minusDays(5), today.plusDays(24));
        current.setHoldStatus("PENDING");
        MembershipSubscription future = period(101L, member, pack, current, today.plusDays(25), today.plusDays(54));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(current, future));

        assertThatThrownBy(() -> service.approveHold(staffPrincipal, 100L))
                .isInstanceOf(ConflictException.class);
        assertThat(current.getStatus()).isEqualTo("active");
        assertThat(future.getStatus()).isEqualTo("active");
        org.mockito.Mockito.verify(enrollmentService, org.mockito.Mockito.never())
                .cancelFutureEnrollmentsForMember(any(), any());
    }

    @Test
    void renew_rejectsFrozenSourceAndSupersededSourceButAcceptsUpgradeTail() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage basic = new MembershipPackage();
        basic.setId(1L); basic.setStatus("active"); basic.setDurationDays(30);
        MembershipPackage vip = new MembershipPackage();
        vip.setId(2L); vip.setStatus("active"); vip.setDurationDays(90);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription source = period(100L, member, basic, null, today.minusDays(10), today);
        source.setStatus("frozen");
        when(subscriptions.findById(100L)).thenReturn(Optional.of(source));
        assertThatThrownBy(() -> service.renew(principal, 100L)).isInstanceOf(BadRequestException.class);

        source.setStatus("expired");
        MembershipSubscription upgrade = period(101L, member, vip, source, today, today.plusDays(89));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(source, upgrade));
        assertThatThrownBy(() -> service.renew(principal, 100L)).isInstanceOf(ConflictException.class);

        when(subscriptions.findById(101L)).thenReturn(Optional.of(upgrade));
        when(packages.findById(2L)).thenReturn(Optional.of(vip));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        SubscriptionDto next = service.renew(principal, 101L);
        assertThat(next.previousSubscriptionId()).isEqualTo(101L);
        assertThat(next.startDate()).isEqualTo(today.plusDays(90));
    }

    @Test
    void requestHold_rejectsNonOwnerNonActiveExpiredFutureAndInvalidReasons() {
        Member member = new Member(); member.setUserId(10L);
        Member other = new Member(); other.setUserId(99L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = period(100L, other, pack, null, today.minusDays(5), today.plusDays(24));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Lý do")))
                .isInstanceOf(ForbiddenException.class);

        sub.setMember(member);
        for (String nonActive : List.of("frozen", "expired", "pending_payment", "cancelled")) {
            sub.setStatus(nonActive);
            assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Lý do")))
                    .isInstanceOf(BadRequestException.class);
        }

        sub.setStatus("active");
        sub.setEndDate(today.minusDays(1));
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Lý do")))
                .isInstanceOf(BadRequestException.class);

        sub.setStartDate(today.plusDays(1));
        sub.setEndDate(today.plusDays(30));
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Lý do")))
                .isInstanceOf(BadRequestException.class);

        sub.setStartDate(today.minusDays(5));
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("   ")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("a".repeat(501))))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void requestHold_rejectsTrialSubscription() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(99L);
        pack.setName("Gói Trải Nghiệm 3 Ngày");
        pack.setDurationDays(3);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = period(100L, member, pack, null, today.minusDays(1), today.plusDays(2));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Lý do")))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("MEMBERSHIP_TRIAL_CANNOT_HOLD"));
    }

    @Test
    void requestHold_rejectsDuplicatePendingHoldPendingPaymentPaidFutureRenewalAndPendingCancellation() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "cancellationRequests", cancellationRequests);
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = period(100L, member, pack, null, today.minusDays(5), today.plusDays(24));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));

        sub.setHoldStatus("PENDING");
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác")))
                .isInstanceOf(ConflictException.class);
        sub.setHoldStatus(null);

        when(subscriptions.existsByMemberUserIdAndStatus(10L, "pending_payment")).thenReturn(true);
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác")))
                .isInstanceOf(ConflictException.class);
        when(subscriptions.existsByMemberUserIdAndStatus(10L, "pending_payment")).thenReturn(false);

        MembershipSubscription future = period(101L, member, pack, sub, today.plusDays(25), today.plusDays(54));
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(sub, future));
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác")))
                .isInstanceOf(ConflictException.class);
        when(subscriptions.findByMemberUserId(10L)).thenReturn(List.of(sub));

        when(cancellationRequests.existsBySubscriptionIdAndStatus(100L, "PENDING")).thenReturn(true);
        assertThatThrownBy(() -> service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác")))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void requestHold_succeedsAfterRejectedHoldAndClearsResolutionMetadata() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = period(100L, member, pack, null, today.minusDays(5), today.plusDays(24));
        sub.setHoldStatus("REJECTED");
        sub.setHoldResolvedAt(today.minusDays(1).atStartOfDay());
        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto result = service.requestHold(principal, 100L, new SubscriptionRequests.HoldRequest("Đi công tác mới"));

        assertThat(result.holdStatus()).isEqualTo("PENDING");
        assertThat(result.holdReason()).isEqualTo("Đi công tác mới");
        assertThat(result.holdResolvedAt()).isNull();
    }

    @Test
    void approveHold_and_rejectHold_enforcePendingStateAndBlockConflicts() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "cancellationRequests", cancellationRequests);
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L);
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = period(100L, member, pack, null, today.minusDays(5), today.plusDays(24));
        when(subscriptions.findById(100L)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.approveHold(staffPrincipal, 100L)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.rejectHold(staffPrincipal, 100L)).isInstanceOf(BadRequestException.class);

        sub.setHoldStatus("PENDING");
        when(subscriptions.existsByMemberUserIdAndStatus(10L, "pending_payment")).thenReturn(true);
        assertThatThrownBy(() -> service.approveHold(staffPrincipal, 100L)).isInstanceOf(ConflictException.class);
        when(subscriptions.existsByMemberUserIdAndStatus(10L, "pending_payment")).thenReturn(false);

        when(cancellationRequests.existsBySubscriptionIdAndStatus(100L, "PENDING")).thenReturn(true);
        assertThatThrownBy(() -> service.approveHold(staffPrincipal, 100L)).isInstanceOf(ConflictException.class);
    }

    @Test
    void listPendingHolds_returnsOnlyActionableActiveUnexpiredHoldsForNonDeletedMembers() {
        LocalDate today = LocalDate.now(clock);
        com.swp391.scms.users.entity.User activeUser = new com.swp391.scms.users.entity.User();
        activeUser.setId(10L); activeUser.setFullName("Active Member");
        Member activeMember = new Member(); activeMember.setUserId(10L); activeMember.setUser(activeUser);

        com.swp391.scms.users.entity.User deletedUser = new com.swp391.scms.users.entity.User();
        deletedUser.setId(11L); deletedUser.setDeletedAt(java.time.LocalDateTime.now(clock));
        Member deletedMember = new Member(); deletedMember.setUserId(11L); deletedMember.setUser(deletedUser);

        MembershipPackage pack = new MembershipPackage(); pack.setId(1L); pack.setName("Essential");

        MembershipSubscription validHold = period(100L, activeMember, pack, null, today.minusDays(3), today.plusDays(10));
        validHold.setHoldStatus("PENDING");
        MembershipSubscription expiredHold = period(101L, activeMember, pack, null, today.minusDays(20), today.minusDays(1));
        expiredHold.setHoldStatus("PENDING");
        MembershipSubscription futureHold = period(102L, activeMember, pack, null, today.plusDays(1), today.plusDays(30));
        futureHold.setHoldStatus("PENDING");
        MembershipSubscription deletedMemberHold = period(103L, deletedMember, pack, null, today.minusDays(3), today.plusDays(10));
        deletedMemberHold.setHoldStatus("PENDING");

        when(subscriptions.findByHoldStatusOrderByHoldRequestedAtDesc("PENDING"))
                .thenReturn(List.of(validHold, expiredHold, futureHold, deletedMemberHold));

        List<HoldRequestDto> list = service.listPendingHolds();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).id()).isEqualTo(100L);
    }

    @Test
    void resume_handlesSameDayAndLastDayFreezeCorrectly() {
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sameDay = frozenSubscription();
        sameDay.setStartDate(today.minusDays(5));
        sameDay.setEndDate(today.plusDays(24));
        sameDay.setHoldResolvedAt(today.atTime(8, 0));
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(sameDay));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionDto sameDayResult = service.resume(principal, 7L);
        assertThat(sameDayResult.status()).isEqualTo("active");
        assertThat(sameDayResult.endDate()).isEqualTo(today.plusDays(24));
        assertThat(sameDay.getHoldStatus()).isNull();

        MembershipSubscription lastDay = frozenSubscription();
        lastDay.setStartDate(today.minusDays(34));
        lastDay.setEndDate(today.minusDays(5));
        lastDay.setHoldResolvedAt(today.minusDays(5).atTime(9, 0));
        when(subscriptions.findByIdForUpdate(7L)).thenReturn(Optional.of(lastDay));

        SubscriptionDto lastDayResult = service.resume(principal, 7L);
        assertThat(lastDayResult.status()).isEqualTo("active");
        assertThat(lastDayResult.endDate()).isEqualTo(today);
        assertThat(lastDay.getHoldStatus()).isNull();
    }

    @Test
    void renew_and_upgrade_rejectWhenHoldRequestIsPending() {
        Member member = new Member(); member.setUserId(10L);
        MembershipPackage basic = new MembershipPackage();
        basic.setId(1L); basic.setStatus("active"); basic.setDurationDays(30); basic.setPrice(new BigDecimal("500000"));
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription current = period(100L, member, basic, null, today.minusDays(5), today.plusDays(24));
        current.setHoldStatus("PENDING");
        when(subscriptions.findById(100L)).thenReturn(Optional.of(current));

        assertThatThrownBy(() -> service.renew(principal, 100L))
                .isInstanceOf(ConflictException.class);
        assertThatThrownBy(() -> service.upgrade(principal, 100L, new SubscriptionRequests.Upgrade(2L)))
                .isInstanceOf(ConflictException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void pendingCashierQuoteUsesExistingPaymentAmountAfterRepricing(boolean hasPendingPayment) {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", paymentRepository);
        var user = new com.swp391.scms.users.entity.User(); user.setId(10L);
        Member member = new Member(); member.setUserId(10L); member.setUser(user);
        MembershipPackage pack = new MembershipPackage(); pack.setId(1L); pack.setPrice(new BigDecimal("299000"));
        MembershipSubscription pending = new MembershipSubscription(); pending.setId(20L);
        pending.setMember(member); pending.setMembershipPackage(pack); pending.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setMember(member); payment.setSubscriptionId(20L);
        payment.setAmount(new BigDecimal("2800000")); payment.setStatus(hasPendingPayment ? "pending" : "failed");
        when(subscriptions.findByStatusOrderByCreatedAtDesc("pending_payment")).thenReturn(List.of(pending));
        when(paymentRepository.findAllBySubscriptionId(20L)).thenReturn(List.of(payment));
        assertThat(service.listPending().getFirst().packagePrice())
                .isEqualByComparingTo(hasPendingPayment ? "2800000" : "299000");
    }


    @Test
    void holdReachingNinetyDaysResumesWithNinetyDaysAddedBack() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipSubscription held = new MembershipSubscription();
        held.setId(30L);
        held.setMember(member);
        held.setStatus("frozen");
        held.setHoldStatus("APPROVED");
        held.setHoldResolvedAt(java.time.LocalDateTime.of(2026, 7, 8, 10, 0));
        held.setStartDate(java.time.LocalDate.of(2026, 6, 1));
        held.setEndDate(java.time.LocalDate.of(2026, 8, 1));
        when(subscriptions.findByStatusAndHoldStatusAndHoldResolvedAtLessThanEqual(
                "frozen", "APPROVED", java.time.LocalDateTime.of(2026, 7, 13, 10, 0))).thenReturn(List.of(held));
        when(subscriptions.findById(30L)).thenReturn(Optional.of(held));
        when(subscriptions.findByIdForUpdate(30L)).thenReturn(Optional.of(held));

        assertThat(service.findHoldsDueForResume()).containsExactly(30L);
        assertThat(service.autoResumeHold(30L)).isTrue();

        assertThat(held.getStatus()).isEqualTo("active");
        assertThat(held.getHoldStatus()).isNull();
        assertThat(held.getEndDate()).isEqualTo(java.time.LocalDate.of(2026, 10, 30));
    }

    @Test
    void recentHoldIsNotResumedAutomatically() {
        Member member = new Member();
        member.setUserId(10L);
        MembershipSubscription held = new MembershipSubscription();
        held.setId(31L);
        held.setMember(member);
        held.setStatus("frozen");
        held.setHoldStatus("APPROVED");
        held.setHoldResolvedAt(java.time.LocalDateTime.of(2026, 10, 1, 10, 0));
        held.setEndDate(java.time.LocalDate.of(2026, 11, 1));
        when(subscriptions.findById(31L)).thenReturn(Optional.of(held));
        when(subscriptions.findByIdForUpdate(31L)).thenReturn(Optional.of(held));

        assertThat(service.autoResumeHold(31L)).isFalse();
        assertThat(held.getStatus()).isEqualTo("frozen");
        assertThat(held.getEndDate()).isEqualTo(java.time.LocalDate.of(2026, 11, 1));
    }
}
