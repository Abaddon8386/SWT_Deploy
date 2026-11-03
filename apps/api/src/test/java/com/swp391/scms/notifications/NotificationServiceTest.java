package com.swp391.scms.notifications;

import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.entity.Notification;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Test
    void sendDispatchesExternalChannelsOnlyAfterCommit() {
        var dispatcher = mock(com.swp391.scms.notifications.port.NotificationDispatcher.class);
        var service = new NotificationService(notificationRepository, userRepository, notificationMapper, dispatcher);
        var user = new User();
        user.setId(101L);
        when(userRepository.findByIdAndDeletedAtIsNull(101L)).thenReturn(Optional.of(user));
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            service.send(101L, "Title", "Message", "system", null, null);
            verify(notificationRepository).save(any(Notification.class));
            verifyNoInteractions(dispatcher);
            org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations()
                    .forEach(org.springframework.transaction.support.TransactionSynchronization::afterCommit);
            verify(dispatcher).dispatch(101L, "Title", "Message", "system", null, null,
                    java.util.Set.of(com.swp391.scms.notifications.port.NotificationChannel.EMAIL,
                                     com.swp391.scms.notifications.port.NotificationChannel.PUSH));
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void rejectedDispatchDoesNotFailAfterCommit() {
        var dispatcher = mock(com.swp391.scms.notifications.port.NotificationDispatcher.class);
        var service = new NotificationService(notificationRepository, userRepository, notificationMapper, dispatcher);
        var user = new User();
        user.setId(101L);
        when(userRepository.findByIdAndDeletedAtIsNull(101L)).thenReturn(Optional.of(user));
        doThrow(new org.springframework.core.task.TaskRejectedException("executor full"))
                .when(dispatcher).dispatch(eq(101L), eq("Title"), eq("Message"), eq("system"), isNull(), isNull(), any());
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            service.send(101L, "Title", "Message", "system", null, null);
            assertThatCode(() -> org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations()
                    .forEach(org.springframework.transaction.support.TransactionSynchronization::afterCommit)).doesNotThrowAnyException();
            verify(dispatcher).dispatch(eq(101L), eq("Title"), eq("Message"), eq("system"), isNull(), isNull(), any());
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private NotificationMapper notificationMapper;

    @InjectMocks
    private NotificationService notificationService;

    @Test
    @DisplayName("getUserNotifications returns paginated notifications for user")
    void getUserNotifications_Success() {
        User user = new User();
        user.setId(101L);
        Notification entity = new Notification(user, "Title", "Body", "system", "support_request", 1L);
        NotificationDto dto = new NotificationDto(1L, "Title", "Body", "system", "support_request", 1L, false, LocalDateTime.now());
        PageRequest pageable = PageRequest.of(0, 20);

        when(notificationRepository.findByUserIdOrderByCreatedAtDesc(101L, pageable))
                .thenReturn(new PageImpl<>(List.of(entity), pageable, 1));
        when(notificationMapper.toDto(entity)).thenReturn(dto);

        Page<NotificationDto> result = notificationService.getUserNotifications(101L, pageable);

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().get(0).title()).isEqualTo("Title");
    }

    @Test
    @DisplayName("getUnreadCount returns count of unread notifications")
    void getUnreadCount_Success() {
        when(notificationRepository.countByUserIdAndIsReadFalse(101L)).thenReturn(3L);

        assertThat(notificationService.getUnreadCount(101L)).isEqualTo(3L);
    }

    @Test
    @DisplayName("markAsRead marks unread notification as read")
    void markAsRead_Success() {
        User user = new User();
        user.setId(101L);
        Notification notification = new Notification(user, "Title", "Body", "system", null, null);
        when(notificationRepository.findByIdAndUserId(10L, 101L)).thenReturn(Optional.of(notification));

        notificationService.markAsRead(10L, 101L);

        assertThat(notification.isRead()).isTrue();
        verify(notificationRepository).save(notification);
    }

    @Test
    @DisplayName("markAsRead throws 404 when notification not found or belongs to another user")
    void markAsRead_NotFound() {
        when(notificationRepository.findByIdAndUserId(99L, 101L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> notificationService.markAsRead(99L, 101L))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("markAllAsRead delegates to repository")
    void markAllAsRead_Success() {
        notificationService.markAllAsRead(101L);

        verify(notificationRepository).markAllAsReadByUserId(101L);
    }

    @Test
    @DisplayName("send saves notification when user is active and not soft-deleted")
    void send_Success() {
        User user = new User();
        user.setId(101L);
        when(userRepository.findByIdAndDeletedAtIsNull(101L)).thenReturn(Optional.of(user));

        notificationService.send(101L, "Title", "Message", "support_reply", "support_request", 5L);

        verify(notificationRepository).save(any(Notification.class));
    }

    @Test
    @DisplayName("send throws ResourceNotFoundException when user is soft-deleted or missing")
    void send_SoftDeletedUser_ThrowsNotFound() {
        when(userRepository.findByIdAndDeletedAtIsNull(101L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> notificationService.send(101L, "Title", "Message", "system", null, null))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(notificationRepository, never()).save(any());
    }

    @Test
    @DisplayName("Spring context verifies Autowired constructor exists and bean instantiates without NoSuchMethodException")
    void springContextResolvesAutowiredConstructor() {
        org.springframework.context.annotation.AnnotationConfigApplicationContext context =
                new org.springframework.context.annotation.AnnotationConfigApplicationContext();
        context.getDefaultListableBeanFactory().registerSingleton("notificationRepository", notificationRepository);
        context.getDefaultListableBeanFactory().registerSingleton("userRepository", userRepository);
        context.getDefaultListableBeanFactory().registerSingleton("notificationMapper", notificationMapper);
        context.register(NotificationService.class);
        context.refresh();

        NotificationService bean = context.getBean(NotificationService.class);
        assertThat(bean).isNotNull();
        context.close();
    }
}
