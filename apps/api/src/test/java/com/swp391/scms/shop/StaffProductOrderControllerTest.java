package com.swp391.scms.shop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.controller.StaffProductOrderController;
import com.swp391.scms.shop.dto.OrderDtos.OrderDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.OrderCountsDto;
import com.swp391.scms.shop.dto.StaffOrderDtos.ShipRequest;
import com.swp391.scms.shop.service.ProductOrderStaffService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StaffProductOrderControllerTest {
    final ProductOrderStaffService orders = mock(ProductOrderStaffService.class);
    final AuthenticatedPrincipal staff = new AuthenticatedPrincipal(3L, "receptionist", "RECEPTIONIST");
    final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new StaffProductOrderController(orders))
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
                        return staff;
                    }
                })
                .setControllerAdvice(new GlobalExceptionHandler(null))
                .build();
    }

    @Test
    void countsReturnsTabCountsAndShipValidatesTrackingNumber() throws Exception {
        when(orders.counts()).thenReturn(new OrderCountsDto(3, 2, 1, 4, 5));

        mvc.perform(get("/api/v1/staff/product-orders/counts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.paid").value(3))
                .andExpect(jsonPath("$.data.counter_pending").value(5));

        mvc.perform(post("/api/v1/staff/product-orders/9/ship")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new ShipRequest("GHN", "12"))))
                .andExpect(status().isBadRequest());

        OrderDto shipped = new OrderDto(
                9L, "SOL-261105-ABCD", "shipping", "delivery", "online",
                List.of(), new BigDecimal("1290000"), BigDecimal.ZERO, new BigDecimal("1290000"),
                null, null, LocalDateTime.of(2026, 11, 5, 14, 30),
                LocalDateTime.of(2026, 11, 5, 14, 0), null, null, null, null, null, null,
                null, "GHN", "GHN998877", true, false, null, null
        );
        when(orders.ship(eq(staff), eq(9L), any())).thenReturn(shipped);

        mvc.perform(post("/api/v1/staff/product-orders/9/ship")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new ShipRequest("GHN", "GHN998877"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("shipping"));
    }
}
