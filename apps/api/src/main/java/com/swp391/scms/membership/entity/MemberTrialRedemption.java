package com.swp391.scms.membership.entity;

import com.swp391.scms.users.entity.Member;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Entity tracking 3-day free Gold trial redemptions verified by Citizen Identity Card (CCCD).
 * Each CCCD and each Member can only redeem once.
 */
@Entity
@Table(name = "member_trial_redemptions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_trial_cccd_hash", columnNames = {"cccd_hash"}),
        @UniqueConstraint(name = "uq_trial_member", columnNames = {"member_id"})
})
public class MemberTrialRedemption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /** HMAC-SHA256 của số CCCD; không lưu số gốc. */
    @Column(name = "cccd_hash", nullable = false, length = 64)
    private String cccdHash;

    @Column(name = "cccd_last4", nullable = false, length = 4)
    private String cccdLast4;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id", nullable = false)
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

