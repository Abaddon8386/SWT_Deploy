package com.swp391.scms.coaching.entity;

import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import org.hibernate.Length;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entity mapping monthly performance review, badges and ranking of coaches (SCRUM-134).
 */
@Entity
@Table(name = "coach_monthly_reviews", indexes = {
        @Index(name = "ix_coach_month_rev_coach", columnList = "coach_id"),
        @Index(name = "ix_coach_month_rev_period", columnList = "review_year, review_month")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uk_coach_month_review", columnNames = {"coach_id", "review_year", "review_month"})
})
public class CoachMonthlyReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coach_id", nullable = false)
    private Coach coach;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private User manager;

    @Column(name = "review_year", nullable = false)
    private Integer year;

    @Column(name = "review_month", nullable = false)
    private Integer month;

    @Column(name = "average_rating", precision = 3, scale = 2)
    private BigDecimal averageRating;

    @Column(name = "total_reviews", nullable = false)
    private Integer totalReviews = 0;

    @Column(name = "total_sessions", nullable = false)
    private Integer totalSessions = 0;

    @Column(name = "rank_position")
    private Integer rankPosition;

    @Column(name = "badge", length = 100)
    private String badge;

    @Column(name = "bonus_amount", precision = 12, scale = 2)
    private BigDecimal bonusAmount = BigDecimal.ZERO;

    @Column(name = "manager_feedback", length = Length.LONG32)
    private String managerFeedback;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "published"; // draft, published

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void onSave() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Coach getCoach() { return coach; }
    public void setCoach(Coach coach) { this.coach = coach; }

    public User getManager() { return manager; }
    public void setManager(User manager) { this.manager = manager; }

    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }

    public Integer getMonth() { return month; }
    public void setMonth(Integer month) { this.month = month; }

    public BigDecimal getAverageRating() { return averageRating; }
    public void setAverageRating(BigDecimal averageRating) { this.averageRating = averageRating; }

    public Integer getTotalReviews() { return totalReviews; }
    public void setTotalReviews(Integer totalReviews) { this.totalReviews = totalReviews; }

    public Integer getTotalSessions() { return totalSessions; }
    public void setTotalSessions(Integer totalSessions) { this.totalSessions = totalSessions; }

    public Integer getRankPosition() { return rankPosition; }
    public void setRankPosition(Integer rankPosition) { this.rankPosition = rankPosition; }

    public String getBadge() { return badge; }
    public void setBadge(String badge) { this.badge = badge; }

    public BigDecimal getBonusAmount() { return bonusAmount; }
    public void setBonusAmount(BigDecimal bonusAmount) { this.bonusAmount = bonusAmount; }

    public String getManagerFeedback() { return managerFeedback; }
    public void setManagerFeedback(String managerFeedback) { this.managerFeedback = managerFeedback; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

