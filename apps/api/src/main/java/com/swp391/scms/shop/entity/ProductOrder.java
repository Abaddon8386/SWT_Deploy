package com.swp391.scms.shop.entity;

import com.swp391.scms.shop.service.AddressService.ShippingSnapshot;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import org.hibernate.annotations.Check;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
    name = "product_orders",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_product_orders_code", columnNames = "code"),
        @UniqueConstraint(name = "uq_product_orders_member_request", columnNames = {"member_id", "client_request_id"})
    },
    indexes = {
        @Index(name = "ix_product_orders_member_created", columnList = "member_id, created_at"),
        @Index(name = "ix_product_orders_status_created", columnList = "status, created_at")
    }
)
@Check(name = "ck_product_orders_total", constraints = "total = subtotal + shipping_fee")
public class ProductOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "client_request_id", nullable = false, length = 36)
    private String clientRequestId;

    @Column(nullable = false, length = 20)
    private String status = OrderStatus.pending_payment.name();

    @Column(nullable = false, length = 10)
    private String fulfillment;

    @Column(name = "payment_method", nullable = false, length = 10)
    private String paymentMethod;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(name = "shipping_fee", nullable = false, precision = 12, scale = 2)
    private BigDecimal shippingFee = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(name = "ship_recipient_name", length = 80)
    private String shipRecipientName;

    @Column(name = "ship_phone", length = 15)
    private String shipPhone;

    @Column(name = "ship_province_name", length = 80)
    private String shipProvinceName;

    @Column(name = "ship_ward_name", length = 80)
    private String shipWardName;

    @Column(name = "ship_street_line", length = 200)
    private String shipStreetLine;

    @Column(name = "ship_note", length = 200)
    private String shipNote;

    @Column(name = "payment_due_at")
    private LocalDateTime paymentDueAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "processing_at")
    private LocalDateTime processingAt;

    @Column(name = "shipped_at")
    private LocalDateTime shippedAt;

    @Column(name = "ready_at")
    private LocalDateTime readyAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancel_reason", length = 255)
    private String cancelReason;

    @Column(name = "cancelled_by_id")
    private Long cancelledById;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cancelled_by_id", insertable = false, updatable = false)
    private User cancelledBy;

    @Column(name = "tracking_carrier", length = 60)
    private String trackingCarrier;

    @Column(name = "tracking_number", length = 60)
    private String trackingNumber;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<ProductOrderItem> items = new ArrayList<>();

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void applyShipping(ShippingSnapshot ship) {
        if (ship == null) {
            this.shipRecipientName = null;
            this.shipPhone = null;
            this.shipProvinceName = null;
            this.shipWardName = null;
            this.shipStreetLine = null;
            this.shipNote = null;
        } else {
            this.shipRecipientName = ship.recipientName();
            this.shipPhone = ship.phone();
            this.shipProvinceName = ship.provinceName();
            this.shipWardName = ship.wardName();
            this.shipStreetLine = ship.streetLine();
            this.shipNote = ship.note();
        }
    }

    public void addItem(ProductOrderItem item) {
        if (item != null) {
            item.setOrder(this);
            this.items.add(item);
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }

    public String getClientRequestId() { return clientRequestId; }
    public void setClientRequestId(String clientRequestId) { this.clientRequestId = clientRequestId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getFulfillment() { return fulfillment; }
    public void setFulfillment(String fulfillment) { this.fulfillment = fulfillment; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public BigDecimal getSubtotal() { return subtotal; }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }

    public BigDecimal getShippingFee() { return shippingFee; }
    public void setShippingFee(BigDecimal shippingFee) { this.shippingFee = shippingFee; }

    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }

    public String getShipRecipientName() { return shipRecipientName; }
    public void setShipRecipientName(String shipRecipientName) { this.shipRecipientName = shipRecipientName; }

    public String getShipPhone() { return shipPhone; }
    public void setShipPhone(String shipPhone) { this.shipPhone = shipPhone; }

    public String getShipProvinceName() { return shipProvinceName; }
    public void setShipProvinceName(String shipProvinceName) { this.shipProvinceName = shipProvinceName; }

    public String getShipWardName() { return shipWardName; }
    public void setShipWardName(String shipWardName) { this.shipWardName = shipWardName; }

    public String getShipStreetLine() { return shipStreetLine; }
    public void setShipStreetLine(String shipStreetLine) { this.shipStreetLine = shipStreetLine; }

    public String getShipNote() { return shipNote; }
    public void setShipNote(String shipNote) { this.shipNote = shipNote; }

    public LocalDateTime getPaymentDueAt() { return paymentDueAt; }
    public void setPaymentDueAt(LocalDateTime paymentDueAt) { this.paymentDueAt = paymentDueAt; }

    public LocalDateTime getPaidAt() { return paidAt; }
    public void setPaidAt(LocalDateTime paidAt) { this.paidAt = paidAt; }

    public LocalDateTime getProcessingAt() { return processingAt; }
    public void setProcessingAt(LocalDateTime processingAt) { this.processingAt = processingAt; }

    public LocalDateTime getShippedAt() { return shippedAt; }
    public void setShippedAt(LocalDateTime shippedAt) { this.shippedAt = shippedAt; }

    public LocalDateTime getReadyAt() { return readyAt; }
    public void setReadyAt(LocalDateTime readyAt) { this.readyAt = readyAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }

    public Long getCancelledById() { return cancelledById; }
    public void setCancelledById(Long cancelledById) { this.cancelledById = cancelledById; }

    public User getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(User cancelledBy) {
        this.cancelledBy = cancelledBy;
        this.cancelledById = cancelledBy == null ? null : cancelledBy.getId();
    }

    public String getTrackingCarrier() { return trackingCarrier; }
    public void setTrackingCarrier(String trackingCarrier) { this.trackingCarrier = trackingCarrier; }

    public String getTrackingNumber() { return trackingNumber; }
    public void setTrackingNumber(String trackingNumber) { this.trackingNumber = trackingNumber; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public List<ProductOrderItem> getItems() { return items; }
    public void setItems(List<ProductOrderItem> items) { this.items = items; }
}
