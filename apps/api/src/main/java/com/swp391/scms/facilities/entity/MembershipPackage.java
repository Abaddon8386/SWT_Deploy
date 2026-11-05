package com.swp391.scms.facilities.entity;

import jakarta.persistence.*;
import com.swp391.scms.users.entity.User;
import org.hibernate.Length;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Entity mapping table membership_packages (Module B: Master Facilities). */
@Entity
@org.hibernate.annotations.Check(name = "ck_packages_status", constraints = "status IN ('active','inactive')")
@Table(name = "membership_packages")
public class MembershipPackage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = Length.LONG32)
    private String description;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(name = "duration_days", nullable = false)
    private int durationDays;

    @Column(name = "class_credit_limit")
    private Integer classCreditLimit;

    @Column(nullable = false, length = 20)
    private String status = "active"; // active, inactive

    @Column(length = 30)
    private String tier; // SILVER, GOLD, PLATINUM

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public int getDurationDays() { return durationDays; }
    public void setDurationDays(int durationDays) { this.durationDays = durationDays; }
    public Integer getClassCreditLimit() { return classCreditLimit; }
    public void setClassCreditLimit(Integer classCreditLimit) { this.classCreditLimit = classCreditLimit; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }
}
