package com.swp391.scms.membership.service;

import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Giá trị tiền của một kỳ gói tập, dùng chung cho báo giá nâng cấp và số tiền hoàn khi hủy gói.
 *
 * <p>Giá trị luôn tính từ số tiền hội viên <b>thực trả</b> (payment đã thu, trừ phần đã hoàn) cộng phần đã quy đổi từ
 * gói trước, không bao giờ từ giá niêm yết hiện tại của gói. Nhờ vậy khi Quản lý tăng hoặc giảm giá gói trong danh
 * mục, phần quy đổi và tiền hoàn của hội viên đã mua không thay đổi.
 */
@Component
public class SubscriptionValueCalculator {

    /** Phần quy đổi làm tròn xuống tới nghìn đồng. */
    static final BigDecimal ROUNDING_UNIT = new BigDecimal("1000");

    /** Chuỗi nâng cấp cũ dài hơn mức này coi là dữ liệu lỗi và không truy ngược thêm. */
    private static final int MAX_CHAIN_DEPTH = 20;

    @Nullable
    private final PaymentRepository payments;

    public SubscriptionValueCalculator(@Nullable PaymentRepository payments) {
        this.payments = payments;
    }

    /**
     * Tổng giá trị của kỳ: tiền đã thu thực tế (payment {@code success}, hoặc {@code refunded}, trừ phần đã hoàn)
     * cộng {@code creditApplied}. Kỳ không có payment nào (gói dùng thử lưu {@code upgradeCharge = 0}) lấy
     * {@code upgradeCharge}; dữ liệu cũ không có payment lẫn báo giá mới rơi về giá gói.
     */
    public BigDecimal paidValue(MembershipSubscription subscription) {
        return paidValue(subscription, 0);
    }

    private BigDecimal paidValue(MembershipSubscription subscription, int depth) {
        BigDecimal credit = subscription.getCreditApplied() != null
                ? subscription.getCreditApplied() : legacyUpgradeCredit(subscription, depth);
        List<Payment> settled = subscription.getId() == null || payments == null ? List.of()
                : payments.findAllBySubscriptionId(subscription.getId()).stream()
                        .filter(payment -> "success".equalsIgnoreCase(payment.getStatus())
                                || "refunded".equalsIgnoreCase(payment.getStatus()))
                        .toList();
        if (!settled.isEmpty()) {
            BigDecimal net = settled.stream()
                    .map(payment -> orZero(payment.getAmount()).subtract(orZero(payment.getRefundedAmount())))
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .max(BigDecimal.ZERO);
            return net.add(credit);
        }
        if (subscription.getUpgradeCharge() != null) {
            return subscription.getUpgradeCharge().add(credit);
        }
        return subscription.getMembershipPackage() != null
                ? orZero(subscription.getMembershipPackage().getPrice()) : BigDecimal.ZERO;
    }

    /**
     * Nâng cấp tạo trước khi có quy đổi theo tỷ lệ không lưu {@code creditApplied}. Dựng lại theo đúng công thức mới:
     * giá trị còn lại của kỳ bị thay thế vào ngày kỳ nâng cấp bắt đầu, trên thời hạn gốc của kỳ đó (trước khi bị cắt
     * ngắn). Như vậy tiền hội viên đã trả cho kỳ cũ mà chưa dùng vẫn được tính vào giá trị kỳ nâng cấp, dù quy tắc cũ
     * từng bắt họ trả đủ giá gói mới.
     */
    private BigDecimal legacyUpgradeCredit(MembershipSubscription upgrade, int depth) {
        MembershipSubscription previous = upgrade.getPreviousSubscription();
        if (depth >= MAX_CHAIN_DEPTH || previous == null || upgrade.getUpgradeCharge() == null
                || upgrade.getStartDate() == null || previous.getStartDate() == null
                || upgrade.getMembershipPackage() == null || previous.getMembershipPackage() == null
                || java.util.Objects.equals(upgrade.getMembershipPackage().getId(), previous.getMembershipPackage().getId())) {
            return BigDecimal.ZERO;
        }
        LocalDate originalEnd = upgrade.getReplacedEndDate();
        if (originalEnd == null && previous.getEndDate() != null && previous.getEndDate().isAfter(upgrade.getStartDate())) {
            originalEnd = previous.getEndDate();
        }
        if (originalEnd == null) {
            // Kỳ cũ đã bị cắt về ngày nâng cấp trước khi có replacedEndDate: dựng lại từ thời hạn gói.
            originalEnd = previous.getStartDate().plusDays(Math.max(1, previous.getMembershipPackage().getDurationDays()) - 1L);
        }
        if (originalEnd.isBefore(previous.getStartDate())) return BigDecimal.ZERO;
        long total = ChronoUnit.DAYS.between(previous.getStartDate(), originalEnd) + 1;
        long remaining = upgrade.getStartDate().isAfter(originalEnd) ? 0
                : upgrade.getStartDate().isBefore(previous.getStartDate()) ? total
                : ChronoUnit.DAYS.between(upgrade.getStartDate(), originalEnd) + 1;
        return prorate(paidValue(previous, depth + 1), remaining, total);
    }

    /** Giá trị phần chưa dùng của kỳ tính tới ngày {@code today} (ngày hôm nay vẫn được tính là chưa dùng). */
    public BigDecimal remainingValue(MembershipSubscription subscription, LocalDate today) {
        long total = totalDays(subscription);
        if (total <= 0) return BigDecimal.ZERO;
        return prorate(paidValue(subscription), remainingDays(subscription, today), total);
    }

    public static long totalDays(MembershipSubscription subscription) {
        if (subscription.getStartDate() == null || subscription.getEndDate() == null
                || subscription.getEndDate().isBefore(subscription.getStartDate())) {
            return 0;
        }
        return ChronoUnit.DAYS.between(subscription.getStartDate(), subscription.getEndDate()) + 1;
    }

    /** Số ngày từ hôm nay tới hết kỳ, gồm cả hôm nay; kỳ chưa bắt đầu còn nguyên, kỳ đã hết còn 0. */
    public static long remainingDays(MembershipSubscription subscription, LocalDate today) {
        long total = totalDays(subscription);
        if (total <= 0) return 0;
        if (today.isBefore(subscription.getStartDate())) return total;
        if (today.isAfter(subscription.getEndDate())) return 0;
        return ChronoUnit.DAYS.between(today, subscription.getEndDate()) + 1;
    }

    /** {@code value × remaining / total}, làm tròn xuống tới nghìn đồng. */
    public static BigDecimal prorate(BigDecimal value, long remainingDays, long totalDays) {
        if (value == null || value.signum() <= 0 || totalDays <= 0 || remainingDays <= 0) return BigDecimal.ZERO;
        if (remainingDays >= totalDays) return value;
        BigDecimal raw = value.multiply(BigDecimal.valueOf(remainingDays))
                .divide(BigDecimal.valueOf(totalDays), 0, RoundingMode.DOWN);
        return raw.divide(ROUNDING_UNIT, 0, RoundingMode.DOWN).multiply(ROUNDING_UNIT);
    }

    /** Phí nâng cấp: giá gói mới hiện tại trừ phần quy đổi; âm hoặc bằng 0 nghĩa là không phải nâng cấp. */
    public static BigDecimal upgradeCharge(BigDecimal targetPrice, BigDecimal credit) {
        return orZero(targetPrice).subtract(orZero(credit));
    }

    private static BigDecimal orZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
