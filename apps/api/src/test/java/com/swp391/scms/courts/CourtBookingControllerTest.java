package com.swp391.scms.courts;

import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.courts.controller.CourtBookingController;
import com.swp391.scms.courts.dto.CourtBookingResponses.*;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CourtBookingControllerTest {
    CourtBookingService service;
    MockMvc mvc;
    @BeforeEach void setup() {
        service = mock(CourtBookingService.class);
        mvc = MockMvcBuilders.standaloneSetup(new CourtBookingController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    public boolean supportsParameter(MethodParameter parameter) { return parameter.getParameterType() == AuthenticatedPrincipal.class; }
                    public Object resolveArgument(MethodParameter p, ModelAndViewContainer c, NativeWebRequest r, WebDataBinderFactory f) {
                        return new AuthenticatedPrincipal(1L, "member", "MEMBER");
                    }
                }).build();
    }
    @Test void courtListAndAvailabilityUseEnvelope() throws Exception {
        when(service.listCourts("Tennis")).thenReturn(List.of(new CourtDto(10L, "A", "L1", 1L, "Tennis", LocalTime.of(6,0), LocalTime.of(22,0))));
        mvc.perform(get("/api/v1/courts").param("discipline", "Tennis")).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].name").value("A"));
        when(service.availability(eq(10L), any())).thenReturn(List.of(new SlotDto(LocalTime.NOON, LocalTime.of(13,0), "free")));
        mvc.perform(get("/api/v1/courts/10/availability").param("date", "2026-11-02")).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].status").value("free"));
    }
    @Test void bookingReturnsCreatedAndRejectsMissingFields() throws Exception {
        mvc.perform(post("/api/v1/court-bookings").contentType("application/json").content("{\"roomId\":10,\"date\":\"2026-11-02\",\"startTime\":\"12:00\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/court-bookings").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        verify(service, times(1)).book(any(), any());
    }
    @Test void ownAndDailyListsExposePageContent() throws Exception {
        var paged = PageRequest.of(0, 20);
        when(service.my(any(), eq(0), eq(20))).thenReturn(new PageImpl<BookingDto>(List.of(), paged, 0));
        when(service.daily(any(), any(), isNull(), eq(0), eq(20))).thenReturn(new PageImpl<BookingDto>(List.of(), paged, 0));
        mvc.perform(get("/api/v1/court-bookings/my")).andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isArray());
        mvc.perform(get("/api/v1/court-bookings").param("date", "2026-11-02")).andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isArray());
    }
    @Test void cancellationBodyIsOptionalAndReasonIsBounded() throws Exception {
        mvc.perform(patch("/api/v1/court-bookings/8/cancel")).andExpect(status().isOk());
        verify(service).cancel(any(), eq(8L), isNull());
        mvc.perform(patch("/api/v1/court-bookings/8/cancel").contentType("application/json").content("{\"reason\":\"" + "x".repeat(256) + "\"}"))
                .andExpect(status().isBadRequest());
    }
}
