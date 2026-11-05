package com.swp391.scms.shop.dto;

import com.swp391.scms.shop.entity.ProductGoal;

import java.math.BigDecimal;
import java.util.List;

public final class ProductPublicDtos {
    private ProductPublicDtos() {}

    public record CategoryDto(Long id, String name, String slug) {}

    public record HighlightDto(String name, BigDecimal amount, String unit) {}

    public record ProductSummaryDto(
            Long id,
            String slug,
            String name,
            String categoryName,
            String form,
            List<ProductGoal> goals,
            String shortDescription,
            String imageUrl,
            HighlightDto highlight,
            BigDecimal minPrice,
            BigDecimal pricePerServing,
            boolean inStock,
            boolean lowStock,
            boolean featured,
            boolean isNew,
            Long defaultVariantId,
            int variantCount
    ) {
        public ProductSummaryDto(
                Long id,
                String slug,
                String name,
                String categoryName,
                String form,
                List<ProductGoal> goals,
                String shortDescription,
                String imageUrl,
                HighlightDto highlight,
                BigDecimal minPrice,
                BigDecimal pricePerServing,
                boolean inStock,
                boolean lowStock,
                boolean featured,
                boolean isNew
        ) {
            this(id, slug, name, categoryName, form, goals, shortDescription, imageUrl, highlight,
                    minPrice, pricePerServing, inStock, lowStock, featured, isNew, null, 0);
        }
    }

    public record ImageDto(Long id, String url, String alt) {}

    public record VariantDto(
            Long id,
            String sku,
            String label,
            BigDecimal price,
            Integer servingsPerContainer,
            BigDecimal pricePerServing,
            int stock,
            boolean available
    ) {}

    public record NutrientDto(
            String name,
            BigDecimal amount,
            String unit,
            Integer dailyValuePercent,
            boolean subRow,
            boolean highlight
    ) {}

    public record ProductDetailDto(
            Long id,
            String slug,
            String name,
            String brand,
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
            List<ImageDto> images,
            List<VariantDto> variants,
            List<NutrientDto> nutrients,
            List<ProductSummaryDto> related
    ) {}

    public record ShopConfigDto(
            BigDecimal shippingFee,
            BigDecimal freeShippingThreshold,
            int paymentWindowMinutes,
            int counterHoldHours,
            String pickupAddress
    ) {}
}
