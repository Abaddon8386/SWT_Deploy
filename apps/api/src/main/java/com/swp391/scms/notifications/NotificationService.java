package com.swp391.scms.notifications;

import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.notifications.dto.NotificationDto;
import com.swp391.scms.notifications.entity.Notification;
import com.swp391.scms.notifications.port.NotificationDispatcher;
import com.swp391.scms.notifications.port.NotificationChannel;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Set;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final NotificationMapper notificationMapper;
    private final NotificationDispatcher notificationDispatcher;

    public NotificationService(NotificationRepository notificationRepository, 
                               UserRepository userRepository,
                               NotificationMapper notificationMapper) {
        this(notificationRepository, userRepository, notificationMapper, null);
    }

    @Autowired
    public NotificationService(NotificationRepository notificationRepository, 
                               UserRepository userRepository,
                               NotificationMapper notificationMapper,
                               @Autowired(required = false) NotificationDispatcher notificationDispatcher) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.notificationMapper = notificationMapper;
        this.notificationDispatcher = notificationDispatcher;
    }

    @Transactional(readOnly = true)
    public Page<NotificationDto> getUserNotifications(Long userId, Pageable pageable) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(notificationMapper::toDto);
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUserIdAndIsReadFalse(userId);
    }

    @Transactional
    public void markAsRead(Long id, Long userId) {
        Notification notification = notificationRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.notification", id));
        if (!notification.isRead()) {
            notification.setRead(true);
            notificationRepository.save(notification);
        }
    }

    @Transactional
    public void markAllAsRead(Long userId) {
        notificationRepository.markAllAsReadByUserId(userId);
    }

    @Transactional
    public void send(Long userId, String title, String message, String type, String relatedEntityType, Long relatedEntityId) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", userId));
        
        Notification notification = new Notification(user, title, message, type, relatedEntityType, relatedEntityId);
        notificationRepository.save(notification);
        if (notificationDispatcher != null) {
            Runnable dispatch = () -> {
                try {
                    notificationDispatcher.dispatch(userId, title, message, type,
                            relatedEntityType, relatedEntityId, Set.of(NotificationChannel.EMAIL, NotificationChannel.PUSH));
                } catch (RuntimeException e) {
                    log.warn("Could not submit external notification for user {}", userId, e);
                }
            };
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCommit() { dispatch.run(); }
                });
            } else {
                dispatch.run();
            }
        }
    }

    /**
     * Dispatches notification asynchronously across multiple channels (Port & Adapter) (SCRUM-108).
     */
    public void dispatchMultiChannel(Long userId, String title, String message, String type, String relatedEntityType, Long relatedEntityId) {
        if (notificationDispatcher != null) {
            notificationDispatcher.dispatch(userId, title, message, type, relatedEntityType, relatedEntityId);
        } else {
            send(userId, title, message, type, relatedEntityType, relatedEntityId);
        }
    }
}
