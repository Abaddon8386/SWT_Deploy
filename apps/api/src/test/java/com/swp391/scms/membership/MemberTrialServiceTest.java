package com.swp391.scms.membership;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.membership.dto.ReceptionTrialDto;
import com.swp391.scms.membership.dto.SubscriptionResponses.SubscriptionDto;
import com.swp391.scms.membership.dto.TrialClaimRequest;
import com.swp391.scms.membership.dto.TrialStatusDto;
import com.swp391.scms.membership.entity.MemberTrialRedemption;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MemberTrialRedemptionRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.membership.service.CccdHasher;
import com.swp391.scms.membership.service.MemberTrialService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MemberTrialServiceTest {

    @Mock
    private MemberTrialRedemptionRepository trialRedemptions;

    @Mock
    private MemberRepository members;

    @Mock
    private MembershipSubscriptionRepository subscriptions;

    @Mock
    private MembershipPackageRepository packages;

    @Mock
    private NotificationService notifications;

    private final CccdHasher hasher = new CccdHasher("test-pepper");
    private MemberTrialService service;
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-03T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));

    private Member testMember;
    private MembershipPackage goldPackage;

    @BeforeEach
    void setUp() {
        service = new MemberTrialService(
                trialRedemptions,
                members,
                subscriptions,
                packages,
                notifications,
                null,
                clock,
                hasher
        );

        User user = new User();
        user.setFullName("Nguyen Van A");
        user.setEmail("nguyenvana@gmail.com");

        testMember = new Member();
        testMember.setUserId(10L);
        testMember.setUser(user);
        testMember.setMembershipCode("MEM-10");

        goldPackage = new MembershipPackage();
        goldPackage.setId(2L);
        goldPackage.setName("GOLD");
        goldPackage.setPrice(new BigDecimal("299000"));
        goldPackage.setDurationDays(30);
    }

    @Test
    @DisplayName("getTrialStatus: Eligible when never claimed and never held a subscription")
    void testGetTrialStatus_Eligible() {
        when(trialRedemptions.findByMemberUserId(10L)).thenReturn(Optional.empty());
        when(subscriptions.existsByMemberUserId(10L))
                .thenReturn(false);

        TrialStatusDto status = service.getTrialStatus(10L);

        assertTrue(status.eligible());
        assertFalse(status.alreadyClaimed());
        assertNull(status.cccd());
    }

    @Test
    @DisplayName("getTrialStatus: Ineligible when already claimed trial")
    void testGetTrialStatus_AlreadyClaimed() {
        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(101L);
        MemberTrialRedemption redemption = new MemberTrialRedemption(testMember, hasher.hash("001200001234"), "1234", "Nguyen Van A", sub);
        when(trialRedemptions.findByMemberUserId(10L)).thenReturn(Optional.of(redemption));

        TrialStatusDto status = service.getTrialStatus(10L);

        assertFalse(status.eligible());
        assertTrue(status.alreadyClaimed());
        assertEquals("********1234", status.cccd());
        assertEquals("Nguyen Van A", status.fullName());
        assertEquals(101L, status.subscriptionId());
    }

    @Test
    @DisplayName("getTrialStatus: Ineligible when member already had a subscription")
    void testGetTrialStatus_HasActiveSubscription() {
        when(trialRedemptions.findByMemberUserId(10L)).thenReturn(Optional.empty());
        when(subscriptions.existsByMemberUserId(10L))
                .thenReturn(true);

        TrialStatusDto status = service.getTrialStatus(10L);

        assertFalse(status.eligible());
        assertFalse(status.alreadyClaimed());
    }

    @Test
    @DisplayName("claimGoldTrial: Successfully claims 3-day Gold trial")
    void testClaimGoldTrial_Success() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("001200001234", "Nguyen Van A");

        when(trialRedemptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRedemptions.existsByCccdHash(hasher.hash("001200001234"))).thenReturn(false);
        when(subscriptions.existsByMemberUserId(10L))
                .thenReturn(false);
        when(members.findById(10L)).thenReturn(Optional.of(testMember));
        when(packages.findByStatusOrderByPriceAsc("active")).thenReturn(List.of(goldPackage));

        when(subscriptions.saveAndFlush(any(MembershipSubscription.class))).thenAnswer(inv -> {
            MembershipSubscription s = inv.getArgument(0);
            s.setId(200L);
            return s;
        });

        SubscriptionDto result = service.claimGoldTrial(principal, request);

        assertNotNull(result);
        assertEquals(200L, result.id());
        assertEquals("active", result.status());
        assertEquals("GOLD", result.packageName());
        assertEquals(LocalDate.now(clock), result.startDate());
        assertEquals(LocalDate.now(clock).plusDays(3), result.endDate());

        verify(trialRedemptions).saveAndFlush(any(MemberTrialRedemption.class));
        verify(notifications).send(eq(10L), anyString(), anyString(), eq("system"), eq("membership_subscription"), eq(200L));
    }

    @Test
    @DisplayName("claimGoldTrial: Throws ConflictException when member already claimed")
    void testClaimGoldTrial_MemberAlreadyClaimed() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("001200001234", "Nguyen Van A");

        when(trialRedemptions.existsByMemberUserId(10L)).thenReturn(true);

        assertThrows(ConflictException.class, () -> service.claimGoldTrial(principal, request));
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("claimGoldTrial: Throws ConflictException when CCCD is already used")
    void testClaimGoldTrial_CccdAlreadyUsed() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("001200001234", "Nguyen Van A");

        when(trialRedemptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRedemptions.existsByCccdHash(hasher.hash("001200001234"))).thenReturn(true);

        assertThrows(ConflictException.class, () -> service.claimGoldTrial(principal, request));
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("claimGoldTrial: Throws ConflictException when member already had a subscription")
    void testClaimGoldTrial_ActiveSubExists() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("001200001234", "Nguyen Van A");

        when(trialRedemptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRedemptions.existsByCccdHash(hasher.hash("001200001234"))).thenReturn(false);
        when(subscriptions.existsByMemberUserId(10L))
                .thenReturn(true);

        assertThrows(ConflictException.class, () -> service.claimGoldTrial(principal, request));
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("CccdHasher: không lưu số gốc, ổn định và phụ thuộc pepper")
    void testCccdHasher() {
        String h = hasher.hash("001200001234");
        assertEquals(64, h.length());
        assertNotEquals("001200001234", h);
        assertEquals(h, hasher.hash("001200001234"));
        assertNotEquals(h, new CccdHasher("other").hash("001200001234"));
        assertEquals("1234", hasher.last4("001200001234"));
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"uq_trial_member,TRIAL_ALREADY_CLAIMED", "uq_trial_cccd_hash,TRIAL_CCCD_ALREADY_USED"})
    void classifiesDuplicateByConstraintRatherThanSqlColumnNames(String constraintName, String expectedCode) {
        when(members.findById(10L)).thenReturn(Optional.of(testMember));
        when(packages.findByStatusOrderByPriceAsc("active")).thenReturn(List.of(goldPackage));
        when(subscriptions.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        var duplicate = new org.hibernate.exception.ConstraintViolationException(
                "insert into member_trial_redemptions (cccd_hash, cccd_last4, member_id)",
                new java.sql.SQLException("duplicate value", "23505"), constraintName);
        when(trialRedemptions.saveAndFlush(any())).thenThrow(
                new org.springframework.dao.DataIntegrityViolationException("cccd_hash SQL insert failed", duplicate));
        var failure = assertThrows(ConflictException.class, () -> service.claimGoldTrial(
                new AuthenticatedPrincipal(10L, "member1", "MEMBER"),
                new TrialClaimRequest("001200001234", "Nguyen Van A")));
        assertEquals(expectedCode, failure.getErrorCode());
        verifyNoInteractions(notifications);
    }

    @Test
    void preservesUnknownIntegrityFailuresInsteadOfReportingAlreadyClaimed() {
        when(members.findById(10L)).thenReturn(Optional.of(testMember));
        when(packages.findByStatusOrderByPriceAsc("active")).thenReturn(List.of(goldPackage));
        var failure = new org.springframework.dao.DataIntegrityViolationException("unrelated subscription foreign key");
        when(subscriptions.saveAndFlush(any())).thenThrow(failure);
        assertSame(failure, assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> service.claimGoldTrial(new AuthenticatedPrincipal(10L, "member1", "MEMBER"),
                        new TrialClaimRequest("001200001234", "Nguyen Van A"))));
        verifyNoInteractions(notifications);
    }

    @Test
    @DisplayName("requestTrial: Successfully submits CCCD trial request in PENDING_APPROVAL status")
    void testRequestTrial_CccdSuccess() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("CCCD", "001200001234", "001200001234", "Nguyen Van A", "VN", "front.jpg", "back.jpg");

        when(subscriptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRedemptions.findByMemberUserId(10L)).thenReturn(Optional.empty());
        when(trialRedemptions.existsByCccdHash(anyString())).thenReturn(false);
        when(members.findById(10L)).thenReturn(Optional.of(testMember));
        when(trialRedemptions.saveAndFlush(any(MemberTrialRedemption.class))).thenAnswer(inv -> {
            MemberTrialRedemption r = inv.getArgument(0);
            r.setId(50L);
            return r;
        });

        TrialStatusDto status = service.requestTrial(principal, request);

        assertNotNull(status);
        assertEquals("PENDING_APPROVAL", status.status());
        assertFalse(status.alreadyClaimed());
        assertEquals("CCCD", status.documentType());
        assertEquals("Nguyen Van A", status.fullName());
        verify(notifications).send(eq(10L), anyString(), anyString(), eq("system"), eq("member_trial_redemption"), eq(50L));
    }

    @Test
    @DisplayName("requestTrial: Successfully submits foreign passport request in PENDING_APPROVAL status")
    void testRequestTrial_ForeignPassportSuccess() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("PASSPORT", "P12345678", null, "John Doe", "United States", "passport.jpg", null);

        when(subscriptions.existsByMemberUserId(10L)).thenReturn(false);
        when(trialRedemptions.findByMemberUserId(10L)).thenReturn(Optional.empty());
        when(trialRedemptions.existsByCccdHash(anyString())).thenReturn(false);
        when(members.findById(10L)).thenReturn(Optional.of(testMember));
        when(trialRedemptions.saveAndFlush(any(MemberTrialRedemption.class))).thenAnswer(inv -> {
            MemberTrialRedemption r = inv.getArgument(0);
            r.setId(51L);
            return r;
        });

        TrialStatusDto status = service.requestTrial(principal, request);

        assertNotNull(status);
        assertEquals("PENDING_APPROVAL", status.status());
        assertEquals("PASSPORT", status.documentType());
        assertEquals("John Doe", status.fullName());
    }

    @Test
    @DisplayName("requestTrial: Rejects Vietnamese citizen trying to use Passport")
    void testRequestTrial_VietnamesePassportRejected() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("PASSPORT", "P12345678", null, "Nguyen Van B", "Vietnam", "passport.jpg", null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.requestTrial(principal, request));
        assertEquals("TRIAL_PASSPORT_FOREIGN_ONLY", ex.getErrorCode());
    }

    @Test
    @DisplayName("requestTrial: Rejects invalid passport number format")
    void testRequestTrial_InvalidPassportFormat() {
        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        TrialClaimRequest request = new TrialClaimRequest("PASSPORT", "AB", null, "John Doe", "France", "passport.jpg", null);

        BadRequestException ex = assertThrows(BadRequestException.class, () -> service.requestTrial(principal, request));
        assertEquals("TRIAL_PASSPORT_INVALID", ex.getErrorCode());
    }

    @Test
    @DisplayName("approveTrial: Receptionist approves trial, syncs user fullName, and creates 3-day active subscription")
    void testApproveTrial_Success() {
        AuthenticatedPrincipal receptionist = new AuthenticatedPrincipal(99L, "receptionist1", "RECEPTIONIST");
        MemberTrialRedemption pending = new MemberTrialRedemption();
        pending.setId(55L);
        pending.setMember(testMember);
        pending.setFullName("Nguyen Van Verified");
        pending.setStatus(MemberTrialRedemption.STATUS_PENDING);

        when(trialRedemptions.findById(55L)).thenReturn(Optional.of(pending));
        when(packages.findByStatusOrderByPriceAsc("active")).thenReturn(List.of(goldPackage));
        when(subscriptions.saveAndFlush(any(MembershipSubscription.class))).thenAnswer(inv -> {
            MembershipSubscription s = inv.getArgument(0);
            s.setId(300L);
            return s;
        });
        when(trialRedemptions.saveAndFlush(any(MemberTrialRedemption.class))).thenAnswer(inv -> inv.getArgument(0));

        ReceptionTrialDto result = service.approveTrial(receptionist, 55L);

        assertNotNull(result);
        assertEquals(300L, result.subscriptionId());
        assertEquals("APPROVED", result.status());
        assertEquals("Nguyen Van Verified", testMember.getUser().getFullName());
        verify(notifications).send(eq(10L), anyString(), anyString(), eq("system"), eq("membership_subscription"), eq(300L));
    }

    @Test
    @DisplayName("rejectTrial: Receptionist rejects trial with a stated reason")
    void testRejectTrial_Success() {
        AuthenticatedPrincipal receptionist = new AuthenticatedPrincipal(99L, "receptionist1", "RECEPTIONIST");
        MemberTrialRedemption pending = new MemberTrialRedemption();
        pending.setId(56L);
        pending.setMember(testMember);
        pending.setStatus(MemberTrialRedemption.STATUS_PENDING);

        when(trialRedemptions.findById(56L)).thenReturn(Optional.of(pending));
        when(trialRedemptions.saveAndFlush(any(MemberTrialRedemption.class))).thenAnswer(inv -> inv.getArgument(0));

        ReceptionTrialDto result = service.rejectTrial(receptionist, 56L, "CCCD mờ không đọc được thông tin");

        assertNotNull(result);
        assertEquals("REJECTED", result.status());
        assertEquals("CCCD mờ không đọc được thông tin", result.rejectionReason());
        verify(notifications).send(eq(10L), anyString(), anyString(), eq("system"), eq("member_trial_redemption"), eq(56L));
    }

    @Test
    @DisplayName("listTrials: Filters by status and search keyword")
    void testListTrials() {
        MemberTrialRedemption r1 = new MemberTrialRedemption();
        r1.setId(1L);
        r1.setFullName("Alice Smith");
        r1.setStatus("PENDING_APPROVAL");
        r1.setMember(testMember);

        MemberTrialRedemption r2 = new MemberTrialRedemption();
        r2.setId(2L);
        r2.setFullName("Bob Jones");
        r2.setStatus("PENDING_APPROVAL");
        r2.setMember(testMember);

        when(trialRedemptions.findByStatusOrderByRedeemedAtDesc("PENDING_APPROVAL")).thenReturn(List.of(r1, r2));

        List<ReceptionTrialDto> results = service.listTrials("PENDING_APPROVAL", "Alice");

        assertEquals(1, results.size());
        assertEquals("Alice Smith", results.get(0).documentFullName());
    }
}
