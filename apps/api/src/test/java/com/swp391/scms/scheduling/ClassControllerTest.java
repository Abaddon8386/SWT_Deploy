package com.swp391.scms.scheduling;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.common.GlobalExceptionHandler;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateClassRequest;
import com.swp391.scms.scheduling.dto.SchedulingRequests.CreateSessionRequest;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.dto.SchedulingResponses.GymClassDto;
import com.swp391.scms.scheduling.service.ClassService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ClassControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ClassService classService;

    private ClassController controller;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messageSource = new ResourceBundleMessageSource();
        messageSource.setBasenames("i18n/messages");
        messageSource.setDefaultEncoding("UTF-8");
        MessageService messageService = new MessageService(messageSource);

        controller = new ClassController(classService, messageService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler(messageService))
                .build();
    }

    @Test
    void createClass_returnsCreated() throws Exception {
        CreateClassRequest request = new CreateClassRequest(
                "Yoga Cơ Bản", 1L, 2L, 3L, 20, "beginner", "Lớp học yoga cho người mới"
        );
        GymClassDto dto = new GymClassDto(
                1L, "Yoga Cơ Bản", 1L, "Yoga", 2L, "Coach Name", 3L, "Phòng 101", 20, "beginner", "Lớp học yoga cho người mới", "active"
        );
        when(classService.createClass(any())).thenReturn(dto);

        mockMvc.perform(post("/api/v1/classes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(1L))
                .andExpect(jsonPath("$.data.name").value("Yoga Cơ Bản"));
    }

    @Test
    void createClass_rejectsUnsupportedLevelBeforePersistence() throws Exception {
        CreateClassRequest request = new CreateClassRequest("Yoga", 1L, 2L, 3L, 20, "expert", null);

        mockMvc.perform(post("/api/v1/classes")
                        .header("Accept-Language", "en")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details.level").value("Level must be beginner, intermediate, advanced or all"));
        verifyNoInteractions(classService);
    }

    @Test
    void createSession_returnsCreated() throws Exception {
        CreateSessionRequest request = new CreateSessionRequest(
                LocalDate.now().plusDays(1), LocalTime.of(8, 0), LocalTime.of(9, 30)
        );
        ClassSessionDto dto = new ClassSessionDto(
                10L, 1L, "Yoga Cơ Bản", 1L, "Yoga", 2L, "Coach Name", 3L, "Phòng 101",
                LocalDate.now().plusDays(1), LocalTime.of(8, 0), LocalTime.of(9, 30),
                "scheduled", null, 20, 0L
        );
        when(classService.createSession(eq(1L), any())).thenReturn(dto);

        mockMvc.perform(post("/api/v1/classes/1/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(10L))
                .andExpect(jsonPath("$.data.status").value("scheduled"));
    }

    @Test
    void listSessions_returnsOk() throws Exception {
        ClassSessionDto dto = new ClassSessionDto(
                10L, 1L, "Yoga Cơ Bản", 1L, "Yoga", 2L, "Coach Name", 3L, "Phòng 101",
                LocalDate.now().plusDays(1), LocalTime.of(8, 0), LocalTime.of(9, 30),
                "scheduled", null, 20, 0L
        );
        when(classService.searchSessions(any(), any(), any(), any())).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/classes/sessions")
                        .param("fromDate", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(10L));
    }

    @Test
    void listSessions_coachOnlySeesOwnSessionsEvenWhenAskingForAnotherCoach() throws Exception {
        com.swp391.scms.security.AuthenticatedPrincipal coach =
                new com.swp391.scms.security.AuthenticatedPrincipal(7L, "coach@test.com", "COACH");
        MockMvc coachMvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(new org.springframework.web.method.support.HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(org.springframework.core.MethodParameter parameter) {
                        return parameter.hasParameterAnnotation(
                                org.springframework.security.core.annotation.AuthenticationPrincipal.class);
                    }

                    @Override
                    public Object resolveArgument(org.springframework.core.MethodParameter parameter,
                                                  org.springframework.web.method.support.ModelAndViewContainer mavContainer,
                                                  org.springframework.web.context.request.NativeWebRequest webRequest,
                                                  org.springframework.web.bind.support.WebDataBinderFactory binderFactory) {
                        return coach;
                    }
                })
                .build();
        when(classService.searchSessions(any(), any(), any(), any())).thenReturn(List.of());

        coachMvc.perform(get("/api/v1/classes/sessions").param("coachId", "99"))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(classService).searchSessions(null, null, null, 7L);
    }

    @Test
    void listClasses_returnsOk() throws Exception {
        GymClassDto dto = new GymClassDto(
                1L, "Yoga Cơ Bản", 1L, "Yoga", 2L, "Coach Name", 3L, "Phòng 101", 20, "beginner", "Lớp học yoga cho người mới", "active"
        );
        when(classService.listClasses()).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/classes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(1L));
    }
}
