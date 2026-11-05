package com.swp391.scms.membership.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.CatalogSeeder;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.dto.SubscriptionRequests;
import com.swp391.scms.membership.dto.SubscriptionResponses.HoldRequestDto;
import com.swp391.scms.membership.dto.SubscriptionResponses.SubscriptionDto;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipCancellationRequestRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Service managing membership subscriptions (SCRUM-71).
 */
@Service
public class MembershipSubscriptionService {

    private static final String STATUS_PENDING_PAYMENT = "pending_payment";
    private static final String STATUS_ACTIVE = "active";
    private static final String STATUS_FROZEN = "frozen";
    private static final String STATUS_EXPIRED = "expired";
    private static final String PACKAGE_ACTIVE = "active";

    private static final String HOLD_PENDING = "PENDING";
    private static final String HOLD_APPROVED = "APPROVED";
    /** Longest a membership may stay frozen; later it resumes on its own with this many days added back. */
    public static final int MAX_HOLD_DAYS = 90;
    private static final String HOLD_REJECTED = "REJECTED";

    private final MembershipSubscriptionRepository subscriptions;
    private final MembershipPackageRepository packages;
    private final MemberRepository members;
    private final Clock clock;
    private final DynamicQrService dynamicQrService;
    private final EnrollmentService enrollmentService;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;

    @Autowired(required = false)
    private PaymentRepository paymentRepository;

    @Autowired(required = false)
    private com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard;

    @Autowired(required = false)
    private EntitlementRevocationService entitlementRevocation;

    @Autowired(required = false)
    private MembershipCancellationRequestRepository cancellationRequests;

    @Autowired(required = false)
    private EntityManager entityManager;

    @Autowired(required = false)
    private SubscriptionValueCalculator valueCalculator;

    @Autowired(required = false)
    private com.swp391.scms.membership.repository.MemberTrialRedemptionRepository trialRedemptionRepository;

    public void setTrialRedemptionRepository(com.swp391.scms.membership.repository.MemberTrialRedemptionRepository repo) {
        this.trialRedemptionRepository = repo;
    }

    public MembershipSubscriptionService(MembershipSubscriptionRepository subscriptions,
            MembershipPackageRepository packages,
            MemberRepository members,
            Clock clock) {
        this(subscriptions, packages, members, clock, new DynamicQrService(), null, null, null, null);
    }

    public MembershipSubscriptionService(MembershipSubscriptionRepository subscriptions,
            MembershipPackageRepository packages,
            MemberRepository members,
            Clock clock,
            DynamicQrService dynamicQrService) {
        this(subscriptions, packages, members, clock, dynamicQrService, null, null, null, null);
    }

    @Autowired
    public MembershipSubscriptionService(MembershipSubscriptionRepository subscriptions,
            MembershipPackageRepository packages,
            MemberRepository members,
            Clock clock,
            @Autowired(required = false) DynamicQrService dynamicQrService,
            @Autowired(required = false) EnrollmentService enrollmentService,
            @Autowired(required = false) UserRepository userRepository,
            @Autowired(required = false) NotificationService notificationService,
            @Autowired(required = false) MessageService messageService) {
        this.subscriptions = subscriptions;
        this.packages = packages;
        this.members = members;
        this.clock = clock;
        this.dynamicQrService = dynamicQrService != null ? dynamicQrService : new DynamicQrService();
        this.enrollmentService = enrollmentService;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.messageService = messageService;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    /**
     * SCRUM-71 BR-01, BR-02, BR-04:
     * Tạo subscription mới ở trạng thái pending_payment.
     * Chỉ mua gói có status active.
     * Một hội viên chỉ có tối đa 1 subscription active tại một thời điểm.
     */
    @Transactional
    public SubscriptionDto create(AuthenticatedPrincipal principal, SubscriptionRequests.Create request) {
        Member member = findMember(principal.id());
        MembershipPackage membershipPackage = findActivePackage(request.packageId());
        members.findByUserIdForUpdate(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", principal.id()));
        if (subscriptions.existsByMemberUserIdAndStatus(member.getUserId(), STATUS_FROZEN)) {
            throw new ConflictException("MEMBERSHIP_FROZEN_EXISTS", "error.membership.frozen_exists", null, null);
        }

        LocalDate today = LocalDate.now(clock);
        if (subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(member.getUserId(), STATUS_ACTIVE,
                today)) {
            throw new ConflictException(
                    "MEMBERSHIP_ALREADY_ACTIVE",
                    "error.membership.already_active",
                    null,
                    "Member already has an active subscription");
        }
        if (subscriptions.existsByMemberUserIdAndStatus(member.getUserId(), STATUS_PENDING_PAYMENT)) {
            throw new ConflictException(
                    "MEMBERSHIP_PENDING_EXISTS",
                    "error.membership.pending_exists",
                    null,
                    "Member already has a pending payment subscription");
        }

        // Kiểm tra KYC bắt buộc trước khi đăng ký gói tập đầu tiên
        if (trialRedemptionRepository != null) {
            boolean hasPriorSubscriptions = subscriptions.existsByMemberUserId(member.getUserId());
            boolean hasApprovedTrial = trialRedemptionRepository.findByMemberUserId(member.getUserId())
                    .map(t -> com.swp391.scms.membership.entity.MemberTrialRedemption.STATUS_APPROVED.equalsIgnoreCase(t.getStatus()))
                    .orElse(false);
            boolean isIdentityVerified = Boolean.TRUE.equals(member.getIdentityVerified()) || hasApprovedTrial;

            if (!hasPriorSubscriptions && !isIdentityVerified) {
                throw new BadRequestException("MEMBERSHIP_KYC_REQUIRED", "error.membership.kyc_required", null,
                        msg("error.membership.kyc_required"));
            }
        }

        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(membershipPackage);
        int durationDays = Math.max(1, membershipPackage.getDurationDays());
        subscription.setStartDate(today);
        subscription.setEndDate(today.plusDays(durationDays - 1L));
        // Giá chốt lúc tạo yêu cầu, giống báo giá nâng cấp: Quản lý đổi giá sau đó không làm đổi số tiền phải thu.
        subscription.setQuotedPrice(membershipPackage.getPrice());
        subscription.setStatus(STATUS_PENDING_PAYMENT);
        subscription.setCreatedAt(LocalDateTime.now(clock));
        subscription.setUpdatedAt(LocalDateTime.now(clock));

        return toDto(subscriptions.saveAndFlush(subscription));
    }

    /**
     * SCRUM-71 BR-05, BR-06:
     * Gia hạn tạo subscription mới liên kết previous_subscription_id ở
     * pending_payment.
     * Nếu gói cũ còn hạn thì start_date mới = end_date cũ + 1 ngày (không mất ngày
     * đã mua).
     * Nếu đã hết hạn thì bắt đầu từ ngày hôm nay.
     */
    @Transactional
    public SubscriptionDto renew(AuthenticatedPrincipal principal, Long previousId) {
        MembershipSubscription requested = subscriptions.findById(previousId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", previousId));
        ensureOwner(requested, principal);
        return renewForOwner(requested, principal.id(), previousId);
    }

    @Transactional(readOnly = true)
    public List<SubscriptionDto> renewalCandidatesForStaff(AuthenticatedPrincipal principal, Long memberId) {
        ensureReceptionStaff(principal);
        Member member = findMember(memberId);
        if (member.getUser() == null || member.getUser().getDeletedAt() != null) {
            throw new ResourceNotFoundException("resource.member", memberId);
        }
        return subscriptions.findByMemberUserIdOrderByCreatedAtDesc(memberId).stream()
                .filter(this::isPaidPeriod).map(this::toDto).toList();
    }

    @Transactional
    public SubscriptionDto renewForMember(AuthenticatedPrincipal principal, Long memberId, Long previousId) {
        ensureReceptionStaff(principal);
        MembershipSubscription requested = subscriptions.findById(previousId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", previousId));
        if (requested.getMember() == null || !memberId.equals(requested.getMember().getUserId())) {
            throw new ForbiddenException("MEMBERSHIP_NOT_OWNER", "error.membership.not_owner", null, null);
        }
        if (requested.getMember().getUser() != null && requested.getMember().getUser().getDeletedAt() != null) {
            throw new ResourceNotFoundException("resource.member", memberId);
        }
        return renewForOwner(requested, memberId, previousId);
    }

    private void ensureReceptionStaff(AuthenticatedPrincipal principal) {
        if (principal == null || !("RECEPTIONIST".equalsIgnoreCase(principal.role())
                || "CENTER_MANAGER".equalsIgnoreCase(principal.role()))) {
            throw new ForbiddenException("MEMBERSHIP_FORBIDDEN", "error.forbidden", null, null);
        }
    }

    private SubscriptionDto renewForOwner(MembershipSubscription requested, Long memberId, Long previousId) {
        if (!isPaidPeriod(requested)) {
            throw new BadRequestException("MEMBERSHIP_INVALID_RENEWAL_STATUS",
                    "membership.subscription.invalid_renewal_status", new Object[]{requested.getStatus()},
                    "Only a paid subscription can be renewed");
        }
        // Serialize all renewal requests for this member, then read the chain afresh.
        members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
        if (entityManager != null) entityManager.refresh(requested);
        if (HOLD_PENDING.equalsIgnoreCase(requested.getHoldStatus())) {
            throw new ConflictException("MEMBERSHIP_HOLD_ALREADY_PENDING",
                    "error.membership.hold_already_pending", null,
                    "Subscription already has a pending hold request");
        }
        List<MembershipSubscription> history = subscriptions.findByMemberUserId(memberId);
        if (history.stream().anyMatch(item -> STATUS_ACTIVE.equalsIgnoreCase(item.getStatus())
                && HOLD_PENDING.equalsIgnoreCase(item.getHoldStatus()))) {
            throw new ConflictException("MEMBERSHIP_HOLD_ALREADY_PENDING",
                    "error.membership.hold_already_pending", null,
                    "Subscription already has a pending hold request");
        }
        List<MembershipSubscription> paidPeriods = history.stream().filter(this::isPaidPeriod).toList();
        for (MembershipSubscription item : paidPeriods) {
            long siblings = paidPeriods.stream().filter(other -> other.getPreviousSubscription() != null
                    && item.getPreviousSubscription() != null
                    && item.getPreviousSubscription().getId().equals(other.getPreviousSubscription().getId()))
                    .count();
            if (siblings > 1) throw renewalConflict();
        }
        for (int i = 0; i < paidPeriods.size(); i++) {
            MembershipSubscription a = paidPeriods.get(i);
            if (!validPeriod(a)) throw renewalConflict();
            for (int j = i + 1; j < paidPeriods.size(); j++) {
                MembershipSubscription b = paidPeriods.get(j);
                if (!validPeriod(b) || (!a.getStartDate().isAfter(b.getEndDate())
                        && !a.getEndDate().isBefore(b.getStartDate())
                        && !isUpgradeTransition(a, b))) throw renewalConflict();
            }
        }
        MembershipSubscription tail = history.stream().filter(item -> previousId.equals(item.getId()))
                .findFirst().orElseThrow(this::renewalConflict);
        if (!isPaidPeriod(tail) || !validPeriod(tail)) throw renewalConflict();
        if (history.stream().anyMatch(item -> STATUS_PENDING_PAYMENT.equalsIgnoreCase(item.getStatus()))) {
            throw new ConflictException("MEMBERSHIP_PENDING_EXISTS", "error.membership.pending_exists", null,
                    "A subscription is still awaiting payment");
        }
        if (history.stream().anyMatch(item -> STATUS_FROZEN.equalsIgnoreCase(item.getStatus()))) throw renewalConflict();
        java.util.Set<Long> visited = new java.util.HashSet<>();
        while (true) {
            if (!visited.add(tail.getId())) throw renewalConflict();
            Long tailId = tail.getId();
            List<MembershipSubscription> next = history.stream()
                    .filter(item -> item.getPreviousSubscription() != null
                            && tailId.equals(item.getPreviousSubscription().getId()) && isPaidPeriod(item))
                    .toList();
            if (next.size() > 1) throw renewalConflict();
            if (next.isEmpty()) break;
            MembershipSubscription successor = next.get(0);
            if (!validPeriod(successor) || !successor.getStartDate().isAfter(tail.getEndDate())
                    || successor.getMembershipPackage() == null || tail.getMembershipPackage() == null
                    || !successor.getMembershipPackage().getId().equals(tail.getMembershipPackage().getId())) {
                throw renewalConflict();
            }
            tail = successor;
        }
        MembershipPackage membershipPackage = findActivePackage(tail.getMembershipPackage().getId());
        LocalDate today = LocalDate.now(clock);
        LocalDate startDate = tail.getEndDate().isBefore(today) ? today : tail.getEndDate().plusDays(1);
        LocalDate endDate = startDate.plusDays(Math.max(1, membershipPackage.getDurationDays()) - 1L);
        for (MembershipSubscription item : history) {
            if (isPaidPeriod(item) && validPeriod(item)
                    && !item.getStartDate().isAfter(endDate) && !item.getEndDate().isBefore(startDate)) {
                throw renewalConflict();
            }
        }
        MembershipSubscription renewal = new MembershipSubscription();
        renewal.setMember(tail.getMember());
        renewal.setMembershipPackage(membershipPackage);
        renewal.setPreviousSubscription(tail);
        renewal.setStartDate(startDate);
        renewal.setEndDate(endDate);
        renewal.setQuotedPrice(membershipPackage.getPrice());
        renewal.setStatus(STATUS_PENDING_PAYMENT);
        renewal.setCreatedAt(LocalDateTime.now(clock));
        renewal.setUpdatedAt(LocalDateTime.now(clock));
        return toDto(subscriptions.saveAndFlush(renewal));
    }

    private void ensureOwner(MembershipSubscription subscription, AuthenticatedPrincipal principal) {
        if (principal == null || subscription.getMember() == null || !principal.id().equals(subscription.getMember().getUserId())) {
            throw new ForbiddenException(
                    "MEMBERSHIP_NOT_OWNER",
                    "error.membership.not_owner",
                    null,
                    "Subscription does not belong to the authenticated member");
        }
    }

    private boolean isActiveOn(MembershipSubscription subscription, LocalDate date) {
        return STATUS_ACTIVE.equalsIgnoreCase(subscription.getStatus())
                && validPeriod(subscription)
                && !subscription.getStartDate().isAfter(date)
                && !subscription.getEndDate().isBefore(date);
    }

    private boolean isPaidPeriod(MembershipSubscription subscription) {
        return subscription != null && (STATUS_ACTIVE.equalsIgnoreCase(subscription.getStatus())
                || "expired".equalsIgnoreCase(subscription.getStatus()));
    }

    private boolean validPeriod(MembershipSubscription subscription) {
        return subscription.getStartDate() != null && subscription.getEndDate() != null
                && !subscription.getEndDate().isBefore(subscription.getStartDate());
    }

    private boolean isUpgradeTransition(MembershipSubscription a, MembershipSubscription b) {
        MembershipSubscription newer = b.getPreviousSubscription() != null
                && a.getId().equals(b.getPreviousSubscription().getId()) ? b
                : a.getPreviousSubscription() != null
                && b.getId().equals(a.getPreviousSubscription().getId()) ? a : null;
        MembershipSubscription older = newer == b ? a : newer == a ? b : null;
        return older != null && older.getMembershipPackage() != null
                && newer.getMembershipPackage() != null
                && !older.getMembershipPackage().getId().equals(newer.getMembershipPackage().getId())
                && older.getEndDate().equals(newer.getStartDate());
    }

    private ConflictException renewalConflict() {
        return new ConflictException("MEMBERSHIP_RENEWAL_CONFLICT", "error.membership.renewal_conflict",
                null, "Subscription chain needs review before renewal");
    }

    /**
     * Nâng cấp gói tập đang hoạt động lên gói tập cao hơn (chờ lễ tân xác nhận thanh toán tại quầy).
     */
    @Transactional
    public SubscriptionDto upgrade(AuthenticatedPrincipal principal, Long currentId, SubscriptionRequests.Upgrade request) {
        MembershipSubscription current = subscriptions.findById(currentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", currentId));

        ensureOwner(current, principal);

        members.findByUserIdForUpdate(current.getMember().getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", current.getMember().getUserId()));
        if (entityManager != null) entityManager.refresh(current);
        LocalDate today = LocalDate.now(clock);
        if (!isActiveOn(current, today)) {
            throw new BadRequestException(
                    "MEMBERSHIP_UPGRADE_REQUIRES_ACTIVE",
                    "error.membership.upgrade_requires_active",
                    null,
                    "Only an active subscription can be upgraded");
        }

        if (HOLD_PENDING.equalsIgnoreCase(current.getHoldStatus())) {
            throw new ConflictException(
                    "MEMBERSHIP_HOLD_ALREADY_PENDING",
                    "error.membership.hold_already_pending",
                    null,
                    "Subscription already has a pending hold request");
        }

        if (subscriptions.existsByMemberUserIdAndStatus(current.getMember().getUserId(), STATUS_PENDING_PAYMENT)
                || subscriptions.existsByPreviousSubscriptionIdAndStatusIn(currentId,
                        List.of(STATUS_PENDING_PAYMENT, STATUS_ACTIVE))) {
            throw new ConflictException(
                    "MEMBERSHIP_PENDING_EXISTS",
                    "error.membership.pending_exists",
                    null,
                    "Member already has a pending payment subscription");
        }

        if (hasPaidFutureRenewal(current.getMember().getUserId(), today)) throw futurePaidConflict();

        MembershipPackage targetPackage = findActivePackage(request.packageId());
        MembershipPackage currentPackage = current.getMembershipPackage();

        if (!isHigherPackage(currentPackage, targetPackage)) {
            throw new BadRequestException(
                    "MEMBERSHIP_UPGRADE_NOT_HIGHER",
                    "error.membership.upgrade_not_higher",
                    null,
                    "Target package must be higher than current package");
        }

        // Phần quy đổi lấy từ tiền hội viên thực trả cho kỳ hiện tại; giá gói mới lấy theo danh mục lúc báo giá.
        // Cả hai được chốt trên yêu cầu nên Quản lý đổi giá sau đó không làm lệch số tiền phải thu.
        BigDecimal credit = valueCalculator().remainingValue(current, today);
        BigDecimal targetPrice = targetPackage.getPrice() != null ? targetPackage.getPrice() : BigDecimal.ZERO;
        BigDecimal charge = SubscriptionValueCalculator.upgradeCharge(targetPrice, credit);
        if (charge.signum() <= 0) {
            throw new BadRequestException(
                    "MEMBERSHIP_UPGRADE_CREDIT_EXCEEDS",
                    "error.membership.upgrade_credit_exceeds",
                    new Object[]{credit.toPlainString(), targetPrice.toPlainString()},
                    "Unused value of the current period already covers the target package");
        }

        MembershipSubscription upgradeSub = new MembershipSubscription();
        upgradeSub.setMember(current.getMember());
        upgradeSub.setMembershipPackage(targetPackage);
        upgradeSub.setPreviousSubscription(current);
        int durationDays = Math.max(1, targetPackage.getDurationDays());
        // Ngày bắt đầu là ngày báo giá: phần quy đổi tính tới hôm nay, nên gói mới cũng tính từ hôm nay.
        upgradeSub.setStartDate(today);
        upgradeSub.setEndDate(today.plusDays(durationDays - 1L));
        upgradeSub.setCreditApplied(credit);
        upgradeSub.setUpgradeCharge(charge);
        upgradeSub.setStatus(STATUS_PENDING_PAYMENT);
        upgradeSub.setCreatedAt(LocalDateTime.now(clock));
        upgradeSub.setUpdatedAt(LocalDateTime.now(clock));

        return toDto(subscriptions.saveAndFlush(upgradeSub));
    }

    /**
     * Hủy yêu cầu gói tập đang ở trạng thái chờ thanh toán (pending_payment).
     * Hội viên (chủ sở hữu) hoặc Lễ tân / Quản lý đều có thể hủy khi chưa thanh toán.
     */
    @Transactional
    public SubscriptionDto cancelPending(AuthenticatedPrincipal principal, Long subscriptionId) {
        MembershipSubscription lookup = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));

        boolean isStaff = principal != null && ("CENTER_MANAGER".equalsIgnoreCase(principal.role())
                || "RECEPTIONIST".equalsIgnoreCase(principal.role())
                || "MANAGER".equalsIgnoreCase(principal.role())
                || "STAFF".equalsIgnoreCase(principal.role()));
        boolean isOwner = principal != null
                && lookup.getMember() != null
                && lookup.getMember().getUserId().equals(principal.id());

        if (!isStaff && !isOwner) {
            throw new ForbiddenException(
                    "MEMBERSHIP_NOT_OWNER",
                    "error.membership.not_owner",
                    null,
                    "Subscription does not belong to the authenticated member");
        }

        Long memberId = lookup.getMember().getUserId();
        members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
        MembershipSubscription subscription = subscriptions.findByIdForUpdate(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));
        if (entityManager != null) entityManager.refresh(subscription);

        if ("cancelled".equalsIgnoreCase(subscription.getStatus())) {
            return toDto(subscription);
        }

        if (!STATUS_PENDING_PAYMENT.equalsIgnoreCase(subscription.getStatus())) {
            throw new ConflictException(
                    "MEMBERSHIP_CANCEL_NOT_PENDING",
                    "error.membership.cancel_not_pending",
                    null,
                    "Only a pending payment subscription can be cancelled");
        }

        if (paymentRepository != null) {
            List<com.swp391.scms.finance.entity.Payment> subPayments = paymentRepository.findAllBySubscriptionId(subscriptionId);
            if (subPayments.stream().anyMatch(payment -> "success".equalsIgnoreCase(payment.getStatus()))) {
                throw new ConflictException("MEMBERSHIP_CANCEL_PAYMENT_UNSETTLED",
                        "error.membership.cancel_payment_unsettled", null, null);
            }
            // A VNPay attempt the gateway may still settle blocks everyone; an abandoned one is closed here.
            if (vnpayGuard != null) vnpayGuard.subscription(subscriptionId);
            // A member may withdraw an unpaid online checkout; a cash receipt under review is decided by reception.
            if (!isStaff && subPayments.stream().anyMatch(payment -> "pending".equalsIgnoreCase(payment.getStatus())
                    && !"online_wallet".equalsIgnoreCase(payment.getMethod()))) {
                throw new ConflictException("MEMBERSHIP_CANCEL_PAYMENT_UNSETTLED",
                        "error.membership.cancel_payment_unsettled", null, null);
            }
            subPayments.stream()
                    .filter(payment -> "pending".equalsIgnoreCase(payment.getStatus()))
                    .forEach(payment -> {
                        payment.setStatus("failed");
                        paymentRepository.save(payment);
                    });
        }

        subscription.setStatus("cancelled");
        subscription.setUpdatedAt(LocalDateTime.now(clock));

        return toDto(subscriptions.saveAndFlush(subscription));
    }

    private SubscriptionValueCalculator valueCalculator() {
        return valueCalculator != null ? valueCalculator : new SubscriptionValueCalculator(paymentRepository);
    }

    private boolean isHigherPackage(MembershipPackage currentPackage, MembershipPackage targetPackage) {
        if (currentPackage == null || targetPackage == null) {
            return false;
        }
        if (currentPackage.getId() != null && currentPackage.getId().equals(targetPackage.getId())) {
            return false;
        }
        BigDecimal currentPrice = currentPackage.getPrice() != null ? currentPackage.getPrice() : BigDecimal.ZERO;
        BigDecimal targetPrice = targetPackage.getPrice() != null ? targetPackage.getPrice() : BigDecimal.ZERO;
        int priceComparison = targetPrice.compareTo(currentPrice);
        if (priceComparison > 0) {
            return true;
        }
        if (priceComparison == 0) {
            return targetPackage.getDurationDays() > currentPackage.getDurationDays();
        }
        return false;
    }

    /**
     * Hội viên chủ động gửi yêu cầu bảo lưu gói tập đang hoạt động kèm lý do.
     */
    @Transactional
    public SubscriptionDto requestHold(AuthenticatedPrincipal principal, Long subscriptionId, SubscriptionRequests.HoldRequest request) {
        MembershipSubscription subscription = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));

        ensureOwner(subscription, principal);

        members.findByUserIdForUpdate(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", principal.id()));
        if (entityManager != null) entityManager.refresh(subscription);

        LocalDate today = LocalDate.now(clock);
        if (!isActiveOn(subscription, today)) {
            throw new BadRequestException(
                    "MEMBERSHIP_HOLD_REQUIRES_ACTIVE",
                    "error.membership.hold_requires_active",
                    null,
                    "Only an active subscription can be placed on hold");
        }

        if (isTrialSubscription(subscription)) {
            throw new BadRequestException(
                    "MEMBERSHIP_TRIAL_CANNOT_HOLD",
                    "error.membership.trial_cannot_hold",
                    null,
                    "Gói tập trải nghiệm không hỗ trợ bảo lưu.");
        }

        if (HOLD_PENDING.equalsIgnoreCase(subscription.getHoldStatus())) {
            throw new ConflictException(
                    "MEMBERSHIP_HOLD_ALREADY_PENDING",
                    "error.membership.hold_already_pending",
                    null,
                    "Subscription already has a pending hold request");
        }

        ensureNoPendingOrCancellationHoldConflicts(principal.id(), subscriptionId, today);

        String reason = request != null && request.reason() != null ? request.reason().trim() : "";
        if (reason.isEmpty()) {
            throw new BadRequestException(
                    "MEMBERSHIP_HOLD_REASON_REQUIRED",
                    "validation.membership.hold_reason.not_blank",
                    null,
                    "Hold reason is required");
        }
        if (reason.length() > 500) {
            throw new BadRequestException(
                    "MEMBERSHIP_HOLD_REASON_TOO_LONG",
                    "validation.membership.hold_reason.size",
                    null,
                    "Hold reason must not exceed 500 characters");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        subscription.setHoldStatus(HOLD_PENDING);
        subscription.setHoldReason(reason);
        subscription.setHoldRequestedAt(now);
        subscription.setHoldResolvedAt(null);
        subscription.setHoldResolvedBy(null);
        subscription.setUpdatedAt(now);

        return toDto(subscriptions.saveAndFlush(subscription));
    }

    private void ensureNoPendingOrCancellationHoldConflicts(Long memberId, Long subscriptionId, LocalDate today) {
        if (subscriptions.existsByMemberUserIdAndStatus(memberId, STATUS_PENDING_PAYMENT)) {
            throw new ConflictException(
                    "MEMBERSHIP_PENDING_EXISTS",
                    "error.membership.pending_exists",
                    null,
                    "Member already has a pending payment subscription");
        }
        if (hasPaidFutureRenewal(memberId, today)) {
            throw futurePaidConflict();
        }
        if (cancellationRequests != null
                && cancellationRequests.existsBySubscriptionIdAndStatus(subscriptionId, "PENDING")) {
            throw new ConflictException(
                    "CANCELLATION_PENDING_EXISTS",
                    "error.membership.cancellation_pending_exists",
                    null,
                    "A cancellation request is already pending for this membership");
        }
    }

    @Transactional
    public SubscriptionDto resume(AuthenticatedPrincipal principal, Long subscriptionId) {
        members.findByUserIdForUpdate(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", principal.id()));
        MembershipSubscription subscription = subscriptions.findByIdForUpdate(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));
        if (entityManager != null) entityManager.refresh(subscription);
        ensureOwner(subscription, principal);
        LocalDate today = LocalDate.now(clock);
        LocalDate heldOn = subscription.getHoldResolvedAt() == null ? null
                : subscription.getHoldResolvedAt().toLocalDate();
        if (!STATUS_FROZEN.equalsIgnoreCase(subscription.getStatus())
                || !HOLD_APPROVED.equalsIgnoreCase(subscription.getHoldStatus())
                || heldOn == null || heldOn.isAfter(today) || !validPeriod(subscription)
                || heldOn.isBefore(subscription.getStartDate()) || heldOn.isAfter(subscription.getEndDate())) {
            throw new BadRequestException("MEMBERSHIP_RESUME_INVALID", "error.membership.resume_invalid", null, null);
        }
        if (subscriptions.existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(principal.id(), STATUS_ACTIVE, today)
                || subscriptions.existsByMemberUserIdAndStatus(principal.id(), STATUS_PENDING_PAYMENT)
                || hasPaidFutureRenewal(principal.id(), today)) {
            throw new ConflictException("MEMBERSHIP_RESUME_CONFLICT", "error.membership.resume_conflict", null, null);
        }
        // Preserve the original paid period and class-credit usage; only extend its expiry, by at most MAX_HOLD_DAYS.
        long heldDays = Math.min(java.time.temporal.ChronoUnit.DAYS.between(heldOn, today), MAX_HOLD_DAYS);
        subscription.setEndDate(subscription.getEndDate().plusDays(heldDays));
        subscription.setStatus(STATUS_ACTIVE);
        subscription.setHoldStatus(null);
        subscription.setUpdatedAt(LocalDateTime.now(clock));
        return toDto(subscriptions.saveAndFlush(subscription));
    }

    /** Frozen memberships whose hold reached MAX_HOLD_DAYS. */
    @Transactional(readOnly = true)
    public List<Long> findHoldsDueForResume() {
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(MAX_HOLD_DAYS);
        return subscriptions.findByStatusAndHoldStatusAndHoldResolvedAtLessThanEqual(STATUS_FROZEN, HOLD_APPROVED, cutoff)
                .stream().map(MembershipSubscription::getId).toList();
    }

    /** Ends a hold that reached MAX_HOLD_DAYS: the membership runs again with those days added to its expiry. */
    @Transactional
    public boolean autoResumeHold(Long subscriptionId) {
        MembershipSubscription lookup = subscriptions.findById(subscriptionId).orElse(null);
        if (lookup == null || lookup.getMember() == null) return false;
        members.findByUserIdForUpdate(lookup.getMember().getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", lookup.getMember().getUserId()));
        MembershipSubscription subscription = subscriptions.findByIdForUpdate(subscriptionId).orElse(null);
        if (subscription == null) return false;
        if (entityManager != null) entityManager.refresh(subscription);
        LocalDateTime now = LocalDateTime.now(clock);
        if (!STATUS_FROZEN.equalsIgnoreCase(subscription.getStatus())
                || !HOLD_APPROVED.equalsIgnoreCase(subscription.getHoldStatus())
                || subscription.getHoldResolvedAt() == null || subscription.getEndDate() == null
                || subscription.getHoldResolvedAt().isAfter(now.minusDays(MAX_HOLD_DAYS))) {
            return false;
        }
        long heldDays = Math.min(java.time.temporal.ChronoUnit.DAYS.between(
                subscription.getHoldResolvedAt().toLocalDate(), now.toLocalDate()), MAX_HOLD_DAYS);
        subscription.setEndDate(subscription.getEndDate().plusDays(heldDays));
        subscription.setStatus(STATUS_ACTIVE);
        subscription.setHoldStatus(null);
        subscription.setUpdatedAt(now);
        subscriptions.saveAndFlush(subscription);
        if (notificationService != null) {
            String pkgName = subscription.getMembershipPackage() != null ? subscription.getMembershipPackage().getName() : "";
            notificationService.send(subscription.getMember().getUserId(),
                    msg("notifications.membership.hold_auto_resumed.title"),
                    msg("notifications.membership.hold_auto_resumed.body", pkgName, MAX_HOLD_DAYS, subscription.getEndDate()),
                    "system", "membership_subscription", subscription.getId());
        }
        return true;
    }

    /**
     * Danh sách yêu cầu bảo lưu đang chờ lễ tân xử lý.
     */
    @Transactional(readOnly = true)
    public List<HoldRequestDto> listPendingHolds() {
        LocalDate today = LocalDate.now(clock);
        return subscriptions.findByHoldStatusOrderByHoldRequestedAtDesc(HOLD_PENDING).stream()
                .filter(s -> s.getMember() != null
                        && s.getMember().getUser() != null
                        && s.getMember().getUser().getDeletedAt() == null
                        && isActiveOn(s, today))
                .map(s -> toHoldRequestDto(s, 0))
                .toList();
    }

    /**
     * Lễ tân duyệt yêu cầu bảo lưu: chuyển gói tập sang trạng thái frozen và tự động hủy các lịch học đã đặt trong tương lai.
     */
    @Transactional
    public HoldRequestDto approveHold(AuthenticatedPrincipal principal, Long subscriptionId) {
        MembershipSubscription subscription = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));

        Long memberId = subscription.getMember().getUserId();
        members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
        if (entityManager != null) entityManager.refresh(subscription);
        if (!HOLD_PENDING.equalsIgnoreCase(subscription.getHoldStatus())
                || !STATUS_ACTIVE.equalsIgnoreCase(subscription.getStatus())) {
            throw new BadRequestException(
                    "MEMBERSHIP_HOLD_NOT_PENDING",
                    "error.membership.hold_not_pending",
                    null,
                    "Subscription does not have a pending hold request");
        }

        LocalDate today = LocalDate.now(clock);
        if (!isActiveOn(subscription, today)) {
            throw new BadRequestException("MEMBERSHIP_HOLD_REQUIRES_ACTIVE",
                    "error.membership.hold_requires_active", null, null);
        }
        ensureNoPendingOrCancellationHoldConflicts(memberId, subscriptionId, today);

        LocalDateTime now = LocalDateTime.now(clock);
        subscription.setStatus(STATUS_FROZEN);
        subscription.setHoldStatus(HOLD_APPROVED);
        subscription.setHoldResolvedAt(now);
        if (principal != null && principal.id() != null && userRepository != null) {
            userRepository.findById(principal.id()).ifPresent(subscription::setHoldResolvedBy);
        }
        subscription.setUpdatedAt(now);

        MembershipSubscription saved = subscriptions.saveAndFlush(subscription);

        int cancelledCount = 0;
        if (saved.getMember() != null && saved.getMember().getUserId() != null) {
            String cancelReason = msg("scheduling.enrollment.cancelled_by_hold");
            if (entitlementRevocation != null) {
                // A frozen period covers no date, so classes, 1:1 sessions and courts are all released.
                cancelledCount = entitlementRevocation.revokeUncoveredBookings(saved.getMember().getUserId(), cancelReason);
            } else if (enrollmentService != null) {
                cancelledCount = enrollmentService.cancelFutureEnrollmentsForMember(
                        saved.getMember().getUserId(), cancelReason);
            }
        }

        if (notificationService != null && saved.getMember() != null && saved.getMember().getUserId() != null) {
            String pkgName = saved.getMembershipPackage() != null ? saved.getMembershipPackage().getName() : "";
            notificationService.send(
                    saved.getMember().getUserId(),
                    msg("notifications.membership.hold_approved.title"),
                    msg("notifications.membership.hold_approved.body", pkgName, cancelledCount),
                    "system",
                    "membership_subscription",
                    saved.getId());
        }

        return toHoldRequestDto(saved, cancelledCount);
    }

    /**
     * Lễ tân từ chối yêu cầu bảo lưu: giữ nguyên trạng thái gói tập active.
     */
    @Transactional
    public HoldRequestDto rejectHold(AuthenticatedPrincipal principal, Long subscriptionId) {
        MembershipSubscription subscription = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));

        if (subscription.getMember() != null && subscription.getMember().getUserId() != null) {
            members.findByUserIdForUpdate(subscription.getMember().getUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.member", subscription.getMember().getUserId()));
        }
        if (entityManager != null) entityManager.refresh(subscription);

        if (!HOLD_PENDING.equalsIgnoreCase(subscription.getHoldStatus())) {
            throw new BadRequestException(
                    "MEMBERSHIP_HOLD_NOT_PENDING",
                    "error.membership.hold_not_pending",
                    null,
                    "Subscription does not have a pending hold request");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        subscription.setHoldStatus(HOLD_REJECTED);
        subscription.setHoldResolvedAt(now);
        if (principal != null && principal.id() != null && userRepository != null) {
            userRepository.findById(principal.id()).ifPresent(subscription::setHoldResolvedBy);
        }
        subscription.setUpdatedAt(now);

        MembershipSubscription saved = subscriptions.saveAndFlush(subscription);

        if (notificationService != null && saved.getMember() != null && saved.getMember().getUserId() != null) {
            String pkgName = saved.getMembershipPackage() != null ? saved.getMembershipPackage().getName() : "";
            notificationService.send(
                    saved.getMember().getUserId(),
                    msg("notifications.membership.hold_rejected.title"),
                    msg("notifications.membership.hold_rejected.body", pkgName),
                    "system",
                    "membership_subscription",
                    saved.getId());
        }

        return toHoldRequestDto(saved, 0);
    }

    /**
     * SCRUM-71 BR-01, BR-06:
     * Lấy subscription active hiện tại (start_date <= today <= end_date) của hội viên kèm mã QR định danh.
     * Không chọn nhầm các gói gia hạn trong tương lai (start_date > today).
     * Trả về null nếu hội viên chưa có gói hoặc gói đã hết hạn.
     */
    @Transactional(readOnly = true)
    public SubscriptionDto current(AuthenticatedPrincipal principal) {
        findMember(principal.id());
        LocalDate today = LocalDate.now(clock);
        return subscriptions.findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                        principal.id(), STATUS_ACTIVE, today, today)
                .map(current -> toDto(current, paidThroughDate(current,
                        subscriptions.findByMemberUserId(principal.id()))))
                .orElse(null);
    }

    private LocalDate paidThroughDate(MembershipSubscription current, List<MembershipSubscription> history) {
        MembershipSubscription tail = current;
        java.util.Set<Long> visited = new java.util.HashSet<>();
        while (visited.add(tail.getId())) {
            Long tailId = tail.getId();
            List<MembershipSubscription> successors = history.stream()
                    .filter(item -> item.getPreviousSubscription() != null
                            && tailId.equals(item.getPreviousSubscription().getId())
                            && STATUS_ACTIVE.equalsIgnoreCase(item.getStatus()))
                    .toList();
            if (successors.size() != 1) break;
            MembershipSubscription next = successors.get(0);
            if (visited.contains(next.getId()) || !validPeriod(next)
                    || !next.getStartDate().equals(tail.getEndDate().plusDays(1))
                    || next.getMembershipPackage() == null || tail.getMembershipPackage() == null
                    || !next.getMembershipPackage().getId().equals(tail.getMembershipPackage().getId())) break;
            tail = next;
        }
        return tail.getEndDate();
    }

    /**
     * SCRUM-71 BR-06:
     * Lấy danh sách lịch sử gói tập của chính hội viên.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionDto> mine(AuthenticatedPrincipal principal) {
        findMember(principal.id());
        return subscriptions.findByMemberUserIdOrderByCreatedAtDesc(principal.id()).stream()
                .map(this::toDto)
                .toList();
    }

    private boolean hasPaidFutureRenewal(Long memberId, LocalDate today) {
        return subscriptions.findByMemberUserId(memberId).stream()
                .anyMatch(item -> item.getPreviousSubscription() != null
                        && isPaidPeriod(item) && item.getStartDate() != null
                        && item.getStartDate().isAfter(today));
    }

    private ConflictException futurePaidConflict() {
        return new ConflictException("MEMBERSHIP_FUTURE_PAID_RENEWAL",
                "error.membership.future_paid_renewal", null,
                "Paid future renewal requires manager review");
    }

    private Member findMember(Long userId) {
        return members.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", userId));
    }

    private MembershipPackage findActivePackage(Long packageId) {
        MembershipPackage membershipPackage = packages.findById(packageId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.package", packageId));
        if (!PACKAGE_ACTIVE.equalsIgnoreCase(membershipPackage.getStatus())
                || membershipPackage.getDurationDays() <= 0) {
            throw new BadRequestException(
                    "MEMBERSHIP_PACKAGE_INACTIVE",
                    "error.membership.package_inactive",
                    null,
                    "Membership package is inactive");
        }
        return membershipPackage;
    }

    @Transactional(readOnly = true)
    public List<com.swp391.scms.membership.dto.SubscriptionResponses.PendingSubscriptionDto> listPending() {
        return subscriptions.findByStatusOrderByCreatedAtDesc(STATUS_PENDING_PAYMENT).stream()
                .filter(s -> s.getMember() != null
                        && s.getMember().getUser() != null
                        && s.getMember().getUser().getDeletedAt() == null)
                .map(this::toPendingDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public com.swp391.scms.membership.dto.SubscriptionResponses.DynamicQrDto generateDynamicQr(AuthenticatedPrincipal principal) {
        SubscriptionDto sub = current(principal);
        if (sub == null || !STATUS_ACTIVE.equalsIgnoreCase(sub.status())) {
            throw new BadRequestException(
                    "MEMBERSHIP_NOT_ACTIVE",
                    "error.attendance.subscription_not_active",
                    null,
                    "No active subscription found to generate dynamic QR");
        }
        long nowMillis = clock.instant().toEpochMilli();
        String qr = dynamicQrService.generate(principal.id(), sub.id(), nowMillis);
        return new com.swp391.scms.membership.dto.SubscriptionResponses.DynamicQrDto(
                qr, dynamicQrService.getTtlSeconds(), LocalDateTime.now(clock));
    }

    private SubscriptionDto toDto(MembershipSubscription s) {
        return toDto(s, null);
    }

    private SubscriptionDto toDto(MembershipSubscription s, LocalDate paidThroughDate) {
        String pkgName;
        if (isTrialSubscription(s)) {
            pkgName = CatalogSeeder.TRIAL_PACKAGE_NAME;
        } else {
            pkgName = s.getMembershipPackage() != null ? s.getMembershipPackage().getName() : null;
        }
        return new SubscriptionDto(
                s.getId(),
                s.getMember() != null ? s.getMember().getUserId() : null,
                s.getMembershipPackage() != null ? s.getMembershipPackage().getId() : null,
                pkgName,
                s.getPreviousSubscription() != null ? s.getPreviousSubscription().getId() : null,
                s.getStartDate(),
                s.getEndDate(),
                s.getStatus(),
                s.getQrCode(),
                s.getCreatedAt(),
                s.getHoldStatus(),
                s.getHoldReason(),
                s.getHoldRequestedAt(),
                s.getHoldResolvedAt(),
                paidThroughDate,
                s.getUpgradeCharge(),
                s.getQuotedPrice(),
                s.getCreditApplied(),
                isActiveOn(s, LocalDate.now(clock)) ? valueCalculator().remainingValue(s, LocalDate.now(clock)) : null);
    }

    private com.swp391.scms.membership.dto.SubscriptionResponses.PendingSubscriptionDto toPendingDto(MembershipSubscription s) {
        Member m = s.getMember();
        com.swp391.scms.users.entity.User u = m != null ? m.getUser() : null;
        MembershipPackage pkg = s.getMembershipPackage();
        BigDecimal payablePrice = s.payableAmount();
        if (paymentRepository != null) {
            var pendingPayments = paymentRepository.findAllBySubscriptionId(s.getId()).stream()
                    .filter(payment -> "pending".equalsIgnoreCase(payment.getStatus())
                            && payment.getMember() != null && m != null
                            && m.getUserId().equals(payment.getMember().getUserId()))
                    .toList();
            if (pendingPayments.size() == 1) payablePrice = pendingPayments.getFirst().getAmount();
        }
        return new com.swp391.scms.membership.dto.SubscriptionResponses.PendingSubscriptionDto(
                s.getId(),
                m != null ? m.getUserId() : null,
                m != null ? m.getMembershipCode() : null,
                u != null ? u.getFullName() : null,
                u != null ? u.getEmail() : null,
                u != null ? u.getPhone() : null,
                pkg != null ? pkg.getId() : null,
                pkg != null ? pkg.getName() : null,
                pkg != null ? pkg.getDurationDays() : null,
                payablePrice,
                s.getStartDate(),
                s.getEndDate(),
                s.getStatus(),
                s.getCreatedAt());
    }

    private HoldRequestDto toHoldRequestDto(MembershipSubscription s, int cancelledEnrollmentsCount) {
        Member m = s.getMember();
        com.swp391.scms.users.entity.User u = m != null ? m.getUser() : null;
        MembershipPackage pkg = s.getMembershipPackage();
        return new HoldRequestDto(
                s.getId(),
                m != null ? m.getUserId() : null,
                m != null ? m.getMembershipCode() : null,
                u != null ? u.getFullName() : null,
                u != null ? u.getEmail() : null,
                u != null ? u.getPhone() : null,
                pkg != null ? pkg.getId() : null,
                pkg != null ? pkg.getName() : null,
                s.getStartDate(),
                s.getEndDate(),
                s.getStatus(),
                s.getHoldStatus(),
                s.getHoldReason(),
                s.getHoldRequestedAt(),
                s.getHoldResolvedAt(),
                cancelledEnrollmentsCount);
    }

    private boolean isTrialSubscription(MembershipSubscription sub) {
        if (sub == null) return false;
        if (sub.getMembershipPackage() != null) {
            String name = sub.getMembershipPackage().getName();
            if (name != null) {
                String upper = name.toUpperCase(java.util.Locale.ROOT);
                if (upper.contains("TRẢI NGHIỆM") || upper.contains("TRIAL")) return true;
            }
            if (sub.getMembershipPackage().getDurationDays() > 0 && sub.getMembershipPackage().getDurationDays() <= 3) return true;
        }
        if (sub.getStartDate() != null && sub.getEndDate() != null) {
            long days = java.time.temporal.ChronoUnit.DAYS.between(sub.getStartDate(), sub.getEndDate());
            if (days <= 3) return true;
        }
        return false;
    }
}
