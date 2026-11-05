package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.CounterPaymentRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.OrderCountsDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.ShipRequest;
import com.swp391.scms.shop.dto.StaffOrderDtos.StaffCancelRequest;
import com.swp391.scms.shop.service.ProductOrderStaffService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/staff/product-orders")
@PreAuthorize("hasAnyRole('RECEPTIONIST','STAFF','CENTER_MANAGER')")
public class StaffProductOrderController {
    private final ProductOrderStaffService orders;
    private final MessageService messages;

    public StaffProductOrderController(ProductOrderStaffService orders) {
        this(orders, null);
    }

    @Autowired
    public StaffProductOrderController(ProductOrderStaffService orders,
                                       @Autowired(required = false) MessageService messages) {
        this.orders = orders;
        this.messages = messages;
    }

    @GetMapping
    public ApiResponse<Page<OrderDto>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(msg("success.shop.orders"), orders.list(status, q, page, size));
    }

    @GetMapping("/counts")
    public ApiResponse<OrderCountsDto> counts() {
        return ApiResponse.ok(msg("success.shop.orders"), orders.counts());
    }

    @GetMapping("/{id}")
    public ApiResponse<OrderDto> get(@PathVariable Long id) {
        return ApiResponse.ok(msg("success.shop.order"), orders.get(id));
    }

    @PostMapping("/{id}/start-processing")
    public ApiResponse<OrderDto> startProcessing(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ApiResponse.ok(msg("success.shop.order_updated"), orders.startProcessing(principal, id));
    }

    @PostMapping("/{id}/ship")
    public ApiResponse<OrderDto> ship(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody ShipRequest request) {
        return ApiResponse.ok(msg("success.shop.order_updated"), orders.ship(principal, id, request));
    }

    @PostMapping("/{id}/ready-for-pickup")
    public ApiResponse<OrderDto> readyForPickup(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ApiResponse.ok(msg("success.shop.order_updated"), orders.readyForPickup(principal, id));
    }

    @PostMapping("/{id}/complete")
    public ApiResponse<OrderDto> complete(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ApiResponse.ok(msg("success.shop.order_updated"), orders.complete(principal, id));
    }

    @PostMapping("/{id}/counter-payment")
    public ApiResponse<OrderDto> counterPayment(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody CounterPaymentRequest request) {
        return ApiResponse.ok(msg("success.shop.order_updated"), orders.counterPayment(principal, id, request));
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<OrderDto> cancel(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody StaffCancelRequest request) {
        return ApiResponse.ok(msg("success.shop.order_cancelled"), orders.cancel(principal, id, request));
    }

    private String msg(String key) {
        return messages != null ? messages.getMessage(key) : key;
    }
}
