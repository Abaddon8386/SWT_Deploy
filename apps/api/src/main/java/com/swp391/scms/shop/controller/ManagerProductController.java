package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.ProductAdminDtos.*;
import com.swp391.scms.shop.service.ProductAdminService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/manager")
@PreAuthorize("hasRole('CENTER_MANAGER')")
public class ManagerProductController {
    private final ProductAdminService products;
    private final MessageService messages;

    public ManagerProductController(ProductAdminService products) {
        this(products, null);
    }

    @Autowired
    public ManagerProductController(ProductAdminService products, MessageService messages) {
        this.products = products;
        this.messages = messages;
    }

    private String msg(String key) {
        return messages == null ? key : messages.getMessage(key);
    }

    @GetMapping("/products")
    public ApiResponse<Page<ProductAdminSummaryDto>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) Boolean lowStock,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.ok(msg("success.shop.products"), products.list(q, active, lowStock, page, size));
    }

    @GetMapping("/products/{id}")
    public ApiResponse<ProductAdminDto> get(@PathVariable Long id) {
        return ApiResponse.ok(msg("success.shop.product"), products.get(id));
    }

    @PostMapping("/products")
    public ResponseEntity<ApiResponse<ProductAdminDto>> create(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody ProductUpsertRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("success.shop.product_saved"), products.create(principal, request)));
    }

    @PutMapping("/products/{id}")
    public ApiResponse<ProductAdminDto> update(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody ProductUpsertRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.product_saved"), products.update(principal, id, request));
    }

    @PatchMapping("/products/{id}/active")
    public ApiResponse<ProductAdminDto> setActive(
            @PathVariable Long id,
            @Valid @RequestBody SetActiveRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.product_saved"), products.setActive(id, request.active()));
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        products.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/products/{id}/images")
    public ApiResponse<ProductAdminDto> addImage(
            @PathVariable Long id,
            @Valid @RequestBody ImageUploadRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.product_saved"), products.addImage(id, request));
    }

    @DeleteMapping("/products/{id}/images/{imageId}")
    public ApiResponse<ProductAdminDto> removeImage(
            @PathVariable Long id,
            @PathVariable Long imageId
    ) {
        return ApiResponse.ok(msg("success.shop.product_saved"), products.removeImage(id, imageId));
    }

    @PutMapping("/products/{id}/images/order")
    public ApiResponse<ProductAdminDto> reorderImages(
            @PathVariable Long id,
            @Valid @RequestBody ImageOrderRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.product_saved"), products.reorderImages(id, request.imageIds()));
    }

    @PostMapping("/product-variants/{id}/stock-adjustments")
    public ApiResponse<VariantAdminDto> adjustStock(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody StockAdjustmentRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.stock_adjusted"), products.adjustStock(principal, id, request));
    }

    @GetMapping("/product-orders/summary")
    public ApiResponse<ManagerOrderSummaryDto> summary() {
        return ApiResponse.ok(msg("success.shop.summary"), products.summary());
    }
}
