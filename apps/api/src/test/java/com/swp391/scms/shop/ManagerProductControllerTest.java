package com.swp391.scms.shop;

import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.controller.ManagerProductController;
import com.swp391.scms.shop.dto.ProductAdminDtos.ManagerOrderSummaryDto;
import com.swp391.scms.shop.service.ProductAdminService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ManagerProductControllerTest {
    ProductAdminService service;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        service = mock(ProductAdminService.class);
        mvc = MockMvcBuilders.standaloneSetup(new ManagerProductController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == AuthenticatedPrincipal.class;
                    }

                    @Override
                    public Object resolveArgument(MethodParameter p, ModelAndViewContainer c, NativeWebRequest r, WebDataBinderFactory f) {
                        return new AuthenticatedPrincipal(99L, "manager", "CENTER_MANAGER");
                    }
                })
                .build();
    }

    @Test
    void listsDeletesAndReturnsSummary() throws Exception {
        when(service.list(null, null, null, 0, 20)).thenReturn(new PageImpl<>(List.of(), org.springframework.data.domain.PageRequest.of(0, 20), 0));
        mvc.perform(get("/api/v1/manager/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray());

        when(service.summary()).thenReturn(new ManagerOrderSummaryDto(3L, new BigDecimal("4500000"), 2L));
        mvc.perform(get("/api/v1/manager/product-orders/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pendingFulfillment").value(3))
                .andExpect(jsonPath("$.data.revenue30d").value(4500000));

        mvc.perform(delete("/api/v1/manager/products/10"))
                .andExpect(status().isNoContent());
        verify(service).delete(10L);
    }
}
