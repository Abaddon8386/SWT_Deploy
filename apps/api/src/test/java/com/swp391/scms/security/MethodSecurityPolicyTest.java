package com.swp391.scms.security;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.PackageController;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.service.PackageService;
import com.swp391.scms.support.SupportRequestController;
import com.swp391.scms.support.SupportRequestService;
import com.swp391.scms.support.dto.UpdateSupportRequestStatusDto;
import com.swp391.scms.users.UserController;
import com.swp391.scms.users.UserService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

/**
 * Integration test proving that Spring Security's @EnableMethodSecurity is active
 * and @PreAuthorize annotations genuinely enforce RBAC policies on controllers.
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = {
        MethodSecurityPolicyTest.MethodSecurityConfig.class
})
class MethodSecurityPolicyTest {

    @Configuration
    @EnableMethodSecurity
    static class MethodSecurityConfig {
        @Bean
        public UserService userService() {
            return mock(UserService.class);
        }

        @Bean
        public PackageService packageService() {
            return mock(PackageService.class);
        }

        @Bean
        public SupportRequestService supportRequestService() {
            return mock(SupportRequestService.class);
        }

        @Bean
        public MessageService messageService() {
            return mock(MessageService.class);
        }

        @Bean
        public UserController userController(UserService userService) {
            return new UserController(userService);
        }

        @Bean
        public PackageController packageController(PackageService packageService, MessageService messageService) {
            return new PackageController(packageService, messageService);
        }

        @Bean
        public SupportRequestController supportRequestController(SupportRequestService service, MessageService messageService) {
            return new SupportRequestController(service, messageService);
        }

        @Bean
        public com.swp391.scms.finance.service.PaymentService paymentService() {
            return mock(com.swp391.scms.finance.service.PaymentService.class);
        }

        @Bean
        public com.swp391.scms.finance.PaymentController paymentController(
                com.swp391.scms.finance.service.PaymentService paymentService, MessageService messageService) {
            return new com.swp391.scms.finance.PaymentController(paymentService, messageService);
        }

        @Bean
        public com.swp391.scms.scheduling.service.ClassService classService() {
            return mock(com.swp391.scms.scheduling.service.ClassService.class);
        }

        @Bean
        public com.swp391.scms.scheduling.ClassController classController(
                com.swp391.scms.scheduling.service.ClassService classService, MessageService messageService) {
            return new com.swp391.scms.scheduling.ClassController(classService, messageService);
        }
    }

    @Autowired
    private UserController userController;

    @Autowired
    private PackageController packageController;

    @Autowired
    private SupportRequestController supportRequestController;

    @Autowired
    private com.swp391.scms.finance.PaymentController paymentController;

    @Autowired
    private com.swp391.scms.scheduling.ClassController classController;

    @Test
    @WithMockUser(roles = "RECEPTIONIST")
    @DisplayName("AC SCRUM-69: Receptionist không thể xóa người dùng -> Spring Security ném AccessDeniedException")
    void receptionistCannotDeleteUser() {
        assertThrows(AccessDeniedException.class, () -> userController.deleteUser(4L));
    }

    @Test
    @WithMockUser(roles = "CENTER_MANAGER")
    @DisplayName("Manager chỉ tạo nhân sự, không xóa người dùng")
    void centerManagerCannotDeleteUser() {
        assertThrows(AccessDeniedException.class, () -> userController.deleteUser(4L));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminCanDeleteUser() {
        assertDoesNotThrow(() -> userController.deleteUser(4L));
    }

    @Test
    @WithMockUser(roles = "RECEPTIONIST")
    @DisplayName("AC SCRUM-69: Receptionist không thể sửa bảng giá gói tập -> Spring Security ném AccessDeniedException")
    void receptionistCannotUpdatePackage() {
        PackageRequest request = new PackageRequest("Gold", "Desc", java.math.BigDecimal.valueOf(500000), 30, 10, "active");
        assertThrows(AccessDeniedException.class, () -> packageController.update(1L, request));
    }

    @Test
    @WithMockUser(roles = "CENTER_MANAGER")
    @DisplayName("AC SCRUM-69: Center Manager có quyền sửa gói tập -> Không bị chặn")
    void centerManagerCanUpdatePackage() {
        PackageRequest request = new PackageRequest("Gold", "Desc", java.math.BigDecimal.valueOf(500000), 30, 10, "active");
        assertDoesNotThrow(() -> packageController.update(1L, request));
    }

    @Test
    @WithMockUser(roles = "MEMBER")
    @DisplayName("AC SCRUM-69: Member không thể xem toàn bộ yêu cầu hỗ trợ -> Spring Security ném AccessDeniedException")
    void memberCannotViewAllSupportRequests() {
        assertThrows(AccessDeniedException.class, () -> supportRequestController.getAllRequests(supportActor(), null, null));
    }

    @Test
    @WithMockUser(roles = "RECEPTIONIST")
    @DisplayName("AC SCRUM-69: Receptionist có quyền xem và xử lý yêu cầu hỗ trợ -> Không bị chặn")
    void receptionistCanViewAllSupportRequests() {
        assertDoesNotThrow(() -> supportRequestController.getAllRequests(supportActor(), null, null));
    }

    @Test
    @WithMockUser(roles = "MEMBER")
    @DisplayName("AC SCRUM-69: Member không thể cập nhật trạng thái yêu cầu hỗ trợ -> Spring Security ném AccessDeniedException")
    void memberCannotUpdateSupportRequestStatus() {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        assertThrows(AccessDeniedException.class, () -> supportRequestController.updateStatus(supportActor(), 1L, updateDto));
    }

    @Test
    @WithMockUser(roles = "CENTER_MANAGER")
    @DisplayName("AC SCRUM-69: Center Manager có quyền cập nhật trạng thái yêu cầu hỗ trợ -> Không bị chặn")
    void centerManagerCanUpdateSupportRequestStatus() {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        assertDoesNotThrow(() -> supportRequestController.updateStatus(supportActor(), 1L, updateDto));
    }

    @Test
    @WithMockUser(roles = "MEMBER")
    @DisplayName("AC SCRUM-69: Member không thể truy cập endpoint quản lý lớp của Manager")
    void memberCannotCreateClass() {
        com.swp391.scms.scheduling.dto.SchedulingRequests.CreateClassRequest req =
                new com.swp391.scms.scheduling.dto.SchedulingRequests.CreateClassRequest("Yoga", 1L, 2L, 3L, 20, "beginner", "Desc");
        assertThrows(AccessDeniedException.class, () -> classController.createClass(req));
    }

    @Test
    @WithMockUser(roles = "MEMBER")
    @DisplayName("AC SCRUM-69: Member không thể truy cập endpoint xử lý thanh toán của Receptionist")
    void memberCannotProcessPayment() {
        com.swp391.scms.finance.dto.PaymentProcessDto req = new com.swp391.scms.finance.dto.PaymentProcessDto();
        assertThrows(AccessDeniedException.class, () -> paymentController.processPayment(req));
    }

    @Test
    @WithMockUser(roles = "RECEPTIONIST")
    @DisplayName("AC SCRUM-69: Receptionist không thể hoàn tiền (chỉ Center Manager)")
    void receptionistCannotRefundPayment() {
        com.swp391.scms.finance.dto.PaymentRefundRequest req = new com.swp391.scms.finance.dto.PaymentRefundRequest();
        assertThrows(AccessDeniedException.class, () -> paymentController.refundPayment(1L, req));
    }

    private static com.swp391.scms.security.AuthenticatedPrincipal supportActor() {
        return new com.swp391.scms.security.AuthenticatedPrincipal(1L, "actor", "RECEPTIONIST");
    }

    @Test
    @WithMockUser(roles = "COACH")
    @DisplayName("Huấn luyện viên không còn xem hay xử lý khiếu nại -> AccessDeniedException")
    void coachCannotTouchSupportRequests() {
        UpdateSupportRequestStatusDto updateDto = new UpdateSupportRequestStatusDto("in_progress", null);
        assertThrows(AccessDeniedException.class, () -> supportRequestController.getAllRequests(supportActor(), null, null));
        assertThrows(AccessDeniedException.class, () -> supportRequestController.updateStatus(supportActor(), 1L, updateDto));
        assertThrows(AccessDeniedException.class, () -> supportRequestController.getMessages(1L, supportActor()));
        assertThrows(AccessDeniedException.class, () -> supportRequestController.sendMessage(1L, supportActor(),
                new com.swp391.scms.support.dto.CreateSupportMessageDto("Xin chào", null)));
    }

    @Test
    @WithMockUser(roles = "CENTER_MANAGER")
    @DisplayName("Chỉ lễ tân được chuyển khiếu nại lên quản lý; quản lý không tự chuyển -> AccessDeniedException")
    void onlyReceptionistsCanEscalate() {
        var dto = new com.swp391.scms.support.dto.EscalateSupportRequestDto("Cần quản lý quyết định");
        assertThrows(AccessDeniedException.class, () -> supportRequestController.escalate(supportActor(), 1L, dto));
    }

    @Test
    @WithMockUser(roles = "RECEPTIONIST")
    @DisplayName("Lễ tân được chuyển khiếu nại lên quản lý -> Không bị chặn")
    void receptionistCanEscalate() {
        var dto = new com.swp391.scms.support.dto.EscalateSupportRequestDto("Cần quản lý quyết định");
        assertDoesNotThrow(() -> supportRequestController.escalate(supportActor(), 1L, dto));
    }
}
