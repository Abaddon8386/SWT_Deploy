package com.swp391.scms.attendance;

import com.swp391.scms.attendance.dto.CheckinRequests;
import com.swp391.scms.attendance.dto.CheckinResponses.CheckinDto;
import com.swp391.scms.attendance.entity.CenterCheckin;
import com.swp391.scms.attendance.repository.CenterCheckinRepository;
import com.swp391.scms.attendance.service.CenterCheckinService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.context.i18n.LocaleContextHolder;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CenterCheckinServiceTest {

    @Test
    void streakCountsDistinctDaysAndKeepsAllTimeRecord() {
        LocalDate today = LocalDate.of(2026, 10, 12);
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of(
                today.minusDays(20).atTime(8, 0), today.minusDays(19).atTime(8, 0),
                today.minusDays(18).atTime(8, 0), today.minusDays(17).atTime(8, 0),
                today.minusDays(2).atTime(8, 0), today.minusDays(1).atTime(8, 0),
                today.atTime(8, 0), today.atTime(10, 0)));

        var result = service.streak(memberPrincipal);

        assertEquals(3, result.currentStreak());
        assertEquals(4, result.longestStreak());
        assertEquals(7, result.workoutDays());
        assertEquals(7, result.activeDates().size());
        assertEquals(LocalDate.of(2026, 7, 20), result.startDate());
        assertEquals(today, result.endDate());
        verify(checkins).findGrantedVisitTimes(10L, today.atTime(17, 0));
    }

    @Test
    void streakAllowsTodayToBePendingAndResetsAfterAMissedDay() {
        LocalDate today = LocalDate.of(2026, 10, 12);
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of(
                today.minusDays(2).atTime(8, 0), today.minusDays(1).atTime(8, 0)));
        assertEquals(2, service.streak(memberPrincipal).currentStreak());
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of(
                today.minusDays(3).atTime(8, 0), today.minusDays(2).atTime(8, 0)));
        assertEquals(0, service.streak(memberPrincipal).currentStreak());
    }

    @Test
    void streakKeepsOlderRecordOutsideTheHeatmap() {
        LocalDate today = LocalDate.of(2026, 10, 12);
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of(
                today.minusDays(200).atTime(8, 0), today.minusDays(199).atTime(8, 0)));
        var result = service.streak(memberPrincipal);
        assertEquals(2, result.longestStreak());
        assertEquals(0, result.currentStreak());
        assertEquals(0, result.workoutDays());
        assertTrue(result.activeDates().isEmpty());
    }

    @Test
    void streakRestartsAtOneWhenReturningAfterAMissedDay() {
        LocalDate today = LocalDate.of(2026, 10, 12);
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of(
                today.minusDays(3).atTime(8, 0), today.minusDays(2).atTime(8, 0), today.atTime(8, 0)));
        var result = service.streak(memberPrincipal);
        assertEquals(1, result.currentStreak());
        assertEquals(2, result.longestStreak());
    }

    @Test
    void streakUsesVietnamDateEvenWhenClockIsUtcAndHandlesEmptyHistory() {
        Clock boundary = Clock.fixed(Instant.parse("2026-10-12T18:00:00Z"), ZoneId.of("UTC"));
        var boundaryService = new CenterCheckinService(checkins, subscriptions, users, members, boundary, messageService, qrService);
        when(checkins.findGrantedVisitTimes(eq(10L), any())).thenReturn(List.of());
        var result = boundaryService.streak(memberPrincipal);
        assertEquals(LocalDate.of(2026, 10, 13), result.endDate());
        assertEquals(0, result.currentStreak());
        assertEquals(0, result.longestStreak());
        verify(checkins).findGrantedVisitTimes(10L, LocalDateTime.of(2026, 10, 13, 1, 0));
    }

    @Test
    void streakRejectsNonMembersBeforeReadingHistory() {
        assertThrows(ForbiddenException.class, () -> service.streak(null));
        for (String role : List.of("COACH", "RECEPTIONIST", "CENTER_MANAGER", "ADMIN")) {
            assertThrows(ForbiddenException.class, () -> service.streak(new AuthenticatedPrincipal(9L, "other", role)));
        }
        verifyNoInteractions(checkins);
    }

    @Mock
    private CenterCheckinRepository checkins;

    @Mock
    private MembershipSubscriptionRepository subscriptions;

    @Mock
    private UserRepository users;

    @Mock
    private MemberRepository members;

    private Clock clock;
    private MessageService messageService;
    private CenterCheckinService service;
    private final com.swp391.scms.membership.service.DynamicQrService qrService =
            new com.swp391.scms.membership.service.DynamicQrService("attendance-test-signing-secret", 60);

    private final AuthenticatedPrincipal receptionist = new AuthenticatedPrincipal(1L, "receptionist", "RECEPTIONIST");
    private final AuthenticatedPrincipal centerManager = new AuthenticatedPrincipal(2L, "manager", "CENTER_MANAGER");
    private final AuthenticatedPrincipal memberPrincipal = new AuthenticatedPrincipal(10L, "member", "MEMBER");

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(Instant.parse("2026-10-12T10:00:00Z"), ZoneId.of("UTC"));
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasenames("i18n/messages");
        source.setDefaultEncoding("UTF-8");
        messageService = new MessageService(source);

        service = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService);
    }

    private Member mockMember(Long userId, String name) {
        User user = new User();
        user.setId(userId);
        user.setFullName(name);

        Member member = new Member();
        member.setUser(user);
        member.setUserId(userId);
        when(members.findByUserIdForUpdate(userId)).thenReturn(Optional.of(member));
        return member;
    }

    private MembershipSubscription mockSubscription(Member member, String status, LocalDate start, LocalDate end) {
        MembershipSubscription sub = new MembershipSubscription();
        sub.setMember(member);
        sub.setStatus(status);
        sub.setStartDate(start);
        sub.setEndDate(end);
        return sub;
    }

    @Test
    void selfScanUsesPrincipalMembershipAndSignedGateAndPreventsPassback() {
        var gateQr = new com.swp391.scms.attendance.service.GateQrService("test-gate-secret");
        var selfService = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService, gateQr);
        Member member = mockMember(10L, "Member");
        LocalDate today = LocalDate.now(clock);
        var sub = mockSubscription(member, "active", today.minusDays(1), today.plusDays(5));
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", today, today)).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        String code = gateQr.generate("A2", clock.millis()).qrCode();
        var result = selfService.selfScan(memberPrincipal, new CheckinRequests.SelfScan(code));
        assertEquals("GRANTED", result.status());
        assertEquals(10L, result.memberId());
        assertEquals("Turnstile A2 - Sảnh Chính", result.gate());
        when(checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED")).thenReturn(true);
        assertEquals("DENIED", selfService.selfScan(memberPrincipal, new CheckinRequests.SelfScan(code)).status());
        verify(subscriptions, never()).findByQrCode(any());
    }

    @Test
    void selfScanRejectsStaffAndGateIssuanceRejectsMember() {
        assertThrows(ForbiddenException.class, () -> service.selfScan(receptionist, new CheckinRequests.SelfScan("anything")));
        assertThrows(ForbiddenException.class, () -> service.gateQr(memberPrincipal, "A1"));
        verifyNoInteractions(subscriptions, checkins);
    }

    @Test
    void selfScanWithForgedOrExpiredGateQrAuditsDenial() {
        var gateQr = new com.swp391.scms.attendance.service.GateQrService("test-gate-secret");
        var selfService = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService, gateQr);
        mockMember(10L, "Member");
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        var forged = selfService.selfScan(memberPrincipal, new CheckinRequests.SelfScan("SOL:GATE:1:A1:1:bad"));
        assertEquals("DENIED", forged.status());
        assertEquals(10L, forged.memberId());
        String expired = gateQr.generate("A1", clock.millis() - 120_000).qrCode();
        assertEquals("DENIED", selfService.selfScan(memberPrincipal, new CheckinRequests.SelfScan(expired)).status());
        verify(checkins, times(2)).saveAndFlush(any());
        verifyNoInteractions(subscriptions);
    }

    @Test
    void selfCheckoutClosesOwnOpenVisitAndRejectsWhenNoneOpen() {
        var gateQr = new com.swp391.scms.attendance.service.GateQrService("test-gate-secret");
        var selfService = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService, gateQr);
        Member member = mockMember(10L, "Member");
        var open = new CenterCheckin();
        open.setMember(member);
        open.setCheckInTime(LocalDateTime.now(clock).minusHours(1));
        open.setStatus("GRANTED");
        when(checkins.findFirstByMemberUserIdAndCheckOutTimeIsNullOrderByCheckInTimeDesc(10L))
                .thenReturn(Optional.of(open), Optional.empty());
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        var request = new CheckinRequests.SelfScan(gateQr.generate("A1", clock.millis()).qrCode());
        assertNotNull(selfService.selfCheckout(memberPrincipal, request).checkOutTime());
        assertThrows(BadRequestException.class, () -> selfService.selfCheckout(memberPrincipal, request));
        assertThrows(ForbiddenException.class, () -> selfService.selfCheckout(receptionist, request));
    }

    @Test
    void historyRejectsRangesLongerThanOneMonthOrReversed() {
        LocalDate today = LocalDate.now(clock);
        assertThrows(BadRequestException.class, () -> service.history(memberPrincipal, today.minusDays(40), today));
        assertThrows(BadRequestException.class, () -> service.history(memberPrincipal, today, today.minusDays(1)));
    }

    @Test
    void selfScanWithoutCurrentSubscriptionAuditsDenial() {
        var gateQr = new com.swp391.scms.attendance.service.GateQrService("test-gate-secret");
        var selfService = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService, gateQr);
        mockMember(10L, "Member");
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        var result = selfService.selfScan(memberPrincipal, new CheckinRequests.SelfScan(gateQr.generate("A1", clock.millis()).qrCode()));
        assertEquals("DENIED", result.status());
        assertEquals(10L, result.memberId());
        verify(subscriptions).findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", LocalDate.now(clock), LocalDate.now(clock));
    }

    @Test
    void selfScanRechecksDeletedAccountEvenWithCurrentSubscription() {
        var gateQr = new com.swp391.scms.attendance.service.GateQrService("test-gate-secret");
        var selfService = new CenterCheckinService(checkins, subscriptions, users, members, clock, messageService, qrService, gateQr);
        Member member = mockMember(10L, "Deleted Member");
        member.getUser().setDeletedAt(LocalDateTime.now(clock));
        LocalDate today = LocalDate.now(clock);
        when(subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                10L, "active", today, today)).thenReturn(Optional.of(mockSubscription(member, "active", today, today.plusDays(5))));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        assertEquals("DENIED", selfService.selfScan(memberPrincipal,
                new CheckinRequests.SelfScan(gateQr.generate("A1", clock.millis()).qrCode())).status());
    }

    @Test
    @DisplayName("BR-01: Member tự gọi API scan phải bị chặn 403 Forbidden")
    void br01_memberCallingScan_throwsForbidden() {
        CheckinRequests.Scan request = new CheckinRequests.Scan("QR-CODE-123", "Gate 1");

        assertThrows(ForbiddenException.class, () -> service.scan(memberPrincipal, request));
        verify(checkins, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("BR-02 & BR-03: Mã QR không tồn tại -> Lưu bản ghi DENIED vào center_checkins")
    void br02_qrNotFound_logsDeniedRecord() {
        CheckinRequests.Scan request = new CheckinRequests.Scan("NON-EXISTENT", "Gate A");
        when(subscriptions.findByQrCode("NON-EXISTENT")).thenReturn(Optional.empty());
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> {
            CenterCheckin c = inv.getArgument(0);
            return c;
        });

        CheckinDto result = service.scan(receptionist, request);

        assertNotNull(result);
        assertEquals("DENIED", result.status());
        assertNotNull(result.denialReason());
        ArgumentCaptor<CenterCheckin> captor = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(captor.capture());
        assertEquals("DENIED", captor.getValue().getStatus());
        assertNull(captor.getValue().getMember());
        assertEquals("Gate A", captor.getValue().getGate());
    }

    @Test
    @DisplayName("BR-02 & BR-03: Gói tập chưa active (pending_payment) -> Lưu bản ghi DENIED")
    void br02_inactiveSubscription_logsDeniedRecord() {
        Member member = mockMember(10L, "Nguyễn Văn B");
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = mockSubscription(member, "pending_payment", today.minusDays(1), today.plusDays(30));

        when(subscriptions.findByQrCode("QR-PENDING")).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-PENDING", "Gate A"));

        assertEquals("DENIED", result.status());
        assertEquals(10L, result.memberId());
        assertNull(result.avatarUrl());
        assertNull(result.packageName());
        assertNull(result.remainingDays());
        ArgumentCaptor<CenterCheckin> captor = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(captor.capture());
        assertEquals("DENIED", captor.getValue().getStatus());
        assertEquals(member, captor.getValue().getMember());
    }

    @Test
    @DisplayName("BR-02 & BR-03: Gói tập đã hết hạn -> Lưu bản ghi DENIED")
    void br02_expiredSubscription_logsDeniedRecord() {
        Member member = mockMember(10L, "Nguyễn Văn C");
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(60), today.minusDays(1));

        when(subscriptions.findByQrCode("QR-EXPIRED")).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-EXPIRED", "Gate A"));

        assertEquals("DENIED", result.status());
        ArgumentCaptor<CenterCheckin> captor = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(captor.capture());
        assertEquals("DENIED", captor.getValue().getStatus());
    }

    @Test
    @DisplayName("BR-04 Anti-passback: Hội viên đang ở trong phòng tập (GRANTED chưa checkout) -> Chặn GRANTED thứ hai, log DENIED")
    void br04_antiPassback_alreadyInside_logsDeniedRecord() {
        Member member = mockMember(10L, "Nguyễn Văn D");
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(1), today.plusDays(30));

        member.getUser().setAvatarUrl("https://example.test/avatar.jpg");
        MembershipPackage membershipPackage = new MembershipPackage();
        membershipPackage.setName("Gói tập 30 ngày");
        sub.setMembershipPackage(membershipPackage);

        when(subscriptions.findByQrCode("QR-VALID")).thenReturn(Optional.of(sub));
        when(checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED")).thenReturn(true);
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-VALID", "Gate A"));

        assertEquals("DENIED", result.status());
        assertNull(result.avatarUrl());
        assertNull(result.packageName());
        assertNull(result.remainingDays());
        ArgumentCaptor<CenterCheckin> captor = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(captor.capture());
        assertEquals("DENIED", captor.getValue().getStatus());
    }

    @Test
    void scanOnExpiryDateReportsZeroRemainingDaysWithoutInventingPhoto() {
        Member member = mockMember(10L, "Hội viên");
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(1), today);
        when(subscriptions.findByQrCode("QR-LAST-DAY")).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-LAST-DAY", "Gate A"));
        assertEquals("GRANTED", result.status());
        assertEquals(0L, result.remainingDays());
        assertNull(result.avatarUrl());
        assertNull(result.packageName());
    }

    @Test
    @DisplayName("BR-02: Gói tập active, đúng hạn, chưa check-in -> result = GRANTED")
    void br02_validSubscription_granted() {
        Member member = mockMember(10L, "Nguyễn Văn E");
        LocalDate today = LocalDate.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(1), today.plusDays(30));
        member.getUser().setAvatarUrl("https://example.test/avatar.jpg");
        MembershipPackage membershipPackage = new MembershipPackage();
        membershipPackage.setName("Gói tập 30 ngày");
        sub.setMembershipPackage(membershipPackage);

        when(subscriptions.findByQrCode("QR-VALID")).thenReturn(Optional.of(sub));
        when(checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED")).thenReturn(false);
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-VALID", "Gate A"));

        assertEquals("GRANTED", result.status());
        assertNull(result.denialReason());
        assertEquals(10L, result.memberId());
        assertEquals("Nguyễn Văn E", result.memberName());
        assertEquals("https://example.test/avatar.jpg", result.avatarUrl());
        assertEquals("Gói tập 30 ngày", result.packageName());
        assertEquals(30L, result.remainingDays());
        ArgumentCaptor<CenterCheckin> captor = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(captor.capture());
        assertEquals("GRANTED", captor.getValue().getStatus());
        assertNull(captor.getValue().getDenialReason());
        InOrder locksBeforeInsert = inOrder(subscriptions, members, checkins);
        locksBeforeInsert.verify(subscriptions).findByQrCode("QR-VALID");
        locksBeforeInsert.verify(members).findByUserIdForUpdate(10L);
        locksBeforeInsert.verify(checkins).existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED");
        locksBeforeInsert.verify(checkins).saveAndFlush(any());
    }

    @Test
    @DisplayName("BR-05: Checkout bản ghi DENIED -> Bị từ chối BadRequestException")
    void br05_checkoutDeniedRecord_throwsBadRequest() {
        CenterCheckin checkin = new CenterCheckin();
        checkin.setStatus("DENIED");
        when(checkins.findByIdForUpdate(1L)).thenReturn(Optional.of(checkin));

        assertThrows(BadRequestException.class, () -> service.checkout(receptionist, 1L));
    }

    @Test
    @DisplayName("BR-05: Checkout bản ghi đã checkout -> Bị từ chối BadRequestException")
    void br05_checkoutAlreadyCheckedOut_throwsBadRequest() {
        CenterCheckin checkin = new CenterCheckin();
        checkin.setStatus("GRANTED");
        checkin.setCheckOutTime(LocalDateTime.now(clock).minusMinutes(10));
        when(checkins.findByIdForUpdate(2L)).thenReturn(Optional.of(checkin));

        assertThrows(BadRequestException.class, () -> service.checkout(receptionist, 2L));
    }

    @Test
    @DisplayName("BR-05: Checkout thành công cho lượt GRANTED đang mở")
    void br05_checkoutSuccess() {
        CenterCheckin checkin = new CenterCheckin();
        checkin.setStatus("GRANTED");
        checkin.setCheckInTime(LocalDateTime.now(clock).minusHours(1));
        checkin.setCheckOutTime(null);
        when(checkins.findByIdForUpdate(3L)).thenReturn(Optional.of(checkin));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.checkout(receptionist, 3L);

        assertEquals("GRANTED", result.status());
        assertNotNull(result.checkOutTime());
    }

    @Test
    @DisplayName("BR-06: Member xem lịch sử -> chỉ lấy đúng danh sách của chính mình (principal.id)")
    void br06_memberViewsHistory_onlyGetsOwnRecords() {
        when(checkins.findByMemberUserIdAndCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(
                eq(10L), any(), any()))
                .thenReturn(List.of(new CenterCheckin()));

        List<CheckinDto> list = service.history(memberPrincipal);

        assertEquals(1, list.size());
        verify(checkins).findByMemberUserIdAndCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(
                eq(10L), any(), any());
        verify(checkins, never()).findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(any(), any());
    }

    @Test
    @DisplayName("BR-06: Receptionist xem lịch sử -> lấy toàn bộ trong ngày")
    void br06_receptionistViewsHistory_getsAllRecords() {
        when(checkins.findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(any(), any()))
                .thenReturn(List.of(new CenterCheckin(), new CenterCheckin()));

        List<CheckinDto> list = service.history(receptionist);

        assertEquals(2, list.size());
        verify(checkins).findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(any(), any());
    }

    @Test
    void scanDeletedMember_logsDeniedInsteadOfGrantingAccess() {
        Member member = mockMember(10L, "Deleted member");
        member.getUser().setDeletedAt(LocalDateTime.now(clock));
        MembershipSubscription sub = mockSubscription(member, "active", LocalDate.now(clock), LocalDate.now(clock).plusDays(1));
        when(subscriptions.findByQrCode("QR-DELETED")).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-DELETED", "Gate A"));

        assertEquals("DENIED", result.status());
        ArgumentCaptor<CenterCheckin> record = ArgumentCaptor.forClass(CenterCheckin.class);
        verify(checkins).saveAndFlush(record.capture());
        assertEquals("error.attendance.member_inactive", record.getValue().getDenialReason());
    }

    @Test
    void scanLockedMember_logsDeniedInsteadOfGrantingAccess() {
        Member member = mockMember(10L, "Locked member");
        member.getUser().setStatus("locked");
        MembershipSubscription sub = mockSubscription(member, "active", LocalDate.now(clock), LocalDate.now(clock).plusDays(1));
        when(subscriptions.findByQrCode("QR-LOCKED")).thenReturn(Optional.of(sub));
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        assertEquals("DENIED", service.scan(receptionist, new CheckinRequests.Scan("QR-LOCKED", "Gate A")).status());
    }

    @Test
    void denialStoresStableKeyAndHistoryUsesCurrentRequestLanguage() {
        when(subscriptions.findByQrCode("QR-INVALID")).thenReturn(Optional.empty());
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        Locale original = LocaleContextHolder.getLocale();
        try {
            LocaleContextHolder.setLocale(Locale.ENGLISH);
            CheckinDto scanned = service.scan(receptionist, new CheckinRequests.Scan("QR-INVALID", "Gate A"));
            ArgumentCaptor<CenterCheckin> record = ArgumentCaptor.forClass(CenterCheckin.class);
            verify(checkins).saveAndFlush(record.capture());
            assertEquals("error.attendance.qr_invalid", record.getValue().getDenialReason());
            assertEquals(messageService.getMessage("error.attendance.qr_invalid"), scanned.denialReason());
            when(checkins.findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(any(), any()))
                    .thenReturn(List.of(record.getValue()));

            LocaleContextHolder.setLocale(Locale.forLanguageTag("vi"));
            assertEquals(messageService.getMessage("error.attendance.qr_invalid"), service.history(receptionist).getFirst().denialReason());
            assertNotEquals(scanned.denialReason(), service.history(receptionist).getFirst().denialReason());
        } finally {
            LocaleContextHolder.setLocale(original);
        }
    }

    @Test
    void historyPreservesLegacyTranslatedDenialReason() {
        CenterCheckin legacy = new CenterCheckin();
        legacy.setStatus("DENIED");
        legacy.setDenialReason("Legacy QR denial text");
        when(checkins.findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(any(), any()))
                .thenReturn(List.of(legacy));

        assertEquals("Legacy QR denial text", service.history(receptionist).getFirst().denialReason());
    }

    @Test
    @DisplayName("Anti-passback: Lượt check-in cũ quá 12 tiếng được tự động check-out (SYSTEM_AUTO_CHECKOUT) và lượt quét hôm sau được GRANTED")
    void antiPassback_staleCheckinOlderThan12Hours_isAutoCheckedOutAndSubsequentScanGranted() {
        Member member = mockMember(10L, "Nguyễn Văn F");
        LocalDate today = LocalDate.now(clock);
        LocalDateTime now = LocalDateTime.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(2), today.plusDays(30));

        CenterCheckin staleCheckin = new CenterCheckin();
        staleCheckin.setMember(member);
        staleCheckin.setStatus("GRANTED");
        staleCheckin.setCheckInTime(now.minusHours(14));
        staleCheckin.setCheckOutTime(null);

        when(subscriptions.findByQrCode("QR-VALID")).thenReturn(Optional.of(sub));
        when(checkins.findByMemberUserIdAndStatusAndCheckOutTimeIsNullAndCheckInTimeLessThan(
                eq(10L), eq("GRANTED"), any(LocalDateTime.class)))
                .thenReturn(List.of(staleCheckin));
        when(checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED")).thenReturn(false);
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan("QR-VALID", "Gate A"));

        assertEquals("GRANTED", result.status());
        assertNotNull(staleCheckin.getCheckOutTime());
        assertEquals("SYSTEM_AUTO_CHECKOUT", staleCheckin.getNotes());
        verify(checkins).save(staleCheckin);
    }

    @Test
    @DisplayName("Cron Job 03:00 AM: Tự động đóng tất cả lượt check-in GRANTED treo quá 12 tiếng")
    void autoCheckoutStaleVisitsCronJob_closesAllVisitsOlderThan12Hours() {
        Member member = new Member();
        member.setUserId(10L);
        LocalDateTime now = LocalDateTime.now(clock);

        CenterCheckin stale1 = new CenterCheckin();
        stale1.setMember(member);
        stale1.setStatus("GRANTED");
        stale1.setCheckInTime(now.minusHours(15));

        CenterCheckin stale2 = new CenterCheckin();
        stale2.setMember(member);
        stale2.setStatus("GRANTED");
        stale2.setCheckInTime(now.minusHours(20));

        when(checkins.findByStatusAndCheckOutTimeIsNullAndCheckInTimeLessThan(eq("GRANTED"), any(LocalDateTime.class)))
                .thenReturn(List.of(stale1, stale2));

        int closedCount = service.autoCheckoutStaleVisits();

        assertEquals(2, closedCount);
        assertNotNull(stale1.getCheckOutTime());
        assertEquals("SYSTEM_AUTO_CHECKOUT", stale1.getNotes());
        assertNotNull(stale2.getCheckOutTime());
        assertEquals("SYSTEM_AUTO_CHECKOUT", stale2.getNotes());
        verify(checkins, times(2)).save(any(CenterCheckin.class));
    }

    @Test
    @DisplayName("Dynamic QR HMAC-SHA256 hợp lệ -> GRANTED")
    void validDynamicQr_granted() {
        Member member = mockMember(10L, "Nguyễn Văn Dynamic");
        LocalDate today = LocalDate.now(clock);
        LocalDateTime now = LocalDateTime.now(clock);
        MembershipSubscription sub = mockSubscription(member, "active", today.minusDays(1), today.plusDays(30));

        long currentMillis = now.atZone(clock.getZone()).toInstant().toEpochMilli();
        String dynamicQr = qrService.generate(10L, 5L, currentMillis);

        when(subscriptions.findById(5L)).thenReturn(Optional.of(sub));
        when(checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(10L, "GRANTED")).thenReturn(false);
        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan(dynamicQr, "Gate A"));

        assertEquals("GRANTED", result.status());
        assertNull(result.denialReason());
    }

    @Test
    @DisplayName("Dynamic QR đã hết hạn (>60s) -> Bị từ chối với lỗi error.attendance.qr_expired")
    void expiredDynamicQr_deniedWithQrExpired() {
        LocalDateTime now = LocalDateTime.now(clock);
        long oldMillis = now.atZone(clock.getZone()).toInstant().toEpochMilli() - 90000L;
        String expiredQr = qrService.generate(10L, 5L, oldMillis);

        when(checkins.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        CheckinDto result = service.scan(receptionist, new CheckinRequests.Scan(expiredQr, "Gate A"));

        assertEquals("DENIED", result.status());
        assertEquals(messageService.getMessage("error.attendance.qr_expired"), result.denialReason());
    }
}
