package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.OrderDtos.CancelOrderRequest;
import com.swp391.scms.shop.dto.OrderDtos.CreateOrderRequest;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.OrderDtos.OrderSummaryDto;
import com.swp391.scms.shop.service.ProductOrderService;
import com.swp391.scms.shop.service.ProductOrderService.CreateResult;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/v1/shop/orders")
@PreAuthorize("hasRole('MEMBER')")
public class ShopOrderController {
    private final ProductOrderService orders;
    private final MessageService messages;

    public ShopOrderController(ProductOrderService orders) {
        this(orders, null);
    }

    @Autowired
    public ShopOrderController(ProductOrderService orders,
                               @Autowired(required = false) MessageService messages) {
        this.orders = orders;
        this.messages = messages;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<OrderDto>> create(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CreateOrderRequest request) {
        CreateResult result = orders.createIdempotent(principal, request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        ApiResponse<OrderDto> body = result.created()
                ? ApiResponse.created(msg("success.shop.order_created"), result.order())
                : ApiResponse.ok(msg("success.shop.order_created"), result.order());
        return ResponseEntity.status(status).body(body);
    }

    @GetMapping
    public ApiResponse<Page<OrderSummaryDto>> list(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        Long userId = principal != null ? principal.id() : null;
        return ApiResponse.ok(msg("success.shop.orders"), orders.myOrders(userId, status, page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<OrderDto> get(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        Long userId = principal != null ? principal.id() : null;
        return ApiResponse.ok(msg("success.shop.order"), orders.myOrder(userId, id));
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<OrderDto> cancel(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody(required = false) CancelOrderRequest request) {
        Long userId = principal != null ? principal.id() : null;
        String reason = request != null ? request.reason() : null;
        return ApiResponse.ok(msg("success.shop.order_cancelled"), orders.cancelByMember(userId, id, reason));
    }

    private String msg(String key) {
        return messages != null ? messages.getMessage(key) : key;
    }
}
