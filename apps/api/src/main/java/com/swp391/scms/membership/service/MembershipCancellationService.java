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
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        request.setRequestedAt(LocalDateTime.now(clock));
        return toDto(requests.saveAndFlush(request));
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
            enrollments.cancelFutureEnrollmentsForMember(memberId, cancelReason);
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

    private boolean isActiveNow(MembershipSubscription subscription) {
        LocalDate today = LocalDate.now(clock);
        return "active".equalsIgnoreCase(subscription.getStatus())
                && subscription.getStartDate() != null && !subscription.getStartDate().isAfter(today)
                && subscription.getEndDate() != null && !subscription.getEndDate().isBefore(today);
    }

    private CancellationDtos.Response toDto(MembershipCancellationRequest request) {
        Member member = request.getMember();
        MembershipSubscription subscription = request.getSubscription();
        return new CancellationDtos.Response(request.getId(), member.getUserId(),
                member.getUser() == null ? null : member.getUser().getFullName(),
                subscription.getId(), subscription.getMembershipPackage().getName(),
                request.getReason(), request.getStatus(), request.getRequestedAt(),
                request.getResolvedBy() == null ? null : request.getResolvedBy().getId(),
                request.getResolvedAt(), request.getResolutionNote());
    }
}
