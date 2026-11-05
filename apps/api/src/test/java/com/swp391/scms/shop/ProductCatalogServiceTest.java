package com.swp391.scms.shop;

import com.swp391.scms.shop.dto.ProductPublicDtos.ProductSummaryDto;
import com.swp391.scms.shop.dto.ProductPublicDtos.VariantDto;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.repository.ProductCategoryRepository;
import com.swp391.scms.shop.repository.ProductImageRepository;
import com.swp391.scms.shop.repository.ProductRepository;
import com.swp391.scms.shop.service.ProductCatalogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProductCatalogServiceTest {
    ProductRepository products;
    ProductCategoryRepository categories;
    ProductImageRepository images;
    ShopProperties props;
    ProductCatalogService service;

    @BeforeEach
    void setup() {
        products = mock(ProductRepository.class);
        categories = mock(ProductCategoryRepository.class);
        images = mock(ProductImageRepository.class);
        props = new ShopProperties();
        service = new ProductCatalogService(products, categories, images, props,
                Clock.fixed(Instant.parse("2026-11-05T07:00:00Z"), ZoneOffset.UTC));
    }

    static Product product(Long id, String slug, boolean active) {
        ProductCategory cat = new ProductCategory();
        cat.setId(1L);
        cat.setName("Whey");
        cat.setSlug("whey");
        cat.setActive(true);

        Product p = new Product();
        p.setId(id);
        p.setCategory(cat);
        p.setName(slug);
        p.setSlug(slug);
        p.setShortDescription("Short");
        p.setServingSize("33 g");
        p.setActive(active);
        return p;
    }

    static ProductVariant variant(Product p, Long id, String price, Integer servings, int stock, boolean active) {
        ProductVariant v = new ProductVariant();
        v.setId(id);
        v.setProduct(p);
        v.setSku("SKU-" + id);
        v.setLabel("Label " + id);
        v.setPrice(new BigDecimal(price));
        v.setServingsPerContainer(servings);
        v.setStock(stock);
        v.setActive(active);
        return v;
    }

    @Test
    void detailHidesInactiveProductsAndInactiveVariants() {
        Product p = product(10L, "whey", true);
        ProductVariant off = variant(p, 2L, "900000", 30, 0, false);
        ProductVariant on = variant(p, 1L, "1290000", 68, 3, true);
        p.getVariants().addAll(List.of(on, off));

        when(products.findBySlugAndActiveTrue("whey")).thenReturn(Optional.of(p));
        var dto = service.detail("whey");
        assertThat(dto.variants()).extracting(VariantDto::id).containsExactly(1L);

        when(products.findBySlugAndActiveTrue("gone")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.detail("gone"))
                .hasFieldOrPropertyWithValue("errorCode", "PRODUCT_NOT_FOUND");
    }

    @Test
    void publicStockIsCappedAndLowStockFlagged() {
        Product pHigh = product(1L, "high", true);
        pHigh.setCreatedAt(java.time.LocalDateTime.of(2026, 11, 1, 10, 0));
        pHigh.getVariants().add(variant(pHigh, 10L, "500000", 30, 140, true));
        when(products.findBySlugAndActiveTrue("high")).thenReturn(Optional.of(pHigh));
        var detailHigh = service.detail("high");
        assertThat(detailHigh.variants().getFirst().stock()).isEqualTo(99);
        assertThat(detailHigh.variants().getFirst().available()).isTrue();

        Product pLow = product(2L, "low", true);
        pLow.setCreatedAt(java.time.LocalDateTime.of(2026, 11, 4, 10, 0));
        pLow.getVariants().add(variant(pLow, 20L, "500000", 30, 9, true));
        Product pZero = product(3L, "zero", true);
        pZero.getVariants().add(variant(pZero, 30L, "500000", 30, 0, true));

        when(products.searchPublic(any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(pHigh, pLow, pZero)));

        var page = service.list(null, null, null, false, false, "newest", 0, 12);
        assertThat(page.getContent()).hasSize(3);
        assertThat(page.getContent().get(0).lowStock()).isFalse();
        assertThat(page.getContent().get(0).isNew()).isFalse();
        assertThat(page.getContent().get(1).lowStock()).isTrue();
        assertThat(page.getContent().get(1).isNew()).isTrue();
        assertThat(page.getContent().get(1).inStock()).isTrue();
        assertThat(page.getContent().get(2).inStock()).isFalse();
        assertThat(page.getContent().get(2).lowStock()).isFalse();
    }

    @Test
    void sortByPricePerServingPutsProductsWithoutServingsLast() {
        Product noServings = product(1L, "no-servings", true);
        noServings.getVariants().add(variant(noServings, 1L, "300000", null, 10, true));

        Product expensiveServing = product(2L, "expensive", true);
        expensiveServing.getVariants().add(variant(expensiveServing, 2L, "900000", 30, 10, true)); // 30000

        Product cheapServing = product(3L, "cheap", true);
        cheapServing.getVariants().add(variant(cheapServing, 3L, "600000", 60, 10, true)); // 10000

        when(products.searchPublic(any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(noServings, expensiveServing, cheapServing)));

        var page = service.list(null, null, null, false, false, "price_per_serving", 0, 12);
        assertThat(page.getContent()).extracting(ProductSummaryDto::slug)
                .containsExactly("cheap", "expensive", "no-servings");
    }
}
