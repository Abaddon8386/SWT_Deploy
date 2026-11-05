package com.swp391.scms.shop;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteLineRequest;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteRequest;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.repository.ProductVariantRepository;
import com.swp391.scms.shop.service.QuoteService;
import com.swp391.scms.shop.service.ShopPricing;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QuoteServiceTest {
    ProductVariantRepository variants;
    QuoteService service;

    @BeforeEach
    void setup() {
        variants = mock(ProductVariantRepository.class);
        service = new QuoteService(variants, new ShopPricing(new ShopProperties()));
    }

    static ProductVariant variant(Long id, String price, int stock, boolean active) {
        ProductCategory cat = new ProductCategory();
        cat.setId(1L);
        cat.setActive(true);

        Product p = new Product();
        p.setId(10L);
        p.setCategory(cat);
        p.setName("SÖL Whey");
        p.setSlug("sol-whey");
        p.setActive(true);

        ProductVariant v = new ProductVariant();
        v.setId(id);
        v.setProduct(p);
        v.setSku("SKU-" + id);
        v.setLabel("Choco");
        v.setPrice(new BigDecimal(price));
        v.setStock(stock);
        v.setActive(active);
        return v;
    }

    @Test
    void quoteMergesDuplicateLinesAndFlagsShortStock() {
        ProductVariant v1 = variant(1L, "200000", 4, true);
        when(variants.findAllById(anyCollection())).thenReturn(List.of(v1));

        var dto = service.quote(new QuoteRequest(
                List.of(new QuoteLineRequest(1L, 2), new QuoteLineRequest(1L, 3)),
                "pickup"
        ));
        assertThat(dto.lines()).hasSize(1);
        var line = dto.lines().getFirst();
        assertThat(line.requestedQuantity()).isEqualTo(5);
        assertThat(line.quantity()).isEqualTo(4);
        assertThat(line.problem()).isEqualTo("INSUFFICIENT_STOCK");
        assertThat(dto.valid()).isFalse();
        assertThat(dto.subtotal()).isEqualByComparingTo("800000");
    }

    @Test
    void quoteRejectsOversizedCarts() {
        assertThatThrownBy(() -> service.quote(new QuoteRequest(List.of(), "pickup")))
                .isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "CART_EMPTY");

        assertThatThrownBy(() -> service.quote(new QuoteRequest(List.of(new QuoteLineRequest(1L, 21)), "pickup")))
                .isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "CART_TOO_LARGE");

        List<QuoteLineRequest> thirtyOne = new ArrayList<>();
        for (long i = 1; i <= 31; i++) {
            thirtyOne.add(new QuoteLineRequest(i, 1));
        }
        assertThatThrownBy(() -> service.quote(new QuoteRequest(thirtyOne, "pickup")))
                .isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "CART_TOO_LARGE");
    }

    @Test
    void unknownOrInactiveVariantsAreReportedNotThrown() {
        ProductVariant inactive = variant(2L, "200000", 5, false);
        when(variants.findAllById(anyCollection())).thenReturn(List.of(inactive));

        var dto = service.quote(new QuoteRequest(
                List.of(new QuoteLineRequest(1L, 1), new QuoteLineRequest(2L, 1)),
                "pickup"
        ));
        assertThat(dto.valid()).isFalse();
        assertThat(dto.lines()).hasSize(2);
        assertThat(dto.lines().get(0).problem()).isEqualTo("NOT_FOUND");
        assertThat(dto.lines().get(1).problem()).isEqualTo("INACTIVE");
    }
}
