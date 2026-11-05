package com.swp391.scms.shop.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.repository.ProductOrderRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProductOrderPayments {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ProductOrderRepository orders;
    private final ProductOrderRefunds refunds;
    private final NotificationService notifications;
    private final UserRepository users;
    private final MessageService messages;
    private final Clock clock;

    @Autowired
    public ProductOrderPayments(ProductOrderRepository orders,
                                @Autowired(required = false) ProductOrderRefunds refunds,
                                @Autowired(required = false) NotificationService notifications,
                                @Autowired(required = false) UserRepository users,
                                @Autowired(required = false) MessageService messages,
                                Clock clock) {
        this.orders = orders;
        this.refunds = refunds;
        this.notifications = notifications;
        this.users = users;
        this.messages = messages;
        this.clock = clock != null ? clock : Clock.system(VN_ZONE);
    }

    public ProductOrder requirePayable(Long orderId) {
        if (orderId == null) {
            throw unavailable();
        }
        ProductOrder order = orders.findByIdForUpdate(orderId).orElseThrow(ProductOrderPayments::unavailable);
        if (!OrderStatus.pending_payment.name().equals(order.getStatus())
                || "counter".equalsIgnoreCase(order.getPaymentMethod())) {
            throw unavailable();
        }
        return order;
    }

    public void markPaid(Long orderId, String method) {
        ProductOrder order = orders.findByIdForUpdate(orderId).orElseThrow(ProductOrderPayments::unavailable);
        if (OrderStatus.cancelled.name().equals(order.getStatus())) {
            String reason = msg("shop.auto_cancel.unpaid");
            BigDecimal refunded = refunds != null ? refunds.refundIfPaid(order, reason) : BigDecimal.ZERO;
            if (notifications != null && order.getMember() != null) {
                BigDecimal amount = (refunded != null && refunded.signum() > 0) ? refunded : order.getTotal();
                notifications.send(
                        order.getMember().getUserId(),
                        msg("notifications.shop.cancelled.title", order.getCode()),
                        msg("notifications.shop.refunded.body", order.getCode(), amount != null ? amount.toPlainString() : "0"),
                        "order",
                        "product_order",
                        order.getId(),
                        "/member/orders/" + order.getId()
                );
            }
            return;
        }
        if (!OrderStatus.pending_payment.name().equals(order.getStatus())) {
            return;
        }
        order.setStatus(OrderStatus.paid.name());
        order.setPaidAt(now());
        orders.save(order);

        if (notifications != null && order.getMember() != null) {
            notifications.send(
                    order.getMember().getUserId(),
                    msg("notifications.shop.paid.title", order.getCode()),
                    msg("notifications.shop.paid.body", order.getCode(), order.getTotal() != null ? order.getTotal().toPlainString() : "0"),
                    "order",
                    "product_order",
                    order.getId(),
                    "/member/orders/" + order.getId()
            );
        }
        if (notifications != null && users != null) {
            List<User> staffList = users.findActiveStaffUsers();
            if (staffList != null) {
                for (User staff : staffList) {
                    if (staff != null && staff.getDeletedAt() == null
                            && (staff.getStatus() == null || "active".equalsIgnoreCase(staff.getStatus()))) {
                        notifications.send(
                                staff.getId(),
                                msg("notifications.shop.staff_new_order.title", order.getCode()),
                                msg("notifications.shop.staff_new_order.body", order.getCode()),
                                "order",
                                "product_order",
                                order.getId(),
                                "/staff/orders"
                        );
                    }
                }
            }
        }
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), VN_ZONE);
    }

    private String msg(String key, Object... args) {
        if (messages != null) {
            String resolved = messages.getMessage(key, args);
            if (resolved != null && !resolved.isBlank()) {
                return resolved;
            }
        }
        return key;
    }

    private static ConflictException unavailable() {
        return new ConflictException("VNPAY_TARGET_UNAVAILABLE", "finance.vnpay.target_unavailable", null, null);
    }
}
