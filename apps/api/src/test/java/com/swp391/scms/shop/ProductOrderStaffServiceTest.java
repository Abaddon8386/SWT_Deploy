package com.swp391.scms.shop;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.service.InvoiceService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.StaffOrderDtos.CounterPaymentRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.ShipRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.StaffCancelRequest;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.entity.ProductOrderItem;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.mapper.OrderMapper;
import com.swp391.scms.shop.repository.ProductOrderRepository;
import com.swp391.scms.shop.repository.ProductVariantRepository;
import com.swp391.scms.shop.repository.StockMovementRepository;
import com.swp391.scms.shop.service.AddressService;
import com.swp391.scms.shop.service.OrderCodeGenerator;
import com.swp391.scms.shop.service.ProductOrderPayments;
import com.swp391.scms.shop.service.ProductOrderRefunds;
import com.swp391.scms.shop.service.ProductOrderService;
import com.swp391.scms.shop.service.ProductOrderStaffService;
import com.swp391.scms.shop.service.QuoteService;
import com.swp391.scms.shop.service.StockService;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductOrderStaffServiceTest {
    final ProductOrderRepository orders = mock(ProductOrderRepository.class);
    final ProductVariantRepository variants = mock(ProductVariantRepository.class);
    final StockMovementRepository movements = mock(StockMovementRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final PaymentRepository payments = mock(PaymentRepository.class);
    final InvoiceService invoices = mock(InvoiceService.class);
    final UserRepository users = mock(UserRepository.class);
    final NotificationService notifications = mock(NotificationService.class);
    final MessageService messages = mock(MessageService.class);
    final ProductOrderRefunds refunds = mock(ProductOrderRefunds.class);
    final ProductOrderPayments orderPayments = mock(ProductOrderPayments.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-11-05T07:00:00Z"), ZoneOffset.UTC);
    final ShopProperties props = new ShopProperties();
    final AuthenticatedPrincipal staff = new AuthenticatedPrincipal(3L, "receptionist", "RECEPTIONIST");

    StockService stock;
    ProductOrderService orderService;
    ProductOrderStaffService service;
    Member member;
    User staffUser;
    ProductVariant variant;

    @BeforeEach
    void setUp() {
        User memberUser = new User();
        memberUser.setId(1L);
        memberUser.setFullName("Member One");
        memberUser.setPhone("0901234567");
        member = new Member();
        member.setUserId(1L);
        member.setUser(memberUser);

        staffUser = new User();
        staffUser.setId(3L);
        staffUser.setFullName("Receptionist");
        lenient().when(users.findByIdAndDeletedAtIsNull(3L)).thenReturn(Optional.of(staffUser));

        Product p = new Product();
        p.setId(10L);
        p.setName("SÖL Whey Isolate");
        p.setSlug("sol-whey-isolate");
        variant = new ProductVariant();
        variant.setId(1L);
        variant.setProduct(p);
        variant.setSku("SKU-1");
        variant.setLabel("2.27 kg");
        variant.setPrice(new BigDecimal("1290000"));
        variant.setStock(5);
        lenient().when(variants.findAllByIdInForUpdate(any())).thenReturn(List.of(variant));

        OrderMapper mapper = new OrderMapper(props, clock, payments, null);
        stock = mock(StockService.class);
        orderService = new ProductOrderService(
                orders, variants, members, mock(QuoteService.class), mock(AddressService.class),
                stock, new OrderCodeGenerator(orders), mapper, props, clock
        );
        orderService.setRefunds(refunds);
        orderService.setPayments(payments);
        orderService.setNotifications(notifications);
        orderService.setMessages(messages);

        service = new ProductOrderStaffService(
                orders, orderService, orderPayments, payments, invoices, users, mapper, notifications, messages, clock
        );
    }

    ProductOrder givenOrder(String status, String fulfillment, String paymentMethod) {
        ProductOrder o = new ProductOrder();
        o.setId(9L);
        o.setCode("SOL-261105-ABCD");
        o.setMember(member);
        o.setStatus(status);
        o.setFulfillment(fulfillment);
        o.setPaymentMethod(paymentMethod);
        o.setSubtotal(new BigDecimal("1290000"));
        o.setShippingFee(BigDecimal.ZERO);
        o.setTotal(new BigDecimal("1290000"));
        o.addItem(ProductOrderItem.snapshot(variant, 1));
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void shipRequiresDeliveryProcessingAndTrackingNumber() {
        givenOrder(OrderStatus.processing.name(), "pickup", "online");
        assertThatThrownBy(() -> service.ship(staff, 9L, new ShipRequest("GHN", "VN123456")))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");

        givenOrder(OrderStatus.processing.name(), "delivery", "online");
        assertThatThrownBy(() -> service.ship(staff, 9L, new ShipRequest("GHN", "")))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void readyForPickupRejectsDeliveryOrders() {
        givenOrder(OrderStatus.processing.name(), "delivery", "online");
        assertThatThrownBy(() -> service.readyForPickup(staff, 9L))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");
    }

    @Test
    void counterPaymentOnlyForPendingCounterOrdersAndCreatesSuccessfulPayment() {
        givenOrder(OrderStatus.pending_payment.name(), "pickup", "online");
        assertThatThrownBy(() -> service.counterPayment(staff, 9L, new CounterPaymentRequest("cash")))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");

        givenOrder(OrderStatus.pending_payment.name(), "pickup", "counter");
        when(payments.save(any())).thenAnswer(inv -> {
            Payment p = inv.getArgument(0);
            p.setId(77L);
            return p;
        });

        var dto = service.counterPayment(staff, 9L, new CounterPaymentRequest("cash"));
        assertThat(dto.status()).isEqualTo("paid");
        verify(payments).save(argThat(p -> "cash".equals(p.getMethod())
                && "success".equals(p.getStatus())
                && staffUser.equals(p.getReceivedBy())
                && Long.valueOf(9L).equals(p.getProductOrderId())));
        verify(invoices).autoIssueInvoiceForPayment(77L);
        verify(orderPayments).markPaid(9L, "cash");
    }

    @Test
    void cancelPaidOrderRefundsWalletAndRestocksWhenAsked() {
        ProductOrder o1 = givenOrder(OrderStatus.paid.name(), "pickup", "online");
        when(refunds.refundIfPaid(eq(o1), any())).thenReturn(new BigDecimal("1290000"));
        service.cancel(staff, 9L, new StaffCancelRequest("Khách yêu cầu hủy", true));
        verify(refunds, times(1)).refundIfPaid(eq(o1), eq("Khách yêu cầu hủy"));
        verify(stock, times(1)).release(eq(o1), eq(3L));

        ProductOrder o2 = givenOrder(OrderStatus.processing.name(), "delivery", "online");
        service.cancel(staff, 9L, new StaffCancelRequest("Hàng bị lỗi bao bì", false));
        verify(refunds, times(1)).refundIfPaid(eq(o2), eq("Hàng bị lỗi bao bì"));
        verify(stock, never()).release(eq(o2), any());
    }

    @Test
    void cancelRequiresReason() {
        givenOrder(OrderStatus.paid.name(), "pickup", "online");
        assertThatThrownBy(() -> service.cancel(staff, 9L, new StaffCancelRequest("abc", true)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void completedOrCancelledOrdersCannotChange() {
        givenOrder(OrderStatus.completed.name(), "pickup", "online");
        assertThatThrownBy(() -> service.cancel(staff, 9L, new StaffCancelRequest("Hủy sau hoàn tất", true)))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");

        givenOrder(OrderStatus.cancelled.name(), "pickup", "online");
        assertThatThrownBy(() -> service.startProcessing(staff, 9L))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "ORDER_INVALID_TRANSITION");
    }

    @Test
    void transitionsNotifyMemberWithOrderLink() {
        givenOrder(OrderStatus.processing.name(), "delivery", "online");
        service.ship(staff, 9L, new ShipRequest("GHN", "GHN998877"));
        verify(notifications).send(eq(1L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/member/orders/9"));
    }

    @Test
    void searchMatchesCodeMemberNameAndPhone() {
        when(orders.searchStaff(eq("paid"), eq(false), eq("sol-26"), any()))
                .thenReturn(new PageImpl<>(List.of()));
        service.list("paid", "  SOL-26 ", 0, 20);
        verify(orders).searchStaff(eq("paid"), eq(false), eq("sol-26"), any());
    }
}
