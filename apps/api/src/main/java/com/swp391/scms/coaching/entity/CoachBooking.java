package com.swp391.scms.coaching.entity;

import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * SCRUM-133: Entity mapping 1-on-1 coach booking (PT private session).
 * Enforces hourly slot booking, minimum 2-hour advance booking, anti-conflict, and paid/quota verification.
 */
@Entity
@org.hibernate.annotations.Check(name = "ck_coach_bookings_status", constraints = "status IN ('confirmed','cancelled','completed')")
@org.hibernate.annotations.Check(name = "ck_coach_bookings_payment_status", constraints = "payment_status IN ('paid','used_quota','pending')")
@Table(name = "coach_bookings", indexes = {
        @Index(name = "ix_coach_bookings_coach_date", columnList = "coach_id, booking_date"),
        @Index(name = "ix_coach_bookings_member_date", columnList = "member_id, booking_date"),
        @Index(name = "ix_coach_bookings_status", columnList = "status")
})
public class CoachBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coach_id", nullable = false)
    private Coach coach;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "discipline_id")
    private Discipline discipline;

    @Column(name = "booking_date", nullable = false)
    private LocalDate bookingDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "hourly_rate", nullable = false, precision = 12, scale = 2)
    private BigDecimal hourlyRate = new BigDecimal("200000.00");

    @Column(name = "payment_method", nullable = false, length = 30)
    private String paymentMethod = "package_quota"; // package_quota, cash, bank_transfer, online_wallet

    @Column(name = "payment_status", nullable = false, length = 20)
    private String paymentStatus = "used_quota"; // used_quota, paid, pending

    @Column(name = "status", nullable = false, length = 20)
    private String status = "confirmed"; // confirmed, cancelled, completed

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancel_reason", length = 255)
    private String cancelReason;

    public CoachBooking() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }

    public Coach getCoach() { return coach; }
    public void setCoach(Coach coach) { this.coach = coach; }

    public Discipline getDiscipline() { return discipline; }
    public void setDiscipline(Discipline discipline) { this.discipline = discipline; }

    public LocalDate getBookingDate() { return bookingDate; }
    public void setBookingDate(LocalDate bookingDate) { this.bookingDate = bookingDate; }

    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }

    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }

    public BigDecimal getHourlyRate() { return hourlyRate; }
    public void setHourlyRate(BigDecimal hourlyRate) { this.hourlyRate = hourlyRate; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
}
