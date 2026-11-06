package com.swp391.scms.shop;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.shop.entity.OrderStatus;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.repository.ProductOrderRepository;
import com.swp391.scms.shop.service.ProductOrderPayments;
import com.swp391.scms.shop.service.ProductOrderRefunds;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductOrderPaymentsTest {
    final ProductOrderRepository orders = mock(ProductOrderRepository.class);
    final ProductOrderRefunds refunds = mock(ProductOrderRefunds.class);
    final NotificationService notifications = mock(NotificationService.class);
    final UserRepository users = mock(UserRepository.class);
    final MessageService messages = mock(MessageService.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-11-05T07:00:00Z"), ZoneOffset.UTC);

    ProductOrderPayments service;
    Member member;

    @BeforeEach
    void setUp() {
        member = new Member();
        member.setUserId(1L);
        service = new ProductOrderPayments(orders, refunds, notifications, users, messages, clock);
    }

    @Test
    void requirePayableRejectsCounterAndNonPendingOrders() {
        ProductOrder counterOrder = new ProductOrder();
        counterOrder.setId(9L);
        counterOrder.setMember(member);
        counterOrder.setStatus(OrderStatus.pending_payment.name());
        counterOrder.setPaymentMethod("counter");
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(counterOrder));

        assertThatThrownBy(() -> service.requirePayable(9L))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "VNPAY_TARGET_UNAVAILABLE");

        counterOrder.setPaymentMethod("online");
        counterOrder.setStatus(OrderStatus.paid.name());
        assertThatThrownBy(() -> service.requirePayable(9L))
                .isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "VNPAY_TARGET_UNAVAILABLE");
    }

    @Test
    void markPaidTransitionsPendingOrderAndNotifiesMemberAndStaff() {
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setCode("SOL-261105-ABCD");
        order.setMember(member);
        order.setStatus(OrderStatus.pending_payment.name());
        order.setPaymentMethod("online");
        order.setTotal(new BigDecimal("1290000"));
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));

        User staff = new User();
        staff.setId(20L);
        staff.setStatus("active");
        when(users.findActiveStaffUsers()).thenReturn(List.of(staff));

        service.markPaid(9L, "online_wallet");

        assertThat(order.getStatus()).isEqualTo("paid");
        assertThat(order.getPaidAt()).isNotNull();
        verify(notifications).send(eq(1L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/member/orders/9"));
        verify(notifications).send(eq(20L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/staff/orders"));
    }

    @Test
    void latePaymentAfterCancellationRefundsWalletInsteadOfReopeningOrder() {
        ProductOrder cancelled = new ProductOrder();
        cancelled.setId(9L);
        cancelled.setCode("SOL-261105-ABCD");
        cancelled.setMember(member);
        cancelled.setStatus(OrderStatus.cancelled.name());
        cancelled.setTotal(new BigDecimal("1290000"));
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(cancelled));
        when(refunds.refundIfPaid(eq(cancelled), any())).thenReturn(new BigDecimal("1290000"));

        service.markPaid(9L, "online_wallet");

        assertThat(cancelled.getStatus()).isEqualTo("cancelled");
        verify(refunds).refundIfPaid(eq(cancelled), any());
        verify(orders, never()).save(any());
        verify(notifications).send(eq(1L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/member/orders/9"));
    }

    @Test
    void counterPaymentNotifiesMemberButNotEveryStaffMember() {
        ProductOrder order = new ProductOrder();
        order.setId(9L);
        order.setCode("SOL-261105-ABCD");
        order.setMember(member);
        order.setStatus(OrderStatus.pending_payment.name());
        order.setPaymentMethod("counter");
        order.setTotal(new BigDecimal("1290000"));
        when(orders.findByIdForUpdate(9L)).thenReturn(Optional.of(order));

        service.markPaid(9L, "cash");

        assertThat(order.getStatus()).isEqualTo("paid");
        verify(notifications).send(eq(1L), any(), any(), eq("order"), eq("product_order"), eq(9L), eq("/member/orders/9"));
        verify(notifications, never()).send(any(), any(), any(), any(), any(), any(), eq("/staff/orders"));
        verify(users, never()).findActiveStaffUsers();
    }
}
