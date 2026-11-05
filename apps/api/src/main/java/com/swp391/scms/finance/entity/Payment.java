package com.swp391.scms.finance.entity;

import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entity mapping table payments on Supabase PostgreSQL (Module F: Thanh toán & Báo cáo).
 */
@Entity
@org.hibernate.annotations.Check(name = "ck_payments_method", constraints = "method IN ('cash','pos','bank_transfer','online_wallet')")
@org.hibernate.annotations.Check(name = "ck_payments_status", constraints = "status IN ('success','pending','failed','refunded')")
@Table(name = "payments", indexes = {
        @Index(name = "ix_payments_member_status", columnList = "member_id, status"),
        @Index(name = "ix_payments_paid_at", columnList = "paid_at")
})
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    /** Read-only mapping so the schema generator emits fk_payments_subscription; writes go through subscriptionId. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id", insertable = false, updatable = false)
    private MembershipSubscription subscription;

    @Column(name = "coach_booking_id")
    private Long coachBookingId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coach_booking_id", insertable = false, updatable = false)
    private com.swp391.scms.coaching.entity.CoachBooking coachBooking;
    @Column(name = "court_booking_id")
    private Long courtBookingId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "court_booking_id", insertable = false, updatable = false)
    private com.swp391.scms.courts.entity.CourtBooking courtBooking;
    @Column(name = "product_order_id")
    private Long productOrderId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_order_id", insertable = false, updatable = false)
    private com.swp391.scms.shop.entity.ProductOrder productOrder;

    public Long getCoachBookingId() { return coachBookingId; }
    public void setCoachBookingId(Long id) { coachBookingId = id; }
    public Long getCourtBookingId() { return courtBookingId; }
    public void setCourtBookingId(Long id) { courtBookingId = id; }
    public Long getProductOrderId() { return productOrderId; }
    public void setProductOrderId(Long id) { productOrderId = id; }
    public com.swp391.scms.shop.entity.ProductOrder getProductOrder() { return productOrder; }
    public void setProductOrder(com.swp391.scms.shop.entity.ProductOrder productOrder) { this.productOrder = productOrder; }

    @Column(name = "class_enrollment_id")
    private Long classEnrollmentId;

    /** Read-only mapping so the schema generator emits fk_payments_enrollment; writes go through classEnrollmentId. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "class_enrollment_id", insertable = false, updatable = false)
    private ClassEnrollment classEnrollment;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    /** Money already returned to the member; a partial refund keeps the payment successful. */
    @Column(name = "refunded_amount", precision = 12, scale = 2)
    private BigDecimal refundedAmount;

    @Column(nullable = false, length = 20)
    private String method; // cash, pos, bank_transfer, online_wallet

    @Column(nullable = false, length = 20)
    private String status = "pending"; // success, pending, failed, refunded

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "received_by")
    private User receivedBy;

    @Column(length = 255)
    private String note;

    /** Receipt photo (data URL) a member attaches to a cash payment for the receptionist to verify. */
    @Column(name = "receipt_image", columnDefinition = "text")
    private String receiptImage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @OneToOne(mappedBy = "payment", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Invoice invoice;

    public Payment() {}

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

    public Long getSubscriptionId() {
        return subscriptionId;
    }

    public void setSubscriptionId(Long subscriptionId) {
        this.subscriptionId = subscriptionId;
    }

    public Long getClassEnrollmentId() {
        return classEnrollmentId;
    }

    public void setClassEnrollmentId(Long classEnrollmentId) {
        this.classEnrollmentId = classEnrollmentId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getPaidAt() {
        return paidAt;
    }

    public void setPaidAt(LocalDateTime paidAt) {
        this.paidAt = paidAt;
    }

    public User getReceivedBy() {
        return receivedBy;
    }

    public void setReceivedBy(User receivedBy) {
        this.receivedBy = receivedBy;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public String getReceiptImage() {
        return receiptImage;
    }

    public void setReceiptImage(String receiptImage) {
        this.receiptImage = receiptImage;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public Invoice getInvoice() {
        return invoice;
    }

    public void setInvoice(Invoice invoice) {
        this.invoice = invoice;
    }

    public BigDecimal getRefundedAmount() {
        return refundedAmount;
    }

    public void setRefundedAmount(BigDecimal refundedAmount) {
        this.refundedAmount = refundedAmount;
    }

    /** Amount the centre keeps: what was paid minus what was refunded. */
    public BigDecimal netAmount() {
        if (amount == null) return BigDecimal.ZERO;
        return refundedAmount == null ? amount : amount.subtract(refundedAmount);
    }
}
