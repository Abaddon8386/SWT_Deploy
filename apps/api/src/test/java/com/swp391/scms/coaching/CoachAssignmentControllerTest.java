package com.swp391.scms.coaching;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.service.CoachAssignmentService;
import com.swp391.scms.common.GlobalExceptionHandler;
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

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class CoachAssignmentControllerTest {

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @Mock
    private CoachAssignmentService coachAssignmentService;

    @InjectMocks
    private CoachAssignmentController controller;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/manager/coach-assignments returns overview data")
    void testGetOverview() throws Exception {
        CoachAssignmentOverviewDto coachDto = new CoachAssignmentOverviewDto(
                10L, "HLV Alpha", "alpha@test.com", "0900000000", "Thể hình", "Bio", "active",
                1, 1, 0, 0, Collections.emptyList()
        );
        CoachAssignmentSummaryStatsDto statsDto = new CoachAssignmentSummaryStatsDto(1, 1, 1, 1, 0, 0);

        when(coachAssignmentService.getOverview(any(), any(), any()))
                .thenReturn(Map.of("coaches", List.of(coachDto), "stats", statsDto));

        mockMvc.perform(get("/api/v1/manager/coach-assignments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.coaches[0].coachName").value("HLV Alpha"))
                .andExpect(jsonPath("$.data.stats.totalCoaches").value(1));
    }

    @Test
    @DisplayName("POST /api/v1/manager/coach-assignments/assign creates assignment")
    void testAssign() throws Exception {
        CoachAssignmentAssignDto dto = new CoachAssignmentAssignDto(
                100L, 10L, "TRAINING_PLAN", "Tập tăng cơ",
                LocalDate.of(2026, 11, 10), LocalDate.of(2026, 12, 10)
        );

        CoachAssignmentStudentDto studentDto = new CoachAssignmentStudentDto(
                100L, "SOL-MB-100", "Học viên A", "0988888888", "a@test.com", null,
                "Tập tăng cơ", "beginner", null, "TRAINING_PLAN", "Theo giáo án riêng",
                "Tập tăng cơ", dto.startDate(), dto.endDate(), null, "active", 1L
        );

        when(coachAssignmentService.assignStudent(any(CoachAssignmentAssignDto.class)))
                .thenReturn(studentDto);

        mockMvc.perform(post("/api/v1/manager/coach-assignments/assign")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.fullName").value("Học viên A"));
    }

    @Test
    @DisplayName("POST /api/v1/manager/coach-assignments/reassign transfers student")
    void testReassign() throws Exception {
        CoachAssignmentReassignDto dto = new CoachAssignmentReassignDto(
                100L, 10L, 20L, 888L, "TRAINING_PLAN", "HLV đổi ca làm"
        );

        mockMvc.perform(post("/api/v1/manager/coach-assignments/reassign")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk());

        verify(coachAssignmentService).reassignStudent(any(CoachAssignmentReassignDto.class));
    }

    @Test
    @DisplayName("DELETE /api/v1/manager/coach-assignments/{planId} removes assignment")
    void testRemove() throws Exception {
        mockMvc.perform(delete("/api/v1/manager/coach-assignments/123"))
                .andExpect(status().isOk());

        verify(coachAssignmentService).removeAssignment(123L);
    }
}

