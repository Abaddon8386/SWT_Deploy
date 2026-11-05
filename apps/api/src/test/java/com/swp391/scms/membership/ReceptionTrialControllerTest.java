package com.swp391.scms.membership;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.dto.ReceptionTrialDto;
import com.swp391.scms.membership.dto.TrialRejectRequest;
import com.swp391.scms.membership.service.MemberTrialService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ReceptionTrialControllerTest {

    private MockMvc mockMvc;

    @Mock
    private MemberTrialService trialService;

    private ReceptionTrialController controller;

    private final HandlerMethodArgumentResolver principalResolver = new HandlerMethodArgumentResolver() {
        @Override
        public boolean supportsParameter(MethodParameter parameter) {
            return parameter.getParameterType().isAssignableFrom(AuthenticatedPrincipal.class);
        }

        @Override
        public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                      NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
            return new AuthenticatedPrincipal(99L, "receptionist1", "RECEPTIONIST");
        }
    };

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messageSource = new ResourceBundleMessageSource();
        messageSource.setBasenames("i18n/messages");
        messageSource.setDefaultEncoding("UTF-8");
        MessageService messageService = new MessageService(messageSource);

        controller = new ReceptionTrialController(trialService, messageService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(principalResolver)
                .setControllerAdvice(new GlobalExceptionHandler(messageService))
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/reception/trials: Trả về danh sách đơn đăng ký trải nghiệm")
    void listTrials_returnsOk() throws Exception {
        ReceptionTrialDto item = new ReceptionTrialDto(
                1L, 10L, "MEM-10", "Nguyen Van A", "a@test.com", "0900000000",
                "CCCD", "********1234", "Nguyen Van A", "VN", "front.png", "back.png",
                "PENDING_APPROVAL", LocalDateTime.now(), null, null, null, null, null, null, null
        );
        when(trialService.listTrials(eq("PENDING_APPROVAL"), eq(null))).thenReturn(List.of(item));

        mockMvc.perform(get("/api/v1/reception/trials?status=PENDING_APPROVAL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(1L))
                .andExpect(jsonPath("$.data[0].documentFullName").value("Nguyen Van A"))
                .andExpect(jsonPath("$.data[0].status").value("PENDING_APPROVAL"));
    }

    @Test
    @DisplayName("POST /api/v1/reception/trials/{id}/approve: Phê duyệt thành công")
    void approveTrial_returnsOk() throws Exception {
        ReceptionTrialDto approved = new ReceptionTrialDto(
                1L, 10L, "MEM-10", "Nguyen Van A", "a@test.com", "0900000000",
                "CCCD", "********1234", "Nguyen Van A", "VN", "front.png", "back.png",
                "APPROVED", LocalDateTime.now(), 99L, LocalDateTime.now(), null, 300L,
                LocalDate.now(), LocalDate.now().plusDays(3), "active"
        );
        when(trialService.approveTrial(any(), eq(1L))).thenReturn(approved);

        mockMvc.perform(post("/api/v1/reception/trials/1/approve"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.subscriptionId").value(300L));
    }

    @Test
    @DisplayName("POST /api/v1/reception/trials/{id}/reject: Từ chối thành công")
    void rejectTrial_returnsOk() throws Exception {
        ReceptionTrialDto rejected = new ReceptionTrialDto(
                1L, 10L, "MEM-10", "Nguyen Van A", "a@test.com", "0900000000",
                "CCCD", "********1234", "Nguyen Van A", "VN", "front.png", "back.png",
                "REJECTED", LocalDateTime.now(), 99L, LocalDateTime.now(), "Ảnh mờ", null, null, null, null
        );
        when(trialService.rejectTrial(any(), eq(1L), eq("Ảnh mờ"))).thenReturn(rejected);

        TrialRejectRequest req = new TrialRejectRequest("Ảnh mờ");

        mockMvc.perform(post("/api/v1/reception/trials/1/reject")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.rejectionReason").value("Ảnh mờ"));
    }
}

