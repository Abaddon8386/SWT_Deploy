package com.swp391.scms.courts.entity;

import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;

@Entity
@Table(name = "court_bookings", indexes = {
        @Index(name = "ix_court_bookings_room_date", columnList = "room_id, booking_date"),
        @Index(name = "ix_court_bookings_member_date", columnList = "member_id, booking_date")})
@org.hibernate.annotations.Check(name = "ck_court_bookings_status", constraints = "status IN ('booked','cancelled')")
@org.hibernate.annotations.Check(name = "ck_court_bookings_time", constraints = "start_time < end_time")
public class CourtBooking {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "room_id", nullable = false) private Room room;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "member_id", nullable = false) private User member;
    @Column(name = "booking_date", nullable = false) private LocalDate bookingDate;
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "end_time", nullable = false) private LocalTime endTime;
    @Column(nullable = false, length = 20) private String status = "booked";
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "cancelled_at") private LocalDateTime cancelledAt;
    @Column(name = "cancel_reason", length = 255) private String cancelReason;
    /** Court fee for the slot; null on bookings made before pricing existed (they were free). */
    @Column(precision = 12, scale = 2) private BigDecimal price;
    /** {@code package_quota} when the plan covered the slot, otherwise the method paid at booking time. */
    @Column(name = "payment_method", length = 20) private String paymentMethod;
    @Column(name = "payment_status", length = 20) private String paymentStatus;
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Room getRoom() { return room; }
    public void setRoom(Room room) { this.room = room; }
    public User getMember() { return member; }
    public void setMember(User member) { this.member = member; }
    public LocalDate getBookingDate() { return bookingDate; }
    public void setBookingDate(LocalDate value) { bookingDate = value; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime value) { startTime = value; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime value) { endTime = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { createdAt = value; }
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime value) { cancelledAt = value; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String value) { cancelReason = value; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal value) { price = value; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String value) { paymentMethod = value; }
    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String value) { paymentStatus = value; }
}
