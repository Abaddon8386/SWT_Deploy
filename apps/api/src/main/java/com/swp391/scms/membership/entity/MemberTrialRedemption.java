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
        @UniqueConstraint(name = "uq_trial_cccd", columnNames = {"cccd"}),
        @UniqueConstraint(name = "uq_trial_member", columnNames = {"member_id"})
})
public class MemberTrialRedemption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "cccd", nullable = false, length = 20)
    private String cccd;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id", nullable = false)
    private MembershipSubscription subscription;

    @Column(name = "redeemed_at", nullable = false)
    private LocalDateTime redeemedAt = LocalDateTime.now();

    public MemberTrialRedemption() {}

    public MemberTrialRedemption(Member member, String cccd, String fullName, MembershipSubscription subscription) {
        this.member = member;
        this.cccd = cccd;
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

    public String getCccd() {
        return cccd;
    }

    public void setCccd(String cccd) {
        this.cccd = cccd;
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

