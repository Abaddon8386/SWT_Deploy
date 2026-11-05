package com.swp391.scms.shop.dto;

import com.swp391.scms.shop.dto.ProductPublicDtos.ImageDto;
import com.swp391.scms.shop.dto.ProductPublicDtos.NutrientDto;
import com.swp391.scms.shop.entity.ProductGoal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

public final class ProductAdminDtos {
    private ProductAdminDtos() {}

    public record CategoryUpsertRequest(
            @NotBlank @Size(min = 2, max = 80) String name,
            int sortOrder,
            boolean active
    ) {}

    public record CategoryAdminDto(
            Long id,
            String name,
            String slug,
            int sortOrder,
            boolean active,
            long productCount
    ) {}

    public record ProductAdminSummaryDto(
            Long id,
            String name,
            String slug,
            String categoryName,
            int variantCount,
            int totalStock,
            boolean lowStock,
            boolean active,
            boolean featured,
            String imageUrl,
            BigDecimal minPrice,
            boolean isNew
    ) {
        public ProductAdminSummaryDto(
                Long id,
                String name,
                String slug,
                String categoryName,
                int variantCount,
                int totalStock,
                boolean lowStock,
                boolean active,
                boolean featured,
                String imageUrl
        ) {
            this(id, name, slug, categoryName, variantCount, totalStock, lowStock, active, featured, imageUrl, null, false);
        }
    }

    public record VariantAdminDto(
            Long id,
            String sku,
            String label,
            BigDecimal price,
            Integer servingsPerContainer,
            BigDecimal pricePerServing,
            int stock,
            boolean active,
            int sortOrder
    ) {}

    public record ProductAdminDto(
            Long id,
            String slug,
            String name,
            String brand,
            Long categoryId,
            String categoryName,
            String categorySlug,
            String form,
            List<ProductGoal> goals,
            String shortDescription,
            String description,
            String servingSize,
            String usageInstructions,
            String warnings,
            String registrationNumber,
            boolean active,
            boolean featured,
            List<ImageDto> images,
            List<VariantAdminDto> variants,
            List<NutrientDto> nutrients
    ) {}

    public record VariantUpsertRequest(
            Long id,
            @NotBlank @Pattern(regexp = "^[A-Z0-9-]{3,40}$") String sku,
            @NotBlank @Size(min = 1, max = 80) String label,
            @NotNull @DecimalMin("1000") @DecimalMax("100000000") BigDecimal price,
            @Min(1) @Max(1000) Integer servingsPerContainer,
            @Min(0) @Max(9999) Integer initialStock,
            boolean active,
            int sortOrder
    ) {}

    public record NutrientUpsertRequest(
            @NotBlank @Size(min = 1, max = 80) String name,
            @NotNull @DecimalMin("0") @DecimalMax("100000") BigDecimal amount,
            @NotBlank @Size(min = 1, max = 12) String unit,
            @Min(0) @Max(1000) Integer dailyValuePercent,
            boolean subRow,
            boolean highlight,
            int sortOrder
    ) {}

    public record ProductUpsertRequest(
            @NotBlank @Size(min = 2, max = 160) String name,
            @NotNull Long categoryId,
            @NotBlank String form,
            @Size(max = 80) String brand,
            @NotBlank @Size(min = 10, max = 300) String shortDescription,
            @Size(max = 5000) String description,
            @NotBlank @Size(min = 1, max = 60) String servingSize,
            @Size(max = 2000) String usageInstructions,
            @Size(max = 2000) String warnings,
            @Size(max = 60) String registrationNumber,
            @NotEmpty Set<ProductGoal> goals,
            boolean active,
            boolean featured,
            @NotEmpty @Size(min = 1, max = 12) List<@Valid VariantUpsertRequest> variants,
            @Size(max = 30) List<@Valid NutrientUpsertRequest> nutrients
    ) {}

    public record SetActiveRequest(boolean active) {}

    public record ImageUploadRequest(
            @NotBlank String dataUrl,
            @NotBlank @Size(min = 1, max = 160) String altText
    ) {}

    public record ImageOrderRequest(
            @NotEmpty List<Long> imageIds
    ) {}

    public record StockAdjustmentRequest(
            int delta,
            @NotBlank String reason,
            @Size(max = 200) String note
    ) {}

    public record ManagerOrderSummaryDto(
            long pendingFulfillment,
            BigDecimal revenue30d,
            long lowStockVariants
    ) {}
}
