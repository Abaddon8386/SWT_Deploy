package com.swp391.scms.operations;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.operations.dto.StaffInternalRequestCreateDto;
import com.swp391.scms.operations.dto.StaffInternalRequestDto;
import com.swp391.scms.operations.dto.StaffInternalRequestReviewDto;
import com.swp391.scms.operations.entity.StaffInternalRequest;
import com.swp391.scms.operations.repository.StaffInternalRequestRepository;
import com.swp391.scms.operations.service.StaffInternalRequestService;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaffInternalRequestServiceTest {

    @Mock
    private StaffInternalRequestRepository requestRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private NotificationService notificationService;

    private StaffInternalRequestService service;

    private User staffUser;
    private User managerUser;

    @BeforeEach
    void setUp() {
        var messages = new org.springframework.context.support.ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        org.springframework.context.i18n.LocaleContextHolder.setLocale(java.util.Locale.forLanguageTag("vi"));
        service = new StaffInternalRequestService(requestRepository, userRepository, notificationService,
                new com.swp391.scms.common.i18n.MessageService(messages));

        Role staffRole = new Role();
        staffRole.setCode("STAFF");
        staffRole.setName("Nhân viên");

        Role managerRole = new Role();
        managerRole.setCode("MANAGER");
        managerRole.setName("Quản lý");

        staffUser = new User();
        staffUser.setId(10L);
        staffUser.setFullName("Nguyễn Văn Nhân Viên");
        staffUser.setEmail("staff@solfitness.vn");
        staffUser.setRole(staffRole);

        managerUser = new User();
        managerUser.setId(1L);
        managerUser.setFullName("Trần Quản Lý");
        managerUser.setEmail("manager@solfitness.vn");
        managerUser.setRole(managerRole);
    }

    @org.junit.jupiter.api.AfterEach
    void resetLocale() {
        org.springframework.context.i18n.LocaleContextHolder.resetLocaleContext();
    }

    @Test
    @DisplayName("Tạo đơn xin nghỉ phép thành công và gửi thông báo cho Manager")
    void createRequest_Success() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(staffUser));
        when(userRepository.findActiveManagers()).thenReturn(List.of(staffUser, managerUser));

        when(requestRepository.save(any(StaffInternalRequest.class))).thenAnswer(invocation -> {
            StaffInternalRequest saved = invocation.getArgument(0);
            saved.setId(100L);
            return saved;
        });

        StaffInternalRequestCreateDto dto = new StaffInternalRequestCreateDto(
                "LEAVE",
                "Xin nghỉ phép việc gia đình",
                "Tôi có việc bận gia đình cần nghỉ 2 ngày",
                LocalDate.now().plusDays(2),
                LocalDate.now().plusDays(3),
                null,
                null
        );

        StaffInternalRequestDto result = service.createRequest(10L, dto);

        assertNotNull(result);
        assertEquals(100L, result.id());
        assertEquals("LEAVE", result.requestType());
        assertEquals("PENDING", result.status());
        assertEquals("Xin nghỉ phép việc gia đình", result.title());

        verify(notificationService).send(
                eq(1L),
                contains("cần duyệt"),
                anyString(),
                eq("system"),
                isNull(),
                eq(100L)
        );
    }

    @Test
    @DisplayName("Tạo đơn với loại không hợp lệ ném BadRequestException")
    void createRequest_InvalidType_ThrowsBadRequest() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(staffUser));

        StaffInternalRequestCreateDto dto = new StaffInternalRequestCreateDto(
                "INVALID_TYPE",
                "Tiêu đề",
                "Lý do",
                null, null, null, null
        );

        assertThrows(BadRequestException.class, () -> service.createRequest(10L, dto));
        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("Hủy đơn thành công khi đơn còn đang PENDING")
    void cancelRequest_Success() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(50L);
        req.setUser(staffUser);
        req.setStatus("PENDING");
        req.setTitle("Đổi ca trực");

        when(requestRepository.findByIdForUpdate(50L)).thenReturn(Optional.of(req));
        when(requestRepository.save(any(StaffInternalRequest.class))).thenAnswer(i -> i.getArgument(0));

        StaffInternalRequestDto cancelled = service.cancelRequest(10L, 50L);

        assertEquals("CANCELLED", cancelled.status());
        verify(requestRepository).save(req);
    }

    @Test
    @DisplayName("Người dùng khác hủy đơn của đồng nghiệp bị ForbiddenException")
    void cancelRequest_Forbidden_WhenNotOwner() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(50L);
        req.setUser(staffUser);
        req.setStatus("PENDING");

        when(requestRepository.findByIdForUpdate(50L)).thenReturn(Optional.of(req));

        assertThrows(ForbiddenException.class, () -> service.cancelRequest(999L, 50L));
        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("Hủy đơn đã được duyệt hoặc từ chối ném BadRequestException")
    void cancelRequest_BadRequest_WhenNotPending() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(50L);
        req.setUser(staffUser);
        req.setStatus("APPROVED");

        when(requestRepository.findByIdForUpdate(50L)).thenReturn(Optional.of(req));

        assertThrows(BadRequestException.class, () -> service.cancelRequest(10L, 50L));
    }

    @Test
    @DisplayName("Quản lý duyệt đơn (APPROVED) thành công và gửi thông báo cho nhân viên")
    void reviewRequest_Approve_Success() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(200L);
        req.setUser(staffUser);
        req.setStatus("PENDING");
        req.setRequestType("LEAVE");
        req.setTitle("Xin nghỉ phép");

        when(requestRepository.findByIdForUpdate(200L)).thenReturn(Optional.of(req));
        when(userRepository.findById(1L)).thenReturn(Optional.of(managerUser));
        when(requestRepository.save(any(StaffInternalRequest.class))).thenAnswer(i -> i.getArgument(0));

        StaffInternalRequestReviewDto dto = new StaffInternalRequestReviewDto("APPROVED", "Đã bố trí nhân sự thay thế, đồng ý.");

        StaffInternalRequestDto reviewed = service.reviewRequest(1L, 200L, dto);

        assertEquals("APPROVED", reviewed.status());
        assertEquals("Đã bố trí nhân sự thay thế, đồng ý.", reviewed.managerNotes());
        assertEquals(1L, reviewed.reviewedByUserId());

        verify(notificationService).send(
                eq(10L),
                contains("đã được duyệt"),
                contains("CHẤP THUẬN"),
                eq("system"),
                isNull(),
                eq(200L)
        );
    }

    @Test
    @DisplayName("Quản lý từ chối đơn (REJECTED) bắt buộc phải có lý do")
    void reviewRequest_Reject_MissingReason_ThrowsBadRequest() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(200L);
        req.setUser(staffUser);
        req.setStatus("PENDING");

        when(requestRepository.findByIdForUpdate(200L)).thenReturn(Optional.of(req));

        StaffInternalRequestReviewDto dto = new StaffInternalRequestReviewDto("REJECTED", "   ");

        assertThrows(BadRequestException.class, () -> service.reviewRequest(1L, 200L, dto));
        verify(requestRepository, never()).save(any());
    }

    @Test
    @DisplayName("Duyệt đơn đã xử lý trước đó ném BadRequestException")
    void reviewRequest_AlreadyReviewed_ThrowsBadRequest() {
        StaffInternalRequest req = new StaffInternalRequest();
        req.setId(200L);
        req.setUser(staffUser);
        req.setStatus("REJECTED");

        when(requestRepository.findByIdForUpdate(200L)).thenReturn(Optional.of(req));

        StaffInternalRequestReviewDto dto = new StaffInternalRequestReviewDto("APPROVED", "Duyệt lại");

        assertThrows(BadRequestException.class, () -> service.reviewRequest(1L, 200L, dto));
    }
    @Test
    void createRequestRejectsReversedDateRange() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(staffUser));
        var dto = new StaffInternalRequestCreateDto("LEAVE", "Leave", "Reason",
                java.time.LocalDate.of(2026, 11, 3), java.time.LocalDate.of(2026, 11, 2), null, null);
        assertThrows(BadRequestException.class, () -> service.createRequest(10L, dto));
        verify(requestRepository, never()).save(any());
    }

    @Test
    void replacementMustBeAnotherActiveStaffMember() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(staffUser));
        Role memberRole = new Role();
        memberRole.setCode("MEMBER");
        User member = new User();
        member.setId(50L);
        member.setStatus("active");
        member.setRole(memberRole);
        when(userRepository.findByIdAndDeletedAtIsNull(50L)).thenReturn(Optional.of(member));
        var dto = new StaffInternalRequestCreateDto("LEAVE", "Nghỉ", "Việc riêng",
                LocalDate.now().plusDays(2), LocalDate.now().plusDays(3), null, 50L);

        var error = assertThrows(BadRequestException.class, () -> service.createRequest(10L, dto));
        assertEquals("INVALID_REPLACEMENT", error.getErrorCode());
        verify(requestRepository, never()).save(any());
    }

    @Test
    void approvingLeaveTellsManagerWhatNeedsCover() {
        var sessions = mock(com.swp391.scms.scheduling.repository.ClassSessionRepository.class);
        var bookings = mock(com.swp391.scms.coaching.repository.CoachBookingRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "classSessionRepository", sessions);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "coachBookingRepository", bookings);
        LocalDate start = LocalDate.of(2026, 11, 10);
        LocalDate end = LocalDate.of(2026, 11, 15);
        StaffInternalRequest leave = new StaffInternalRequest();
        leave.setId(100L);
        leave.setUser(staffUser);
        leave.setRequestType("LEAVE");
        leave.setTitle("Nghỉ phép");
        leave.setStartDate(start);
        leave.setEndDate(end);
        leave.setStatus("PENDING");
        when(requestRepository.findByIdForUpdate(100L)).thenReturn(Optional.of(leave));
        when(userRepository.findById(1L)).thenReturn(Optional.of(managerUser));
        when(requestRepository.save(any(StaffInternalRequest.class))).thenAnswer(call -> call.getArgument(0));
        when(sessions.countScheduledForCoachBetween(10L, start, end)).thenReturn(2L);
        when(bookings.countConfirmedForCoachBetween(10L, start, end)).thenReturn(1L);

        service.reviewRequest(1L, 100L, new StaffInternalRequestReviewDto("APPROVED", null));

        verify(notificationService).send(eq(1L), any(),
                org.mockito.ArgumentMatchers.contains("2 buổi lớp và 1 buổi PT"), eq("system"), isNull(), eq(100L));
    }
}
