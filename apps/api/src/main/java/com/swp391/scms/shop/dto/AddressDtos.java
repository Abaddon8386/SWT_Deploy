package com.swp391.scms.shop.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AddressDtos {
    private AddressDtos() {}

    public record AddressRequest(
            @NotBlank(message = "{validation.shop.address.recipient_required}")
            @Size(min = 2, max = 80, message = "{validation.shop.address.recipient_size}")
            String recipientName,

            @NotBlank(message = "{validation.shop.address.phone_invalid}")
            @Pattern(regexp = "^(0|\\+84)(3|5|7|8|9)\\d{8}$", message = "{validation.shop.address.phone_invalid}")
            String phone,

            @NotBlank(message = "{validation.shop.address.province_required}")
            String provinceCode,

            @NotBlank(message = "{validation.shop.address.ward_required}")
            String wardCode,

            @NotBlank(message = "{validation.shop.address.street_size}")
            @Size(min = 5, max = 200, message = "{validation.shop.address.street_size}")
            String streetLine,

            @Size(max = 200, message = "{validation.shop.address.note_size}")
            String note,

            boolean makeDefault
    ) {}

    public record AddressDto(
            Long id,
            String recipientName,
            String phone,
            String provinceCode,
            String provinceName,
            String wardCode,
            String wardName,
            String streetLine,
            String note,
            boolean isDefault
    ) {}
}
