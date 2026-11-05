package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.shop.dto.ProductAdminDtos.CategoryAdminDto;
import com.swp391.scms.shop.dto.ProductAdminDtos.CategoryUpsertRequest;
import com.swp391.scms.shop.service.CategoryAdminService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/manager/product-categories")
@PreAuthorize("hasRole('CENTER_MANAGER')")
public class ManagerCategoryController {
    private final CategoryAdminService categories;
    private final MessageService messages;

    public ManagerCategoryController(CategoryAdminService categories) {
        this(categories, null);
    }

    @Autowired
    public ManagerCategoryController(CategoryAdminService categories, MessageService messages) {
        this.categories = categories;
        this.messages = messages;
    }

    private String msg(String key) {
        return messages == null ? key : messages.getMessage(key);
    }

    @GetMapping
    public ApiResponse<List<CategoryAdminDto>> list() {
        return ApiResponse.ok(msg("success.shop.categories"), categories.list());
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CategoryAdminDto>> create(@Valid @RequestBody CategoryUpsertRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("success.shop.product_saved"), categories.create(request)));
    }

    @PutMapping("/{id}")
    public ApiResponse<CategoryAdminDto> update(@PathVariable Long id, @Valid @RequestBody CategoryUpsertRequest request) {
        return ApiResponse.ok(msg("success.shop.product_saved"), categories.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categories.delete(id);
        return ResponseEntity.noContent().build();
    }
}
