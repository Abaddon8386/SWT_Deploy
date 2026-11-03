package com.swp391.scms.scheduling.entity;

import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/**
 * A member's seat in ONE class session. Unlike {@link ClassEnrollment}, which holds a seat for every session of a
 * class, a booking is made, cancelled and counted per session, so members can pick individual days, a whole week or a
 * whole month. Capacity and the one-booking-per-session rule are enforced by database triggers/indexes.
 */
@Entity
@org.hibernate.annotations.Check(name = "ck_session_bookings_status", constraints = "status IN ('booked','cancelled','completed')")
@Table(name = "session_bookings", indexes = {
        @Index(name = "ix_session_bookings_session_status", columnList = "session_id, status"),
        @Index(name = "ix_session_bookings_member_status", columnList = "member_id, status")})
public class SessionBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    @JoinColumn(name = "session_id", nullable = false)
    private ClassSession session;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "booked";

    @Column(name = "booked_at", nullable = false)
    private LocalDateTime bookedAt;

    /** Groups the bookings created by one bulk request (week / month / hand-picked sessions). */
    @Column(name = "batch_id", length = 36)
    private String batchId;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cancelled_by")
    private User cancelledBy;

    @Column(name = "cancel_reason", length = 255)
    private String cancelReason;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ClassSession getSession() { return session; }
    public void setSession(ClassSession session) { this.session = session; }
    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getBookedAt() { return bookedAt; }
    public void setBookedAt(LocalDateTime bookedAt) { this.bookedAt = bookedAt; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }
    public User getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(User cancelledBy) { this.cancelledBy = cancelledBy; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
}
