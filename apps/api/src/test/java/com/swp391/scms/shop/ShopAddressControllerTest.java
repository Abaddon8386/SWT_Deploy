package com.swp391.scms.shop;

import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.controller.ShopAddressController;
import com.swp391.scms.shop.dto.AddressDtos.AddressDto;
import com.swp391.scms.shop.service.AddressService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ShopAddressControllerTest {
    AddressService service;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        service = mock(AddressService.class);
        mvc = MockMvcBuilders.standaloneSetup(new ShopAddressController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == AuthenticatedPrincipal.class;
                    }

                    @Override
                    public Object resolveArgument(MethodParameter p, ModelAndViewContainer c, NativeWebRequest r, WebDataBinderFactory f) {
                        return new AuthenticatedPrincipal(1L, "member", "MEMBER");
                    }
                })
                .build();
    }

    @Test
    void listsCreatesAndValidatesAddresses() throws Exception {
        AddressDto dto = new AddressDto(10L, "Nguyễn An", "0901234567", "79", "TP.HCM", "26740", "Phường Sài Gòn", "12 Lê Lợi", null, true);
        when(service.list(1L)).thenReturn(List.of(dto));
        mvc.perform(get("/api/v1/shop/addresses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].recipientName").value("Nguyễn An"));

        when(service.create(eq(1L), any())).thenReturn(dto);
        mvc.perform(post("/api/v1/shop/addresses")
                        .contentType("application/json")
                        .content("""
                                {"recipientName":"Nguyễn An","phone":"0901234567","provinceCode":"79","wardCode":"26740","streetLine":"12 Lê Lợi","makeDefault":true}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(10));

        mvc.perform(post("/api/v1/shop/addresses")
                        .contentType("application/json")
                        .content("""
                                {"recipientName":"A","phone":"invalid","provinceCode":"","wardCode":"","streetLine":"12"}
                                """))
                .andExpect(status().isBadRequest());
    }
}
