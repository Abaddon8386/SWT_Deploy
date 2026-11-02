package com.swp391.scms.users.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@org.hibernate.annotations.Check(name = "ck_coaches_status", constraints = "employment_status IN ('active','on_leave','terminated')")
@Table(name = "coaches")
public class Coach {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "specialization", length = 150)
    private String specialization;

    @Column(name = "bio", length = org.hibernate.Length.LONG32)
    private String bio;

    @Column(name = "certification", length = 255)
    private String certification;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(name = "employment_status", nullable = false, length = 20)
    private String employmentStatus = "active";

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getSpecialization() { return specialization; }
    public void setSpecialization(String specialization) { this.specialization = specialization; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getCertification() { return certification; }
    public void setCertification(String certification) { this.certification = certification; }

    public LocalDate getHireDate() { return hireDate; }
    public void setHireDate(LocalDate hireDate) { this.hireDate = hireDate; }

    public String getEmploymentStatus() { return employmentStatus; }
    public void setEmploymentStatus(String employmentStatus) { this.employmentStatus = employmentStatus; }
}
