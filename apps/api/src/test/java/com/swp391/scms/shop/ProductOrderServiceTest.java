package com.swp391.scms.shop;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.service.VnpayPaymentGuard;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.AddressDtos.AddressRequest;
import com.swp391.scms.shop.dto.OrderDtos.CreateOrderRequest;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteLineRequest;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.entity.ProductOrderItem;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.mapper.OrderMapper;
import com.swp391.scms.shop.repository.ProductImageRepository;
import com.swp391.scms.shop.repository.ProductOrderRepository;
import com.swp391.scms.shop.repository.ProductVariantRepository;
import com.swp391.scms.shop.repository.StockMovementRepository;
import com.swp391.scms.shop.service.AddressService;
import com.swp391.scms.shop.service.AddressService.ShippingSnapshot;
import com.swp391.scms.shop.service.OrderCodeGenerator;
import com.swp391.scms.shop.service.ProductOrderRefunds;
import com.swp391.scms.shop.service.ProductOrderService;
import com.swp391.scms.shop.service.QuoteService;
import com.swp391.scms.shop.service.ShopPricing;
import com.swp391.scms.shop.service.StockService;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductOrderServiceTest {
    final ProductOrderRepository orders = mock(ProductOrderRepository.class);
    final ProductVariantRepository variants = mock(ProductVariantRepository.class);
    final StockMovementRepository movements = mock(StockMovementRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final AddressService addresses = mock(AddressService.class);
    final VnpayPaymentGuard guard = mock(VnpayPaymentGuard.class);
    final PaymentRepository payments = mock(PaymentRepository.class);
    final ProductOrderRefunds refunds = mock(ProductOrderRefunds.class);
    final NotificationService notifications = mock(NotificationService.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-11-05T07:00:00Z"), ZoneOffset.UTC);
    final ShopProperties props = new ShopProperties();
    final AuthenticatedPrincipal member = new AuthenticatedPrincipal(1L, "member", "MEMBER");

    final Map<Long, ProductVariant> variantStore = new HashMap<>();
    User user;
    Member memberProfile;
    ProductOrderService service;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setId(1L);
        user.setFullName("Nguyen Van A");
        user.setStatus("active");
        memberProfile = new Member();
        memberProfile.setUserId(1L);
        memberProfile.setUser(user);

        lenient().when(members.findByUserIdForUpdate(1L)).thenReturn(Optional.of(memberProfile));
        lenient().when(orders.saveAndFlush(any())).thenAnswer(inv -> {
            ProductOrder o = inv.getArgument(0);
            if (o.getId() == null) o.setId(9L);
            return o;
        });
        lenient().when(orders.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(variants.findAllByIdInForUpdate(any())).thenAnswer(inv -> {
            @SuppressWarnings("unchecked")
            java.util.Collection<Long> ids = inv.getArgument(0);
            return ids.stream().map(variantStore::get).filter(java.util.Objects::nonNull).toList();
        });

        ShopPricing pricing = new ShopPricing(props);
        QuoteService quotes = new QuoteService(variants, pricing);
        StockService stock = new StockService(variants, movements, clock);
        OrderCodeGenerator codes = new OrderCodeGenerator(orders);
        OrderMapper mapper = new OrderMapper(props, clock, payments, null);

        service = new ProductOrderService(orders, variants, members, quotes, addresses, stock, codes, mapper, props, clock);
        service.setGuard(guard);
        service.setPayments(payments);
        service.setRefunds(refunds);
        service.setNotifications(notifications);
    }

    ProductVariant givenVariant(Long id, String price, int servings, int stock) {
        ProductCategory cat = new ProductCategory();
        cat.setId(1L);
        cat.setName("Whey");
        cat.setSlug("whey");
        cat.setActive(true);

        Product p = new Product();
        p.setId(10L + id);
        p.setCategory(cat);
        p.setName("SÖL Whey Isolate");
        p.setSlug("sol-whey-isolate");
        p.setActive(true);

        ProductVariant v = new ProductVariant();
        v.setId(id);
        v.setProduct(p);
        v.setSku("SKU-" + id);
        v.setLabel("2.27 kg");
        v.setPrice(new BigDecimal(price));
        v.setServingsPerContainer(servings);
        v.setStock(stock);
        v.setActive(true);
        variantStore.put(id, v);
        return v;
    }

    ProductVariant variant(Long id) {
        return variantStore.get(id);
    }

    QuoteLineRequest line(Long variantId, int qty) {
        return new QuoteLineRequest(variantId, qty);
    }

    CreateOrderRequest order(List<QuoteLineRequest> lines, String fulfillment, String paymentMethod, String expectedTotal) {
        return new CreateOrderRequest(
                "11111111-2222-3333-4444-555555555555",
                lines,
                fulfillment,
                paymentMethod,
                null,
                null,
                false,
                new BigDecimal(expectedTotal)
        );
    }

    @Test
    void createReservesStockSnapshotsPricesAndSetsPaymentWindow() {
        givenVariant(1L, "1290000", 68, 5);
        var result = service.create(member, order(List.of(line(1L, 2)), "pickup", "online", "2580000"));
        assertThat(result.created()).isTrue();
        assertThat(variant(1L).getStock()).isEqualTo(3);
        assertThat(result.order().total()).isEqualByComparingTo("2580000");
        assertThat(result.order().paymentDueAt()).isEqualTo(LocalDateTime.of(2026, 11, 5, 14, 30));
        verify(movements).save(argThat(m -> m.getDelta() == -2 && "order_reserve".equals(m.getReason())));
    }

    @Test
    void sameClientRequestIdReturnsExistingOrderWithoutTouchingStock() {
        givenVariant(1L, "1290000", 68, 5);
        ProductOrder existing = new ProductOrder();
        existing.setId(9L);
        existing.setMember(memberProfile);
        existing.setCode("SOL-261105-ABCD");
        existing.setStatus(OrderStatus.pending_payment.name());
        existing.setFulfillment("pickup");
        existing.setPaymentMethod("online");
        existing.setSubtotal(new BigDecimal("2580000"));
        existing.setShippingFee(BigDecimal.ZERO);
        existing.setTotal(new BigDecimal("2580000"));
        when(orders.findByMember_UserIdAndClientRequestId(1L, "11111111-2222-3333-4444-555555555555"))
                .thenReturn(Optional.of(existing));

        var result = service.create(member, order(List.of(line(1L, 2)), "pickup", "online", "2580000"));
        assertThat(result.created()).isFalse();
        assertThat(result.order().code()).isEqualTo("SOL-261105-ABCD");
        assertThat(variant(1L).getStock()).isEqualTo(5);
        verify(orders, never()).saveAndFlush(any());
    }

    @Test
    void expectedTotalMismatchIsPriceChanged() {
        givenVariant(1L, "1290000", 68, 5);
        assertThatThrownBy(() -> service.create(member, order(List.of(line(1L, 2)), "pickup", "online", "2500000")))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_PRICE_CHANGED");
        assertThat(variant(1L).getStock()).isEqualTo(5);
    }

    @Test
    void insufficientStockIsOutOfStock() {
        givenVariant(1L, "1290000", 68, 1);
        assertThatThrownBy(() -> service.create(member, order(List.of(line(1L, 2)), "pickup", "online", "2580000")))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_OUT_OF_STOCK");
        assertThat(variant(1L).getStock()).isEqualTo(1);
    }

    @Test
    void counterRequiresPickupAndDeliveryRequiresExactlyOneAddress() {
        givenVariant(1L, "600000", 30, 5);
        AddressRequest inlineAddr = new AddressRequest("Tran Van B", "0901234567", "79", "26734", "123 Le Loi", null, false);
        when(addresses.snapshot(1L, 10L)).thenReturn(new ShippingSnapshot("Tran Van B", "0901234567", "TP.HCM", "Phuong Ben Nghe", "123 Le Loi", null));

        // counter + delivery -> PAYMENT_METHOD_NOT_ALLOWED
        CreateOrderRequest counterDelivery = new CreateOrderRequest(
                "req-counter-delivery", List.of(line(1L, 1)), "delivery", "counter", 10L, null, false, new BigDecimal("600000"));
        assertThatThrownBy(() -> service.create(member, counterDelivery))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "PAYMENT_METHOD_NOT_ALLOWED");

        // delivery with neither addressId nor shippingAddress -> FULFILLMENT_INVALID
        CreateOrderRequest deliveryNoAddr = new CreateOrderRequest(
                "req-deliv-none", List.of(line(1L, 1)), "delivery", "online", null, null, false, new BigDecimal("600000"));
        assertThatThrownBy(() -> service.create(member, deliveryNoAddr))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "FULFILLMENT_INVALID");

        // delivery with both addressId and shippingAddress -> FULFILLMENT_INVALID
        CreateOrderRequest deliveryBothAddr = new CreateOrderRequest(
                "req-deliv-both", List.of(line(1L, 1)), "delivery", "online", 10L, inlineAddr, false, new BigDecimal("600000"));
        assertThatThrownBy(() -> service.create(member, deliveryBothAddr))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "FULFILLMENT_INVALID");

        // pickup with addressId -> FULFILLMENT_INVALID
        CreateOrderRequest pickupWithAddr = new CreateOrderRequest(
                "req-pickup-addr", List.of(line(1L, 1)), "pickup", "online", 10L, null, false, new BigDecimal("600000"));
        assertThatThrownBy(() -> service.create(member, pickupWithAddr))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "FULFILLMENT_INVALID");
    }

    @Test
    void deletedOrNonMemberUsersCannotOrder() {
        givenVariant(1L, "600000", 30, 5);
        AuthenticatedPrincipal staff = new AuthenticatedPrincipal(2L, "staff", "RECEPTIONIST");
        assertThatThrownBy(() -> service.create(staff, order(List.of(line(1L, 1)), "pickup", "online", "600000")))
                .isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SHOP_MEMBER_REQUIRED");

        user.setDeletedAt(LocalDateTime.now(clock));
        assertThatThrownBy(() -> service.create(member, order(List.of(line(1L, 1)), "pickup", "online", "600000")))
                .isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SHOP_MEMBER_REQUIRED");
    }

    @Test
    void memberCancelsPendingOrderAndStockReturns() {
        ProductVariant v = givenVariant(1L, "1290000", 68, 3);
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setCode("SOL-261105-ABCD");
        order.setMember(memberProfile);
        order.setStatus(OrderStatus.pending_payment.name());
        order.setFulfillment("pickup");
        order.setPaymentMethod("online");
        order.setSubtotal(new BigDecimal("2580000"));
        order.setShippingFee(BigDecimal.ZERO);
        order.setTotal(new BigDecimal("2580000"));
        order.addItem(ProductOrderItem.snapshot(v, 2));

        Payment pendingPayment = new Payment();
        pendingPayment.setId(15L);
        pendingPayment.setStatus("pending");
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));
        when(payments.findAllByProductOrderId(9L)).thenReturn(List.of(pendingPayment));

        var dto = service.cancelByMember(1L, 9L, "Đổi ý");
        assertThat(dto.status()).isEqualTo("cancelled");
        assertThat(v.getStock()).isEqualTo(5);
        assertThat(pendingPayment.getStatus()).isEqualTo("failed");
        verify(movements).save(argThat(m -> m.getDelta() == 2 && "order_release".equals(m.getReason())));
    }

    @Test
    void memberCannotCancelWhileVnpayIsSettling() {
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setMember(memberProfile);
        order.setStatus(OrderStatus.pending_payment.name());
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));
        doThrow(new ConflictException("VNPAY_AWAITING_CONFIRMATION", "finance.vnpay.awaiting_confirmation", null, null))
                .when(guard).productOrder(9L);

        assertThatThrownBy(() -> service.cancelByMember(1L, 9L, "Hủy"))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_AWAITING_PAYMENT");
    }

    @Test
    void memberCannotCancelProcessingOrder() {
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setMember(memberProfile);
        order.setStatus(OrderStatus.processing.name());
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> service.cancelByMember(1L, 9L, "Hủy"))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");
    }

    @Test
    void expiryCancelsOnlyOverdueOrdersWhoseGatewayIsDone() {
        ProductVariant v = givenVariant(1L, "500000", 30, 5);
        ProductOrder settling = new ProductOrder();
        settling.setId(9L);
        settling.setCode("SOL-261105-0001");
        settling.setMember(memberProfile);
        settling.setStatus(OrderStatus.pending_payment.name());
        settling.addItem(ProductOrderItem.snapshot(v, 1));

        ProductOrder expired = new ProductOrder();
        expired.setId(10L);
        expired.setCode("SOL-261105-0002");
        expired.setMember(memberProfile);
        expired.setStatus(OrderStatus.pending_payment.name());
        expired.addItem(ProductOrderItem.snapshot(v, 2));

        when(orders.findExpiredUnpaid(any())).thenReturn(List.of(settling, expired));
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(settling));
        when(orders.findByIdForUpdate(10L)).thenReturn(Optional.of(expired));
        doThrow(new ConflictException("VNPAY_AWAITING_CONFIRMATION", "finance.vnpay.awaiting_confirmation", null, null))
                .when(guard).productOrder(9L);

        int count = service.expireUnpaid();
        assertThat(count).isEqualTo(1);
        assertThat(settling.getStatus()).isEqualTo("pending_payment");
        assertThat(expired.getStatus()).isEqualTo("cancelled");
        assertThat(v.getStock()).isEqualTo(7);
    }

    @Test
    void otherMembersOrderIsNotFound() {
        Member otherMember = new Member();
        otherMember.setUserId(2L);
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setMember(otherMember);
        order.setStatus(OrderStatus.pending_payment.name());
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> service.cancelByMember(1L, 9L, "Hủy"))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_NOT_FOUND");
        assertThatThrownBy(() -> service.myOrder(1L, 9L))
                .isInstanceOf(AppException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_NOT_FOUND");
    }
}
