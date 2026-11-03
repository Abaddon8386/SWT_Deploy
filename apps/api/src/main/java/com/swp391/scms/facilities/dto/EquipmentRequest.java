package com.swp391.scms.facilities.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record EquipmentRequest(
        @NotBlank(message = "{validation.equipment.name.not_blank}")
        @Size(max = 150, message = "{validation.equipment.name.size}")
        String name,

        @Size(max = 60, message = "{validation.equipment.code.size}")
        String code,

        @Size(max = 80, message = "{validation.equipment.category.size}")
        String category,

        Long roomId,

        @Min(value = 1, message = "{validation.equipment.quantity.min}")
        int quantity,

        @Pattern(regexp = "active|maintenance|broken|retired", message = "{validation.equipment.status.pattern}")
        String status,

        LocalDate purchaseDate,

        LocalDate maintenanceDate,

        @Size(max = 500, message = "{validation.equipment.note.size}")
        String note
) {
    public EquipmentRequest(String name, String code, String category, Long roomId, int quantity, String status) {
        this(name, code, category, roomId, quantity, status, null, null, null);
    }
}

