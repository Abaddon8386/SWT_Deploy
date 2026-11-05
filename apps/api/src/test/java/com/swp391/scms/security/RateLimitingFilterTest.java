package com.swp391.scms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class RateLimitingFilterTest {

    @Test
    void authRequestsAreLimitedAndUseApiResponseShape() throws Exception {
        MockHttpServletResponse response = null;
        for (int i = 0; i < 61; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
            request.setRemoteAddr("10.0.0.10");
            response = new MockHttpServletResponse();
            filter.doFilterInternal(request, response, filterChain);
        }
        assertEquals(429, response.getStatus());
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getContentAsString());
        assertEquals(false, json.get("success").asBoolean());
        assertEquals(429, json.get("status").asInt());
    }

    @Test
    void sessionReadOnEveryPortalLoadDoesNotUseTheLoginBudget() throws Exception {
        for (int i = 0; i < 100; i++) {
            MockHttpServletRequest me = new MockHttpServletRequest("GET", "/api/v1/auth/me");
            me.setRemoteAddr("10.0.0.11");
            MockHttpServletResponse meResponse = new MockHttpServletResponse();
            filter.doFilterInternal(me, meResponse, filterChain);
            assertEquals(200, meResponse.getStatus());
        }
        MockHttpServletRequest login = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        login.setRemoteAddr("10.0.0.11");
        MockHttpServletResponse loginResponse = new MockHttpServletResponse();
        filter.doFilterInternal(login, loginResponse, filterChain);
        assertEquals(200, loginResponse.getStatus());
    }

    private RateLimitingFilter filter;
    private FilterChain filterChain;

    @BeforeEach
    void setUp() {
        filter = new RateLimitingFilter();
        filterChain = mock(FilterChain.class);
    }

    @Test
    @DisplayName("Các request bình thường dưới ngưỡng limit được cho qua")
    void requestsUnderLimit_passThrough() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/check-in/scan");
        request.setRemoteAddr("192.168.1.100");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, filterChain);

        assertEquals(200, response.getStatus());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Vượt quá rate limit (quét cạn > 60 req/phút) -> Trả về HTTP 429 Too Many Requests kèm Retry-After")
    void requestsExceedingLimit_return429TooManyRequests() throws ServletException, IOException {
        String clientIp = "10.0.0.99";

        // Gửi 60 requests hợp lệ
        for (int i = 0; i < 60; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/check-in/scan");
            req.setRemoteAddr(clientIp);
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilterInternal(req, res, filterChain);
            assertEquals(200, res.getStatus());
        }

        // Request thứ 61 bị chặn rate limit
        MockHttpServletRequest blockedReq = new MockHttpServletRequest("POST", "/api/v1/check-in/scan");
        blockedReq.setRemoteAddr(clientIp);
        MockHttpServletResponse blockedRes = new MockHttpServletResponse();

        filter.doFilterInternal(blockedReq, blockedRes, filterChain);

        assertEquals(429, blockedRes.getStatus());
        assertEquals("60", blockedRes.getHeader("Retry-After"));
    }
}
