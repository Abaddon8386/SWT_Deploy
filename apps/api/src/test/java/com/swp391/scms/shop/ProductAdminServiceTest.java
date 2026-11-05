package com.swp391.scms.shop;

import com.swp391.scms.shop.dto.ProductAdminDtos.*;
import com.swp391.scms.shop.entity.*;
import com.swp391.scms.shop.repository.*;
import com.swp391.scms.shop.service.ProductAdminService;
import com.swp391.scms.shop.service.ProductAdminService.OrderMetricRow;
import com.swp391.scms.shop.service.ProductAdminService.OrderUsageChecker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class ProductAdminServiceTest {
    ProductRepository products;
    ProductCategoryRepository categories;
    ProductVariantRepository variants;
    ProductImageRepository images;
    StockMovementRepository movements;
    OrderUsageChecker orderUsage;
    ProductAdminService service;

    final byte[] pngBytes = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    final String pngDataUrl = "data:image/png;base64," + Base64.getEncoder().encodeToString(pngBytes);

    @BeforeEach
    void setup() {
        products = mock(ProductRepository.class);
        categories = mock(ProductCategoryRepository.class);
        variants = mock(ProductVariantRepository.class);
        images = mock(ProductImageRepository.class);
        movements = mock(StockMovementRepository.class);
        orderUsage = mock(OrderUsageChecker.class);

        ProductCategory cat = new ProductCategory();
        cat.setId(1L);
        cat.setName("Whey");
        cat.setSlug("whey");
        cat.setActive(true);
        when(categories.findById(1L)).thenReturn(Optional.of(cat));
        when(products.save(any(Product.class))).thenAnswer(inv -> {
            Product p = inv.getArgument(0);
            if (p.getId() == null) {
                p.setId(100L);
            }
            long vId = 1L;
            for (ProductVariant v : p.getVariants()) {
                if (v.getId() == null) {
                    v.setId(vId++);
                }
            }
            return p;
        });

        service = new ProductAdminService(
                products,
                categories,
                variants,
                images,
                movements,
                Clock.fixed(Instant.parse("2026-11-05T07:00:00Z"), ZoneOffset.UTC),
                orderUsage
        );
    }

    static VariantUpsertRequest variantReq(Long id, String sku, String price, Integer initialStock) {
        return new VariantUpsertRequest(id, sku, "Sô-cô-la 2kg", new BigDecimal(price), 60, initialStock, true, 0);
    }

    static ProductUpsertRequest validReq(List<VariantUpsertRequest> vars, List<NutrientUpsertRequest> nuts) {
        return new ProductUpsertRequest(
                "SÖL Whey Isolate",
                1L,
                "powder",
                "SÖL Nutrition",
                "Đạm whey tách béo dễ hấp thu.",
                "Mô tả chi tiết",
                "1 muỗng (33 g)",
                "Pha với 250 ml nước",
                "Không dùng cho trẻ em",
                null,
                Set.of(ProductGoal.muscle_gain),
                true,
                true,
                vars,
                nuts
        );
    }

    @Test
    void createProductRequiresAtLeastOneVariantAndOneGoalAndOneHighlightMax() {
        assertThatThrownBy(() -> service.create(validReq(List.of(), List.of())))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_INVALID");

        ProductUpsertRequest noGoals = new ProductUpsertRequest(
                "SÖL Whey", 1L, "powder", null, "Đạm whey tách béo dễ hấp thu.",
                null, "33 g", null, null, null, Set.of(), true, false,
                List.of(variantReq(null, "SOL-WHEY-1", "1290000", 5)), List.of()
        );
        assertThatThrownBy(() -> service.create(noGoals))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_INVALID");

        List<NutrientUpsertRequest> twoHighlights = List.of(
                new NutrientUpsertRequest("Đạm", new BigDecimal("25"), "g", 50, false, true, 0),
                new NutrientUpsertRequest("BCAA", new BigDecimal("5.5"), "g", null, true, true, 1)
        );
        assertThatThrownBy(() -> service.create(validReq(List.of(variantReq(null, "SOL-WHEY-1", "1290000", 5)), twoHighlights)))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_INVALID");
    }

    @Test
    void duplicateNameYieldsSlugTakenAndDuplicateSkuYieldsSkuTaken() {
        when(products.existsBySlug("sol-whey-isolate")).thenReturn(true);
        assertThatThrownBy(() -> service.create(validReq(List.of(variantReq(null, "SOL-WHEY-1", "1290000", 5)), List.of())))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_SLUG_TAKEN");

        when(products.existsBySlug("sol-whey-isolate")).thenReturn(false);
        when(variants.existsBySkuIgnoreCase("SOL-WHEY-1")).thenReturn(true);
        assertThatThrownBy(() -> service.create(validReq(List.of(variantReq(null, "SOL-WHEY-1", "1290000", 5)), List.of())))
                .hasFieldOrPropertyWithValue("errorCode", "SKU_TAKEN");
    }

    @Test
    void updateDoesNotChangeExistingStockAndDeactivatesRemovedVariantsWithOrders() {
        Product existing = new Product();
        existing.setId(10L);
        ProductVariant vKeep = new ProductVariant();
        vKeep.setId(1L);
        vKeep.setProduct(existing);
        vKeep.setSku("SKU-KEEP");
        vKeep.setLabel("Old");
        vKeep.setPrice(new BigDecimal("1000000"));
        vKeep.setStock(12);
        vKeep.setActive(true);

        ProductVariant vOrdered = new ProductVariant();
        vOrdered.setId(2L);
        vOrdered.setProduct(existing);
        vOrdered.setSku("SKU-ORDERED");
        vOrdered.setLabel("Ordered");
        vOrdered.setPrice(new BigDecimal("900000"));
        vOrdered.setStock(4);
        vOrdered.setActive(true);

        ProductVariant vUnused = new ProductVariant();
        vUnused.setId(3L);
        vUnused.setProduct(existing);
        vUnused.setSku("SKU-UNUSED");
        vUnused.setLabel("Unused");
        vUnused.setPrice(new BigDecimal("900000"));
        vUnused.setStock(0);
        vUnused.setActive(true);

        existing.getVariants().addAll(List.of(vKeep, vOrdered, vUnused));
        when(products.findById(10L)).thenReturn(Optional.of(existing));
        when(orderUsage.hasOrdersForVariant(2L)).thenReturn(true);
        when(orderUsage.hasOrdersForVariant(3L)).thenReturn(false);

        var updated = service.update(10L, validReq(List.of(variantReq(1L, "SKU-KEEP", "1290000", 999)), List.of()));
        assertThat(updated.variants()).hasSize(2);
        assertThat(updated.variants().get(0).id()).isEqualTo(1L);
        assertThat(updated.variants().get(0).stock()).isEqualTo(12);
        assertThat(updated.variants().get(0).price()).isEqualByComparingTo("1290000");
        assertThat(updated.variants().get(1).id()).isEqualTo(2L);
        assertThat(updated.variants().get(1).active()).isFalse();
    }

    @Test
    void deleteWithOrderLinesIsRefused() {
        Product existing = new Product();
        existing.setId(10L);
        when(products.findById(10L)).thenReturn(Optional.of(existing));
        when(orderUsage.hasOrdersForProduct(10L)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(10L))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_HAS_ORDERS");
        verify(products, never()).delete(any());
    }

    @Test
    void stockAdjustmentLocksVariantRecordsMovementAndRejectsNegativeResult() {
        ProductVariant v = new ProductVariant();
        v.setId(5L);
        v.setSku("SKU-5");
        v.setLabel("Choco");
        v.setPrice(new BigDecimal("500000"));
        v.setStock(3);
        when(variants.findByIdForUpdate(5L)).thenReturn(Optional.of(v));
        when(variants.save(any(ProductVariant.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThatThrownBy(() -> service.adjustStock(5L, new StockAdjustmentRequest(-4, "adjustment", "Hỏng")))
                .hasFieldOrPropertyWithValue("errorCode", "STOCK_ADJUSTMENT_INVALID");

        var dto = service.adjustStock(5L, new StockAdjustmentRequest(7, "restock", "Nhập lô mới"));
        assertThat(dto.stock()).isEqualTo(10);
        verify(movements).save(argThat(m -> m.getDelta() == 7 && "restock".equals(m.getReason())));
    }

    @Test
    void imageLimitAndReorderMustMatchExistingIds() {
        Product p = new Product();
        p.setId(10L);
        for (long i = 1; i <= 6; i++) {
            ProductImage img = new ProductImage();
            img.setId(i);
            img.setProduct(p);
            img.setDataUrl(pngDataUrl);
            img.setContentType("image/png");
            img.setAltText("Alt " + i);
            img.setSortOrder((int) i - 1);
            p.getImages().add(img);
        }
        when(products.findById(10L)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> service.addImage(10L, pngDataUrl, "Extra"))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_IMAGE_LIMIT");

        assertThatThrownBy(() -> service.reorderImages(10L, List.of(1L, 2L)))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_INVALID");

        var reordered = service.reorderImages(10L, List.of(6L, 5L, 4L, 3L, 2L, 1L));
        assertThat(reordered.images()).extracting(i -> i.id()).containsExactly(6L, 5L, 4L, 3L, 2L, 1L);
    }

    @Test
    void summaryCountsRealOrders() {
        LocalDateTime paidRecent = LocalDateTime.of(2026, 11, 1, 10, 0);
        when(orderUsage.findRecentAndActiveOrders(any())).thenReturn(List.of(
                new OrderMetricRow("paid", new BigDecimal("1000000"), paidRecent),
                new OrderMetricRow("processing", new BigDecimal("500000"), paidRecent),
                new OrderMetricRow("completed", new BigDecimal("300000"), paidRecent),
                new OrderMetricRow("cancelled", new BigDecimal("900000"), paidRecent)
        ));
        when(variants.countLowStockActiveVariants()).thenReturn(4L);

        var summary = service.summary();
        assertThat(summary.pendingFulfillment()).isEqualTo(2L);
        assertThat(summary.revenue30d()).isEqualByComparingTo("1800000");
        assertThat(summary.lowStockVariants()).isEqualTo(4L);
    }
}
