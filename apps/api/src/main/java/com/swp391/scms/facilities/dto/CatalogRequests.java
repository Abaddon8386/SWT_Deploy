package com.swp391.scms.facilities.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalTime;

/** Request DTOs for the master catalogs (disciplines, rooms, packages). */
public final class CatalogRequests {
    private CatalogRequests() {}

    public record DisciplineRequest(
            @NotBlank(message = "{validation.catalog.name.not_blank}")
            @Size(max = 100, message = "{validation.catalog.name.size}") String name,
            String description) {}

    public record RoomRequest(
            @NotBlank(message = "{validation.catalog.name.not_blank}")
            @Size(max = 100, message = "{validation.catalog.name.size}") String name,
            @Size(max = 150, message = "{validation.catalog.location.size}") String location,
            @Min(value = 1, message = "{validation.catalog.capacity.min}") int capacity,
            @Pattern(regexp = "available|maintenance|closed", message = "{validation.catalog.room_status.pattern}") String status,
            Long disciplineId, LocalTime openTime, LocalTime closeTime,
            @Pattern(regexp = "(?i)STANDARD|PLATINUM", message = "{validation.catalog.room_tier.pattern}") String tier) {
        public RoomRequest(String name, String location, int capacity, String status) {
            this(name, location, capacity, status, null, null, null, "STANDARD");
        }
        public RoomRequest(String name, String location, int capacity, String status, Long disciplineId, LocalTime openTime, LocalTime closeTime) {
            this(name, location, capacity, status, disciplineId, openTime, closeTime, "STANDARD");
        }
    }

    public record PackageRequest(
            @NotBlank(message = "{validation.catalog.name.not_blank}")
            @Size(max = 150, message = "{validation.catalog.name.size}") String name,
            String description,
            @NotNull(message = "{validation.catalog.price.not_null}")
            @DecimalMin(value = "0.0", message = "{validation.catalog.price.min}") BigDecimal price,
            @Min(value = 1, message = "{validation.catalog.duration.min}") int durationDays,
            @Min(value = 0, message = "{validation.catalog.credit.min}") Integer classCreditLimit,
            @Pattern(regexp = "active|inactive", message = "{validation.catalog.package_status.pattern}") String status,
            @Pattern(regexp = "(?i)|SILVER|GOLD|PLATINUM", message = "{validation.catalog.room_tier.pattern}") String tier) {
        public PackageRequest(String name, String description, BigDecimal price, int durationDays,
                              Integer classCreditLimit, String status) {
            this(name, description, price, durationDays, classCreditLimit, status, null);
        }
    }

    public record PackageStatusRequest(
            @NotBlank(message = "{validation.catalog.package_status.pattern}")
            @Pattern(regexp = "active|inactive", message = "{validation.catalog.package_status.pattern}") String status) {}
}
