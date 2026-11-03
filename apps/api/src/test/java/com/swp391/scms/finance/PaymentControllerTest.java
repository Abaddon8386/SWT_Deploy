package com.swp391.scms.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.finance.dto.PaymentCreateDto;
import com.swp391.scms.finance.dto.PaymentDto;
import com.swp391.scms.finance.dto.PaymentStatusUpdateRequest;
import com.swp391.scms.finance.service.PaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class PaymentControllerTest {

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @Mock
    private PaymentService paymentService;

    @InjectMocks
    private PaymentController paymentController;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        mockMvc = MockMvcBuilders.standaloneSetup(paymentController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("POST /api/v1/payments should return 201 Created when request is valid")
    void shouldCreatePaymentSuccessfully() throws Exception {
        PaymentCreateDto request = new PaymentCreateDto();
        request.setMemberId(2L);
        request.setAmount(new BigDecimal("1500000.00"));
        request.setMethod("cash");
        request.setStatus("success");

        PaymentDto responseDto = new PaymentDto();
        responseDto.setId(10L);
        responseDto.setAmount(new BigDecimal("1500000.00"));

        when(paymentService.createPayment(org.mockito.ArgumentMatchers.nullable(
                com.swp391.scms.security.AuthenticatedPrincipal.class), any(PaymentCreateDto.class))).thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(201))
                .andExpect(jsonPath("$.data.id").value(10));
    }

    @Test
    @DisplayName("POST /api/v1/payments should return 400 Bad Request when missing memberId or invalid method")
    void shouldRejectInvalidPaymentRequest() throws Exception {
        PaymentCreateDto request = new PaymentCreateDto();
        request.setAmount(new BigDecimal("-100.00")); // invalid negative amount
        request.setMethod("crypto"); // invalid method

        mockMvc.perform(post("/api/v1/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("GET /api/v1/payments/{id} should return 200 OK")
    void shouldGetPaymentById() throws Exception {
        PaymentDto dto = new PaymentDto();
        dto.setId(1L);

        when(paymentService.getPaymentById(1L)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/payments/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(1));
    }

    @Test
    @DisplayName("GET /api/v1/payments/member/{memberId} should return 200 OK")
    void shouldGetPaymentsByMemberId() throws Exception {
        PaymentDto dto = new PaymentDto();
        dto.setId(1L);

        when(paymentService.getPaymentsByMemberId(2L)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/payments/member/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    @DisplayName("PATCH /api/v1/payments/{id}/status should return 200 OK on valid status")
    void shouldUpdatePaymentStatusSuccessfully() throws Exception {
        PaymentStatusUpdateRequest request = new PaymentStatusUpdateRequest("refunded");
        PaymentDto dto = new PaymentDto();
        dto.setId(1L);
        dto.setStatus("refunded");

        when(paymentService.updatePaymentStatus(eq(1L), eq("refunded"))).thenReturn(dto);

        mockMvc.perform(patch("/api/v1/payments/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("refunded"));
    }

    @Test
    @DisplayName("PATCH /api/v1/payments/{id}/status should return 400 Bad Request on invalid status")
    void shouldRejectInvalidPaymentStatusUpdate() throws Exception {
        String invalidJson = "{\"status\": \"unknown_state\"}";

        mockMvc.perform(patch("/api/v1/payments/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("POST /api/v1/payments/process should return 201 Created when process request is valid")
    void shouldProcessPaymentSuccessfully() throws Exception {
        com.swp391.scms.finance.dto.PaymentProcessDto request =
                new com.swp391.scms.finance.dto.PaymentProcessDto(2L, 10L, null, new BigDecimal("1500000.00"), "cash", null, "Thanh toan");

        PaymentDto responseDto = new PaymentDto();
        responseDto.setId(100L);
        responseDto.setAmount(new BigDecimal("1500000.00"));
        responseDto.setStatus("success");

        when(paymentService.processPayment(any(com.swp391.scms.finance.dto.PaymentProcessDto.class))).thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/payments/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(100L))
                .andExpect(jsonPath("$.data.status").value("success"));
    }

    @Test
    @DisplayName("POST /api/v1/payments/{id}/refund should return 200 OK when refund is valid")
    void shouldRefundPaymentSuccessfully() throws Exception {
        com.swp391.scms.finance.dto.PaymentRefundRequest request =
                new com.swp391.scms.finance.dto.PaymentRefundRequest("Lý do hợp lệ", new BigDecimal("1500000.00"));

        PaymentDto responseDto = new PaymentDto();
        responseDto.setId(5L);
        responseDto.setStatus("refunded");

        when(paymentService.refundPayment(eq(5L), any(com.swp391.scms.finance.dto.PaymentRefundRequest.class)))
                .thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/payments/5/refund")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("refunded"));
    }
}
