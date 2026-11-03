package com.swp391.scms.finance.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Data Transfer Object for creating a new Payment transaction.
 */
@Schema(description = "Yêu cầu tạo mới giao dịch thanh toán")
public class PaymentCreateDto {

    @NotNull(message = "{validation.payment.member_id.not_null}")
    @Schema(description = "ID hội viên thực hiện thanh toán", example = "2")
    private Long memberId;

    @Schema(description = "ID gói hội viên đăng ký (nếu thanh toán cho gói)", example = "1")
    private Long subscriptionId;

    @Schema(description = "ID lượt đăng ký lớp học (nếu thanh toán cho lớp)", example = "5")
    private Long classEnrollmentId;

    @NotNull(message = "{validation.payment.amount.not_null}")
    @DecimalMin(value = "0.0", inclusive = false, message = "{validation.payment.amount.min}")
    @Schema(description = "Số tiền thanh toán (VNĐ)", example = "1500000.00")
    private BigDecimal amount;

    @NotBlank(message = "{validation.payment.method.not_blank}")
    @Pattern(regexp = "(?i)^(cash|online_wallet)$", message = "{validation.payment.method.pattern}")
    @Schema(description = "Phương thức thanh toán", example = "cash")
    private String method;

    @Pattern(regexp = "(?i)^(success|pending|failed|refunded)$", message = "{validation.payment.status.pattern}")
    @Schema(description = "Trạng thái thanh toán ban đầu", example = "success")
    private String status = "pending";

    @Schema(description = "Thời điểm thanh toán hoàn tất")
    private LocalDateTime paidAt;

    @Schema(description = "ID nhân viên thu ngân tiếp nhận thanh toán", example = "1")
    private Long receivedById;

    @Schema(description = "Ghi chú giao dịch", example = "Thanh toán gói Silver 3 tháng tại quầy")
    private String note;

    @Size(max = 3_000_000, message = "{validation.payment.receipt.size}")
    @Schema(description = "Ảnh hóa đơn thanh toán tiền mặt dạng data URL (jpeg/png/webp)")
    private String receiptImage;

    public PaymentCreateDto() {}

    public String getReceiptImage() {
        return receiptImage;
    }

    public void setReceiptImage(String receiptImage) {
        this.receiptImage = receiptImage;
    }

    public Long getMemberId() {
        return memberId;
    }

    public void setMemberId(Long memberId) {
        this.memberId = memberId;
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

    public Long getReceivedById() {
        return receivedById;
    }

    public void setReceivedById(Long receivedById) {
        this.receivedById = receivedById;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
