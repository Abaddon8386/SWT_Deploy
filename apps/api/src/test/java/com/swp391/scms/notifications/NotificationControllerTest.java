package com.swp391.scms.notifications;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.dto.UnreadCountDto;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Locale;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
public class NotificationControllerTest {

    private MockMvc mockMvc;

    @Mock
    private NotificationService notificationService;

    private MessageService messageService;

    private NotificationController notificationController;

    private ObjectMapper objectMapper;

    private final HandlerMethodArgumentResolver principalResolver = new HandlerMethodArgumentResolver() {
        @Override
        public boolean supportsParameter(MethodParameter parameter) {
            return parameter.hasParameterAnnotation(AuthenticationPrincipal.class)
                    && parameter.getParameterType().equals(AuthenticatedPrincipal.class);
        }

        @Override
        public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                      NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
            String role = webRequest.getHeader("X-Test-Role");
            if (role == null) role = "MEMBER";
            return new AuthenticatedPrincipal(101L, "user1", role);
        }
    };

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());

        ResourceBundleMessageSource messageSource = new ResourceBundleMessageSource();
        messageSource.setBasenames("i18n/messages");
        messageSource.setDefaultEncoding("UTF-8");
        messageService = new MessageService(messageSource);

        notificationController = new NotificationController(notificationService, messageService);

        AcceptHeaderLocaleResolver localeResolver = new AcceptHeaderLocaleResolver();
        localeResolver.setDefaultLocale(new Locale("vi"));

        mockMvc = MockMvcBuilders.standaloneSetup(notificationController)
                .setControllerAdvice(new GlobalExceptionHandler(messageService))
                .setCustomArgumentResolvers(principalResolver, new PageableHandlerMethodArgumentResolver())
                .setLocaleResolver(localeResolver)
                .build();
    }

    @Test
    void inboxHonorsEnglishHeaderAndDefaultsToVietnameseWithoutChangingStoredText() throws Exception {
        var repository = org.mockito.Mockito.mock(NotificationRepository.class);
        var users = org.mockito.Mockito.mock(com.swp391.scms.users.UserRepository.class);
        var service = new NotificationService(repository, users, new NotificationMapper(new NotificationLocalizer(messageService)));
        var entity = new com.swp391.scms.notifications.entity.Notification();
        entity.setId(99L);
        entity.setTitle("Upcoming class reminder");
        entity.setMessage("Your class \"Sunrise Yoga\" is starting at 07:00 on 2026-11-14. Get ready!");
        when(repository.findByUserIdOrderByCreatedAtDesc(eq(101L), any()))
                .thenReturn(new PageImpl<>(Collections.singletonList(entity), PageRequest.of(0, 20), 1));
        mockMvc = MockMvcBuilders.standaloneSetup(new NotificationController(service, messageService))
                .setCustomArgumentResolvers(principalResolver, new PageableHandlerMethodArgumentResolver())
                .setLocaleResolver(new com.swp391.scms.config.I18nConfig().localeResolver())
                .build();

        mockMvc.perform(get("/api/v1/notifications").header("Accept-Language", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].title").value("Upcoming class reminder"))
                .andExpect(jsonPath("$.data.content[0].message").value("Your class \"Sunrise Yoga\" is starting at 07:00 on 2026-11-14. Get ready!"));
        mockMvc.perform(get("/api/v1/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].title").value("Nhắc nhở lịch học sắp diễn ra"));
        mockMvc.perform(get("/api/v1/notifications").header("Accept-Language", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].title").value("Upcoming class reminder"));
        org.assertj.core.api.Assertions.assertThat(entity.getTitle()).isEqualTo("Upcoming class reminder");
        org.assertj.core.api.Assertions.assertThat(entity.getMessage())
                .isEqualTo("Your class \"Sunrise Yoga\" is starting at 07:00 on 2026-11-14. Get ready!");
    }

    @Test
    @DisplayName("GET /api/v1/notifications returns user notifications")
    void getNotifications_Success() throws Exception {
        NotificationDto dto = new NotificationDto(1L, "Test title", "Test content", "system", "support_request", 101L, false, LocalDateTime.now());
        Page<NotificationDto> page = new PageImpl<>(Collections.singletonList(dto), PageRequest.of(0, 20), 1);
        when(notificationService.getUserNotifications(eq(101L), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Lấy danh sách thông báo thành công"))
                .andExpect(jsonPath("$.data.content[0].id").value(1))
                .andExpect(jsonPath("$.data.content[0].title").value("Test title"));
    }

    @Test
    @DisplayName("GET /api/v1/notifications/unread-count returns unread count")
    void getUnreadCount_Success() throws Exception {
        when(notificationService.getUnreadCount(101L)).thenReturn(5L);

        mockMvc.perform(get("/api/v1/notifications/unread-count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Lấy số lượng thông báo chưa đọc thành công"))
                .andExpect(jsonPath("$.data.count").value(5));
    }

    @Test
    @DisplayName("PATCH /api/v1/notifications/{id}/read marks as read")
    void markAsRead_Success() throws Exception {
        mockMvc.perform(patch("/api/v1/notifications/1/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Đánh dấu đã đọc thành công"));
        verify(notificationService).markAsRead(1L, 101L);
    }

    @Test
    @DisplayName("PATCH /api/v1/notifications/read-all marks all as read")
    void markAllAsRead_Success() throws Exception {
        mockMvc.perform(patch("/api/v1/notifications/read-all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Đánh dấu tất cả đã đọc thành công"));
        verify(notificationService).markAllAsRead(101L);
    }
}
