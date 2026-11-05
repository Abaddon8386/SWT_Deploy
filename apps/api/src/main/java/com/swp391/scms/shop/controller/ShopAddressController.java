package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.AddressDtos.AddressDto;
import com.swp391.scms.shop.dto.AddressDtos.AddressRequest;
import com.swp391.scms.shop.service.AddressService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/shop/addresses")
@PreAuthorize("hasRole('MEMBER')")
public class ShopAddressController {
    private final AddressService addresses;
    private final MessageService messages;

    public ShopAddressController(AddressService addresses) {
        this(addresses, null);
    }

    @Autowired
    public ShopAddressController(AddressService addresses, MessageService messages) {
        this.addresses = addresses;
        this.messages = messages;
    }

    private String msg(String key) {
        return messages == null ? key : messages.getMessage(key);
    }

    @GetMapping
    public ApiResponse<List<AddressDto>> list(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ApiResponse.ok(msg("success.shop.addresses"), addresses.list(principal.id()));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AddressDto>> create(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody AddressRequest request
    ) {
        AddressDto created = addresses.create(principal.id(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("success.shop.address_saved"), created));
    }

    @PutMapping("/{id}")
    public ApiResponse<AddressDto> update(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody AddressRequest request
    ) {
        return ApiResponse.ok(msg("success.shop.address_saved"), addresses.update(principal.id(), id, request));
    }

    @PostMapping("/{id}/default")
    public ApiResponse<List<AddressDto>> makeDefault(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id
    ) {
        return ApiResponse.ok(msg("success.shop.address_saved"), addresses.makeDefault(principal.id(), id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<List<AddressDto>> delete(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id
    ) {
        return ApiResponse.ok(msg("success.shop.address_deleted"), addresses.delete(principal.id(), id));
    }
}
