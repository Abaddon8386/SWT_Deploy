package com.swp391.scms.finance.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.finance.dto.PaymentCreateDto;
import com.swp391.scms.finance.dto.PaymentDto;
import com.swp391.scms.finance.dto.PaymentProcessDto;
import com.swp391.scms.finance.dto.PaymentRefundRequest;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.mapper.PaymentMapper;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Service managing Payments transactions.
 */
@Service
@Transactional
public class PaymentService {
    private final com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard;

    private static final java.util.regex.Pattern RECEIPT_DATA_URL =
            java.util.regex.Pattern.compile("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$");

    private static final Set<String> VALID_STATUSES = Set.of("success", "pending", "failed", "refunded");

    private final PaymentRepository paymentRepository;
    private final MemberRepository memberRepository;
    private final UserRepository userRepository;
    private final MembershipSubscriptionRepository membershipSubscriptionRepository;
    private final ClassEnrollmentRepository classEnrollmentRepository;
    private final PaymentMapper paymentMapper;
    private final Clock clock;

    @Autowired(required = false)
    private EntityManager entityManager;

    @Autowired(required = false)
    private com.swp391.scms.common.i18n.MessageService messageService;

    @Autowired(required = false)
    private com.swp391.scms.facilities.repository.MembershipPackageRepository membershipPackageRepository;

    @Autowired(required = false)
    private InvoiceService invoiceService;

    @Autowired(required = false)
    private com.swp391.scms.scheduling.service.EnrollmentService enrollmentService;

    @Autowired(required = false)
    private com.swp391.scms.coaching.repository.CoachBookingRepository coachBookingRepository;

    @Autowired(required = false)
    private com.swp391.scms.membership.service.EntitlementRevocationService entitlementRevocation;

    public PaymentService(PaymentRepository paymentRepository,
                          MemberRepository memberRepository,
                          UserRepository userRepository,
                          PaymentMapper paymentMapper, Clock clock) {
        this(paymentRepository, memberRepository, userRepository, null, null, paymentMapper, clock);
    }

    public PaymentService(PaymentRepository paymentRepository,
                          MemberRepository memberRepository,
                          UserRepository userRepository,
                          MembershipSubscriptionRepository membershipSubscriptionRepository,
                          ClassEnrollmentRepository classEnrollmentRepository,
                          PaymentMapper paymentMapper, Clock clock) {
        this(paymentRepository, memberRepository, userRepository, membershipSubscriptionRepository, classEnrollmentRepository, paymentMapper, clock, null);
    }

    @Autowired
    public PaymentService(PaymentRepository paymentRepository,
                          MemberRepository memberRepository,
                          UserRepository userRepository,
                          MembershipSubscriptionRepository membershipSubscriptionRepository,
                          ClassEnrollmentRepository classEnrollmentRepository,
                          PaymentMapper paymentMapper, Clock clock, com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard) {
        this.vnpayGuard = vnpayGuard;
        this.paymentRepository = paymentRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.membershipSubscriptionRepository = membershipSubscriptionRepository;
        this.classEnrollmentRepository = classEnrollmentRepository;
        this.paymentMapper = paymentMapper;
        this.clock = clock;
    }

    /** Member requests are pending only; staff retain the existing cashier workflow. */
    public PaymentDto createPayment(AuthenticatedPrincipal principal, PaymentCreateDto dto) {
        if (principal == null) {
            throw new ForbiddenException("FORBIDDEN", "error.forbidden", null, null);
        }
        if ("MEMBER".equalsIgnoreCase(principal.role())) {
            if (!principal.id().equals(dto.getMemberId())) {
                throw new ForbiddenException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null, null);
            }
            if ((dto.getStatus() != null && !"pending".equalsIgnoreCase(dto.getStatus()))
                    || dto.getPaidAt() != null || dto.getReceivedById() != null) {
                throw new ForbiddenException("PAYMENT_MEMBER_PENDING_ONLY", "finance.payment.member_pending_only", null, null);
            }
            validateMemberPaymentTarget(principal.id(), dto);
            if ("cash".equalsIgnoreCase(dto.getMethod())
                    && (dto.getReceiptImage() == null || dto.getReceiptImage().isBlank())) {
                throw new BadRequestException("PAYMENT_RECEIPT_REQUIRED", "finance.payment.receipt_required", null, null);
            }
        } else if (!"CENTER_MANAGER".equalsIgnoreCase(principal.role())
                && !"RECEPTIONIST".equalsIgnoreCase(principal.role())) {
            throw new ForbiddenException("FORBIDDEN", "error.forbidden", null, null);
        }
        return createPayment(dto);
    }

    private void validateMemberPaymentTarget(Long memberId, PaymentCreateDto dto) {
        if (dto.getSubscriptionId() == null && dto.getClassEnrollmentId() == null) {
            throw new BadRequestException("PAYMENT_TARGET_REQUIRED", "finance.payment.target_required", null, null);
        }
        if (dto.getSubscriptionId() != null) {
            MembershipSubscription subscription = membershipSubscriptionRepository.findById(dto.getSubscriptionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", dto.getSubscriptionId()));
            if (subscription.getMember() == null || !memberId.equals(subscription.getMember().getUserId())) {
                throw new ForbiddenException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null, null);
            }
            if (!"pending_payment".equals(subscription.getStatus())) {
                throw new BadRequestException("PAYMENT_SUBSCRIPTION_NOT_PENDING", "finance.payment.subscription_not_pending", null, null);
            }
            BigDecimal expectedPrice = subscription.payableAmount();
            if (dto.getAmount().compareTo(expectedPrice) != 0) {
                throw new BadRequestException("PAYMENT_AMOUNT_MISMATCH", "finance.payment.amount_mismatch",
                        new Object[]{dto.getAmount(), expectedPrice}, null);
            }
        }
        if (dto.getClassEnrollmentId() != null) {
            ClassEnrollment enrollment = classEnrollmentRepository.findById(dto.getClassEnrollmentId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.class_enrollment", dto.getClassEnrollmentId()));
            if (enrollment.getMember() == null || !memberId.equals(enrollment.getMember().getUserId())) {
                throw new ForbiddenException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null, null);
            }
            requirePayableEnrollment(enrollment);
        }
    }

    public PaymentDto createPayment(PaymentCreateDto dto) {
        if (dto.getReceiptImage() != null && !RECEIPT_DATA_URL.matcher(dto.getReceiptImage()).matches()) {
            throw new BadRequestException("PAYMENT_RECEIPT_INVALID", "finance.payment.receipt_invalid", null, null);
        }
        Member member = memberRepository.findById(dto.getMemberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", dto.getMemberId()));

        if (dto.getSubscriptionId() != null && membershipSubscriptionRepository != null) {
            MembershipSubscription target = membershipSubscriptionRepository.findById(dto.getSubscriptionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", dto.getSubscriptionId()));
            if (target.getMember() == null || !member.getUserId().equals(target.getMember().getUserId())) {
                throw new BadRequestException("PAYMENT_MEMBER_MISMATCH",
                        "finance.payment.member_mismatch", null, null);
            }
            memberRepository.findByUserIdForUpdate(member.getUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.member", member.getUserId()));
            if (entityManager != null) entityManager.refresh(target);
            if (!"pending_payment".equals(target.getStatus())) {
                throw new BadRequestException("PAYMENT_SUBSCRIPTION_NOT_PENDING",
                        "finance.payment.subscription_not_pending", null, null);
            }
            if (!paymentRepository.findAllBySubscriptionId(target.getId()).isEmpty()) {
                throw new ConflictException("RENEWAL_PAYMENT_EXISTS",
                        "error.membership.renewal_payment_exists", null, "Payment already exists");
            }
            BigDecimal expectedPrice = target.payableAmount();
            if (expectedPrice == null || dto.getAmount().compareTo(expectedPrice) != 0) {
                throw new BadRequestException("PAYMENT_AMOUNT_MISMATCH", "finance.payment.amount_mismatch",
                        new Object[]{dto.getAmount(), expectedPrice}, "Payment amount mismatch");
            }
        }

        if (vnpayGuard != null && dto.getClassEnrollmentId() != null) {
            paymentRepository.findByClassEnrollmentId(dto.getClassEnrollmentId()).ifPresent(p -> vnpayGuard.payment(p.getId()));
        }
        User receiver = null;
        if (dto.getReceivedById() != null) {
            receiver = userRepository.findByIdAndDeletedAtIsNull(dto.getReceivedById())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.cashier", dto.getReceivedById()));
        }

        Payment payment = paymentMapper.toEntity(dto);
        payment.setMember(member);
        payment.setReceivedBy(receiver);

        if (dto.getMethod() != null) {
            payment.setMethod(dto.getMethod().toLowerCase(Locale.ROOT));
        }
        String initialStatus = dto.getStatus() != null ? dto.getStatus().toLowerCase(Locale.ROOT) : "pending";
        if (dto.getSubscriptionId() != null && !"pending".equals(initialStatus)) {
            throw new BadRequestException("PAYMENT_SUBSCRIPTION_NOT_PENDING",
                    "finance.payment.subscription_not_pending", null, "Confirm payment through the status flow");
        }
        payment.setStatus(initialStatus);
        markPaidIfSuccess(payment, initialStatus);

        Payment saved = paymentRepository.save(payment);
        return paymentMapper.toDto(saved);
    }

    @Transactional(readOnly = true)
    public PaymentDto getPaymentById(Long id) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.payment", id));
        PaymentDto dto = paymentMapper.toDto(payment);
        dto.setReceiptImage(payment.getReceiptImage());
        return dto;
    }

    @Transactional(readOnly = true)
    public List<PaymentDto> getPaymentsByMemberId(Long memberId) {
        if (!memberRepository.existsById(memberId)) {
            throw new ResourceNotFoundException("resource.member", memberId);
        }
        List<Payment> payments = paymentRepository.findByMemberUserId(memberId);
        return paymentMapper.toDtoList(payments);
    }

    public PaymentDto updatePaymentStatus(Long id, String status) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.payment", id));

        lockSubscriptionMember(payment);
        if (vnpayGuard != null) vnpayGuard.payment(payment.getId());
        if (status == null || !VALID_STATUSES.contains(status.toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("INVALID_PAYMENT_STATUS", "finance.payment.invalid_status", new Object[]{status}, null);
        }
        String normalizedStatus = status.toLowerCase(Locale.ROOT);
        String currentStatus = payment.getStatus() != null ? payment.getStatus().toLowerCase(Locale.ROOT) : "pending";

        if (payment.getSubscriptionId() != null && "failed".equals(currentStatus) && "pending".equals(normalizedStatus)
                && membershipSubscriptionRepository != null) {
            MembershipSubscription target = membershipSubscriptionRepository.findById(payment.getSubscriptionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", payment.getSubscriptionId()));
            if (!"pending_payment".equalsIgnoreCase(target.getStatus())) {
                throw new ConflictException("PAYMENT_SUBSCRIPTION_NOT_PENDING", "finance.payment.subscription_not_pending", null, null);
            }
        }

        if (!currentStatus.equals(normalizedStatus)) {
            boolean allowed = switch (currentStatus) {
                case "pending" -> "success".equals(normalizedStatus) || "failed".equals(normalizedStatus);
                case "failed" -> "pending".equals(normalizedStatus);
                // Refunds go through refundPayment (manager-only, audited, with reason).
                default -> false;
            };
            if (!allowed) {
                throw new BadRequestException("INVALID_STATUS_TRANSITION", "finance.payment.invalid_transition",
                        new Object[]{currentStatus, normalizedStatus}, null);
            }
            if ("pending".equals(currentStatus) && "success".equals(normalizedStatus)
                    && payment.getSubscriptionId() != null && membershipSubscriptionRepository != null) {
                MembershipSubscription target = membershipSubscriptionRepository.findById(payment.getSubscriptionId())
                        .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", payment.getSubscriptionId()));
                if (!"pending_payment".equals(target.getStatus())) {
                    throw new ConflictException("PAYMENT_SUBSCRIPTION_NOT_PENDING",
                            "finance.payment.subscription_not_pending", null, null);
                }
            }
            payment.setStatus(normalizedStatus);
            markPaidIfSuccess(payment, normalizedStatus);
            if ("pending".equals(currentStatus) && "failed".equals(normalizedStatus)) {
                cancelFailedRenewal(payment);
            }
            if ("pending".equals(currentStatus) && "success".equals(normalizedStatus)) {
                activateLinkedTargetsOnSuccess(payment);
            }
        }

        PaymentDto dto = paymentMapper.toDto(payment);
        if ("pending".equals(currentStatus) && "success".equals(normalizedStatus)) {
            attachAutoIssuedInvoiceNumber(payment, dto);
        }
        return dto;
    }

    public PaymentDto processPayment(PaymentProcessDto dto) {
        if (dto.getSubscriptionId() == null && dto.getPackageId() == null && dto.getClassEnrollmentId() == null) {
            throw new BadRequestException("PAYMENT_TARGET_REQUIRED", "finance.payment.target_required", null,
                    "Target subscription or enrollment is required");
        }

        Member member = memberRepository.findByUserIdForUpdate(dto.getMemberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", dto.getMemberId()));

        if (dto.getSubscriptionId() != null && membershipSubscriptionRepository != null) {
            MembershipSubscription target = membershipSubscriptionRepository.findById(dto.getSubscriptionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", dto.getSubscriptionId()));
            if (entityManager != null) entityManager.refresh(target);
            if (target.getMember() == null || !member.getUserId().equals(target.getMember().getUserId())) {
                throw new BadRequestException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null, null);
            }
            if (dto.getPackageId() != null && (target.getMembershipPackage() == null
                    || !dto.getPackageId().equals(target.getMembershipPackage().getId()))) {
                throw new BadRequestException("PAYMENT_PACKAGE_MISMATCH", "error.membership.pos_package_mismatch",
                        null, "Checkout package does not match the subscription");
            }
        }

        if (vnpayGuard != null && dto.getClassEnrollmentId() != null) {
            paymentRepository.findByClassEnrollmentId(dto.getClassEnrollmentId()).ifPresent(p -> vnpayGuard.payment(p.getId()));
        }
        User receiver = null;
        if (dto.getReceivedById() != null) {
            receiver = userRepository.findByIdAndDeletedAtIsNull(dto.getReceivedById())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.cashier", dto.getReceivedById()));
        }

        Long resolvedSubscriptionId = dto.getSubscriptionId();
        Payment pendingToSettle = null;

        if (resolvedSubscriptionId == null && dto.getPackageId() != null
                && membershipPackageRepository != null && membershipSubscriptionRepository != null) {
            com.swp391.scms.facilities.entity.MembershipPackage pkg = membershipPackageRepository.findById(dto.getPackageId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.package", dto.getPackageId()));
            if (pkg.getStatus() != null && !"active".equalsIgnoreCase(pkg.getStatus())) {
                throw new BadRequestException("MEMBERSHIP_PACKAGE_INACTIVE", "membership.package.inactive",
                        new Object[]{pkg.getId()}, "Membership package is inactive");
            }
            List<MembershipSubscription> history = membershipSubscriptionRepository.findByMemberUserId(member.getUserId());
            if (history == null) history = List.of();
            if (history.stream().anyMatch(sub -> "frozen".equalsIgnoreCase(sub.getStatus()))) {
                throw new ConflictException("MEMBERSHIP_FROZEN_PAYMENT",
                        "error.membership.frozen_payment", null, "Membership on hold cannot be activated by payment");
            }
            if (history.stream().anyMatch(sub -> sub.getPreviousSubscription() != null
                    && "pending_payment".equals(sub.getStatus()))) {
                throw new ConflictException("RENEWAL_REQUIRES_SUBSCRIPTION_ID",
                        "error.membership.pos_renewal_requires_subscription", null,
                        "Use the checked subscription renewal for checkout");
            }
            java.time.LocalDate today = java.time.LocalDate.now(clock);
            if (history.stream().anyMatch(sub -> ("active".equals(sub.getStatus()) || "expired".equals(sub.getStatus()))
                    && (sub.getEndDate() == null || !sub.getEndDate().isBefore(today)))) {
                throw new ConflictException("MEMBERSHIP_ALREADY_ACTIVE",
                        "error.membership.already_active", null, "Member already has a paid period");
            }
            List<MembershipSubscription> pendingSubs = history.stream()
                    .filter(sub -> "pending_payment".equals(sub.getStatus())).toList();
            if (pendingSubs.size() > 1) {
                throw new ConflictException("MEMBERSHIP_PENDING_EXISTS",
                        "error.membership.pending_exists", null, "Multiple pending subscriptions need review");
            }
            if (!pendingSubs.isEmpty()) {
                MembershipSubscription pendingSub = pendingSubs.get(0);
                if (vnpayGuard != null) vnpayGuard.subscription(pendingSub.getId());
                if (pendingSub.getMembershipPackage() == null
                        || !pkg.getId().equals(pendingSub.getMembershipPackage().getId())) {
                    throw new BadRequestException("PAYMENT_PACKAGE_MISMATCH",
                            "error.membership.pos_package_mismatch", null, "Checkout package does not match the subscription");
                }
                pendingToSettle = payableExistingPayment(member.getUserId(), pendingSub.getId(), dto.getAmount(), dto.getClassEnrollmentId());
                validateCheckoutAmount(dto.getAmount(), pendingSub.payableAmount(), pendingToSettle);
                pendingSub.setCreatedBy(receiver);
                activateSubscription(pendingSub);
                resolvedSubscriptionId = pendingSub.getId();
            } else {
                validateCheckoutAmount(dto.getAmount(), pkg.getPrice(), null);
                MembershipSubscription sub = new MembershipSubscription();
                sub.setMember(member);
                sub.setMembershipPackage(pkg);
                sub.setStartDate(today);
                sub.setEndDate(today.plusDays(Math.max(1, pkg.getDurationDays()) - 1L));
                sub.setStatus("active");
                sub.setCreatedBy(receiver);
                sub.setCreatedAt(LocalDateTime.now(clock));
                sub.setUpdatedAt(LocalDateTime.now(clock));
                MembershipSubscription savedSub = membershipSubscriptionRepository.save(sub);
                Long subId = savedSub != null && savedSub.getId() != null ? savedSub.getId() : sub.getId();
                sub.setQrCode(UUID.randomUUID().toString());
                membershipSubscriptionRepository.save(sub);
                resolvedSubscriptionId = subId;
            }
        } else if (resolvedSubscriptionId != null && membershipSubscriptionRepository != null) {
            if (vnpayGuard != null) vnpayGuard.subscription(resolvedSubscriptionId);
            final Long targetSubId = resolvedSubscriptionId;
            MembershipSubscription subscription = membershipSubscriptionRepository.findById(targetSubId)
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", targetSubId));

            if (!subscription.getMember().getUserId().equals(member.getUserId())) {
                throw new BadRequestException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null,
                        "Subscription does not belong to member");
            }

            if (subscription.getStatus() != null && !"pending_payment".equalsIgnoreCase(subscription.getStatus())) {
                throw new ConflictException("PAYMENT_SUBSCRIPTION_NOT_PENDING", "finance.payment.subscription_not_pending",
                        null, "Subscription is not in pending_payment state");
            }

            if (subscription.getMembershipPackage() != null) {
                if (subscription.getMembershipPackage().getStatus() != null
                        && !"active".equalsIgnoreCase(subscription.getMembershipPackage().getStatus())) {
                    throw new BadRequestException("MEMBERSHIP_PACKAGE_INACTIVE", "membership.package.inactive",
                            new Object[]{subscription.getMembershipPackage().getId()}, "Membership package is inactive");
                }
            }

            pendingToSettle = payableExistingPayment(member.getUserId(), subscription.getId(), dto.getAmount(), dto.getClassEnrollmentId());
            if (subscription.getMembershipPackage() != null) {
                validateCheckoutAmount(dto.getAmount(), subscription.payableAmount(), pendingToSettle);
            }
            activateSubscription(subscription);
        }

        if (dto.getClassEnrollmentId() != null && classEnrollmentRepository != null) {
            ClassEnrollment enrollment = classEnrollmentRepository.findById(dto.getClassEnrollmentId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.class_enrollment", dto.getClassEnrollmentId()));

            if (!enrollment.getMember().getUserId().equals(member.getUserId())) {
                throw new BadRequestException("PAYMENT_MEMBER_MISMATCH", "finance.payment.member_mismatch", null,
                        "Enrollment does not belong to member");
            }

            requirePayableEnrollment(enrollment);
        }

        if (pendingToSettle != null) {
            pendingToSettle.setStatus("success");
            pendingToSettle.setPaidAt(LocalDateTime.now(clock));
            pendingToSettle.setReceivedBy(receiver);
            pendingToSettle.setMethod(dto.getMethod() != null ? dto.getMethod().toLowerCase(Locale.ROOT) : "cash");
            pendingToSettle.setNote(dto.getNote());
            Payment savedPending = paymentRepository.save(pendingToSettle);
            Payment targetPayment = savedPending != null ? savedPending : pendingToSettle;
            PaymentDto resultDto = paymentMapper.toDto(targetPayment);
            attachAutoIssuedInvoiceNumber(targetPayment, resultDto);
            return resultDto;
        }

        Payment payment = new Payment();
        payment.setMember(member);
        payment.setSubscriptionId(resolvedSubscriptionId);
        payment.setClassEnrollmentId(dto.getClassEnrollmentId());
        payment.setAmount(dto.getAmount());
        payment.setMethod(dto.getMethod() != null ? dto.getMethod().toLowerCase(Locale.ROOT) : "cash");
        payment.setStatus("success");
        payment.setPaidAt(LocalDateTime.now(clock));
        payment.setReceivedBy(receiver);
        payment.setNote(dto.getNote());

        Payment saved = paymentRepository.save(payment);
        Payment targetPayment = saved != null ? saved : payment;
        PaymentDto resultDto = paymentMapper.toDto(targetPayment);
        attachAutoIssuedInvoiceNumber(targetPayment, resultDto);
        return resultDto;
    }

    @Audited(action = "PAYMENT_REFUND", entity = "payments")
    public PaymentDto refundPayment(Long paymentId, PaymentRefundRequest request) {
        if (vnpayGuard != null) vnpayGuard.refund(paymentId);
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.payment", paymentId));

        String currentStatus = payment.getStatus() != null ? payment.getStatus().toLowerCase(Locale.ROOT) : "";
        if (!"success".equals(currentStatus)) {
            throw new BadRequestException("CANNOT_REFUND_PAYMENT", "finance.payment.cannot_refund",
                    new Object[]{currentStatus}, "Only successful payments can be refunded");
        }

        BigDecimal alreadyRefunded = payment.getRefundedAmount() != null ? payment.getRefundedAmount() : BigDecimal.ZERO;
        BigDecimal refundable = payment.getAmount().subtract(alreadyRefunded);
        BigDecimal refundAmount = request.getRefundAmount() != null ? request.getRefundAmount() : refundable;
        if (refundAmount.compareTo(BigDecimal.ZERO) <= 0 || refundAmount.compareTo(refundable) > 0) {
            throw new BadRequestException("INVALID_REFUND_AMOUNT", "finance.payment.invalid_refund_amount",
                    new Object[]{refundAmount, refundable}, "Invalid refund amount");
        }

        BigDecimal totalRefunded = alreadyRefunded.add(refundAmount);
        boolean fullRefund = totalRefunded.compareTo(payment.getAmount()) == 0;
        payment.setRefundedAmount(totalRefunded);
        // A partial refund keeps the payment successful and the membership running; only the full amount ends it.
        if (fullRefund) {
            payment.setStatus("refunded");
        }
        String refundNote = resolveRefundNote(refundAmount, request.getReason());
        String combinedNote = (payment.getNote() != null && !payment.getNote().isBlank())
                ? payment.getNote() + " | " + refundNote
                : refundNote;
        if (combinedNote.length() > 255) {
            combinedNote = combinedNote.substring(0, 255);
        }
        payment.setNote(combinedNote);

        if (fullRefund) {
            cancelLinkedTargetsOnRefund(payment, request.getReason());
        }

        Payment saved = paymentRepository.save(payment);
        return paymentMapper.toDto(saved);
    }

    private void cancelLinkedTargetsOnRefund(Payment payment, String cancelReason) {
        if (payment.getSubscriptionId() != null && membershipSubscriptionRepository != null) {
            membershipSubscriptionRepository.findById(payment.getSubscriptionId()).ifPresent(sub -> {
                sub.setStatus("cancelled");
                sub.setHoldStatus(null);
                sub.setUpdatedAt(LocalDateTime.now(clock));
                membershipSubscriptionRepository.save(sub);
                restorePeriodReplacedByUpgrade(sub);
                cancelFutureBookingsWithoutEntitlement(sub, cancelReason);
            });
        }

        if (payment.getClassEnrollmentId() != null && classEnrollmentRepository != null) {
            classEnrollmentRepository.findById(payment.getClassEnrollmentId()).ifPresent(enrollment -> {
                enrollment.setStatus("cancelled");
                if (cancelReason != null) {
                    enrollment.setCancelReason(cancelReason);
                }
                enrollment.setCancelledAt(LocalDateTime.now(clock));
                classEnrollmentRepository.save(enrollment);
            });
        }
    }

    /**
     * Refunding an upgrade gives back the period it replaced: the old package returns to active with the expiry
     * it had before the upgrade cut it to the upgrade day, unless that date has already passed.
     */
    private void restorePeriodReplacedByUpgrade(MembershipSubscription refunded) {
        MembershipSubscription previous = refunded.getPreviousSubscription();
        if (previous == null || !isUpgradeOf(refunded, previous) || !"expired".equalsIgnoreCase(previous.getStatus())) {
            return;
        }
        java.time.LocalDate originalEnd = refunded.getReplacedEndDate();
        if (originalEnd == null && previous.getStartDate() != null && previous.getMembershipPackage() != null
                && previous.getEndDate() != null && previous.getEndDate().equals(refunded.getStartDate())) {
            // Upgrades activated before replacedEndDate existed: rebuild the term from the package length.
            originalEnd = previous.getStartDate().plusDays(Math.max(1, previous.getMembershipPackage().getDurationDays()) - 1L);
        }
        java.time.LocalDate today = java.time.LocalDate.now(clock);
        if (originalEnd == null || originalEnd.isBefore(today)) {
            return;
        }
        previous.setStatus("active");
        previous.setEndDate(originalEnd);
        previous.setUpdatedAt(LocalDateTime.now(clock));
        membershipSubscriptionRepository.save(previous);
    }

    private static boolean isUpgradeOf(MembershipSubscription subscription, MembershipSubscription previous) {
        return subscription.getMembershipPackage() != null && previous.getMembershipPackage() != null
                && previous.getMembershipPackage().getId() != null
                && !previous.getMembershipPackage().getId().equals(subscription.getMembershipPackage().getId());
    }

    /** A refunded membership grants no booking rights, unless another paid period still covers the member. */
    private void cancelFutureBookingsWithoutEntitlement(MembershipSubscription refunded, String reason) {
        if (refunded.getMember() == null) return;
        Long memberId = refunded.getMember().getUserId();
        if (entitlementRevocation != null) {
            // Checks every booking date, so a gap before a later renewal is released too.
            entitlementRevocation.revokeUncoveredBookings(memberId, reason != null && !reason.isBlank() ? reason : "Refunded membership");
            return;
        }
        java.time.LocalDate today = java.time.LocalDate.now(clock);
        boolean stillCovered = membershipSubscriptionRepository.findByMemberUserId(memberId).stream()
                .anyMatch(other -> !other.getId().equals(refunded.getId())
                        && ("active".equalsIgnoreCase(other.getStatus()) || "frozen".equalsIgnoreCase(other.getStatus()))
                        && other.getEndDate() != null && !other.getEndDate().isBefore(today));
        if (stillCovered) return;
        String cancelReason = reason != null && !reason.isBlank() ? reason : "Refunded membership";
        if (cancelReason.length() > 255) cancelReason = cancelReason.substring(0, 255);
        if (enrollmentService != null) {
            enrollmentService.cancelFutureEnrollmentsForMember(memberId, cancelReason);
        }
        if (coachBookingRepository != null) {
            for (var booking : coachBookingRepository.findFutureConfirmedByMember(memberId, today)) {
                booking.setStatus("cancelled");
                booking.setCancelledAt(LocalDateTime.now(clock));
                booking.setCancelReason(cancelReason);
            }
        }
    }

    private void attachAutoIssuedInvoiceNumber(Payment payment, PaymentDto dto) {
        if (invoiceService == null || payment == null || payment.getId() == null || dto == null) {
            return;
        }
        if (dto.getInvoiceNumber() != null && !dto.getInvoiceNumber().isBlank()) {
            return;
        }
        try {
            com.swp391.scms.finance.dto.InvoiceDto issued = invoiceService.autoIssueInvoiceForPayment(payment.getId());
            if (issued != null && issued.getInvoiceNumber() != null) {
                dto.setInvoiceNumber(issued.getInvoiceNumber());
            }
        } catch (Exception ignored) {
            // Best-effort auto-issue in 1-step checkout flow
        }
    }

    private void lockSubscriptionMember(Payment payment) {
        if (payment.getSubscriptionId() == null || membershipSubscriptionRepository == null) return;
        MembershipSubscription target = membershipSubscriptionRepository.findById(payment.getSubscriptionId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", payment.getSubscriptionId()));
        memberRepository.findByUserIdForUpdate(target.getMember().getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", target.getMember().getUserId()));
        if (entityManager != null) {
            entityManager.refresh(payment);
            entityManager.refresh(target);
        }
    }
    private void cancelFailedRenewal(Payment payment) {
        if (payment.getSubscriptionId() == null || membershipSubscriptionRepository == null) return;
        membershipSubscriptionRepository.findById(payment.getSubscriptionId()).ifPresent(subscription -> {
            if (subscription.getPreviousSubscription() != null
                    && "pending_payment".equals(subscription.getStatus())) {
                // A failed renewal has never granted rights; allow a fresh request on its paid parent.
                subscription.setStatus("cancelled");
                subscription.setUpdatedAt(LocalDateTime.now(clock));
                membershipSubscriptionRepository.save(subscription);
            }
        });
    }

    private void activateLinkedTargetsOnSuccess(Payment payment) {
        if (payment.getSubscriptionId() != null && membershipSubscriptionRepository != null) {
            membershipSubscriptionRepository.findById(payment.getSubscriptionId()).ifPresent(this::activateSubscription);
        }
        if (payment.getClassEnrollmentId() != null && classEnrollmentRepository != null) {
            classEnrollmentRepository.findById(payment.getClassEnrollmentId())
                    .ifPresent(this::requirePayableEnrollment);
        }
    }

    /** Paying never changes an enrollment; a booked or attended one may be paid, a cancelled one may not. */
    private void requirePayableEnrollment(ClassEnrollment enrollment) {
        if ("cancelled".equalsIgnoreCase(enrollment.getStatus())) {
            throw new ConflictException("PAYMENT_ENROLLMENT_NOT_PAYABLE", "finance.payment.enrollment_not_payable",
                    new Object[]{enrollment.getStatus()}, null);
        }
    }

    private void activateSubscription(MembershipSubscription subscription) {
        if (!"pending_payment".equalsIgnoreCase(subscription.getStatus())) {
            throw new ConflictException("PAYMENT_SUBSCRIPTION_NOT_PENDING", "finance.payment.subscription_not_pending", null, null);
        }
        java.time.LocalDate today = java.time.LocalDate.now(clock);
        if (membershipSubscriptionRepository.findByMemberUserId(
                subscription.getMember().getUserId()).stream()
                .anyMatch(item -> "frozen".equalsIgnoreCase(item.getStatus()))) {
            throw new ConflictException("MEMBERSHIP_FROZEN_PAYMENT",
                    "error.membership.frozen_payment", null,
                    "Membership on hold cannot be activated by payment");
        }
        MembershipSubscription previous = subscription.getPreviousSubscription();
        if (previous != null && ("cancelled".equalsIgnoreCase(previous.getStatus())
                || "frozen".equalsIgnoreCase(previous.getStatus()))) {
            throw new ConflictException("PAYMENT_PREVIOUS_UNAVAILABLE", "finance.payment.previous_unavailable", null, null);
        }
        boolean isUpgrade = previous != null
                && subscription.getMembershipPackage() != null
                && previous.getMembershipPackage() != null
                && previous.getMembershipPackage().getId() != null
                && !previous.getMembershipPackage().getId().equals(subscription.getMembershipPackage().getId());

        if (isUpgrade && membershipSubscriptionRepository.findByMemberUserId(
                subscription.getMember().getUserId()).stream()
                .anyMatch(item -> item.getPreviousSubscription() != null
                        && ("active".equalsIgnoreCase(item.getStatus())
                            || "expired".equalsIgnoreCase(item.getStatus()))
                        && item.getStartDate() != null && item.getStartDate().isAfter(today))) {
            throw new ConflictException("MEMBERSHIP_FUTURE_PAID_RENEWAL",
                    "error.membership.future_paid_renewal", null,
                    "Paid future renewal requires manager review");
        }
        // A prorated quote credits the old period up to its quote day, so the new period runs from that day too and
        // days used between quoting and paying are not credited twice. Legacy quotes (no credit) start on payment day.
        java.time.LocalDate upgradeStart = isUpgrade ? proratedUpgradeStart(subscription, previous, today) : today;
        if (isUpgrade && "active".equalsIgnoreCase(previous.getStatus())) {
            previous.setStatus("expired");
            previous.setHoldStatus(null);
            if (previous.getEndDate() != null && previous.getEndDate().isAfter(upgradeStart)) {
                subscription.setReplacedEndDate(previous.getEndDate());
                previous.setEndDate(upgradeStart);
            }
            previous.setUpdatedAt(LocalDateTime.now(clock));
            membershipSubscriptionRepository.save(previous);
        }

        if ((subscription.getPreviousSubscription() == null || isUpgrade)
                && subscription.getMembershipPackage() != null
                && subscription.getMembershipPackage().getDurationDays() > 0
                && (isUpgrade || subscription.getStartDate() == null || subscription.getStartDate().isBefore(today))) {
            int durationDays = Math.max(1, subscription.getMembershipPackage().getDurationDays());
            java.time.LocalDate start = isUpgrade ? upgradeStart : today;
            subscription.setStartDate(start);
            subscription.setEndDate(start.plusDays(durationDays - 1L));
        } else if (subscription.getPreviousSubscription() != null && !isUpgrade
                && subscription.getStartDate() != null && subscription.getEndDate() != null
                && subscription.getStartDate().isBefore(today)) {
            // A renewal paid after its planned start keeps its full length instead of losing the unpaid days.
            long lengthDays = java.time.temporal.ChronoUnit.DAYS.between(subscription.getStartDate(), subscription.getEndDate());
            subscription.setStartDate(today);
            subscription.setEndDate(today.plusDays(lengthDays));
        }
        subscription.setStatus("active");
        if (subscription.getQrCode() == null || subscription.getQrCode().isBlank()) {
            subscription.setQrCode(UUID.randomUUID().toString());
        }
        subscription.setUpdatedAt(LocalDateTime.now(clock));
        membershipSubscriptionRepository.save(subscription);
    }

    /**
     * Start of a paid upgrade: its quote day when the charge was prorated, never before the replaced period began
     * nor after today; otherwise (quotes made before proration existed) the payment day.
     */
    private static java.time.LocalDate proratedUpgradeStart(MembershipSubscription upgrade, MembershipSubscription previous,
                                                            java.time.LocalDate today) {
        java.time.LocalDate quotedOn = upgrade.getStartDate();
        if (upgrade.getCreditApplied() == null || quotedOn == null || quotedOn.isAfter(today)) return today;
        if (previous.getStartDate() != null && quotedOn.isBefore(previous.getStartDate())) return previous.getStartDate();
        return quotedOn;
    }

    private void validateCheckoutAmount(BigDecimal amount, BigDecimal payable, Payment existing) {
        // A stored pending payment keeps its original amount after catalog repricing.
        BigDecimal expected = existing != null ? existing.getAmount() : payable;
        if (expected != null && amount.compareTo(expected) != 0) {
            throw new BadRequestException("PAYMENT_AMOUNT_MISMATCH", "finance.payment.amount_mismatch",
                    new Object[]{amount, expected}, null);
        }
    }

    private Payment payableExistingPayment(Long memberId, Long subscriptionId, BigDecimal amount, Long enrollmentId) {
        List<Payment> related = paymentRepository.findAllBySubscriptionId(subscriptionId);
        if (related == null || related.isEmpty()) return null;
        List<Payment> unsettled = related.stream().filter(payment ->
                "pending".equalsIgnoreCase(payment.getStatus()) || "success".equalsIgnoreCase(payment.getStatus())).toList();
        if (unsettled.isEmpty()) return null;
        if (unsettled.size() != 1 || !"pending".equalsIgnoreCase(unsettled.get(0).getStatus())
                || unsettled.get(0).getMember() == null
                || !memberId.equals(unsettled.get(0).getMember().getUserId())
                || unsettled.get(0).getAmount().compareTo(amount) != 0) {
            throw new ConflictException("PAYMENT_ALREADY_EXISTS", "finance.payment.already_exists", null, null);
        }
        if (enrollmentId != null) {
            throw new BadRequestException("PAYMENT_TARGET_REQUIRED", "finance.payment.target_required", null, null);
        }
        return unsettled.get(0);
    }

    private String resolveRefundNote(BigDecimal refundAmount, String reason) {
        String fallback = "[HOÀN TIỀN: " + refundAmount + " VNĐ] Lý do: " + reason;
        if (messageService == null) {
            return fallback;
        }
        String resolved = messageService.getMessage("finance.payment.refund_note", new Object[]{refundAmount, reason});
        return (resolved == null || resolved.isBlank() || "finance.payment.refund_note".equals(resolved))
                ? fallback
                : resolved;
    }

    private void markPaidIfSuccess(Payment payment, String status) {
        if ("success".equals(status) && payment.getPaidAt() == null) {
            payment.setPaidAt(LocalDateTime.now(clock));
        }
    }
}
