package com.swp391.scms.shop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.controller.ShopOrderController;
import com.swp391.scms.shop.dto.OrderDtos.CreateOrderRequest;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteLineRequest;
import com.swp391.scms.shop.service.ProductOrderService;
import com.swp391.scms.shop.service.ProductOrderService.CreateResult;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ShopOrderControllerTest {
    final ProductOrderService orders = mock(ProductOrderService.class);
    final AuthenticatedPrincipal member = new AuthenticatedPrincipal(1L, "member", "MEMBER");
    final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ShopOrderController(orders))
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
                    }

                    @Override
                    public Object resolveArgument(MethodParameter parameter,
                                                  ModelAndViewContainer mavContainer,
                                                  NativeWebRequest webRequest,
                                                  WebDataBinderFactory binderFactory) {
                        return member;
                    }
                })
                .setControllerAdvice(new GlobalExceptionHandler(null))
                .build();
    }

    OrderDto sampleOrder() {
        return new OrderDto(
                9L, "SOL-261105-ABCD", "pending_payment", "pickup", "online",
                List.of(), new BigDecimal("1290000"), BigDecimal.ZERO, new BigDecimal("1290000"),
                null, "120 Hai Bà Trưng", LocalDateTime.of(2026, 11, 5, 14, 30),
                LocalDateTime.of(2026, 11, 5, 14, 0), null, null, null, null, null, null,
                null, null, null, true, true, null, null
        );
    }

    @Test
    void createReturns201ForNewOrderAnd200ForDuplicateClientRequestId() throws Exception {
        CreateOrderRequest req = new CreateOrderRequest(
                "11111111-2222-3333-4444-555555555555",
                List.of(new QuoteLineRequest(1L, 1)),
                "pickup",
                "online",
                new BigDecimal("1290000")
        );
        when(orders.createIdempotent(eq(member), any()))
                .thenReturn(new CreateResult(sampleOrder(), true))
                .thenReturn(new CreateResult(sampleOrder(), false));

        mvc.perform(post("/api/v1/shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.code").value("SOL-261105-ABCD"));

        mvc.perform(post("/api/v1/shop/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("SOL-261105-ABCD"));
    }
}
