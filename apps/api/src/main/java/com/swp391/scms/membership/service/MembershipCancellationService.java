package com.swp391.scms.membership.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.dto.CancellationDtos;
import com.swp391.scms.membership.entity.MembershipCancellationRequest;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipCancellationRequestRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.wallet.WalletService;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class MembershipCancellationService {
    private final MembershipCancellationRequestRepository requests;
    private final MembershipSubscriptionRepository subscriptions;
    private final MemberRepository members;
    private final UserRepository users;
    private final EnrollmentService enrollments;
    private final MessageService messages;
    private final Clock clock;
    private final PaymentRepository payments;
    private final EntityManager entityManager;

    @Autowired(required = false)
    private EntitlementRevocationService entitlementRevocation;

    @Autowired(required = false)
    private WalletService walletService;

    @Autowired(required = false)
    private NotificationService notificationService;

    @Autowired(required = false)
    private SubscriptionValueCalculator valueCalculator;

    public MembershipCancellationService(MembershipCancellationRequestRepository requests,
            MembershipSubscriptionRepository subscriptions, MemberRepository members,
            UserRepository users, EnrollmentService enrollments, MessageService messages, Clock clock,
            PaymentRepository payments, EntityManager entityManager) {
        this.requests = requests;
        this.subscriptions = subscriptions;
        this.members = members;
        this.users = users;
        this.enrollments = enrollments;
        this.messages = messages;
        this.clock = clock;
        this.payments = payments;
        this.entityManager = entityManager;
    }

    @Transactional
    public CancellationDtos.Response request(AuthenticatedPrincipal principal, Long subscriptionId, CancellationDtos.Request body) {
        Member member = lockMember(principal.id());
        MembershipSubscription subscription = lockSubscription(subscriptionId);
        if (subscription.getMember() == null || !member.getUserId().equals(subscription.getMember().getUserId())) {
            throw new ForbiddenException("MEMBERSHIP_NOT_OWNER", "error.membership.not_owner", null, null);
        }
        if (!isActiveNow(subscription)) {
            throw new ConflictException("CANCELLATION_NOT_ACTIVE", "error.membership.cancellation_not_active", null, null);
        }
        if ("PENDING".equalsIgnoreCase(subscription.getHoldStatus())) {
            throw new ConflictException("MEMBERSHIP_HOLD_ALREADY_PENDING", "error.membership.hold_already_pending", null, null);
        }
        String reason = body == null || body.reason() == null ? "" : body.reason().trim();
        if (reason.isEmpty()) {
            throw new BadRequestException("CANCELLATION_REASON_REQUIRED", "validation.membership.cancellation_reason.not_blank", null, null);
        }
        if (requests.existsBySubscriptionIdAndStatus(subscriptionId, "PENDING")) {
            throw new ConflictException("CANCELLATION_PENDING_EXISTS", "error.membership.cancellation_pending_exists", null, null);
        }
        MembershipCancellationRequest request = new MembershipCancellationRequest();
        request.setMember(member);
        request.setSubscription(subscription);
        request.setReason(reason);
        request.setRefundAmount(defaultRefund(subscription));
        request.setRequestedAt(LocalDateTime.now(clock));
        return toDto(requests.saveAndFlush(request));
    }

    @Transactional
    public CancellationDtos.Response staffRequest(AuthenticatedPrincipal principal, CancellationDtos.StaffRequest body) {
        if (principal == null || !("RECEPTIONIST".equalsIgnoreCase(principal.role())
                || "STAFF".equalsIgnoreCase(principal.role())
                || "CENTER_MANAGER".equalsIgnoreCase(principal.role())
                || "MANAGER".equalsIgnoreCase(principal.role()))) {
            throw new ForbiddenException("CANCELLATION_STAFF_ONLY", "error.forbidden", null, null);
        }
        String reason = body == null || body.reason() == null ? "" : body.reason().trim();
        if (reason.isEmpty()) {
            throw new BadRequestException("CANCELLATION_REASON_REQUIRED", "validation.membership.cancellation_reason.not_blank", null, null);
        }

        Member member;
        MembershipSubscription subscription;
        if (body.subscriptionId() != null) {
            MembershipSubscription found = subscriptions.findById(body.subscriptionId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", body.subscriptionId()));
            member = lockMember(found.getMember().getUserId());
            subscription = lockSubscription(body.subscriptionId());
        } else if (body.memberId() != null) {
            member = lockMember(body.memberId());
            MembershipSubscription activeSub = subscriptions.findByMemberUserIdOrderByCreatedAtDesc(body.memberId())
                    .stream()
                    .filter(s -> isActiveNow(s) || "active".equalsIgnoreCase(s.getStatus()))
                    .findFirst()
                    .orElseThrow(() -> new ConflictException("CANCELLATION_NOT_ACTIVE", "error.membership.cancellation_not_active", null, null));
            subscription = lockSubscription(activeSub.getId());
        } else {
            throw new BadRequestException("CANCELLATION_TARGET_REQUIRED", "resource.subscription", null, null);
        }

        if (!isActiveNow(subscription) && !"active".equalsIgnoreCase(subscription.getStatus())) {
            throw new ConflictException("CANCELLATION_NOT_ACTIVE", "error.membership.cancellation_not_active", null, null);
        }
        if ("PENDING".equalsIgnoreCase(subscription.getHoldStatus())) {
            throw new ConflictException("MEMBERSHIP_HOLD_ALREADY_PENDING", "error.membership.hold_already_pending", null, null);
        }
        if (requests.existsBySubscriptionIdAndStatus(subscription.getId(), "PENDING")) {
            throw new ConflictException("CANCELLATION_PENDING_EXISTS", "error.membership.cancellation_pending_exists", null, null);
        }

        BigDecimal defaultRefund = defaultRefund(subscription);
        BigDecimal refundAmount = (body.refundAmount() != null && body.refundAmount().compareTo(BigDecimal.ZERO) >= 0)
                ? body.refundAmount()
                : defaultRefund;

        MembershipCancellationRequest request = new MembershipCancellationRequest();
        request.setMember(member);
        request.setSubscription(subscription);
        request.setReason(reason);
        request.setRefundAmount(refundAmount);
        request.setRequestedAt(LocalDateTime.now(clock));
        if (principal.id() != null && users != null) {
            users.findByIdAndDeletedAtIsNull(principal.id()).ifPresent(request::setRequestedBy);
        }
        MembershipCancellationRequest saved = requests.saveAndFlush(request);

        if (notificationService != null && users != null) {
            String memberName = member.getUser() != null ? member.getUser().getFullName() : ("#" + member.getUserId());
            String pkgName = subscription.getMembershipPackage() != null ? subscription.getMembershipPackage().getName() : "";
            for (User mgr : users.findActiveManagers()) {
                try {
                    notificationService.send(
                            mgr.getId(),
                            "Yêu cầu hủy gói tập & hoàn tiền mới",
                            "Lễ tân vừa trình yêu cầu hủy gói " + pkgName + " của hội viên " + memberName
                                    + " (Hoàn dự kiến: " + refundAmount.toPlainString() + " đ). Lý do: " + reason,
                            "system",
                            "cancellation_request",
                            saved.getId(),
                            "/manager/reports");
                } catch (RuntimeException ignored) {
                }
            }
        }
        return toDto(saved);
    }

    @Transactional(readOnly = true)
    public List<CancellationDtos.Response> mine(AuthenticatedPrincipal principal) {
        return requests.findByMemberUserIdOrderByRequestedAtDesc(principal.id()).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<CancellationDtos.Response> all() {
        return requests.findAllForManager().stream()
                .map(this::toDto).toList();
    }

    @Transactional
    public CancellationDtos.Response decide(AuthenticatedPrincipal principal, Long requestId,
            boolean approve, CancellationDtos.Decision body) {
        if (principal == null || !"CENTER_MANAGER".equalsIgnoreCase(principal.role())) {
            throw new ForbiddenException("CANCELLATION_MANAGER_ONLY", "error.membership.cancellation_manager_only", null, null);
        }
        MembershipCancellationRequest initial = requests.findById(requestId)
            .orElseThrow(() -> new ResourceNotFoundException("resource.cancellation_request", requestId));
        Long memberId = initial.getMember().getUserId();
        lockMember(memberId);
        MembershipCancellationRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.cancellation_request", requestId));
        if (entityManager != null) entityManager.refresh(request);
        if (!"PENDING".equals(request.getStatus())) {
            throw new ConflictException("CANCELLATION_ALREADY_DECIDED", "error.membership.cancellation_already_decided", null, null);
        }
        if (approve) {
            MembershipSubscription subscription = lockSubscription(request.getSubscription().getId());
            if (!isActiveNow(subscription)) {
                throw new ConflictException("CANCELLATION_NOT_ACTIVE", "error.membership.cancellation_not_active", null, null);
            }
            if ("PENDING".equalsIgnoreCase(subscription.getHoldStatus())) {
                throw new ConflictException("MEMBERSHIP_HOLD_ALREADY_PENDING", "error.membership.hold_already_pending", null, null);
            }
            // Enrollments reference member and class, not subscription. The member-wide
            // cancellation below is safe only when this is the sole remaining entitlement.
            ensureSoleEntitlement(memberId, subscription.getId());
            subscription.setStatus("cancelled");
            subscription.setUpdatedAt(LocalDateTime.now(clock));
            subscriptions.saveAndFlush(subscription);
            String cancelReason = messages != null
                    ? messages.getMessage("scheduling.enrollment.cancelled_by_membership")
                    : "Gói tập đã được quản lý duyệt hủy.";
            if (entitlementRevocation != null) {
                entitlementRevocation.revokeUncoveredBookings(memberId, cancelReason);
            } else {
                enrollments.cancelFutureEnrollmentsForMember(memberId, cancelReason);
            }

            BigDecimal refundAmount = (body != null && body.refundAmount() != null)
                    ? body.refundAmount()
                    : request.getRefundAmount();
            if (refundAmount == null) {
                refundAmount = defaultRefund(subscription);
            }
            request.setRefundAmount(refundAmount);
            if (walletService != null && refundAmount != null && refundAmount.compareTo(BigDecimal.ZERO) > 0) {
                walletService.creditRefund(
                        memberId,
                        refundAmount,
                        "CANCEL_REQ_" + request.getId(),
                        request.getReason());
            } else if (notificationService != null) {
                try {
                    notificationService.send(
                            memberId,
                            "Gói tập đã được duyệt hủy",
                            "Yêu cầu hủy gói tập của bạn đã được Quản lý phê duyệt.",
                            "payment",
                            "cancellation_request",
                            request.getId(),
                            "/member/packages");
                } catch (RuntimeException ignored) {
                }
            }

            if (notificationService != null && request.getRequestedBy() != null && request.getRequestedBy().getId() != null) {
                String memberName = request.getMember() != null && request.getMember().getUser() != null
                        ? request.getMember().getUser().getFullName()
                        : ("#" + memberId);
                try {
                    notificationService.send(
                            request.getRequestedBy().getId(),
                            "Quản lý đã duyệt yêu cầu hủy gói & hoàn tiền",
                            "Yêu cầu hủy gói của hội viên " + memberName + " đã được phê duyệt. Tiền hoàn đã chuyển vào Ví hội viên.",
                            "system",
                            "cancellation_request",
                            request.getId(),
                            "/staff/reception");
                } catch (RuntimeException ignored) {
                }
            }
        } else {
            if (notificationService != null) {
                try {
                    notificationService.send(
                            memberId,
                            "Yêu cầu hủy gói tập bị từ chối",
                            "Yêu cầu hủy gói tập chưa được Quản lý phê duyệt."
                                    + (body != null && body.note() != null && !body.note().isBlank() ? " Ghi chú: " + body.note().trim() : ""),
                            "system",
                            "cancellation_request",
                            request.getId(),
                            "/member/packages");
                } catch (RuntimeException ignored) {
                }
                if (request.getRequestedBy() != null && request.getRequestedBy().getId() != null) {
                    try {
                        notificationService.send(
                                request.getRequestedBy().getId(),
                                "Quản lý đã từ chối yêu cầu hủy gói",
                                "Yêu cầu hủy gói #" + request.getId() + " đã bị Quản lý từ chối.",
                                "system",
                                "cancellation_request",
                                request.getId(),
                                "/staff/reception");
                    } catch (RuntimeException ignored) {
                    }
                }
            }
        }
        User manager = users.findByIdAndDeletedAtIsNull(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.manager", principal.id()));
        request.setStatus(approve ? "APPROVED" : "REJECTED");
        request.setResolvedBy(manager);
        request.setResolvedAt(LocalDateTime.now(clock));
        request.setResolutionNote(body == null || body.note() == null ? null : body.note().trim());
        return toDto(requests.saveAndFlush(request));
    }

    private void ensureSoleEntitlement(Long memberId, Long cancellingId) {
        LocalDate today = LocalDate.now(clock);
        if (payments.hasUnsettledUpcomingEnrollmentPayment(memberId, today, LocalDateTime.now(clock).toLocalTime())) {
            throw new ConflictException("CANCELLATION_PAID_ENROLLMENT",
                    "error.membership.cancellation_paid_enrollment", null, null);
        }
        List<MembershipSubscription> history = subscriptions.findByMemberUserId(memberId);
        for (MembershipSubscription other : history) {
            if (other.getId().equals(cancellingId)) continue;
            String status = other.getStatus();
            if (("active".equalsIgnoreCase(status) || "frozen".equalsIgnoreCase(status))
                    && other.getEndDate() != null && !other.getEndDate().isBefore(today)) {
                throw new ConflictException("CANCELLATION_OTHER_ENTITLEMENT", "error.membership.cancellation_paid_future", null, null);
            }
            if ("pending_payment".equalsIgnoreCase(status)) {
                throw new ConflictException("CANCELLATION_PENDING_PAYMENT", "error.membership.cancellation_pending_payment", null, null);
            }
        }
    }

    private Member lockMember(Long memberId) {
        return members.findByUserIdForUpdate(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
    }

    private MembershipSubscription lockSubscription(Long subscriptionId) {
        MembershipSubscription subscription = subscriptions.findByIdForUpdate(subscriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.subscription", subscriptionId));
        if (entityManager != null) entityManager.refresh(subscription);
        return subscription;
    }

    /**
     * Suggested refund: the unused share of what the member actually paid for this period (including value carried
     * over from an upgraded package), never the current catalog price. A manager may still override it.
     */
    private BigDecimal defaultRefund(MembershipSubscription subscription) {
        SubscriptionValueCalculator calculator = valueCalculator != null ? valueCalculator : new SubscriptionValueCalculator(payments);
        return calculator.remainingValue(subscription, LocalDate.now(clock));
    }

    private boolean isActiveNow(MembershipSubscription subscription) {
        LocalDate today = LocalDate.now(clock);
        return "active".equalsIgnoreCase(subscription.getStatus())
                && subscription.getStartDate() != null && !subscription.getStartDate().isAfter(today)
                && subscription.getEndDate() != null && !subscription.getEndDate().isBefore(today);
    }

    private CancellationDtos.Response toDto(MembershipCancellationRequest request) {
        Member member = request.getMember();
        MembershipSubscription subscription = request.getSubscription();
        BigDecimal refund = request.getRefundAmount();
        if (refund == null && subscription != null) {
            refund = defaultRefund(subscription);
        }
        return new CancellationDtos.Response(request.getId(), member.getUserId(),
                member.getUser() == null ? null : member.getUser().getFullName(),
                subscription.getId(), subscription.getMembershipPackage().getName(),
                request.getReason(), request.getStatus(), request.getRequestedAt(),
                request.getResolvedBy() == null ? null : request.getResolvedBy().getId(),
                request.getResolvedAt(), request.getResolutionNote(),
                refund,
                request.getRequestedBy() == null ? null : request.getRequestedBy().getId(),
                request.getRequestedBy() == null ? null : request.getRequestedBy().getFullName());
    }
}
