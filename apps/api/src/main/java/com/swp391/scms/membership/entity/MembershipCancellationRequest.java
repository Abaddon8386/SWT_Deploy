package com.swp391.scms.membership.entity;

import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "membership_cancellation_requests", indexes = {
        @Index(name = "ix_cancellation_member_status", columnList = "member_id, status"),
        @Index(name = "ix_cancellation_subscription", columnList = "subscription_id")
})
@org.hibernate.annotations.Check(name = "ck_cancellation_status", constraints = "status IN ('PENDING','APPROVED','REJECTED')")
public class MembershipCancellationRequest {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subscription_id", nullable = false)
    private MembershipSubscription subscription;
    @Column(name = "reason", nullable = false, length = 500)
    private String reason;
    @Column(name = "refund_amount", precision = 15, scale = 2)
    private BigDecimal refundAmount;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by")
    private User requestedBy;
    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING";
    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    private User resolvedBy;
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
    @Column(name = "resolution_note", length = 500)
    private String resolutionNote;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }
    public MembershipSubscription getSubscription() { return subscription; }
    public void setSubscription(MembershipSubscription subscription) { this.subscription = subscription; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public BigDecimal getRefundAmount() { return refundAmount; }
    public void setRefundAmount(BigDecimal refundAmount) { this.refundAmount = refundAmount; }
    public User getRequestedBy() { return requestedBy; }
    public void setRequestedBy(User requestedBy) { this.requestedBy = requestedBy; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public void setRequestedAt(LocalDateTime requestedAt) { this.requestedAt = requestedAt; }
    public User getResolvedBy() { return resolvedBy; }
    public void setResolvedBy(User resolvedBy) { this.resolvedBy = resolvedBy; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
}
