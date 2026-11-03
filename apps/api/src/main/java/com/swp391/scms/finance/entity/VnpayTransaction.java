package com.swp391.scms.finance.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@org.hibernate.annotations.Check(name = "ck_vnpay_transactions_status", constraints = "status IN ('pending','success','failed')")
@Table(name = "vnpay_transactions", indexes = @Index(name = "ix_vnpay_payment_status", columnList = "payment_id,status"))
public class VnpayTransaction {
    @Id @Column(length = 32)
    private String reference;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "ip_address", nullable = false, length = 45)
    private String ipAddress;
    @Column(nullable = false, length = 20)
    private String status;
    @Column(name = "gateway_transaction_no", unique = true, length = 20)
    private String gatewayTransactionNo;
    protected VnpayTransaction() {}
    public VnpayTransaction(String reference, Payment payment, BigDecimal amount, LocalDateTime createdAt, LocalDateTime expiresAt, String ipAddress) {
        this.reference = reference; this.payment = payment; this.amount = amount;
        this.createdAt = createdAt; this.expiresAt = expiresAt; this.ipAddress = ipAddress; this.status = "pending";
    }
    public String getReference() { return reference; }
    public Payment getPayment() { return payment; }
    public BigDecimal getAmount() { return amount; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public String getIpAddress() { return ipAddress; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public String getGatewayTransactionNo() { return gatewayTransactionNo; }
    public void setGatewayTransactionNo(String value) { this.gatewayTransactionNo = value; }
}
