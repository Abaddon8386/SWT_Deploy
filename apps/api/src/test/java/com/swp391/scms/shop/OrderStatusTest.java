package com.swp391.scms.shop;

import com.swp391.scms.shop.entity.OrderStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OrderStatusTest {
    @Test
    void onlyCompletedAndCancelledAreTerminal() {
        assertThat(OrderStatus.pending_payment.terminal()).isFalse();
        assertThat(OrderStatus.paid.terminal()).isFalse();
        assertThat(OrderStatus.processing.terminal()).isFalse();
        assertThat(OrderStatus.shipping.terminal()).isFalse();
        assertThat(OrderStatus.ready_for_pickup.terminal()).isFalse();
        assertThat(OrderStatus.completed.terminal()).isTrue();
        assertThat(OrderStatus.cancelled.terminal()).isTrue();
    }
}
