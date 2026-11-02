package com.swp391.scms.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.support.dto.CreateSupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestDto;
import com.swp391.scms.support.dto.UpdateSupportRequestStatusDto;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.dto.SupportRequestMessageDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class SupportRequestControllerTest {

    private MockMvc mockMvc;

    @Mock
    private SupportRequestService supportRequestService;

    private MessageService messageService;
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
            return new AuthenticatedPrincipal(10L, "member1", "MEMBER");
        }
    };

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        ResourceBundleMessageSource messageSource = new ResourceBundleMessageSource();
        messageSource.setBasenames("i18n/messages");
        messageSource.setDefaultEncoding("UTF-8");
        messageService = new MessageService(messageSource);

        SupportRequestController controller = new SupportRequestController(supportRequestService, messageService);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler(messageService))
                .setCustomArgumentResolvers(principalResolver, new PageableHandlerMethodArgumentResolver())
                .build();
    }

    private SupportRequestDto sampleDto(Long id, String status) {
        return new SupportRequestDto(
                id, 10L, "Nguyễn Văn A", null, null,
                "Lỗi phòng tập", "Mô tả chi tiết", status,
                LocalDateTime.now(), null
        );
    }

    @Test
    @DisplayName("POST /api/v1/support/requests tạo yêu cầu thành công")
    void createRequest_Success() throws Exception {
        CreateSupportRequestDto dto = new CreateSupportRequestDto("Lỗi phòng tập", "Mô tả chi tiết");
        when(supportRequestService.createRequest(eq(10L), any(CreateSupportRequestDto.class)))
                .thenReturn(sampleDto(1L, "open"));

        mockMvc.perform(post("/api/v1/support/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.subject").value("Lỗi phòng tập"));
    }

    @Test
    @DisplayName("POST /api/v1/support/requests lỗi 400 khi subject để trống")
    void createRequest_ValidationFailure() throws Exception {
        CreateSupportRequestDto dto = new CreateSupportRequestDto("", "Mô tả chi tiết");

        mockMvc.perform(post("/api/v1/support/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("GET /api/v1/support/requests/my lấy danh sách yêu cầu của Member")
    void getMyRequests_Success() throws Exception {
        when(supportRequestService.getMyRequests(eq(10L), any()))
                .thenReturn(new PageImpl<>(List.of(sampleDto(1L, "open")), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/support/requests/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(1));
    }

    @Test
    @DisplayName("GET /api/v1/support/requests lấy tất cả yêu cầu cho Receptionist/Manager")
    void getAllRequests_Success() throws Exception {
        when(supportRequestService.getAllRequests(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(sampleDto(1L, "open"), sampleDto(2L, "in_progress")), PageRequest.of(0, 20), 2));

        mockMvc.perform(get("/api/v1/support/requests"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content.length()").value(2));
    }

    @Test
    @DisplayName("PATCH /api/v1/support/requests/{id}/status cập nhật trạng thái ticket")
    void updateStatus_Success() throws Exception {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        when(supportRequestService.updateStatus(eq(1L), any(UpdateSupportRequestStatusDto.class), any()))
                .thenReturn(sampleDto(1L, "in_progress"));

        mockMvc.perform(patch("/api/v1/support/requests/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateDto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("in_progress"));
    }

    @Test
    @DisplayName("PATCH /api/v1/support/requests/{id}/status lỗi 400 khi status không thuộc regex")
    void updateStatus_InvalidStatusRegex() throws Exception {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("invalid_status", null);

        mockMvc.perform(patch("/api/v1/support/requests/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateDto)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("PATCH /api/v1/support/requests/{id}/status trả về 403 FORBIDDEN khi phân quyền bị chặn")
    void updateStatus_AccessDeniedReturns403() throws Exception {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        when(supportRequestService.updateStatus(eq(1L), any(UpdateSupportRequestStatusDto.class), any()))
                .thenThrow(new AccessDeniedException("Access is denied"));

        mockMvc.perform(patch("/api/v1/support/requests/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateDto)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @DisplayName("POST /api/v1/support/requests/{id}/messages gửi tin nhắn thành công")
    void sendMessage_Success() throws Exception {
        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Tôi muốn kiểm tra lại");
        SupportRequestMessageDto responseDto = new SupportRequestMessageDto(
                1L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tôi muốn kiểm tra lại", LocalDateTime.now()
        );

        when(supportRequestService.sendMessage(eq(1L), eq(10L), eq("MEMBER"), any(CreateSupportMessageDto.class)))
                .thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/support/requests/1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(messageDto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.message").value("Tôi muốn kiểm tra lại"));
    }

    @Test
    @DisplayName("POST /api/v1/support/requests/{id}/messages lỗi 400 khi tin nhắn trống")
    void sendMessage_BlankMessage_Returns400() throws Exception {
        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("");

        mockMvc.perform(post("/api/v1/support/requests/1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(messageDto)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("GET /api/v1/support/requests/{id}/messages lấy lịch sử trao đổi thành công")
    void getMessages_Success() throws Exception {
        SupportRequestMessageDto msg1 = new SupportRequestMessageDto(
                1L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tin nhắn 1", LocalDateTime.now()
        );
        SupportRequestMessageDto msg2 = new SupportRequestMessageDto(
                2L, 1L, 20L, "Lễ tân Lan", "RECEPTIONIST", "Tin nhắn 2", LocalDateTime.now()
        );

        when(supportRequestService.getMessages(eq(1L), eq(10L), eq("MEMBER")))
                .thenReturn(List.of(msg1, msg2));

        mockMvc.perform(get("/api/v1/support/requests/1/messages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].message").value("Tin nhắn 1"))
                .andExpect(jsonPath("$.data[1].message").value("Tin nhắn 2"));
    }
}
