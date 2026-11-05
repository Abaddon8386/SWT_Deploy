package com.swp391.scms.shop;

import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.shop.controller.PublicProductController;
import com.swp391.scms.shop.service.ProductCatalogService;
import com.swp391.scms.shop.service.QuoteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PublicProductControllerTest {
    ProductCatalogService catalog;
    QuoteService quotes;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        catalog = mock(ProductCatalogService.class);
        quotes = mock(QuoteService.class);
        mvc = MockMvcBuilders.standaloneSetup(new PublicProductController(catalog, quotes))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void rejectsBogusSortAndPassesSizeToServiceForClamping() throws Exception {
        when(catalog.list(any(), any(), any(), anyBoolean(), anyBoolean(), eq("bogus"), anyInt(), anyInt()))
                .thenThrow(new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{"sort"}, "Invalid sort"));

        mvc.perform(get("/api/v1/public/products").param("sort", "bogus"))
                .andExpect(status().isBadRequest());

        when(catalog.list(any(), any(), any(), anyBoolean(), anyBoolean(), eq("newest"), eq(0), eq(100)))
                .thenReturn(new PageImpl<>(List.of(), org.springframework.data.domain.PageRequest.of(0, 100), 0));

        mvc.perform(get("/api/v1/public/products").param("size", "100"))
                .andExpect(status().isOk());
        verify(catalog).list(isNull(), isNull(), isNull(), eq(false), eq(false), eq("newest"), eq(0), eq(100));
    }
}
