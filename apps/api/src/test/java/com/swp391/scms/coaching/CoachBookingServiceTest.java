package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachAvailableSlotDto;
import com.swp391.scms.coaching.dto.CoachBookingCreateDto;
import com.swp391.scms.coaching.dto.CoachBookingDto;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.service.CoachBookingService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CoachBookingServiceTest {

    @Mock private CoachBookingRepository coachBookingRepository;
    @Mock private CoachRepository coachRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private ClassSessionRepository classSessionRepository;
    @Mock private ClassEnrollmentRepository classEnrollmentRepository;
    @Mock private MembershipSubscriptionRepository subscriptionRepository;
    @Mock private DisciplineRepository disciplineRepository;

    private Clock fixedClock;
    private CoachBookingService service;

    private Member member;
    private Coach coach;
    private AuthenticatedPrincipal principal;

    @BeforeEach
    void setUp() {
        // Fix clock at 2026-10-31 08:00:00
        Instant fixedInstant = LocalDateTime.of(2026, 10, 31, 8, 0, 0)
                .atZone(ZoneId.systemDefault()).toInstant();
        fixedClock = Clock.fixed(fixedInstant, ZoneId.systemDefault());

        service = new CoachBookingService(
                coachBookingRepository,
                coachRepository,
                memberRepository,
                classSessionRepository,
                classEnrollmentRepository,
                subscriptionRepository,
                disciplineRepository,
                fixedClock,
                null
        );

        User memberUser = new User();
        memberUser.setId(10L);
        memberUser.setFullName("Khoa Hội Viên");

        member = new Member();
        member.setUserId(10L);
        member.setUser(memberUser);

        User coachUser = new User();
        coachUser.setId(20L);
        coachUser.setFullName("Huấn luyện viên Hùng");

        coach = new Coach();
        coach.setUserId(20L);
        coach.setUser(coachUser);
        coach.setSpecialization("Gym & Fitness");
        coach.setEmploymentStatus("active");

        principal = new AuthenticatedPrincipal(10L, "khoa", "MEMBER");
    }

    @Test
    @DisplayName("Đặt lịch 1:1 thành công với hình thức trả phí theo giờ")
    void createBooking_success_hourlyPay() {
        MembershipSubscription active = new MembershipSubscription();
        active.setStartDate(LocalDate.of(2026, 10, 1));
        active.setEndDate(LocalDate.of(2026, 11, 30));
        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(active));

        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());

        when(coachBookingRepository.save(any(CoachBooking.class))).thenAnswer(inv -> {
            CoachBooking b = inv.getArgument(0);
            b.setId(100L);
            return b;
        });

        // Booking at 14:00 (more than 2 hours from 08:00)
        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0),
                LocalTime.of(15, 0),
                "cash",
                "Mục tiêu tăng cơ giảm mỡ"
        );

        CoachBookingDto result = service.createBooking(principal, request);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(100L);
        assertThat(result.paymentMethod()).isEqualTo("cash");
        assertThat(result.paymentStatus()).isEqualTo("pending");
        assertThat(result.status()).isEqualTo("confirmed");
    }

    @Test
    @DisplayName("Chặn đặt lịch nếu thời gian bắt đầu cách dưới 2 tiếng")
    void createBooking_throws_whenTooSoon() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));

        // Attempt booking at 09:00 (only 1 hour from 08:00, less than 2 hours!)
        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(9, 0),
                LocalTime.of(10, 0),
                "cash",
                "Đặt gấp"
        );

        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("COACH_BOOKING_TOO_SOON"));
    }

    @Test
    @DisplayName("Chặn đặt lịch nếu Huấn luyện viên đã có lịch dạy lớp trùng giờ")
    void createBooking_throws_whenCoachBusy() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));

        GymClass gymClass = new GymClass();
        gymClass.setName("Yoga Buổi Chiều");

        ClassSession busySession = new ClassSession();
        busySession.setGymClass(gymClass);
        busySession.setStartTime(LocalTime.of(14, 0));
        busySession.setEndTime(LocalTime.of(15, 0));

        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of(busySession));

        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0),
                LocalTime.of(15, 0),
                "cash",
                "Tập riêng"
        );

        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getErrorCode()).isEqualTo("COACH_SCHEDULE_CONFLICT"));
    }

    @Test
    @DisplayName("Thành công trừ lượt PT của gói GOLD khi còn hạn mức")
    void createBooking_success_withPackageQuota() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());

        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("GOLD");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 1));
        sub.setEndDate(LocalDate.of(2026, 11, 30));

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        // Used 1 quota out of 3
        when(coachBookingRepository.countMonthlyQuotaUsage(eq(10L), any(), any(), eq("package_quota"))).thenReturn(1L);

        when(coachBookingRepository.save(any(CoachBooking.class))).thenAnswer(inv -> {
            CoachBooking b = inv.getArgument(0);
            b.setId(101L);
            return b;
        });

        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(16, 0),
                LocalTime.of(17, 0),
                "package_quota",
                "Tập kèm 1:1"
        );

        CoachBookingDto result = service.createBooking(principal, request);
        assertThat(result.paymentStatus()).isEqualTo("used_quota");
        assertThat(result.status()).isEqualTo("confirmed");
    }

    @Test
    @DisplayName("Thành công trừ lượt PT của Gói Trải Nghiệm 3 Ngày (tối đa 1 lượt)")
    void createBooking_success_withTrialQuota() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());

        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("Gói Trải Nghiệm 3 Ngày");
        pkg.setDurationDays(3);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 30));
        sub.setEndDate(LocalDate.of(2026, 11, 2));

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        // Used 0 quota out of 1
        when(coachBookingRepository.countMonthlyQuotaUsage(eq(10L), any(), any(), eq("package_quota"))).thenReturn(0L);

        when(coachBookingRepository.save(any(CoachBooking.class))).thenAnswer(inv -> {
            CoachBooking b = inv.getArgument(0);
            b.setId(102L);
            return b;
        });

        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(16, 0),
                LocalTime.of(17, 0),
                "package_quota",
                "Tập thử HLV 1:1"
        );

        CoachBookingDto result = service.createBooking(principal, request);
        assertThat(result.paymentStatus()).isEqualTo("used_quota");
        assertThat(result.status()).isEqualTo("confirmed");
    }

    @Test
    @DisplayName("Báo lỗi khi Gói Trải Nghiệm 3 Ngày đã dùng hết 1 buổi PT 1:1")
    void createBooking_throws_whenTrialQuotaExceeded() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());

        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("Gói Trải Nghiệm 3 Ngày");
        pkg.setDurationDays(3);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 30));
        sub.setEndDate(LocalDate.of(2026, 11, 2));

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        // Already used 1 session
        when(coachBookingRepository.countMonthlyQuotaUsage(eq(10L), any(), any(), eq("package_quota"))).thenReturn(1L);

        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(16, 0),
                LocalTime.of(17, 0),
                "package_quota",
                "Đặt buổi thứ hai"
        );

        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("COACH_BOOKING_TRIAL_QUOTA_EXCEEDED"));
    }

    @Test
    @DisplayName("Báo lỗi khi gói tập không có quyền lợi PT (như SILVER) mà chọn trừ lượt gói")
    void createBooking_throws_whenSilverHasNoPtQuota() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());

        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("SILVER");

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 1));
        sub.setEndDate(LocalDate.of(2026, 11, 30));

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));

        CoachBookingCreateDto request = new CoachBookingCreateDto(
                20L,
                null,
                LocalDate.of(2026, 10, 31),
                LocalTime.of(16, 0),
                LocalTime.of(17, 0),
                "package_quota",
                "Tập riêng"
        );

        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("COACH_BOOKING_PACKAGE_NO_QUOTA"));
    }

    @Test
    @DisplayName("Kiểm tra khung giờ khả dụng: đánh dấu slot dưới 2 tiếng là too_soon")
    void getAvailableSlots_marks_tooSoon() {
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());

        List<CoachAvailableSlotDto> slots = service.getAvailableSlots(20L, LocalDate.of(2026, 10, 31), 10L);

        // At 08:00, slots 06:00, 07:00, 08:00, 09:00 are too soon or past
        CoachAvailableSlotDto slot9 = slots.stream().filter(s -> s.startTime().equals(LocalTime.of(9, 0))).findFirst().orElseThrow();
        assertThat(slot9.available()).isFalse();
        assertThat(slot9.reason()).isEqualTo("too_soon");

        // Slot 11:00 (more than 2 hours) should be available
        CoachAvailableSlotDto slot11 = slots.stream().filter(s -> s.startTime().equals(LocalTime.of(11, 0))).findFirst().orElseThrow();
        assertThat(slot11.available()).isTrue();
    }
    @Test
    void unrelatedCoachCannotCancelAnotherCoachBooking() {
        CoachBooking booking = new CoachBooking();
        booking.setId(77L);
        booking.setMember(member);
        booking.setCoach(coach);
        booking.setStatus("confirmed");
        when(coachBookingRepository.findByIdForUpdate(77L)).thenReturn(Optional.of(booking));
        assertThatThrownBy(() -> service.cancelBooking(new AuthenticatedPrincipal(99L, "other", "COACH"), 77L, null))
                .isInstanceOf(com.swp391.scms.common.exception.ForbiddenException.class);
        assertThat(booking.getStatus()).isEqualTo("confirmed");
    }

    @Test
    void memberCannotCancelASessionThatStartedOrWasCompleted() {
        CoachBooking started = new CoachBooking();
        started.setId(78L); started.setMember(member); started.setCoach(coach); started.setStatus("confirmed");
        started.setBookingDate(java.time.LocalDate.now(fixedClock));
        started.setStartTime(java.time.LocalTime.now(fixedClock).minusMinutes(30));
        when(coachBookingRepository.findByIdForUpdate(78L)).thenReturn(Optional.of(started));
        AuthenticatedPrincipal owner = new AuthenticatedPrincipal(member.getUserId(), "member", "MEMBER");
        assertThatThrownBy(() -> service.cancelBooking(owner, 78L, null))
                .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
        assertThat(started.getStatus()).isEqualTo("confirmed");

        CoachBooking completed = new CoachBooking();
        completed.setId(79L); completed.setMember(member); completed.setCoach(coach); completed.setStatus("completed");
        completed.setBookingDate(java.time.LocalDate.now(fixedClock).plusDays(1));
        completed.setStartTime(java.time.LocalTime.of(9, 0));
        when(coachBookingRepository.findByIdForUpdate(79L)).thenReturn(Optional.of(completed));
        assertThatThrownBy(() -> service.cancelBooking(owner, 79L, null))
                .isInstanceOf(com.swp391.scms.common.exception.BadRequestException.class);
        assertThat(completed.getStatus()).isEqualTo("completed");
    }

    @Test
    void paidBookingRequiresActiveMembership() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var request = new CoachBookingCreateDto(20L, null, LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0), LocalTime.of(15, 0), "cash", null);
        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("MEMBERSHIP_INACTIVE_OR_EXPIRED"));
        verify(coachBookingRepository, never()).save(any());
    }
    @Test
    void rejectsMultiHourBookingChargedAsOneSession() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var request = new CoachBookingCreateDto(20L, null, LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0), LocalTime.of(18, 0), "package_quota", null);
        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("INVALID_COACH_BOOKING_SLOT"));
        verify(coachBookingRepository, never()).save(any());
    }

    @Test
    void availabilityIncludesMembersGroupClass() {
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        ClassSession session = new ClassSession();
        session.setStartTime(LocalTime.of(11, 0)); session.setEndTime(LocalTime.NOON);
        when(classSessionRepository.findActiveByMemberAndDate(10L, LocalDate.of(2026, 10, 31))).thenReturn(List.of(session));
        var slot = service.getAvailableSlots(20L, LocalDate.of(2026, 10, 31), 10L).stream()
                .filter(item -> item.startTime().equals(LocalTime.of(11, 0))).findFirst().orElseThrow();
        assertThat(slot.available()).isFalse();
        assertThat(slot.reason()).isEqualTo("member_busy");
    }
    @Test
    void rejectsUnknownPaymentMethod() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var request = new CoachBookingCreateDto(20L, null, LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0), LocalTime.of(15, 0), "free_lunch", null);
        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getErrorCode()).isEqualTo("INVALID_PAYMENT_METHOD"));
        verify(coachBookingRepository, never()).save(any());
    }

    @Test
    void rejectsHourlyBookingWhenUnpaidLimitReached() {
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        MembershipSubscription sub = new MembershipSubscription();
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 1));
        sub.setEndDate(LocalDate.of(2026, 12, 31));
        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        when(coachBookingRepository.countUnpaid(10L)).thenReturn(2L);
        var request = new CoachBookingCreateDto(20L, null, LocalDate.of(2026, 10, 31),
                LocalTime.of(14, 0), LocalTime.of(15, 0), "cash", null);
        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class);
        verify(coachBookingRepository, never()).save(any());
    }

    @Test
    void deskConfirmsHourlyPaymentAndRecordsRevenue() {
        var payments = org.mockito.Mockito.mock(com.swp391.scms.finance.repository.PaymentRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "paymentRepository", payments);
        CoachBooking booking = new CoachBooking();
        booking.setId(90L);
        booking.setMember(member);
        booking.setCoach(coach);
        booking.setBookingDate(LocalDate.of(2026, 10, 30));
        booking.setStartTime(LocalTime.of(14, 0));
        booking.setEndTime(LocalTime.of(15, 0));
        booking.setHourlyRate(new java.math.BigDecimal("200000.00"));
        booking.setPaymentMethod("cash");
        booking.setPaymentStatus("pending");
        booking.setStatus("completed");
        when(coachBookingRepository.findByIdForUpdate(90L)).thenReturn(Optional.of(booking));
        var desk = new AuthenticatedPrincipal(30L, "desk", "RECEPTIONIST");

        assertThatThrownBy(() -> service.confirmHourlyPayment(principal, 90L, null))
                .isInstanceOf(com.swp391.scms.common.exception.ForbiddenException.class);

        var result = service.confirmHourlyPayment(desk, 90L, "cash");
        assertThat(result.paymentStatus()).isEqualTo("paid");
        assertThat(booking.getPaymentMethod()).isEqualTo("cash");
        var saved = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.finance.entity.Payment.class);
        verify(payments).save(saved.capture());
        assertThat(saved.getValue().getStatus()).isEqualTo("success");
        assertThat(saved.getValue().getAmount()).isEqualByComparingTo("200000.00");

        assertThatThrownBy(() -> service.confirmHourlyPayment(desk, 90L, "cash"))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class);
    }

    @Test
    void coachOnApprovedLeaveCannotBeBookedAndShowsNoFreeSlots() {
        var leaves = org.mockito.Mockito.mock(com.swp391.scms.operations.repository.StaffInternalRequestRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "staffRequestRepository", leaves);
        LocalDate day = LocalDate.of(2026, 11, 2);
        when(leaves.existsApprovedLeaveOn(20L, day)).thenReturn(true);
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var request = new CoachBookingCreateDto(20L, null, day, LocalTime.of(14, 0), LocalTime.of(15, 0), "package_quota", null);

        assertThatThrownBy(() -> service.createBooking(principal, request))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class)
                .satisfies(e -> assertThat(((com.swp391.scms.common.exception.ConflictException) e).getErrorCode())
                        .isEqualTo("COACH_ON_LEAVE"));
        assertThat(service.getAvailableSlots(20L, day, 10L))
                .allSatisfy(slot -> {
                    assertThat(slot.available()).isFalse();
                    assertThat(slot.reason()).isEqualTo("coach_on_leave");
                });
        verify(coachBookingRepository, never()).save(any());
    }

    @Test
    @DisplayName("Đặt 1:1 định kỳ theo tuần: ngày trùng lịch bị bỏ qua kèm lý do, các ngày còn lại vẫn được đặt")
    void createRecurringBooking_skipsConflictingDayAndKeepsTheRest() {
        MembershipSubscription active = new MembershipSubscription();
        active.setStartDate(LocalDate.of(2026, 10, 1));
        active.setEndDate(LocalDate.of(2026, 11, 30));
        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(active));
        when(memberRepository.findByUserIdForUpdate(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(classSessionRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByCoachAndDate(eq(20L), any())).thenReturn(List.of());
        when(coachBookingRepository.findActiveByMemberAndDate(eq(10L), any())).thenReturn(List.of());
        CoachBooking busy = new CoachBooking();
        busy.setStartTime(LocalTime.of(14, 30));
        busy.setEndTime(LocalTime.of(15, 30));
        when(coachBookingRepository.findActiveByMemberAndDate(10L, LocalDate.of(2026, 11, 4))).thenReturn(List.of(busy));
        when(coachBookingRepository.save(any(CoachBooking.class))).thenAnswer(inv -> inv.getArgument(0));

        var result = service.createRecurringBooking(principal, new com.swp391.scms.coaching.dto.CoachRecurringBookingDto(
                20L, null, LocalDate.of(2026, 11, 2), LocalTime.of(14, 0), LocalTime.of(15, 0),
                "week", List.of(1, 3, 5), "cash", null));

        assertThat(result.booked()).extracting(CoachBookingDto::bookingDate)
                .containsExactly(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 6));
        assertThat(result.skipped()).hasSize(1);
        assertThat(result.skipped().get(0).date()).isEqualTo(LocalDate.of(2026, 11, 4));
        assertThat(result.skipped().get(0).code()).isEqualTo("MEMBER_SCHEDULE_CONFLICT");
    }

    @Test
    @DisplayName("Đặt 1:1 định kỳ: HLV không tồn tại thì báo lỗi ngay, không tạo lịch nào")
    void createRecurringBooking_failsFastForUnknownCoach() {
        when(coachRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createRecurringBooking(principal,
                new com.swp391.scms.coaching.dto.CoachRecurringBookingDto(99L, null, LocalDate.of(2026, 11, 2),
                        LocalTime.of(14, 0), LocalTime.of(15, 0), "month", null, null, null)))
                .isInstanceOf(com.swp391.scms.common.exception.ResourceNotFoundException.class);
        verify(coachBookingRepository, never()).save(any());
    }

    @Test
    @DisplayName("getMemberQuotaStatus: Trả về đúng 1 lượt cho Gói Trải Nghiệm 3 Ngày (dù tên cũ là GOLD)")
    void getMemberQuotaStatus_returnsTrialQuotaCorrectly() {
        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("GOLD");
        pkg.setDurationDays(30);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 30));
        sub.setEndDate(LocalDate.of(2026, 11, 2)); // 3 days

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        when(coachBookingRepository.countMonthlyQuotaUsage(eq(10L), any(), any(), eq("package_quota"))).thenReturn(0L);

        var quota = service.getMemberQuotaStatus(10L);
        assertThat(quota.packageName()).isEqualTo("Gói Trải Nghiệm 3 Ngày");
        assertThat(quota.monthlyQuota()).isEqualTo(1);
        assertThat(quota.remainingQuota()).isEqualTo(1);
    }

    @Test
    @DisplayName("getMemberQuotaStatus: Trả về đúng 3 lượt cho Gói GOLD 30 ngày chuẩn")
    void getMemberQuotaStatus_returnsGoldQuotaCorrectly() {
        MembershipPackage pkg = new MembershipPackage();
        pkg.setName("GOLD");
        pkg.setDurationDays(30);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setMembershipPackage(pkg);
        sub.setStatus("active");
        sub.setStartDate(LocalDate.of(2026, 10, 1));
        sub.setEndDate(LocalDate.of(2026, 11, 30)); // 60 days

        when(subscriptionRepository.findByMemberUserIdAndStatus(10L, "active")).thenReturn(List.of(sub));
        when(coachBookingRepository.countMonthlyQuotaUsage(eq(10L), any(), any(), eq("package_quota"))).thenReturn(1L);

        var quota = service.getMemberQuotaStatus(10L);
        assertThat(quota.packageName()).isEqualTo("GOLD");
        assertThat(quota.monthlyQuota()).isEqualTo(3);
        assertThat(quota.usedThisMonth()).isEqualTo(1);
        assertThat(quota.remainingQuota()).isEqualTo(2);
    }
}
