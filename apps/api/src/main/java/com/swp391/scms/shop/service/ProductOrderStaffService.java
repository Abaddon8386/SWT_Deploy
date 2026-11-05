package com.swp391.scms.shop.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.service.InvoiceService;
import com.swp391.scms.finance.service.VnpayPaymentGuard;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.CounterPaymentRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.OrderCountsDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.ShipRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.StaffCancelRequest;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.mapper.OrderMapper;
import com.swp391.scms.shop.repository.ProductOrderRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ProductOrderStaffService {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Set<String> STAFF_ROLES = Set.of("RECEPTIONIST", "STAFF", "CENTER_MANAGER", "MANAGER");
    private static final Set<String> COUNTER_METHODS = Set.of("cash", "pos", "bank_transfer");

    private final ProductOrderRepository orders;
    private final ProductOrderService orderService;
    private final ProductOrderPayments orderPayments;
    private final PaymentRepository payments;
    private final InvoiceService invoices;
    private final UserRepository users;
    private final OrderMapper mapper;
    private final NotificationService notifications;
    private final MessageService messages;
    private final Clock clock;
    private VnpayPaymentGuard guard;

    public ProductOrderStaffService(ProductOrderRepository orders,
                                    ProductOrderService orderService,
                                    ProductOrderPayments orderPayments,
                                    PaymentRepository payments,
                                    InvoiceService invoices,
                                    UserRepository users,
                                    OrderMapper mapper,
                                    NotificationService notifications,
                                    MessageService messages,
                                    Clock clock) {
        this(orders, orderService, orderPayments, payments, invoices, users, mapper, notifications, messages, clock, null);
    }

    @Autowired
    public ProductOrderStaffService(ProductOrderRepository orders,
                                    ProductOrderService orderService,
                                    @Autowired(required = false) ProductOrderPayments orderPayments,
                                    @Autowired(required = false) PaymentRepository payments,
                                    @Autowired(required = false) InvoiceService invoices,
                                    @Autowired(required = false) UserRepository users,
                                    OrderMapper mapper,
                                    @Autowired(required = false) NotificationService notifications,
                                    @Autowired(required = false) MessageService messages,
                                    Clock clock,
                                    @Autowired(required = false) VnpayPaymentGuard guard) {
        this.orders = orders;
        this.orderService = orderService;
        this.orderPayments = orderPayments;
        this.payments = payments;
        this.invoices = invoices;
        this.users = users;
        this.mapper = mapper;
        this.notifications = notifications;
        this.messages = messages;
        this.clock = clock != null ? clock : Clock.system(VN_ZONE);
        this.guard = guard;
    }

    public void setGuard(VnpayPaymentGuard guard) {
        this.guard = guard;
    }

    @Transactional(readOnly = true)
    public Page<OrderDto> list(String status, String q, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.clamp(size, 1, 50);
        boolean counterPending = "counter_pending".equalsIgnoreCase(status);
        String normalizedStatus = (status == null || status.isBlank() || "all".equalsIgnoreCase(status) || counterPending)
                ? null
                : status.trim().toLowerCase(Locale.ROOT);
        String normalizedQ = (q == null || q.isBlank()) ? null : q.trim().toLowerCase(Locale.ROOT);
        Pageable pageable = PageRequest.of(
                safePage,
                safeSize,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))
        );
        return orders.searchStaff(normalizedStatus, counterPending, normalizedQ, pageable)
                .map(o -> mapper.toDto(o, true));
    }

    @Transactional(readOnly = true)
    public OrderCountsDto counts() {
        return new OrderCountsDto(
                orders.countByStatus(OrderStatus.paid.name()),
                orders.countByStatus(OrderStatus.processing.name()),
                orders.countByStatus(OrderStatus.ready_for_pickup.name()),
                orders.countByStatus(OrderStatus.shipping.name()),
                orders.countByStatusAndPaymentMethod(OrderStatus.pending_payment.name(), "counter")
        );
    }

    @Transactional(readOnly = true)
    public OrderDto get(Long id) {
        ProductOrder order = orders.findById(id)
                .or(() -> orders.findByIdForUpdate(id))
                .orElseThrow(ProductOrderStaffService::notFound);
        return mapper.toDto(order, true);
    }

    @Audited(action = "START_PROCESSING", entity = "product_orders")
    public OrderDto startProcessing(AuthenticatedPrincipal principal, Long id) {
        requireStaff(principal);
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        if (!OrderStatus.paid.name().equals(order.getStatus())) {
            throw invalidTransition();
        }
        LocalDateTime now = now();
        order.setStatus(OrderStatus.processing.name());
        order.setProcessingAt(now);
        order.setUpdatedAt(now);
        orders.save(order);
        return mapper.toDto(order, true);
    }

    @Audited(action = "SHIP_ORDER", entity = "product_orders")
    public OrderDto ship(AuthenticatedPrincipal principal, Long id, ShipRequest request) {
        requireStaff(principal);
        if (request == null || request.trackingNumber() == null
                || request.trackingNumber().trim().length() < 3
                || request.trackingNumber().trim().length() > 60) {
            throw new BadRequestException("FULFILLMENT_INVALID", "error.shop.fulfillment_invalid", null, "Tracking number is required (3..60 chars)");
        }
        if (request.carrier() != null && request.carrier().trim().length() > 60) {
            throw new BadRequestException("FULFILLMENT_INVALID", "error.shop.fulfillment_invalid", null, "Carrier must be <= 60 chars");
        }
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        if (!OrderStatus.processing.name().equals(order.getStatus())
                || !"delivery".equals(order.getFulfillment())) {
            throw invalidTransition();
        }
        LocalDateTime now = now();
        order.setStatus(OrderStatus.shipping.name());
        order.setTrackingCarrier(request.carrier() != null && !request.carrier().isBlank() ? request.carrier().trim() : null);
        order.setTrackingNumber(request.trackingNumber().trim());
        order.setShippedAt(now);
        order.setUpdatedAt(now);
        orders.save(order);

        notifyMember(
                order,
                msg("notifications.shop.shipping.title", order.getCode()),
                msg("notifications.shop.shipping.body", order.getCode(), order.getTrackingNumber())
        );
        return mapper.toDto(order, true);
    }

    @Audited(action = "READY_FOR_PICKUP", entity = "product_orders")
    public OrderDto readyForPickup(AuthenticatedPrincipal principal, Long id) {
        requireStaff(principal);
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        if (!OrderStatus.processing.name().equals(order.getStatus())
                || !"pickup".equals(order.getFulfillment())) {
            throw invalidTransition();
        }
        LocalDateTime now = now();
        order.setStatus(OrderStatus.ready_for_pickup.name());
        order.setReadyAt(now);
        order.setUpdatedAt(now);
        orders.save(order);

        notifyMember(
                order,
                msg("notifications.shop.ready_pickup.title", order.getCode()),
                msg("notifications.shop.ready_pickup.body", order.getCode())
        );
        return mapper.toDto(order, true);
    }

    @Audited(action = "COMPLETE_ORDER", entity = "product_orders")
    public OrderDto complete(AuthenticatedPrincipal principal, Long id) {
        requireStaff(principal);
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        boolean validDelivery = "delivery".equals(order.getFulfillment())
                && OrderStatus.shipping.name().equals(order.getStatus());
        boolean validPickup = "pickup".equals(order.getFulfillment())
                && (OrderStatus.ready_for_pickup.name().equals(order.getStatus())
                    || (OrderStatus.paid.name().equals(order.getStatus()) && "counter".equals(order.getPaymentMethod())));
        if (!validDelivery && !validPickup) {
            throw invalidTransition();
        }
        LocalDateTime now = now();
        order.setStatus(OrderStatus.completed.name());
        order.setCompletedAt(now);
        order.setUpdatedAt(now);
        orders.save(order);

        notifyMember(
                order,
                msg("notifications.shop.completed.title", order.getCode()),
                msg("notifications.shop.completed.body", order.getCode())
        );
        return mapper.toDto(order, true);
    }

    @Audited(action = "COUNTER_PAYMENT", entity = "product_orders")
    public OrderDto counterPayment(AuthenticatedPrincipal principal, Long id, CounterPaymentRequest request) {
        requireStaff(principal);
        if (request == null || request.method() == null
                || !COUNTER_METHODS.contains(request.method().trim().toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("PAYMENT_METHOD_NOT_ALLOWED", "error.shop.payment_method_not_allowed", null, "Invalid counter payment method");
        }
        String method = request.method().trim().toLowerCase(Locale.ROOT);
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        if (!OrderStatus.pending_payment.name().equals(order.getStatus())
                || !"counter".equals(order.getPaymentMethod())
                || !"pickup".equals(order.getFulfillment())) {
            throw invalidTransition();
        }

        User staffUser = resolveUser(principal.id());
        LocalDateTime now = now();
        if (payments != null) {
            Payment payment = new Payment();
            payment.setMember(order.getMember());
            payment.setProductOrderId(order.getId());
            payment.setAmount(order.getTotal());
            payment.setMethod(method);
            payment.setStatus("success");
            payment.setPaidAt(now);
            payment.setReceivedBy(staffUser);
            Payment saved = payments.save(payment);
            Payment targetPayment = saved != null ? saved : payment;
            if (invoices != null) {
                Long paymentId = targetPayment.getId() != null ? targetPayment.getId() : order.getId();
                invoices.autoIssueInvoiceForPayment(paymentId);
            }
        }
        if (orderPayments != null) {
            orderPayments.markPaid(order.getId(), method);
        }
        if (OrderStatus.pending_payment.name().equals(order.getStatus())) {
            order.setStatus(OrderStatus.paid.name());
            order.setPaidAt(now);
            order.setUpdatedAt(now);
            orders.save(order);
        }
        return mapper.toDto(order, true);
    }

    @Audited(action = "CANCEL_ORDER", entity = "product_orders")
    public OrderDto cancel(AuthenticatedPrincipal principal, Long id, StaffCancelRequest request) {
        requireStaff(principal);
        if (request == null || request.reason() == null
                || request.reason().trim().length() < 5
                || request.reason().trim().length() > 255) {
            throw new BadRequestException("FULFILLMENT_INVALID", "error.shop.fulfillment_invalid", null, "Cancellation reason (5..255 chars) is required");
        }
        ProductOrder order = orders.findByIdForUpdate(id).orElseThrow(ProductOrderStaffService::notFound);
        try {
            if (OrderStatus.valueOf(order.getStatus()).terminal()) {
                throw invalidTransition();
            }
        } catch (IllegalArgumentException e) {
            throw invalidTransition();
        }
        if (OrderStatus.pending_payment.name().equals(order.getStatus()) && guard != null) {
            try {
                guard.productOrder(order.getId());
            } catch (ConflictException ex) {
                throw new ConflictException("ORDER_AWAITING_PAYMENT", "error.shop.order_awaiting_payment", null, "Order awaiting VNPay confirmation");
            }
        }
        User staffUser = resolveUser(principal.id());
        orderService.cancelInternal(order, request.reason().trim(), request.shouldRestock(), staffUser);
        return mapper.toDto(order, true);
    }

    private void notifyMember(ProductOrder order, String title, String body) {
        if (notifications != null && order.getMember() != null) {
            notifications.send(
                    order.getMember().getUserId(),
                    title,
                    body,
                    "order",
                    "product_order",
                    order.getId(),
                    "/member/orders/" + order.getId()
            );
        }
    }

    private User resolveUser(Long userId) {
        if (userId == null || users == null) {
            return null;
        }
        return users.findByIdAndDeletedAtIsNull(userId)
                .or(() -> users.findById(userId))
                .orElse(null);
    }

    private static void requireStaff(AuthenticatedPrincipal principal) {
        if (principal == null || principal.role() == null
                || !STAFF_ROLES.contains(principal.role().toUpperCase(Locale.ROOT))) {
            throw new ForbiddenException("FORBIDDEN", "error.forbidden", null, "Staff access required");
        }
    }

    private static ResourceNotFoundException notFound() {
        return new ResourceNotFoundException("ORDER_NOT_FOUND", "error.shop.order_not_found", null, "Order not found");
    }

    private static ConflictException invalidTransition() {
        return new ConflictException("ORDER_INVALID_TRANSITION", "error.shop.order_invalid_transition", null, "Invalid order status transition");
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
}
