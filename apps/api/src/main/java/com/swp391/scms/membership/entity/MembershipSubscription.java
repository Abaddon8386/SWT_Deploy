package com.swp391.scms.membership.entity;

import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Entity mapping table membership_subscriptions (schema is generated code-first by Hibernate). */
@Entity
@org.hibernate.annotations.Check(name = "ck_subscriptions_status", constraints = "status IN ('pending_payment','active','frozen','expired','cancelled')")
@Table(name = "membership_subscriptions", indexes = {@Index(name = "ix_subscriptions_member_status", columnList = "member_id, status"), @Index(name = "ix_subscriptions_end_date", columnList = "end_date")})
public class MembershipSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "package_id", nullable = false)
    private MembershipPackage membershipPackage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "previous_subscription_id")
    private MembershipSubscription previousSubscription;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "pending_payment";

    @Column(name = "qr_code", length = 255, unique = true)
    private String qrCode;

    /** Quoted amount for an upgrade: new package price minus {@link #creditApplied}; null for ordinary purchases and renewals. */
    @Column(name = "upgrade_charge", precision = 14, scale = 2)
    private BigDecimal upgradeCharge;

    /**
     * For an upgrade: unused value of the replaced period carried into this one, fixed when the upgrade is quoted.
     * It comes from what the member actually paid, so later catalog price changes never alter it.
     */
    @Column(name = "credit_applied", precision = 14, scale = 2)
    private BigDecimal creditApplied;

    /**
     * For a new registration or renewal: the catalog price when the request was made. Like an upgrade quote it is
     * what the member pays even if the manager reprices the package before payment; null for older requests.
     */
    @Column(name = "quoted_price", precision = 14, scale = 2)
    private BigDecimal quotedPrice;

    /** For an upgrade: the expiry the replaced period had before the upgrade cut it short. */
    @Column(name = "replaced_end_date")
    private java.time.LocalDate replacedEndDate;

    public java.time.LocalDate getReplacedEndDate() { return replacedEndDate; }
    public void setReplacedEndDate(java.time.LocalDate replacedEndDate) { this.replacedEndDate = replacedEndDate; }

    @Column(name = "hold_status", length = 20)
    private String holdStatus;

    @Column(name = "hold_reason", length = 500)
    private String holdReason;

    @Column(name = "hold_requested_at")
    private LocalDateTime holdRequestedAt;

    @Column(name = "hold_resolved_at")
    private LocalDateTime holdResolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hold_resolved_by")
    private User holdResolvedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }
    public MembershipPackage getMembershipPackage() { return membershipPackage; }
    public void setMembershipPackage(MembershipPackage membershipPackage) { this.membershipPackage = membershipPackage; }
    public MembershipSubscription getPreviousSubscription() { return previousSubscription; }
    public void setPreviousSubscription(MembershipSubscription previousSubscription) { this.previousSubscription = previousSubscription; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getQrCode() { return qrCode; }
    public void setQrCode(String qrCode) { this.qrCode = qrCode; }
    public BigDecimal getUpgradeCharge() { return upgradeCharge; }
    public void setUpgradeCharge(BigDecimal upgradeCharge) { this.upgradeCharge = upgradeCharge; }
    public BigDecimal getCreditApplied() { return creditApplied; }
    public void setCreditApplied(BigDecimal creditApplied) { this.creditApplied = creditApplied; }
    public BigDecimal getQuotedPrice() { return quotedPrice; }
    public void setQuotedPrice(BigDecimal quotedPrice) { this.quotedPrice = quotedPrice; }
    /**
     * What the member owes at the counter or on VNPay: the price fixed when the request was made (upgrade charge or
     * quoted catalog price). Only requests created before prices were fixed fall back to the current package price.
     */
    public BigDecimal payableAmount() {
        if (upgradeCharge != null) return upgradeCharge;
        if (quotedPrice != null) return quotedPrice;
        return membershipPackage != null ? membershipPackage.getPrice() : null;
    }
    public String getHoldStatus() { return holdStatus; }
    public void setHoldStatus(String holdStatus) { this.holdStatus = holdStatus; }
    public String getHoldReason() { return holdReason; }
    public void setHoldReason(String holdReason) { this.holdReason = holdReason; }
    public LocalDateTime getHoldRequestedAt() { return holdRequestedAt; }
    public void setHoldRequestedAt(LocalDateTime holdRequestedAt) { this.holdRequestedAt = holdRequestedAt; }
    public LocalDateTime getHoldResolvedAt() { return holdResolvedAt; }
    public void setHoldResolvedAt(LocalDateTime holdResolvedAt) { this.holdResolvedAt = holdResolvedAt; }
    public User getHoldResolvedBy() { return holdResolvedBy; }
    public void setHoldResolvedBy(User holdResolvedBy) { this.holdResolvedBy = holdResolvedBy; }
    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
