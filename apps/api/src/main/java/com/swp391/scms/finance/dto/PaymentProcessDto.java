package com.swp391.scms.finance.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

/**
 * Data Transfer Object for processing a checkout payment and activating subscriptions/enrollments.
 */
@Schema(description = "Yêu cầu xử lý thanh toán mua gói tập hoặc ghi danh lớp học")
public class PaymentProcessDto {

    @NotNull(message = "{validation.payment.member_id.not_null}")
    @Schema(description = "ID hội viên thực hiện thanh toán", example = "2")
    private Long memberId;

    @Schema(description = "ID gói hội viên đăng ký (nếu thanh toán cho gói tập đã tạo)", example = "1")
    private Long subscriptionId;

    @Schema(description = "ID gói tập mua trực tiếp tại quầy (nếu chưa tạo subscription trước)", example = "1")
    private Long packageId;

    @Schema(description = "ID lượt đăng ký lớp học (nếu thanh toán cho lớp)", example = "5")
    private Long classEnrollmentId;

    @NotNull(message = "{validation.payment.amount.not_null}")
    @DecimalMin(value = "0.0", inclusive = false, message = "{validation.payment.amount.min}")
    @Schema(description = "Số tiền thanh toán (VNĐ)", example = "1500000.00")
    private BigDecimal amount;

    @NotBlank(message = "{validation.payment.method.not_blank}")
    @Pattern(regexp = "(?i)^cash$", message = "{validation.payment.method.pattern}")
    @Schema(description = "Phương thức thanh toán", example = "cash")
    private String method;

    @Schema(description = "ID nhân viên thu ngân/lễ tân tiếp nhận", example = "1")
    private Long receivedById;

    @Schema(description = "Ghi chú giao dịch", example = "Thanh toán kích hoạt gói tập tại quầy")
    private String note;

    public PaymentProcessDto() {}

    public PaymentProcessDto(Long memberId, Long subscriptionId, Long classEnrollmentId,
                             BigDecimal amount, String method, Long receivedById, String note) {
        this.memberId = memberId;
        this.subscriptionId = subscriptionId;
        this.classEnrollmentId = classEnrollmentId;
        this.amount = amount;
        this.method = method;
        this.receivedById = receivedById;
        this.note = note;
    }

    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }

    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }

    public Long getPackageId() { return packageId; }
    public void setPackageId(Long packageId) { this.packageId = packageId; }

    public Long getClassEnrollmentId() { return classEnrollmentId; }
    public void setClassEnrollmentId(Long classEnrollmentId) { this.classEnrollmentId = classEnrollmentId; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public Long getReceivedById() { return receivedById; }
    public void setReceivedById(Long receivedById) { this.receivedById = receivedById; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
