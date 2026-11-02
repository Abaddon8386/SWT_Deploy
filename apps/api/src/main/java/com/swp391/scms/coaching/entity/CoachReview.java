package com.swp391.scms.coaching.entity;

import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import jakarta.persistence.*;
import org.hibernate.Length;

import java.time.LocalDateTime;

/**
 * Entity mapping member feedback and rating for a Coach (SCRUM-134).
 */
@Entity
@Table(name = "coach_reviews", uniqueConstraints = {
        @UniqueConstraint(name = "uq_review_member_booking", columnNames = {"member_id", "booking_id"}),
        @UniqueConstraint(name = "uq_review_member_session", columnNames = {"member_id", "class_session_id"})
}, indexes = {
        @Index(name = "ix_coach_reviews_coach", columnList = "coach_id"),
        @Index(name = "ix_coach_reviews_member", columnList = "member_id")
})
public class CoachReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coach_id", nullable = false)
    private Coach coach;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "booking_id")
    private Long bookingId;

    @Column(name = "class_session_id")
    private Long classSessionId;

    @Column(name = "rating", nullable = false)
    private Integer rating; // 1 to 5

    @Column(name = "comment", length = Length.LONG32)
    private String comment;

    @Column(name = "is_anonymous")
    private Boolean isAnonymous = false;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "approved"; // approved, pending, hidden

    @Column(name = "manager_notes", length = Length.LONG32)
    private String managerNotes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Coach getCoach() { return coach; }
    public void setCoach(Coach coach) { this.coach = coach; }

    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }

    public Long getBookingId() { return bookingId; }
    public void setBookingId(Long bookingId) { this.bookingId = bookingId; }

    public Long getClassSessionId() { return classSessionId; }
    public void setClassSessionId(Long classSessionId) { this.classSessionId = classSessionId; }

    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Boolean getIsAnonymous() { return isAnonymous; }
    public void setIsAnonymous(Boolean anonymous) { isAnonymous = anonymous; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getManagerNotes() { return managerNotes; }
    public void setManagerNotes(String managerNotes) { this.managerNotes = managerNotes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}

