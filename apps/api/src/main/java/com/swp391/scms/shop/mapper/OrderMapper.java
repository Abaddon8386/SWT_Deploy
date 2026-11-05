package com.swp391.scms.shop.mapper;

import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.shop.ShopProperties;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.OrderDtos.OrderItemDto;
import com.swp391.scms.shop.dto.OrderDtos.OrderMemberDto;
import com.swp391.scms.shop.dto.OrderDtos.OrderShippingDto;
import com.swp391.scms.shop.dto.OrderDtos.OrderSummaryDto;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductImage;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.entity.ProductOrderItem;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.repository.ProductImageRepository;
import com.swp391.scms.users.entity.User;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class OrderMapper {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ShopProperties props;
    private final Clock clock;
    private final PaymentRepository payments;
    private final ProductImageRepository images;

    public OrderMapper(ShopProperties props, Clock clock) {
        this(props, clock, null, null);
    }

    @Autowired
    public OrderMapper(ShopProperties props,
                       Clock clock,
                       @Autowired(required = false) PaymentRepository payments,
                       @Autowired(required = false) ProductImageRepository images) {
        this.props = props;
        this.clock = clock != null ? clock : Clock.system(VN_ZONE);
        this.payments = payments;
        this.images = images;
    }

    public OrderDto toDto(ProductOrder order, boolean includeMember) {
        List<OrderItemDto> items = order.getItems().stream()
                .map(this::toItemDto)
                .toList();

        OrderShippingDto shipping = null;
        if ("delivery".equals(order.getFulfillment()) && order.getShipRecipientName() != null) {
            shipping = new OrderShippingDto(
                    order.getShipRecipientName(),
                    order.getShipPhone(),
                    order.getShipProvinceName(),
                    order.getShipWardName(),
                    order.getShipStreetLine(),
                    order.getShipNote()
            );
        }

        String pickupAddress = "pickup".equals(order.getFulfillment()) && props != null
                ? props.pickupAddress()
                : null;

        boolean canPay = computeCanPay(order);
        boolean canCancel = computeCanCancel(order, includeMember);
        BigDecimal refundedAmount = resolveRefundedAmount(order);

        OrderMemberDto memberDto = null;
        if (includeMember && order.getMember() != null) {
            User u = order.getMember().getUser();
            memberDto = new OrderMemberDto(
                    order.getMember().getUserId(),
                    u != null ? u.getFullName() : null,
                    u != null ? u.getPhone() : null
            );
        }

        return new OrderDto(
                order.getId(),
                order.getCode(),
                order.getStatus(),
                order.getFulfillment(),
                order.getPaymentMethod(),
                items,
                order.getSubtotal(),
                order.getShippingFee(),
                order.getTotal(),
                shipping,
                pickupAddress,
                order.getPaymentDueAt(),
                order.getCreatedAt(),
                order.getPaidAt(),
                order.getProcessingAt(),
                order.getShippedAt(),
                order.getReadyAt(),
                order.getCompletedAt(),
                order.getCancelledAt(),
                order.getCancelReason(),
                order.getTrackingCarrier(),
                order.getTrackingNumber(),
                canCancel,
                canPay,
                refundedAmount,
                memberDto
        );
    }

    public OrderSummaryDto toSummaryDto(ProductOrder order) {
        int itemCount = order.getItems().stream().mapToInt(ProductOrderItem::getQuantity).sum();
        String firstItemName = order.getItems().isEmpty() ? null : order.getItems().getFirst().getProductName();
        return new OrderSummaryDto(
                order.getId(),
                order.getCode(),
                order.getStatus(),
                order.getFulfillment(),
                order.getPaymentMethod(),
                order.getTotal(),
                itemCount,
                firstItemName,
                order.getCreatedAt(),
                computeCanPay(order)
        );
    }

    private OrderItemDto toItemDto(ProductOrderItem item) {
        ProductVariant v = item.getVariant();
        Product p = v != null ? v.getProduct() : null;
        String slug = p != null ? p.getSlug() : null;
        String imageUrl = resolveImageUrl(p);
        return new OrderItemDto(
                v != null ? v.getId() : null,
                item.getProductName(),
                item.getVariantLabel(),
                item.getSku(),
                item.getUnitPrice(),
                item.getQuantity(),
                item.getLineTotal(),
                slug,
                imageUrl
        );
    }

    private String resolveImageUrl(Product p) {
        if (p == null) {
            return null;
        }
        if (p.getImages() != null && !p.getImages().isEmpty()) {
            return p.getImages().stream()
                    .min(Comparator.comparingInt(ProductImage::getSortOrder).thenComparing(img -> img.getId() != null ? img.getId() : 0L))
                    .map(ProductMapper::imageUrl)
                    .orElse(null);
        }
        if (images != null && p.getId() != null) {
            return images.findAllByProduct_IdOrderBySortOrderAscIdAsc(p.getId()).stream()
                    .findFirst()
                    .map(ProductMapper::imageUrl)
                    .orElse(null);
        }
        return null;
    }

    private boolean computeCanPay(ProductOrder order) {
        return OrderStatus.pending_payment.name().equals(order.getStatus())
                && "online".equals(order.getPaymentMethod())
                && order.getPaymentDueAt() != null
                && order.getPaymentDueAt().isAfter(now());
    }

    private boolean computeCanCancel(ProductOrder order, boolean isStaff) {
        String st = order.getStatus();
        if (st == null) return false;
        if (isStaff) {
            try {
                return !OrderStatus.valueOf(st).terminal();
            } catch (IllegalArgumentException e) {
                return false;
            }
        }
        return OrderStatus.pending_payment.name().equals(st) || OrderStatus.paid.name().equals(st);
    }

    private BigDecimal resolveRefundedAmount(ProductOrder order) {
        if (payments != null && order.getId() != null) {
            List<Payment> list = payments.findAllByProductOrderId(order.getId());
            if (list != null) {
                for (Payment p : list) {
                    if (p.getRefundedAmount() != null && p.getRefundedAmount().signum() > 0) {
                        return p.getRefundedAmount();
                    }
                }
            }
        }
        if (OrderStatus.cancelled.name().equals(order.getStatus()) && order.getPaidAt() != null) {
            return order.getTotal();
        }
        return null;
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), VN_ZONE);
    }
}
