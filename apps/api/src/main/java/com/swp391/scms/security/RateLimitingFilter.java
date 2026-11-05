package com.swp391.scms.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Rate Limiting Filter tại Gateway API để ngăn chặn hành vi quét cạn (brute-force scan)
 * hoặc spam sinh mã Dynamic QR trên hệ thống.
 */
@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    private static final int SCAN_LIMIT_PER_MINUTE = 60;
    private static final int DYNAMIC_QR_LIMIT_PER_MINUTE = 30;
    private static final int AUTH_LIMIT_PER_MINUTE = 60;

    private static final String SCAN_PATH = "/api/v1/check-in/scan";
    private static final String DYNAMIC_QR_PATH = "/api/v1/memberships/subscriptions/my/dynamic-qr";
    private static final String AUTH_PATH = "/api/v1/auth/";
    private static final String AUTH_ME_PATH = "/api/v1/auth/me";

    private final Map<String, WindowCounter> requestCounts = new ConcurrentHashMap<>();
    private final AtomicLong lastCleanupMinute = new AtomicLong(-1);
    private final ObjectMapper objectMapper;
    private final MessageService messageService;

    public RateLimitingFilter() {
        this(new ObjectMapper().findAndRegisterModules(), null);
    }

    @Autowired
    public RateLimitingFilter(ObjectMapper objectMapper, MessageService messageService) {
        this.objectMapper = objectMapper;
        this.messageService = messageService;
    }

    private static class WindowCounter {
        long windowStartMinute;
        final AtomicInteger count = new AtomicInteger(0);

        WindowCounter(long minute) {
            this.windowStartMinute = minute;
            this.count.set(1);
        }
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String uri = request.getRequestURI();
        int limit = getRateLimitForUri(uri);

        if (limit > 0) {
            String clientIp = getClientIp(request);
            String key = (uri.startsWith(AUTH_PATH) ? AUTH_PATH : uri) + ":" + clientIp;
            long currentMinute = System.currentTimeMillis() / 60000L;
            long previousCleanup = lastCleanupMinute.get();
            if (previousCleanup != currentMinute && lastCleanupMinute.compareAndSet(previousCleanup, currentMinute)) {
                requestCounts.entrySet().removeIf(entry -> entry.getValue().windowStartMinute < currentMinute);
            }

            WindowCounter counter = requestCounts.compute(key, (k, existing) -> {
                if (existing == null || existing.windowStartMinute != currentMinute) {
                    return new WindowCounter(currentMinute);
                }
                existing.count.incrementAndGet();
                return existing;
            });

            if (counter.count.get() > limit) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", "60");
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                Locale locale = request.getHeader("Accept-Language") == null
                        ? Locale.forLanguageTag("vi") : request.getLocale();
                String message = messageService == null ? "security.rate_limit.exceeded"
                        : messageService.getMessage("security.rate_limit.exceeded", locale);
                objectMapper.writeValue(response.getWriter(), ApiResponse.error(429, "RATE_LIMIT_EXCEEDED", message));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private int getRateLimitForUri(String uri) {
        // The portal reads the current session on every load; it is authenticated and not a guessing target.
        if (uri.equals(AUTH_ME_PATH)) {
            return 0;
        }
        if (uri.startsWith(AUTH_PATH)) {
            return AUTH_LIMIT_PER_MINUTE;
        }
        if (uri.endsWith(SCAN_PATH)) {
            return SCAN_LIMIT_PER_MINUTE;
        }
        if (uri.endsWith(DYNAMIC_QR_PATH)) {
            return DYNAMIC_QR_LIMIT_PER_MINUTE;
        }
        return 0; // Not rate limited
    }

    /**
     * The client address. Behind the hosting proxy this is the real client only because
     * {@code server.forward-headers-strategy=native} lets Tomcat take X-Forwarded-For from trusted internal proxies;
     * the header is never read here directly, so a client cannot spoof it to dodge the limit.
     */
    private String getClientIp(HttpServletRequest request) {
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
    }
}
