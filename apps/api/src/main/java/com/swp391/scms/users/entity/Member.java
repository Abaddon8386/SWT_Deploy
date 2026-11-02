package com.swp391.scms.users.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@org.hibernate.annotations.Check(name = "ck_members_level", constraints = "fitness_level IN ('beginner','intermediate','advanced')")
@Table(name = "members")
public class Member {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "membership_code", nullable = false, unique = true, length = 30)
    private String membershipCode;

    @Column(name = "join_date", nullable = false)
    private LocalDate joinDate;

    @Column(name = "health_notes")
    private String healthNotes;

    @Column(name = "fitness_goal", length = 255)
    private String fitnessGoal;

    @Column(name = "fitness_level", nullable = false, length = 20)
    private String fitnessLevel = "beginner"; // beginner, intermediate, advanced

    @Column(name = "emergency_contact_name", length = 150)
    private String emergencyContactName;

    @Column(name = "emergency_contact_phone", length = 20)
    private String emergencyContactPhone;

    // Capability for data-free Realtime invalidations; never serialized in member DTOs.
    @Column(name = "payment_realtime_topic")
    private java.util.UUID paymentRealtimeTopic;

    public java.util.UUID getPaymentRealtimeTopic() { return paymentRealtimeTopic; }
    public void setPaymentRealtimeTopic(java.util.UUID topic) { paymentRealtimeTopic = topic; }

    // Getters and Setters
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getMembershipCode() { return membershipCode; }
    public void setMembershipCode(String membershipCode) { this.membershipCode = membershipCode; }

    public LocalDate getJoinDate() { return joinDate; }
    public void setJoinDate(LocalDate joinDate) { this.joinDate = joinDate; }

    public String getHealthNotes() { return healthNotes; }
    public void setHealthNotes(String healthNotes) { this.healthNotes = healthNotes; }

    public String getFitnessGoal() { return fitnessGoal; }
    public void setFitnessGoal(String fitnessGoal) { this.fitnessGoal = fitnessGoal; }

    public String getFitnessLevel() { return fitnessLevel; }
    public void setFitnessLevel(String fitnessLevel) { this.fitnessLevel = fitnessLevel; }

    public String getEmergencyContactName() { return emergencyContactName; }
    public void setEmergencyContactName(String emergencyContactName) { this.emergencyContactName = emergencyContactName; }

    public String getEmergencyContactPhone() { return emergencyContactPhone; }
    public void setEmergencyContactPhone(String emergencyContactPhone) { this.emergencyContactPhone = emergencyContactPhone; }

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "member_favorite_disciplines",
        joinColumns = @JoinColumn(name = "member_id"),
        inverseJoinColumns = @JoinColumn(name = "discipline_id")
    )
    private java.util.Set<com.swp391.scms.facilities.entity.Discipline> favoriteDisciplines = new java.util.HashSet<>();

    public java.util.Set<com.swp391.scms.facilities.entity.Discipline> getFavoriteDisciplines() { return favoriteDisciplines; }
    public void setFavoriteDisciplines(java.util.Set<com.swp391.scms.facilities.entity.Discipline> favoriteDisciplines) { this.favoriteDisciplines = favoriteDisciplines; }

}
