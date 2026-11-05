package com.swp391.scms.finance;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.finance.dto.PaymentCreateDto;
import com.swp391.scms.finance.dto.PaymentDto;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.mapper.PaymentMapper;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.service.PaymentService;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import com.swp391.scms.finance.dto.PaymentProcessDto;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private MembershipSubscriptionRepository membershipSubscriptionRepository;

    @Mock
    private ClassEnrollmentRepository classEnrollmentRepository;

    @Mock
    private PaymentMapper paymentMapper;

    private Clock clock;
    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(Instant.parse("2026-10-01T10:00:00Z"), ZoneOffset.UTC);
        paymentService = new PaymentService(paymentRepository, memberRepository, userRepository,
                membershipSubscriptionRepository, classEnrollmentRepository, paymentMapper, clock);
    }

    @Test
    @DisplayName("Should create payment successfully when member and cashier are valid")
    void shouldCreatePaymentSuccessfully() {
        PaymentCreateDto dto = new PaymentCreateDto();
        dto.setMemberId(2L);
        dto.setReceivedById(1L);
        dto.setAmount(new BigDecimal("1500000.00"));
        dto.setMethod("POS");
        dto.setStatus("SUCCESS");

        Member member = new Member();
        User receiver = new User();
        Payment payment = new Payment();
        PaymentDto expectedDto = new PaymentDto();
        expectedDto.setId(10L);

        when(memberRepository.findById(2L)).thenReturn(Optional.of(member));
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(receiver));
        when(paymentMapper.toEntity(dto)).thenReturn(payment);
        when(paymentRepository.save(payment)).thenReturn(payment);
        when(paymentMapper.toDto(payment)).thenReturn(expectedDto);

        PaymentDto result = paymentService.createPayment(dto);

        assertNotNull(result);
        assertEquals(10L, result.getId());
        assertEquals("pos", payment.getMethod());
        assertEquals("success", payment.getStatus());
        assertEquals(LocalDateTime.now(clock), payment.getPaidAt());
        verify(paymentRepository).save(payment);
    }

    @Test
    @DisplayName("Should throw ResourceNotFoundException when member does not exist")
    void shouldThrowWhenCreatingPaymentWithNonExistentMember() {
        PaymentCreateDto dto = new PaymentCreateDto();
        dto.setMemberId(999L);

        when(memberRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> paymentService.createPayment(dto));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should throw ResourceNotFoundException when cashier receiver is soft-deleted")
    void shouldThrowWhenCreatingPaymentWithSoftDeletedCashier() {
        PaymentCreateDto dto = new PaymentCreateDto();
        dto.setMemberId(2L);
        dto.setReceivedById(1L);

        when(memberRepository.findById(2L)).thenReturn(Optional.of(new Member()));
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> paymentService.createPayment(dto));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should return PaymentDto by ID when payment exists")
    void shouldGetPaymentById() {
        Payment payment = new Payment();
        payment.setId(5L);
        PaymentDto expectedDto = new PaymentDto();
        expectedDto.setId(5L);

        when(paymentRepository.findById(5L)).thenReturn(Optional.of(payment));
        when(paymentMapper.toDto(payment)).thenReturn(expectedDto);

        PaymentDto result = paymentService.getPaymentById(5L);
        assertEquals(5L, result.getId());
    }

    @Test
    @DisplayName("Should throw ResourceNotFoundException when payment ID not found")
    void shouldThrowWhenPaymentNotFound() {
        when(paymentRepository.findById(999L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> paymentService.getPaymentById(999L));
    }

    @Test
    @DisplayName("Should return list of payments for existing member")
    void shouldGetPaymentsByMemberId() {
        when(memberRepository.existsById(2L)).thenReturn(true);
        Payment payment = new Payment();
        when(paymentRepository.findByMemberUserId(2L)).thenReturn(List.of(payment));
        when(paymentMapper.toDtoList(List.of(payment))).thenReturn(List.of(new PaymentDto()));

        List<PaymentDto> results = paymentService.getPaymentsByMemberId(2L);
        assertEquals(1, results.size());
    }

    @Test
    @DisplayName("Should throw ResourceNotFoundException when querying payments for non-existent member")
    void shouldThrowWhenMemberNotFoundForPaymentsHistory() {
        when(memberRepository.existsById(999L)).thenReturn(false);
        assertThrows(ResourceNotFoundException.class, () -> paymentService.getPaymentsByMemberId(999L));
    }

    @Test
    @DisplayName("Should update payment status from pending to success and set paidAt")
    void shouldUpdatePaymentStatusFromPendingToSuccess() {
        Payment payment = new Payment();
        payment.setId(1L);
        payment.setStatus("pending");

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));
        when(paymentMapper.toDto(payment)).thenReturn(new PaymentDto());

        paymentService.updatePaymentStatus(1L, "success");

        assertEquals("success", payment.getStatus());
        assertEquals(LocalDateTime.now(clock), payment.getPaidAt());
    }

    @Test
    @DisplayName("Should reject success to refunded on the status endpoint; refunds go through refundPayment")
    void shouldRejectStatusUpdateFromSuccessToRefunded() {
        Payment payment = new Payment();
        payment.setId(1L);
        payment.setStatus("success");
        payment.setPaidAt(LocalDateTime.now(clock).minusHours(1));

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));

        assertThrows(BadRequestException.class, () -> paymentService.updatePaymentStatus(1L, "refunded"));
        assertEquals("success", payment.getStatus());
    }

    @Test
    @DisplayName("Should throw BadRequestException for invalid status transitions (e.g., refunded -> success)")
    void shouldRejectDisallowedStatusTransitions() {
        Payment payment = new Payment();
        payment.setId(1L);
        payment.setStatus("refunded");

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));

        assertThrows(BadRequestException.class, () -> paymentService.updatePaymentStatus(1L, "success"));
    }

    @Test
    @DisplayName("Should throw BadRequestException when status string is unknown")
    void shouldRejectInvalidStatusString() {
        Payment payment = new Payment();
        payment.setId(1L);

        when(paymentRepository.findById(1L)).thenReturn(Optional.of(payment));

        assertThrows(BadRequestException.class, () -> paymentService.updatePaymentStatus(1L, "invalid_status"));
    }

    @Test
    @DisplayName("Should process payment and activate subscription with QR code generation")
    void shouldProcessPaymentAndActivateSubscription() {
        Member member = new Member();
        member.setUserId(2L);

        MembershipPackage pkg = new MembershipPackage();
        pkg.setPrice(new BigDecimal("1500000.00"));

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(10L);
        sub.setMember(member);
        sub.setMembershipPackage(pkg);
        sub.setStatus("pending_payment");

        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(sub));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(paymentMapper.toDto(any(Payment.class))).thenReturn(new PaymentDto());

        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, null, new BigDecimal("1500000.00"), "pos", null, "Ghi chú");
        PaymentDto result = paymentService.processPayment(dto);

        assertNotNull(result);
        assertEquals("active", sub.getStatus());
        assertNotNull(sub.getQrCode());
        assertFalse(sub.getQrCode().isBlank());
        verify(membershipSubscriptionRepository).save(sub);
        verify(paymentRepository).save(any(Payment.class));
    }

    @Test
    void posCannotActivateCancelledSubscription() {
        Member member = new Member(); member.setUserId(2L);
        MembershipSubscription cancelled = new MembershipSubscription(); cancelled.setId(10L);
        cancelled.setMember(member); cancelled.setStatus("cancelled");
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(cancelled));
        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, null,
                new BigDecimal("500000"), "pos", null, null);
        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        verify(paymentRepository, never()).save(any());
        assertEquals("cancelled", cancelled.getStatus());
    }

    @Test
    void posSettlesExistingPendingPaymentWithoutCreatingDuplicate() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pkg = new MembershipPackage(); pkg.setPrice(new BigDecimal("500000"));
        MembershipSubscription sub = new MembershipSubscription(); sub.setId(10L);
        sub.setMember(member); sub.setMembershipPackage(pkg); sub.setStatus("pending_payment");
        Payment pending = new Payment(); pending.setId(90L); pending.setMember(member);
        pending.setSubscriptionId(10L); pending.setStatus("pending"); pending.setAmount(new BigDecimal("500000"));
        pending.setMethod("bank_transfer"); pending.setNote("Awaiting transfer");
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(sub));
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(pending));
        when(paymentRepository.save(pending)).thenReturn(pending);
        when(paymentMapper.toDto(pending)).thenReturn(new PaymentDto());
        paymentService.processPayment(new PaymentProcessDto(2L, 10L, null,
                new BigDecimal("500000"), "pos", null, "Paid at desk"));
        assertEquals("pos", pending.getMethod());
        assertEquals("Paid at desk", pending.getNote());
        assertEquals("success", pending.getStatus());
        assertEquals("active", sub.getStatus());
        verify(paymentRepository).save(pending);
        verify(paymentRepository, times(1)).save(any());
    }

    @Test
    void existingSubscriptionPaymentCannotSettleAnotherEnrollment() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pkg = new MembershipPackage(); pkg.setPrice(new BigDecimal("500000"));
        MembershipSubscription sub = new MembershipSubscription(); sub.setId(10L);
        sub.setMember(member); sub.setMembershipPackage(pkg); sub.setStatus("pending_payment");
        Payment pending = new Payment(); pending.setId(90L); pending.setMember(member);
        pending.setSubscriptionId(10L); pending.setStatus("pending"); pending.setAmount(pkg.getPrice());
        ClassEnrollment enrollment = new ClassEnrollment(); enrollment.setMember(member); enrollment.setStatus("cancelled");
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(sub));
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(pending));
        lenient().when(classEnrollmentRepository.findById(20L)).thenReturn(Optional.of(enrollment));
        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, 20L, pkg.getPrice(), "pos", null, null);

        assertThrows(BadRequestException.class, () -> paymentService.processPayment(dto));
        assertEquals("pending_payment", sub.getStatus());
        assertEquals("pending", pending.getStatus());
        assertEquals("cancelled", enrollment.getStatus());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void paymentConfirmationCannotReactivateCancelledRequest() {
        Member member = new Member(); member.setUserId(2L);
        Payment payment = new Payment(); payment.setId(90L); payment.setMember(member);
        payment.setSubscriptionId(10L); payment.setStatus("pending");
        MembershipSubscription cancelled = new MembershipSubscription(); cancelled.setId(10L);
        cancelled.setMember(member); cancelled.setStatus("cancelled");
        when(paymentRepository.findById(90L)).thenReturn(Optional.of(payment));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(cancelled));
        assertThrows(ConflictException.class, () -> paymentService.updatePaymentStatus(90L, "success"));
        assertEquals("cancelled", cancelled.getStatus());
    }

    @Test
    @DisplayName("Should reject payment processing when amount does not match package price")
    void shouldRejectPaymentWhenAmountMismatches() {
        Member member = new Member();
        member.setUserId(2L);

        MembershipPackage pkg = new MembershipPackage();
        pkg.setPrice(new BigDecimal("1500000.00"));

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(10L);
        sub.setMember(member);
        sub.setMembershipPackage(pkg);

        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(sub));

        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, null, new BigDecimal("1000000.00"), "pos", null, null);
        assertThrows(BadRequestException.class, () -> paymentService.processPayment(dto));
    }

    @Test
    @DisplayName("Should reject payment processing when target subscription and enrollment are both null")
    void shouldRejectPaymentWhenTargetIsMissing() {
        PaymentProcessDto dto = new PaymentProcessDto(2L, null, null, new BigDecimal("1000000.00"), "pos", null, null);
        assertThrows(BadRequestException.class, () -> paymentService.processPayment(dto));
    }

    @Test
    @DisplayName("Should refund payment successfully and cancel associated subscription")
    void shouldRefundPaymentSuccessfullyAndCancelSubscription() {
        Payment payment = new Payment();
        payment.setId(10L);
        payment.setStatus("success");
        payment.setAmount(new BigDecimal("1500000.00"));
        payment.setSubscriptionId(5L);

        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(5L);
        sub.setStatus("active");

        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));
        when(membershipSubscriptionRepository.findById(5L)).thenReturn(Optional.of(sub));
        when(paymentRepository.save(payment)).thenReturn(payment);
        when(paymentMapper.toDto(payment)).thenReturn(new PaymentDto());

        PaymentDto result = paymentService.refundPayment(10L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Chuyển nhà", new BigDecimal("1500000.00")));
        assertNotNull(result);
        assertEquals("refunded", payment.getStatus());
        assertEquals("cancelled", sub.getStatus());
        assertTrue(payment.getNote().contains("HOÀN TIỀN"));
        verify(membershipSubscriptionRepository).save(sub);
        verify(paymentRepository).save(payment);
    }

    @Test
    @DisplayName("Should reject refund when payment is not in success status")
    void shouldRejectRefundWhenPaymentNotSuccess() {
        Payment payment = new Payment();
        payment.setId(10L);
        payment.setStatus("pending");
        payment.setAmount(new BigDecimal("1500000.00"));

        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));

        assertThrows(BadRequestException.class, () -> paymentService.refundPayment(10L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Lỗi thu ngân")));
    }

    @Test
    @DisplayName("Should reject refund when refund amount is invalid or exceeds payment amount")
    void shouldRejectRefundWhenAmountExceedsPayment() {
        Payment payment = new Payment();
        payment.setId(10L);
        payment.setStatus("success");
        payment.setAmount(new BigDecimal("1500000.00"));

        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));

        assertThrows(BadRequestException.class, () -> paymentService.refundPayment(10L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Nhầm", new BigDecimal("2000000.00"))));
    }
    @Test
    void failedRenewalPaymentCancelsPendingPeriodWithoutActivatingIt() {
        Member member = new Member(); member.setUserId(2L);
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setPreviousSubscription(previous);
        renewal.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setId(11L); payment.setSubscriptionId(10L);
        payment.setStatus("pending");
        when(paymentRepository.findById(11L)).thenReturn(Optional.of(payment));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(renewal));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(paymentMapper.toDto(payment)).thenReturn(new PaymentDto());
        paymentService.updatePaymentStatus(11L, "failed");
        assertEquals("failed", payment.getStatus());
        assertEquals("cancelled", renewal.getStatus());
        assertNull(renewal.getQrCode());
        verify(membershipSubscriptionRepository).save(renewal);
    }
    @Test
    void renewalPaymentAmountIsCheckedAgainstServerPackagePrice() {
        Member member = new Member(); member.setUserId(2L);
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipPackage pack = new MembershipPackage(); pack.setPrice(new BigDecimal("1500000.00"));
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setPreviousSubscription(previous);
        renewal.setMembershipPackage(pack); renewal.setStatus("pending_payment");
        PaymentCreateDto dto = new PaymentCreateDto();
        dto.setMemberId(2L); dto.setSubscriptionId(10L);
        dto.setAmount(new BigDecimal("1.00")); dto.setMethod("bank_transfer");
        when(memberRepository.findById(2L)).thenReturn(Optional.of(member));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(renewal));
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of());
        assertThrows(BadRequestException.class, () -> paymentService.createPayment(dto));
        verify(paymentRepository, never()).save(any());
    }
    @Test
    void renewalPaymentRequestCannotBeCreatedTwice() {
        Member member = new Member(); member.setUserId(2L);
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setPreviousSubscription(previous);
        renewal.setStatus("pending_payment");
        PaymentCreateDto dto = new PaymentCreateDto();
        dto.setMemberId(2L); dto.setSubscriptionId(10L);
        dto.setAmount(new BigDecimal("1500000.00")); dto.setMethod("bank_transfer");
        when(memberRepository.findById(2L)).thenReturn(Optional.of(member));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(renewal));
        Payment settled = new Payment(); settled.setMember(member); settled.setStatus("success");
        settled.setAmount(dto.getAmount());
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(settled));
        assertThrows(ConflictException.class, () -> paymentService.createPayment(dto));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void posPackageIdRejectsPendingRenewalWithoutChangingItsPackage() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        pack.setPrice(new BigDecimal("1500000.00"));
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setMembershipPackage(pack);
        renewal.setPreviousSubscription(previous); renewal.setStatus("pending_payment");
        PaymentProcessDto dto = new PaymentProcessDto(2L, null, null, pack.getPrice(), "pos", null, null);
        dto.setPackageId(5L);
        var packageRepository = org.mockito.Mockito.mock(com.swp391.scms.facilities.repository.MembershipPackageRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "membershipPackageRepository", packageRepository);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(packageRepository.findById(5L)).thenReturn(Optional.of(pack));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(renewal));
        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        assertSame(pack, renewal.getMembershipPackage());
        assertEquals("pending_payment", renewal.getStatus());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void posPackageIdCannotChangePendingPurchaseOrDuplicateItsPayment() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L); pack.setPrice(new BigDecimal("1500000.00"));
        MembershipPackage other = new MembershipPackage(); other.setId(6L);
        MembershipSubscription pending = new MembershipSubscription();
        pending.setId(10L); pending.setMember(member); pending.setMembershipPackage(other); pending.setStatus("pending_payment");
        PaymentProcessDto dto = new PaymentProcessDto(2L, null, null, pack.getPrice(), "pos", null, null);
        dto.setPackageId(5L);
        var packageRepository = org.mockito.Mockito.mock(com.swp391.scms.facilities.repository.MembershipPackageRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "membershipPackageRepository", packageRepository);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(packageRepository.findById(5L)).thenReturn(Optional.of(pack));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(pending));
        assertThrows(BadRequestException.class, () -> paymentService.processPayment(dto));
        assertSame(other, pending.getMembershipPackage());
        pending.setMembershipPackage(pack);
        Payment settled = new Payment(); settled.setMember(member); settled.setStatus("success");
        settled.setAmount(pack.getPrice());
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(settled));
        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void confirmingSameRenewalPaymentTwiceActivatesOnlyOnce() {
        Member member = new Member(); member.setUserId(2L);
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setPreviousSubscription(previous);
        renewal.setStatus("pending_payment");
        Payment payment = new Payment(); payment.setId(11L); payment.setSubscriptionId(10L);
        payment.setStatus("pending");
        when(paymentRepository.findById(11L)).thenReturn(Optional.of(payment));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(renewal));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(paymentMapper.toDto(payment)).thenReturn(new PaymentDto());
        paymentService.updatePaymentStatus(11L, "success");
        paymentService.updatePaymentStatus(11L, "success");
        assertEquals("active", renewal.getStatus());
        verify(membershipSubscriptionRepository, times(1)).save(renewal);
    }

    @Test
    void posFirstPurchaseStillCreatesPaidSubscription() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        pack.setPrice(new BigDecimal("1500000.00")); pack.setDurationDays(30);
        PaymentProcessDto dto = new PaymentProcessDto(2L, null, null, pack.getPrice(), "pos", null, null);
        dto.setPackageId(5L);
        var packageRepository = org.mockito.Mockito.mock(com.swp391.scms.facilities.repository.MembershipPackageRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "membershipPackageRepository", packageRepository);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(packageRepository.findById(5L)).thenReturn(Optional.of(pack));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of());
        when(membershipSubscriptionRepository.save(any(MembershipSubscription.class))).thenAnswer(inv -> inv.getArgument(0));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));
        when(paymentMapper.toDto(any(Payment.class))).thenReturn(new PaymentDto());
        paymentService.processPayment(dto);
        var saved = org.mockito.ArgumentCaptor.forClass(MembershipSubscription.class);
        verify(membershipSubscriptionRepository, atLeastOnce()).save(saved.capture());
        assertEquals("active", saved.getValue().getStatus());
        assertNull(saved.getValue().getPreviousSubscription());
        verify(paymentRepository, times(1)).save(any(Payment.class));
    }

    @Test
    void posConfirmsExistingPendingRenewalPaymentWithoutCreatingAnother() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        pack.setPrice(new BigDecimal("1500000.00"));
        MembershipSubscription previous = new MembershipSubscription(); previous.setId(9L);
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(10L); renewal.setMember(member); renewal.setMembershipPackage(pack);
        renewal.setPreviousSubscription(previous); renewal.setStatus("pending_payment");
        Payment pendingPayment = new Payment();
        pendingPayment.setId(11L); pendingPayment.setMember(member); pendingPayment.setSubscriptionId(10L);
        pendingPayment.setStatus("pending"); pendingPayment.setAmount(pack.getPrice());
        pendingPayment.setMethod("bank_transfer");
        User cashier = new User(); cashier.setId(1L);
        jakarta.persistence.EntityManager entityManager = mock(jakarta.persistence.EntityManager.class);
        org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "entityManager", entityManager);
        // Refresh reloads the stored values and discards unflushed cashier edits.
        doAnswer(invocation -> {
            if (invocation.getArgument(0) != pendingPayment) return null;
            pendingPayment.setMethod("bank_transfer");
            pendingPayment.setReceivedBy(null);
            pendingPayment.setNote(null);
            return null;
        }).when(entityManager).refresh(any());
        when(userRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(cashier));
        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, null, pack.getPrice(), "pos", 1L, "Paid at desk");
        dto.setPackageId(5L);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(renewal));
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(pendingPayment));
        when(paymentRepository.save(pendingPayment)).thenReturn(pendingPayment);
        when(paymentMapper.toDto(pendingPayment)).thenReturn(new PaymentDto());
        paymentService.processPayment(dto);
        assertEquals("pos", pendingPayment.getMethod());
        assertSame(cashier, pendingPayment.getReceivedBy());
        assertEquals("Paid at desk", pendingPayment.getNote());
        assertEquals("success", pendingPayment.getStatus());
        assertEquals("active", renewal.getStatus());
        verify(paymentRepository).save(pendingPayment);
        verify(membershipSubscriptionRepository, times(1)).save(renewal);
    }

    @Test
    void posPackageIdRejectsAlreadyPaidFuturePeriod() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        pack.setPrice(new BigDecimal("1500000.00"));
        MembershipSubscription future = new MembershipSubscription();
        future.setId(10L); future.setMember(member); future.setMembershipPackage(pack);
        future.setStatus("active"); future.setStartDate(java.time.LocalDate.of(2026, 11, 1));
        future.setEndDate(java.time.LocalDate.of(2026, 11, 30));
        PaymentProcessDto dto = new PaymentProcessDto(2L, null, null, pack.getPrice(), "pos", null, null);
        dto.setPackageId(5L);
        var packageRepository = org.mockito.Mockito.mock(com.swp391.scms.facilities.repository.MembershipPackageRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "membershipPackageRepository", packageRepository);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(packageRepository.findById(5L)).thenReturn(Optional.of(pack));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(future));
        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        verify(paymentRepository, never()).save(any());
        var order = inOrder(memberRepository, membershipSubscriptionRepository);
        order.verify(memberRepository).findByUserIdForUpdate(2L);
        order.verify(membershipSubscriptionRepository).findByMemberUserId(2L);
    }

    @Test
    void posSubscriptionCheckoutRejectsMismatchedPackageId() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        MembershipSubscription pending = new MembershipSubscription();
        pending.setId(10L); pending.setMember(member); pending.setMembershipPackage(pack);
        pending.setStatus("pending_payment");
        PaymentProcessDto dto = new PaymentProcessDto(2L, 10L, null,
                new BigDecimal("1500000.00"), "pos", null, null);
        dto.setPackageId(6L);
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(pending));
        assertThrows(BadRequestException.class, () -> paymentService.processPayment(dto));
        verify(paymentRepository, never()).save(any());
    }
    @Test
    @DisplayName("A prorated upgrade paid later keeps its quote: price, credit and start day survive catalog repricing")
    void proratedUpgradeKeepsItsQuoteAfterRepricing() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage basic = new MembershipPackage();
        basic.setId(1L); basic.setPrice(new BigDecimal("199000")); basic.setDurationDays(30); basic.setStatus("active");
        MembershipPackage vip = new MembershipPackage();
        vip.setId(2L); vip.setPrice(new BigDecimal("299000")); vip.setDurationDays(30); vip.setStatus("active");
        MembershipSubscription current = new MembershipSubscription();
        current.setId(10L); current.setMember(member); current.setMembershipPackage(basic); current.setStatus("active");
        current.setStartDate(java.time.LocalDate.of(2026, 9, 15)); current.setEndDate(java.time.LocalDate.of(2026, 10, 14));
        MembershipSubscription upgrade = new MembershipSubscription();
        upgrade.setId(12L); upgrade.setMember(member); upgrade.setMembershipPackage(vip);
        upgrade.setPreviousSubscription(current); upgrade.setStatus("pending_payment");
        // Quoted on 28/09: 17 of 30 days left of 199,000 paid -> 112,000 credit, 187,000 due.
        upgrade.setStartDate(java.time.LocalDate.of(2026, 9, 28)); upgrade.setEndDate(java.time.LocalDate.of(2026, 10, 27));
        upgrade.setCreditApplied(new BigDecimal("112000")); upgrade.setUpgradeCharge(new BigDecimal("187000"));
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(12L)).thenReturn(Optional.of(upgrade));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(current, upgrade));

        // A quote waiting for payment is not repriced: the raised catalog price is refused at the counter.
        basic.setPrice(new BigDecimal("249000"));
        vip.setPrice(new BigDecimal("399000"));
        PaymentProcessDto repriced = new PaymentProcessDto(2L, 12L, null, new BigDecimal("399000"), "pos", null, null);
        repriced.setPackageId(2L);
        assertThrows(BadRequestException.class, () -> paymentService.processPayment(repriced));
        assertEquals("pending_payment", upgrade.getStatus());

        // The member pays the quoted amount on 01/10.
        PaymentProcessDto dto = new PaymentProcessDto(2L, 12L, null, new BigDecimal("187000"), "pos", null, null);
        dto.setPackageId(2L);
        paymentService.processPayment(dto);

        assertEquals("active", upgrade.getStatus());
        assertEquals(new BigDecimal("187000"), upgrade.payableAmount());
        // New period runs from the quote day; the old one ends that day, so credited days are not used twice.
        assertEquals(java.time.LocalDate.of(2026, 9, 28), upgrade.getStartDate());
        assertEquals(java.time.LocalDate.of(2026, 10, 27), upgrade.getEndDate());
        assertEquals("expired", current.getStatus());
        assertEquals(java.time.LocalDate.of(2026, 9, 28), current.getEndDate());
        assertEquals(java.time.LocalDate.of(2026, 10, 14), upgrade.getReplacedEndDate());
    }

    @Test
    void posCannotConfirmUpgradeWhenPaidFutureRenewalAppears() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage basic = new MembershipPackage();
        basic.setId(1L); basic.setPrice(new BigDecimal("500000"));
        MembershipPackage vip = new MembershipPackage();
        vip.setId(2L); vip.setPrice(new BigDecimal("1500000")); vip.setDurationDays(90);
        MembershipSubscription current = new MembershipSubscription();
        current.setId(10L); current.setMember(member); current.setMembershipPackage(basic);
        current.setStatus("active"); current.setEndDate(java.time.LocalDate.of(2026, 10, 10));
        MembershipSubscription future = new MembershipSubscription();
        future.setId(11L); future.setMember(member); future.setMembershipPackage(basic);
        future.setPreviousSubscription(current); future.setStatus("active");
        future.setStartDate(java.time.LocalDate.of(2026, 10, 11));
        future.setEndDate(java.time.LocalDate.of(2026, 11, 9));
        MembershipSubscription upgrade = new MembershipSubscription();
        upgrade.setId(12L); upgrade.setMember(member); upgrade.setMembershipPackage(vip);
        upgrade.setPreviousSubscription(current); upgrade.setStatus("pending_payment");
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(12L)).thenReturn(Optional.of(upgrade));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(current, future, upgrade));
        PaymentProcessDto dto = new PaymentProcessDto(2L, 12L, null, vip.getPrice(), "pos", null, null);
        dto.setPackageId(2L);

        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        assertEquals("pending_payment", upgrade.getStatus());
        assertEquals("active", current.getStatus());
        assertEquals("active", future.getStatus());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void posCannotActivatePendingRenewalWhileSourceIsFrozen() {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage();
        pack.setId(1L); pack.setPrice(new BigDecimal("500000")); pack.setDurationDays(30);
        MembershipSubscription source = new MembershipSubscription();
        source.setId(10L); source.setMember(member); source.setMembershipPackage(pack);
        source.setStatus("frozen");
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(11L); renewal.setMember(member); renewal.setMembershipPackage(pack);
        renewal.setPreviousSubscription(source); renewal.setStatus("pending_payment");
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findById(11L)).thenReturn(Optional.of(renewal));
        when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(source, renewal));
        PaymentProcessDto dto = new PaymentProcessDto(2L, 11L, null, pack.getPrice(), "pos", null, null);
        dto.setPackageId(1L);

        assertThrows(ConflictException.class, () -> paymentService.processPayment(dto));
        assertEquals("pending_payment", renewal.getStatus());
        verify(paymentRepository, never()).save(any());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void posSettlesOriginalPendingAmountAfterCatalogPriceReduction(boolean explicitSubscription) {
        Member member = new Member(); member.setUserId(2L);
        MembershipPackage pack = new MembershipPackage(); pack.setId(5L);
        pack.setPrice(new BigDecimal("299000")); pack.setDurationDays(30);
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setId(10L); subscription.setMember(member); subscription.setMembershipPackage(pack);
        subscription.setStatus("pending_payment");
        Payment pendingPayment = new Payment(); pendingPayment.setId(11L);
        pendingPayment.setMember(member); pendingPayment.setSubscriptionId(10L);
        pendingPayment.setStatus("pending"); pendingPayment.setAmount(new BigDecimal("2800000"));
        var dto = new PaymentProcessDto(2L, explicitSubscription ? 10L : null, null, pendingPayment.getAmount(), "cash", null, null);
        if (!explicitSubscription) {
            dto.setPackageId(5L);
            var catalog = mock(com.swp391.scms.facilities.repository.MembershipPackageRepository.class);
            org.springframework.test.util.ReflectionTestUtils.setField(paymentService, "membershipPackageRepository", catalog);
            when(catalog.findById(5L)).thenReturn(Optional.of(pack));
            when(membershipSubscriptionRepository.findByMemberUserId(2L)).thenReturn(List.of(subscription));
        }
        when(memberRepository.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        if (explicitSubscription) when(membershipSubscriptionRepository.findById(10L)).thenReturn(Optional.of(subscription));
        when(paymentRepository.findAllBySubscriptionId(10L)).thenReturn(List.of(pendingPayment));
        when(paymentRepository.save(pendingPayment)).thenReturn(pendingPayment);
        when(paymentMapper.toDto(pendingPayment)).thenReturn(new PaymentDto());
        paymentService.processPayment(dto);
        assertEquals("success", pendingPayment.getStatus());
        assertEquals(new BigDecimal("2800000"), pendingPayment.getAmount());
        assertEquals("active", subscription.getStatus());
        verify(paymentRepository).save(pendingPayment);
    }


    @Test
    @DisplayName("A partial refund keeps the payment successful and the membership running; the rest ends it")
    void partialRefundKeepsMembershipUntilFullyRefunded() {
        Payment payment = new Payment();
        payment.setId(10L);
        payment.setStatus("success");
        payment.setAmount(new BigDecimal("1500000.00"));
        payment.setSubscriptionId(5L);
        MembershipSubscription sub = new MembershipSubscription();
        sub.setId(5L);
        sub.setStatus("active");
        when(paymentRepository.findById(10L)).thenReturn(Optional.of(payment));

        paymentService.refundPayment(10L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Ốm", new BigDecimal("500000.00")));
        assertEquals("success", payment.getStatus());
        assertEquals(0, new BigDecimal("500000.00").compareTo(payment.getRefundedAmount()));
        assertEquals(0, new BigDecimal("1000000.00").compareTo(payment.netAmount()));
        assertEquals("active", sub.getStatus());
        verify(membershipSubscriptionRepository, never()).findById(5L);

        assertThrows(BadRequestException.class, () -> paymentService.refundPayment(10L,
                new com.swp391.scms.finance.dto.PaymentRefundRequest("Quá số còn lại", new BigDecimal("1000000.01"))));

        when(membershipSubscriptionRepository.findById(5L)).thenReturn(Optional.of(sub));
        paymentService.refundPayment(10L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Chuyển nhà", null));
        assertEquals("refunded", payment.getStatus());
        assertEquals(0, payment.getAmount().compareTo(payment.getRefundedAmount()));
        assertEquals("cancelled", sub.getStatus());
    }

    @Test
    @DisplayName("Refunding an upgrade restores the period it replaced with its original expiry")
    void refundingUpgradeRestoresReplacedPeriod() {
        com.swp391.scms.facilities.entity.MembershipPackage basic = new com.swp391.scms.facilities.entity.MembershipPackage();
        basic.setId(1L);
        com.swp391.scms.facilities.entity.MembershipPackage premium = new com.swp391.scms.facilities.entity.MembershipPackage();
        premium.setId(2L);
        MembershipSubscription previous = new MembershipSubscription();
        previous.setId(4L);
        previous.setMembershipPackage(basic);
        previous.setStartDate(java.time.LocalDate.of(2026, 9, 1));
        previous.setEndDate(java.time.LocalDate.of(2026, 10, 1));
        previous.setStatus("expired");
        MembershipSubscription upgrade = new MembershipSubscription();
        upgrade.setId(5L);
        upgrade.setMembershipPackage(premium);
        upgrade.setPreviousSubscription(previous);
        upgrade.setStartDate(java.time.LocalDate.of(2026, 10, 1));
        upgrade.setReplacedEndDate(java.time.LocalDate.of(2026, 12, 31));
        upgrade.setStatus("active");
        Payment payment = new Payment();
        payment.setId(11L);
        payment.setStatus("success");
        payment.setAmount(new BigDecimal("900000.00"));
        payment.setSubscriptionId(5L);
        when(paymentRepository.findById(11L)).thenReturn(Optional.of(payment));
        when(membershipSubscriptionRepository.findById(5L)).thenReturn(Optional.of(upgrade));

        paymentService.refundPayment(11L, new com.swp391.scms.finance.dto.PaymentRefundRequest("Đổi ý", null));

        assertEquals("cancelled", upgrade.getStatus());
        assertEquals("active", previous.getStatus());
        assertEquals(java.time.LocalDate.of(2026, 12, 31), previous.getEndDate());
    }

    @Test
    @DisplayName("A renewal paid after its planned start keeps its full length from the payment day")
    void lateRenewalPaymentKeepsFullLength() {
        com.swp391.scms.facilities.entity.MembershipPackage pkg = new com.swp391.scms.facilities.entity.MembershipPackage();
        pkg.setId(1L);
        pkg.setDurationDays(30);
        Member member = new Member();
        member.setUserId(3L);
        MembershipSubscription previous = new MembershipSubscription();
        previous.setId(6L);
        previous.setMember(member);
        previous.setMembershipPackage(pkg);
        previous.setStatus("expired");
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setId(7L);
        renewal.setMember(member);
        renewal.setMembershipPackage(pkg);
        renewal.setPreviousSubscription(previous);
        renewal.setStartDate(java.time.LocalDate.of(2026, 9, 20));
        renewal.setEndDate(java.time.LocalDate.of(2026, 10, 19));
        renewal.setStatus("pending_payment");
        Payment payment = new Payment();
        payment.setId(12L);
        payment.setStatus("pending");
        payment.setSubscriptionId(7L);
        when(paymentRepository.findById(12L)).thenReturn(Optional.of(payment));
        when(membershipSubscriptionRepository.findById(7L)).thenReturn(Optional.of(renewal));
        when(memberRepository.findByUserIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(membershipSubscriptionRepository.findByMemberUserId(3L)).thenReturn(List.of(previous, renewal));

        paymentService.updatePaymentStatus(12L, "success");

        assertEquals("active", renewal.getStatus());
        assertEquals(java.time.LocalDate.of(2026, 10, 1), renewal.getStartDate());
        assertEquals(java.time.LocalDate.of(2026, 10, 30), renewal.getEndDate());
    }

    @Test
    @DisplayName("Paying for an attended enrollment never reopens it; a cancelled one cannot be paid")
    void enrollmentPaymentNeverChangesItsStatus() {
        Payment payment = new Payment();
        payment.setId(13L);
        payment.setStatus("pending");
        payment.setClassEnrollmentId(8L);
        ClassEnrollment attended = new ClassEnrollment();
        attended.setStatus("completed");
        when(paymentRepository.findById(13L)).thenReturn(Optional.of(payment));
        when(classEnrollmentRepository.findById(8L)).thenReturn(Optional.of(attended));

        paymentService.updatePaymentStatus(13L, "success");
        assertEquals("success", payment.getStatus());
        assertEquals("completed", attended.getStatus());

        Payment second = new Payment();
        second.setId(14L);
        second.setStatus("pending");
        second.setClassEnrollmentId(9L);
        ClassEnrollment cancelled = new ClassEnrollment();
        cancelled.setStatus("cancelled");
        when(paymentRepository.findById(14L)).thenReturn(Optional.of(second));
        when(classEnrollmentRepository.findById(9L)).thenReturn(Optional.of(cancelled));
        assertThrows(ConflictException.class, () -> paymentService.updatePaymentStatus(14L, "success"));
        assertEquals("cancelled", cancelled.getStatus());
    }
}
