package com.swp391.scms.membership.entity;

import com.swp391.scms.users.entity.Member;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Entity tracking 3-day free trial redemptions verified by Citizen Identity Card (CCCD) or Passport.
 * Each document hash and each Member can only redeem once.
 * Submissions initially stay in PENDING_APPROVAL until verified at the reception desk.
 */
@Entity
@Table(name = "member_trial_redemptions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_trial_cccd_hash", columnNames = {"cccd_hash"}),
        @UniqueConstraint(name = "uq_trial_member", columnNames = {"member_id"})
})
public class MemberTrialRedemption {

    public static final String STATUS_PENDING = "PENDING_APPROVAL";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";

    public static final String DOC_CCCD = "CCCD";
    public static final String DOC_PASSPORT = "PASSPORT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /** HMAC-SHA256 của số CCCD/Hộ chiếu; không lưu số gốc. */
    @Column(name = "cccd_hash", nullable = false, length = 64)
    private String cccdHash;

    @Column(name = "cccd_last4", nullable = false, length = 4)
    private String cccdLast4;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(name = "document_type", length = 20)
    private String documentType = DOC_CCCD; // CCCD, PASSPORT

    @Column(name = "nationality", length = 100)
    private String nationality;

    @Column(name = "front_image_url", columnDefinition = "TEXT")
    private String frontImageUrl;

    @Column(name = "back_image_url", columnDefinition = "TEXT")
    private String backImageUrl;

    @Column(name = "status", length = 30)
    private String status = STATUS_PENDING; // PENDING_APPROVAL, APPROVED, REJECTED

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id", nullable = true)
    private MembershipSubscription subscription;

    @Column(name = "redeemed_at", nullable = false)
    private LocalDateTime redeemedAt = LocalDateTime.now();

    public MemberTrialRedemption() {}

    public MemberTrialRedemption(Member member, String cccdHash, String cccdLast4, String fullName, MembershipSubscription subscription) {
        this.member = member;
        this.cccdHash = cccdHash;
        this.cccdLast4 = cccdLast4;
        this.fullName = fullName;
        this.subscription = subscription;
        this.status = subscription != null ? STATUS_APPROVED : STATUS_PENDING;
        this.redeemedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Member getMember() {
        return member;
    }

    public void setMember(Member member) {
        this.member = member;
    }

    public String getCccdHash() {
        return cccdHash;
    }

    public void setCccdHash(String cccdHash) {
        this.cccdHash = cccdHash;
    }

    public String getCccdLast4() {
        return cccdLast4;
    }

    public void setCccdLast4(String cccdLast4) {
        this.cccdLast4 = cccdLast4;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getDocumentType() {
        return documentType;
    }

    public void setDocumentType(String documentType) {
        this.documentType = documentType;
    }

    public String getNationality() {
        return nationality;
    }

    public void setNationality(String nationality) {
        this.nationality = nationality;
    }

    public String getFrontImageUrl() {
        return frontImageUrl;
    }

    public void setFrontImageUrl(String frontImageUrl) {
        this.frontImageUrl = frontImageUrl;
    }

    public String getBackImageUrl() {
        return backImageUrl;
    }

    public void setBackImageUrl(String backImageUrl) {
        this.backImageUrl = backImageUrl;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(Long reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public LocalDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(LocalDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public MembershipSubscription getSubscription() {
        return subscription;
    }

    public void setSubscription(MembershipSubscription subscription) {
        this.subscription = subscription;
    }

    public LocalDateTime getRedeemedAt() {
        return redeemedAt;
    }

    public void setRedeemedAt(LocalDateTime redeemedAt) {
        this.redeemedAt = redeemedAt;
    }
}
