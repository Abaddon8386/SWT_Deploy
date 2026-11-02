package com.swp391.scms.support;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.dto.SupportRequestMessageDto;
import com.swp391.scms.support.entity.SupportRequestMessage;
import com.swp391.scms.support.dto.CreateSupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestDto;
import com.swp391.scms.support.dto.UpdateSupportRequestStatusDto;
import com.swp391.scms.support.entity.SupportRequest;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SupportRequestServiceTest {

    @Mock
    private SupportRequestRepository supportRequestRepository;

    @Mock
    private SupportRequestMapper supportRequestMapper;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private com.swp391.scms.notifications.NotificationService notificationService;

    @Mock
    private SupportRequestMessageRepository supportRequestMessageRepository;

    @Mock
    private com.swp391.scms.common.i18n.MessageService messageService;

    @InjectMocks
    private SupportRequestService supportRequestService;

    private Member sampleMember;
    private User sampleUser;
    private SupportRequest sampleRequest;

    @BeforeEach
    void setUp() {
        sampleUser = new User();
        sampleUser.setId(10L);
        sampleUser.setStatus("active");
        var memberRole = new com.swp391.scms.users.entity.Role(); memberRole.setCode("MEMBER"); sampleUser.setRole(memberRole);
        sampleUser.setFullName("Nguyễn Văn A");

        sampleMember = new Member();
        sampleMember.setUserId(10L);
        sampleMember.setUser(sampleUser);

        sampleRequest = new SupportRequest(sampleMember, "Lỗi tủ đồ", "Tủ số 12 bị kẹt");
        sampleRequest.setId(1L);
        sampleRequest.setStatus("open");
    }

    @Test
    @DisplayName("Tạo yêu cầu hỗ trợ thành công khi member tồn tại")
    void createRequest_Success() {
        CreateSupportRequestDto dto = new CreateSupportRequestDto("Lỗi tủ đồ", "Tủ số 12 bị kẹt");
        SupportRequestDto expectedDto = new SupportRequestDto(
                1L, 10L, "Nguyễn Văn A", null, null, "Lỗi tủ đồ", "Tủ số 12 bị kẹt", "open", LocalDateTime.now(), null
        );

        when(memberRepository.findById(10L)).thenReturn(Optional.of(sampleMember));
        when(supportRequestRepository.save(any(SupportRequest.class))).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(any(SupportRequest.class))).thenReturn(expectedDto);

        SupportRequestDto result = supportRequestService.createRequest(10L, dto);

        assertThat(result).isNotNull();
        assertThat(result.subject()).isEqualTo("Lỗi tủ đồ");
        verify(supportRequestRepository).save(any(SupportRequest.class));
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi tạo yêu cầu với member không tồn tại")
    void createRequest_MemberNotFound() {
        CreateSupportRequestDto dto = new CreateSupportRequestDto("Lỗi tủ đồ", "Tủ số 12 bị kẹt");
        when(memberRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supportRequestService.createRequest(99L, dto))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi user của member đã bị xóa mềm")
    void createRequest_SoftDeletedMemberUser() {
        sampleUser.setDeletedAt(LocalDateTime.now());
        CreateSupportRequestDto dto = new CreateSupportRequestDto("Lỗi tủ đồ", "Tủ số 12 bị kẹt");
        when(memberRepository.findById(10L)).thenReturn(Optional.of(sampleMember));

        assertThatThrownBy(() -> supportRequestService.createRequest(10L, dto))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("Lấy danh sách yêu cầu của Member có phân trang")
    void getMyRequests_Success() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<SupportRequest> page = new PageImpl<>(List.of(sampleRequest));
        SupportRequestDto expectedDto = new SupportRequestDto(
                1L, 10L, "Nguyễn Văn A", null, null, "Lỗi tủ đồ", "Tủ số 12 bị kẹt", "open", LocalDateTime.now(), null
        );

        when(supportRequestRepository.findByMemberUserIdOrderByCreatedAtDesc(10L, pageable)).thenReturn(page);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(expectedDto);

        Page<SupportRequestDto> result = supportRequestService.getMyRequests(10L, pageable);

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).subject()).isEqualTo("Lỗi tủ đồ");
    }

    @Test
    @DisplayName("Lấy toàn bộ yêu cầu lọc theo status")
    void getAllRequests_Success() {
        Pageable pageable = PageRequest.of(0, 10);
        Page<SupportRequest> page = new PageImpl<>(List.of(sampleRequest));
        SupportRequestDto expectedDto = new SupportRequestDto(
                1L, 10L, "Nguyễn Văn A", null, null, "Lỗi tủ đồ", "Tủ số 12 bị kẹt", "open", LocalDateTime.now(), null
        );

        when(supportRequestRepository.findAllByStatus("open", pageable)).thenReturn(page);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(expectedDto);

        Page<SupportRequestDto> result = supportRequestService.getAllRequests("open", pageable);

        assertThat(result.getContent()).hasSize(1);
    }

    @Test
    @DisplayName("Chuyển trạng thái hợp lệ: open -> in_progress và gửi thông báo cho member")
    void updateStatus_OpenToInProgress_Success() {
        sampleRequest.setStatus("open");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(supportRequestRepository.save(sampleRequest)).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(
                new SupportRequestDto(1L, 10L, "Nguyễn Văn A", null, null, "Lỗi", "Desc", "in_progress", LocalDateTime.now(), null)
        );

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        SupportRequestDto result = supportRequestService.updateStatus(1L, updateDto);

        assertThat(sampleRequest.getStatus()).isEqualTo("in_progress");
        assertThat(result.status()).isEqualTo("in_progress");
        verify(notificationService).send(eq(10L), any(), any(), eq("support_reply"), eq("support_request"), any());
    }

    @Test
    @DisplayName("Chuyển trạng thái hợp lệ: in_progress -> resolved và ghi nhận resolvedAt")
    void updateStatus_InProgressToResolved_Success() {
        sampleRequest.setStatus("in_progress");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(supportRequestRepository.save(sampleRequest)).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(
                new SupportRequestDto(1L, 10L, "Nguyễn Văn A", null, null, "Lỗi", "Desc", "resolved", LocalDateTime.now(), LocalDateTime.now())
        );

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("resolved", null);
        supportRequestService.updateStatus(1L, updateDto);

        assertThat(sampleRequest.getStatus()).isEqualTo("resolved");
        assertThat(sampleRequest.getResolvedAt()).isNotNull();
    }

    @Test
    @DisplayName("Chuyển trạng thái hợp lệ: resolved -> closed")
    void updateStatus_ResolvedToClosed_Success() {
        sampleRequest.setStatus("resolved");
        sampleRequest.setResolvedAt(LocalDateTime.now().minusHours(24));
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(supportRequestRepository.save(sampleRequest)).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(
                new SupportRequestDto(1L, 10L, "Nguyễn Văn A", null, null, "Lỗi", "Desc", "closed", LocalDateTime.now(), sampleRequest.getResolvedAt())
        );

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("closed", null);
        supportRequestService.updateStatus(1L, updateDto);

        assertThat(sampleRequest.getStatus()).isEqualTo("closed");
    }

    @Test
    @DisplayName("Chuyển trạng thái hợp lệ: in_progress -> open (yêu cầu thêm thông tin)")
    void updateStatus_InProgressToOpen_Success() {
        sampleRequest.setStatus("in_progress");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(supportRequestRepository.save(sampleRequest)).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(
                new SupportRequestDto(1L, 10L, "Nguyễn Văn A", null, null, "Lỗi", "Desc", "open", LocalDateTime.now(), null)
        );

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("open", null);
        supportRequestService.updateStatus(1L, updateDto);

        assertThat(sampleRequest.getStatus()).isEqualTo("open");
        assertThat(sampleRequest.getResolvedAt()).isNull();
    }

    @Test
    @DisplayName("Không được phép mở lại hoặc thay đổi ticket đã đóng (closed)")
    void updateStatus_ClosedTicketCannotBeChanged() {
        sampleRequest.setStatus("closed");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);

        assertThatThrownBy(() -> supportRequestService.updateStatus(1L, updateDto))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Closed support request cannot be modified");
    }

    @Test
    @DisplayName("Ném AppException khi chuyển trạng thái sai state machine: open -> closed")
    void updateStatus_InvalidTransition_OpenToClosed() {
        sampleRequest.setStatus("open");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("closed", null);

        assertThatThrownBy(() -> supportRequestService.updateStatus(1L, updateDto))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Invalid state transition from open to closed");
    }

    @Test
    @DisplayName("Cập nhật người phụ trách (assignedTo) thành công")
    void updateStatus_AssignToUser_Success() {
        sampleRequest.setStatus("open");
        User staff = new User();
        staff.setId(20L);
        staff.setStatus("active");
        staff.setFullName("Lễ tân Lan");
        staff.setStatus("active");
        com.swp391.scms.users.entity.Role role = new com.swp391.scms.users.entity.Role();
        role.setCode("RECEPTIONIST");
        staff.setRole(role);

        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(userRepository.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(staff));
        when(supportRequestRepository.save(sampleRequest)).thenReturn(sampleRequest);
        when(supportRequestMapper.toDto(sampleRequest)).thenReturn(
                new SupportRequestDto(1L, 10L, "Nguyễn Văn A", 20L, "Lễ tân Lan", "Lỗi", "Desc", "open", LocalDateTime.now(), null)
        );

        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto(null, 20L);
        SupportRequestDto result = supportRequestService.updateStatus(1L, updateDto);

        assertThat(sampleRequest.getAssignedTo()).isEqualTo(staff);
        assertThat(result.assignedToName()).isEqualTo("Lễ tân Lan");
    }

    @Test
    @DisplayName("Gửi tin nhắn phản hồi thành công bởi Member và gửi thông báo cho Assigned Staff")
    void sendMessage_asMember_Success() {
        User staff = new User();
        staff.setId(20L);
        staff.setStatus("active");
        var staffRole = new com.swp391.scms.users.entity.Role(); staffRole.setCode("RECEPTIONIST"); staff.setRole(staffRole);
        staff.setFullName("Lễ tân Lan");
        sampleRequest.setAssignedTo(staff);

        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Tôi vẫn chưa mở được tủ");
        SupportRequestMessageDto expectedDto = new SupportRequestMessageDto(
                100L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tôi vẫn chưa mở được tủ", LocalDateTime.now()
        );

        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(userRepository.findByIdAndDeletedAtIsNull(10L)).thenReturn(Optional.of(sampleUser));
        when(supportRequestMessageRepository.save(any(SupportRequestMessage.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(supportRequestMapper.toMessageDto(any(SupportRequestMessage.class))).thenReturn(expectedDto);

        SupportRequestMessageDto result = supportRequestService.sendMessage(1L, 10L, "MEMBER", messageDto);

        assertThat(result).isNotNull();
        assertThat(result.message()).isEqualTo("Tôi vẫn chưa mở được tủ");
        verify(notificationService).send(eq(20L), any(), any(), eq("support_reply"), eq("support_request"), eq(1L));
    }

    @Test
    @DisplayName("Gửi tin nhắn phản hồi thành công bởi Staff và gửi thông báo cho Member")
    void sendMessage_asStaff_Success() {
        User staff = new User();
        staff.setId(20L);
        staff.setStatus("active");
        var staffRole = new com.swp391.scms.users.entity.Role(); staffRole.setCode("RECEPTIONIST"); staff.setRole(staffRole);
        staff.setFullName("Lễ tân Lan");

        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Nhân viên đang tới hỗ trợ bạn");
        SupportRequestMessageDto expectedDto = new SupportRequestMessageDto(
                101L, 1L, 20L, "Lễ tân Lan", "RECEPTIONIST", "Nhân viên đang tới hỗ trợ bạn", LocalDateTime.now()
        );

        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(userRepository.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(staff));
        when(supportRequestMessageRepository.save(any(SupportRequestMessage.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(supportRequestMapper.toMessageDto(any(SupportRequestMessage.class))).thenReturn(expectedDto);

        SupportRequestMessageDto result = supportRequestService.sendMessage(1L, 20L, "RECEPTIONIST", messageDto);

        assertThat(result).isNotNull();
        assertThat(result.message()).isEqualTo("Nhân viên đang tới hỗ trợ bạn");
        verify(notificationService).send(eq(10L), any(), any(), eq("support_reply"), eq("support_request"), eq(1L));
    }

    @Test
    @DisplayName("Gửi tin nhắn thất bại khi phiếu hỗ trợ đã đóng (closed)")
    void sendMessage_whenTicketClosed_throwsBadRequestException() {
        sampleRequest.setStatus("closed");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));

        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Tin nhắn mới");

        when(userRepository.findByIdAndDeletedAtIsNull(10L)).thenReturn(Optional.of(sampleUser));
        assertThatThrownBy(() -> supportRequestService.sendMessage(1L, 10L, "MEMBER", messageDto))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("Gửi tin nhắn thất bại khi Member không phải chủ phiếu hỗ trợ")
    void sendMessage_whenMemberNotOwner_throwsForbiddenException() {
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));

        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Tin nhắn từ người khác");

        assertThatThrownBy(() -> supportRequestService.sendMessage(1L, 999L, "MEMBER", messageDto))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("Không tiết lộ trạng thái phiếu đóng cho Member không sở hữu")
    void sendMessage_whenClosedAndMemberNotOwner_checksOwnershipFirst() {
        sampleRequest.setStatus("closed");
        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));

        assertThatThrownBy(() -> supportRequestService.sendMessage(
                1L, 999L, "MEMBER", new CreateSupportMessageDto("Xin chào")))
                .isInstanceOf(ForbiddenException.class);
        verify(supportRequestMessageRepository, never()).save(any());
    }

    @Test
    @DisplayName("Lấy danh sách tin nhắn thành công theo thứ tự thời gian cho Member chủ phiếu")
    void getMessages_asMember_Success() {
        when(supportRequestRepository.findById(1L)).thenReturn(Optional.of(sampleRequest));

        SupportRequestMessage msg1 = new SupportRequestMessage(sampleRequest, sampleUser, "Tin nhắn 1");
        SupportRequestMessage msg2 = new SupportRequestMessage(sampleRequest, sampleUser, "Tin nhắn 2");

        when(supportRequestMessageRepository.findBySupportRequestIdOrderByCreatedAtAsc(1L))
                .thenReturn(List.of(msg1, msg2));

        SupportRequestMessageDto dto1 = new SupportRequestMessageDto(1L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tin nhắn 1", LocalDateTime.now());
        SupportRequestMessageDto dto2 = new SupportRequestMessageDto(2L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tin nhắn 2", LocalDateTime.now());

        when(supportRequestMapper.toMessageDto(msg1)).thenReturn(dto1);
        when(supportRequestMapper.toMessageDto(msg2)).thenReturn(dto2);

        when(userRepository.findByIdAndDeletedAtIsNull(10L)).thenReturn(Optional.of(sampleUser));
        List<SupportRequestMessageDto> result = supportRequestService.getMessages(1L, 10L, "MEMBER");

        assertThat(result).hasSize(2);
        assertThat(result.get(0).message()).isEqualTo("Tin nhắn 1");
        assertThat(result.get(1).message()).isEqualTo("Tin nhắn 2");
    }

    @Test
    @DisplayName("Lấy danh sách tin nhắn thất bại khi Member không phải chủ phiếu")
    void getMessages_asMember_whenNotOwner_throwsForbiddenException() {
        when(supportRequestRepository.findById(1L)).thenReturn(Optional.of(sampleRequest));

        assertThatThrownBy(() -> supportRequestService.getMessages(1L, 999L, "MEMBER"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("Lấy danh sách tin nhắn thành công cho Staff dù không phải Member chủ phiếu")
    void getMessages_asStaff_Success() {
        when(supportRequestRepository.findById(1L)).thenReturn(Optional.of(sampleRequest));
        when(supportRequestMessageRepository.findBySupportRequestIdOrderByCreatedAtAsc(1L))
                .thenReturn(List.of());

        var actor = new User(); actor.setId(50L); actor.setStatus("active");
        var role = new com.swp391.scms.users.entity.Role(); role.setCode("CENTER_MANAGER"); actor.setRole(role);
        when(userRepository.findByIdAndDeletedAtIsNull(50L)).thenReturn(Optional.of(actor));
        List<SupportRequestMessageDto> result = supportRequestService.getMessages(1L, 50L, "CENTER_MANAGER");

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("Gửi tin nhắn bởi Member vào ticket chưa có assignedTo sẽ phát thông báo cho tất cả Staff trực")
    void sendMessage_asMember_whenTicketUnassigned_notifiesAllActiveStaff() {
        sampleRequest.setAssignedTo(null);

        User manager = new User();
        manager.setId(50L);
        manager.setFullName("Quản lý Minh");

        User receptionist = new User();
        receptionist.setId(51L);
        receptionist.setFullName("Lễ tân Hoa");

        CreateSupportMessageDto messageDto = new CreateSupportMessageDto("Tôi cần hỗ trợ gấp");
        SupportRequestMessageDto expectedDto = new SupportRequestMessageDto(
                102L, 1L, 10L, "Nguyễn Văn A", "MEMBER", "Tôi cần hỗ trợ gấp", LocalDateTime.now()
        );

        when(supportRequestRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(sampleRequest));
        when(userRepository.findByIdAndDeletedAtIsNull(10L)).thenReturn(Optional.of(sampleUser));
        when(userRepository.findActiveStaffUsers()).thenReturn(List.of(manager, receptionist));
        when(supportRequestMessageRepository.save(any(SupportRequestMessage.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(supportRequestMapper.toMessageDto(any(SupportRequestMessage.class))).thenReturn(expectedDto);

        SupportRequestMessageDto result = supportRequestService.sendMessage(1L, 10L, "MEMBER", messageDto);

        assertThat(result).isNotNull();
        verify(notificationService).send(eq(50L), any(), any(), eq("support_reply"), eq("support_request"), eq(1L));
        verify(notificationService).send(eq(51L), any(), any(), eq("support_reply"), eq("support_request"), eq(1L));
    }
}
