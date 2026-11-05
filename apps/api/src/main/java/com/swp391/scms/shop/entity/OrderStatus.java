package com.swp391.scms.shop.entity;

public enum OrderStatus {
    pending_payment,
    paid,
    processing,
    shipping,
    ready_for_pickup,
    completed,
    cancelled;

    public boolean terminal() {
        return this == completed || this == cancelled;
    }
}
