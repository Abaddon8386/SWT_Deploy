package com.swp391.scms.support;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.dto.CreateSupportRequestDto;
import com.swp391.scms.support.dto.EscalateSupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestMessageDto;
import com.swp391.scms.support.dto.UpdateSupportRequestStatusDto;
import com.swp391.scms.support.entity.SupportRequest;
import com.swp391.scms.support.entity.SupportRequestMessage;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
public class SupportRequestService {

    private static final Set<String> VALID_STATUSES = Set.of("open", "in_progress", "resolved", "closed");
    private static final Set<String> STAFF_ROLES = Set.of("CENTER_MANAGER", "RECEPTIONIST");
    private static final String MANAGER = "CENTER_MANAGER";
    private static final String RECEPTIONIST = "RECEPTIONIST";

    private final SupportRequestRepository supportRequestRepository;
    private final SupportRequestMapper supportRequestMapper;
    private final MemberRepository memberRepository;
    private final UserRepository userRepository;
    private final SupportRequestMessageRepository supportRequestMessageRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;
    private final Clock clock;

    public SupportRequestService(SupportRequestRepository supportRequestRepository,
                                 SupportRequestMapper supportRequestMapper,
                                 MemberRepository memberRepository,
                                 UserRepository userRepository) {
        this(supportRequestRepository, supportRequestMapper, memberRepository, userRepository, null, null, null, null);
    }

    public SupportRequestService(SupportRequestRepository supportRequestRepository,
                                 SupportRequestMapper supportRequestMapper,
                                 MemberRepository memberRepository,
                                 UserRepository userRepository,
                                 SupportRequestMessageRepository supportRequestMessageRepository) {
        this(supportRequestRepository, supportRequestMapper, memberRepository, userRepository, supportRequestMessageRepository, null, null, null);
    }

    public SupportRequestService(SupportRequestRepository supportRequestRepository,
                                 SupportRequestMapper supportRequestMapper,
                                 MemberRepository memberRepository,
                                 UserRepository userRepository,
                                 NotificationService notificationService,
                                 MessageService messageService) {
        this(supportRequestRepository, supportRequestMapper, memberRepository, userRepository, null, notificationService, messageService, null);
    }

    public SupportRequestService(SupportRequestRepository supportRequestRepository,
                                 SupportRequestMapper supportRequestMapper,
                                 MemberRepository memberRepository,
                                 UserRepository userRepository,
                                 SupportRequestMessageRepository supportRequestMessageRepository,
                                 NotificationService notificationService,
                                 MessageService messageService) {
        this(supportRequestRepository, supportRequestMapper, memberRepository, userRepository, supportRequestMessageRepository, notificationService, messageService, null);
    }

    @Autowired
    public SupportRequestService(SupportRequestRepository supportRequestRepository,
                                 SupportRequestMapper supportRequestMapper,
                                 MemberRepository memberRepository,
                                 UserRepository userRepository,
                                 SupportRequestMessageRepository supportRequestMessageRepository,
                                 NotificationService notificationService,
                                 MessageService messageService,
                                 @Autowired(required = false) Clock clock) {
        this.supportRequestRepository = supportRequestRepository;
        this.supportRequestMapper = supportRequestMapper;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.supportRequestMessageRepository = supportRequestMessageRepository;
        this.notificationService = notificationService;
        this.messageService = messageService;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
    }

    @Transactional
    public SupportRequestDto createRequest(Long memberId, CreateSupportRequestDto dto) {
        Member member = memberRepository.findById(memberId)
                .filter(m -> m.getUser() == null || m.getUser().getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));

        SupportRequest request = new SupportRequest(member, dto.subject(), dto.description());
        SupportRequest saved = supportRequestRepository.save(request);
        // A new complaint reaches the receptionists first; managers are only notified once it is escalated
        // (they are not allowed to open a complaint that has not been escalated).
        notifyStaff(RECEPTIONIST, "notifications.support.new_request.title", "notifications.support.new_request.body",
                saved.getId(), dto.subject());
        return supportRequestMapper.toDto(saved).forMember();
    }

    @Transactional(readOnly = true)
    public Page<SupportRequestDto> getMyRequests(Long memberId, Pageable pageable) {
        return supportRequestRepository.findByMemberUserIdOrderByCreatedAtDesc(memberId, pageable)
                .map(request -> supportRequestMapper.toDto(request).forMember());
    }

    @Transactional(readOnly = true)
    public Page<SupportRequestDto> getAllRequests(String status, Pageable pageable, String role) {
        String normalizedStatus = (status == null || status.isBlank()) ? null : status.trim().toLowerCase(Locale.ROOT);
        if (normalizedStatus != null && !VALID_STATUSES.contains(normalizedStatus)) {
            throw new BadRequestException("INVALID_SUPPORT_STATUS", "validation.support.status.invalid", null,
                    "Invalid support request status: " + status);
        }
        requireInboxRole(role);
        Page<SupportRequest> page = isManager(role)
                ? supportRequestRepository.findEscalatedByStatus(normalizedStatus, pageable)
                : supportRequestRepository.findAllByStatus(normalizedStatus, pageable);
        return page.map(supportRequestMapper::toDto);
    }

    @Transactional
    @Audited(action = "SUPPORT_STATUS_UPDATE", entity = "support_requests")
    public SupportRequestDto updateStatus(Long id, UpdateSupportRequestStatusDto dto, String actorRole) {
        SupportRequest request = supportRequestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", id));
        requireHandler(request, actorRole);

        if ("closed".equalsIgnoreCase(request.getStatus())) {
            throw new com.swp391.scms.common.exception.AppException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "INVALID_STATE_TRANSITION",
                    "support.status.closed_cannot_reopen",
                    new Object[]{request.getStatus(), dto != null ? dto.status() : null},
                    "Closed support request cannot be modified"
            );
        }

        if (dto == null || (dto.status() == null && dto.assignedTo() == null)) {
            throw new BadRequestException("EMPTY_SUPPORT_UPDATE", "support.status.empty_update", null,
                    "At least one of status or assignedTo must be provided");
        }

        boolean statusChanged = false;
        if (dto.status() != null) {
            String currentStatus = request.getStatus();
            String targetStatus = dto.status().trim().toLowerCase(Locale.ROOT);
            validateStatusTransition(currentStatus, targetStatus);
            statusChanged = currentStatus == null || !currentStatus.equalsIgnoreCase(targetStatus);

            request.setStatus(targetStatus);
            if ("resolved".equals(targetStatus) || "closed".equals(targetStatus)) {
                if (request.getResolvedAt() == null) {
                    request.setResolvedAt(LocalDateTime.now(clock));
                }
            } else {
                request.setResolvedAt(null);
            }
        }

        if (dto.assignedTo() != null) {
            User assignee = userRepository.findByIdAndDeletedAtIsNull(dto.assignedTo())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.user", dto.assignedTo()));
            if (assignee.getStatus() != null && !"active".equalsIgnoreCase(assignee.getStatus())) {
                throw new BadRequestException("INVALID_ASSIGNEE", "support.assignee.invalid", null,
                        "Assignee must be an active staff account");
            }
            String requiredAssigneeRole = request.isEscalated() ? MANAGER : RECEPTIONIST;
            if (assignee.getRole() != null && assignee.getRole().getCode() != null
                    && !requiredAssigneeRole.equals(normalizeRole(assignee.getRole().getCode()))) {
                throw new BadRequestException("INVALID_ASSIGNEE", "support.assignee.invalid", null,
                        "Assignee must hold the role that handles this request");
            }
            request.setAssignedTo(assignee);
        }

        SupportRequest saved = supportRequestRepository.save(request);
        if (statusChanged && notificationService != null && request.getMember() != null) {
            Long memberUserId = request.getMember().getUserId() != null
                    ? request.getMember().getUserId()
                    : (request.getMember().getUser() != null ? request.getMember().getUser().getId() : null);
            if (memberUserId != null && memberReachable(request)) {
                String title = messageService != null
                        ? messageService.getMessage("notifications.support.status_updated.title")
                        : "notifications.support.status_updated.title";
                String body = messageService != null
                        ? messageService.getMessage("notifications.support.status_updated.body", request.getSubject(), request.getStatus())
                        : "notifications.support.status_updated.body";
                notificationService.send(memberUserId, title, body, "support_reply", "support_request", saved != null ? saved.getId() : id);
            }
        }
        return supportRequestMapper.toDto(saved != null ? saved : request);
    }

    @Transactional
    public SupportRequestMessageDto sendMessage(Long requestId, Long senderUserId, String senderRole, CreateSupportMessageDto dto) {
        SupportRequest request = supportRequestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", requestId));

        boolean staff = isStaffRole(senderRole);
        Long memberUserId = request.getMember() != null ? request.getMember().getUserId() : null;
        if (!staff) {
            if (memberUserId == null || !Objects.equals(memberUserId, senderUserId)) {
                throw new ForbiddenException(
                        "FORBIDDEN",
                        "support.message.forbidden",
                        null,
                        "You are not allowed to send messages in this support request"
                );
            }
        } else {
            requireHandler(request, senderRole);
        }

        User sender = requireActor(senderUserId, senderRole);
        if (dto.clientMessageId() != null) {
            var existing = supportRequestMessageRepository.findBySupportRequestIdAndSenderIdAndClientMessageId(requestId, senderUserId, dto.clientMessageId());
            if (existing.isPresent()) {
                if (!Objects.equals(existing.get().getMessage(), dto.message().trim()))
                    throw new com.swp391.scms.common.exception.ConflictException("SUPPORT_MESSAGE_KEY_REUSED", "support.message.key_reused", null, null);
                return supportRequestMapper.toMessageDto(existing.get());
            }
        }

        if ("closed".equalsIgnoreCase(request.getStatus())) {
            throw new BadRequestException(
                    "TICKET_CLOSED",
                    "support.message.ticket_closed",
                    new Object[]{requestId},
                    "Cannot send message to a closed support request"
            );
        }

        // 1-step convenience: when staff replies to an open ticket, auto-transition to in_progress
        // and auto-assign if unassigned so staff don't have to make a separate status PATCH first.
        if (staff) {
            boolean updatedTicket = false;
            if ("open".equalsIgnoreCase(request.getStatus())) {
                request.setStatus("in_progress");
                updatedTicket = true;
            }
            if (request.getAssignedTo() == null) {
                request.setAssignedTo(sender);
                updatedTicket = true;
            }
            if (updatedTicket) {
                supportRequestRepository.save(request);
            }
        }

        SupportRequestMessage message = new SupportRequestMessage(request, sender, dto.message().trim());
        message.setClientMessageId(dto.clientMessageId());
        SupportRequestMessage saved = supportRequestMessageRepository != null
                ? supportRequestMessageRepository.save(message)
                : message;

        // Auto send in-app notification to the counterpart
        if (notificationService != null) {
            String senderName = sender.getFullName() != null && !sender.getFullName().isBlank()
                    ? sender.getFullName()
                    : sender.getUsername();
            String title = messageService != null
                    ? messageService.getMessage("notifications.support.new_message.title")
                    : "notifications.support.new_message.title";
            String body = messageService != null
                    ? messageService.getMessage("notifications.support.new_message.body", senderName, request.getSubject())
                    : "notifications.support.new_message.body";

            Long targetRequestId = request.getId() != null ? request.getId() : requestId;
            if (staff) {
                // If staff replies, notify the member (a deleted account has no inbox to notify)
                if (memberUserId != null && memberReachable(request)) {
                    notificationService.send(memberUserId, title, body, "support_reply", "support_request", targetRequestId);
                }
            } else {
                // If member sends message, notify the assigned handler (if assigned)
                if (request.getAssignedTo() != null && request.getAssignedTo().getId() != null) {
                    notificationService.send(request.getAssignedTo().getId(), title, body, "support_reply", "support_request", targetRequestId);
                } else {
                    // Unassigned: tell whoever handles it now, receptionists first and managers once escalated.
                    notifyStaff(request.isEscalated() ? MANAGER : RECEPTIONIST,
                            "notifications.support.new_message.title", "notifications.support.new_message.body",
                            targetRequestId, senderName, request.getSubject());
                }
            }
        }

        return supportRequestMapper.toMessageDto(saved);
    }

    @Transactional(readOnly = true)
    public List<SupportRequestMessageDto> getMessages(Long requestId, Long currentUserId, String currentRole) {
        SupportRequest request = supportRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", requestId));

        boolean staff = isStaffRole(currentRole);
        Long memberUserId = request.getMember() != null ? request.getMember().getUserId() : null;
        if (!staff) {
            if (memberUserId == null || !Objects.equals(memberUserId, currentUserId)) {
                throw new ForbiddenException(
                        "FORBIDDEN",
                        "support.message.forbidden",
                        null,
                        "You are not allowed to view messages in this support request"
                );
            }
        }

        requireActor(currentUserId, currentRole);
        if (staff) requireReadable(request, currentRole);
        if (supportRequestMessageRepository == null) {
            return List.of();
        }

        List<SupportRequestMessage> messages = supportRequestMessageRepository.findBySupportRequestIdOrderByCreatedAtAsc(requestId);
        return messages.stream().map(supportRequestMapper::toMessageDto).toList();
    }

    @Transactional(readOnly = true)
    public SupportRequestDto getRequest(Long requestId, Long actorId, String role) {
        SupportRequestDto dto = supportRequestMapper.toDto(requireTicket(requestId, actorId, role));
        return isStaffRole(role) ? dto : dto.forMember();
    }

    @Transactional(readOnly = true)
    public SupportRequest requireTicket(Long requestId, Long actorId, String role) {
        requireActor(actorId, role);
        SupportRequest request = supportRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", requestId));
        if (!isStaffRole(role) && (request.getMember() == null || !Objects.equals(request.getMember().getUserId(), actorId)))
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        if (isStaffRole(role)) requireReadable(request, role);
        return request;
    }

    public User requireActor(Long actorId, String role) {
        User actor = userRepository.findByIdAndDeletedAtIsNull(actorId)
                .orElseThrow(() -> new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null));
        if (!"active".equalsIgnoreCase(actor.getStatus()) || actor.getRole() == null
                || !Objects.equals(actor.getRole().getCode(), role)
                || !("MEMBER".equals(role) || STAFF_ROLES.contains(role)))
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        return actor;
    }

    private static String normalizeRole(String role) {
        if (role == null) return "";
        String normalized = role.startsWith("ROLE_") ? role.substring(5) : role;
        return normalized.toUpperCase(Locale.ROOT);
    }

    private static boolean isManager(String role) {
        String normalized = normalizeRole(role);
        return MANAGER.equals(normalized) || "MANAGER".equals(normalized);
    }

    private static boolean isReceptionist(String role) {
        String normalized = normalizeRole(role);
        return RECEPTIONIST.equals(normalized) || "STAFF".equals(normalized);
    }

    /** Coaches no longer take part in complaints: only receptionists and managers are staff here. */
    private boolean isStaffRole(String role) {
        return isManager(role) || isReceptionist(role);
    }

    private void requireInboxRole(String role) {
        if (!isStaffRole(role)) {
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        }
    }

    /** Receptionists see every complaint; managers only the ones escalated to them. */
    private void requireReadable(SupportRequest request, String role) {
        if (isManager(role) && !request.isEscalated()) {
            throw new ForbiddenException("SUPPORT_NOT_ESCALATED", "support.manager.not_escalated", null, null);
        }
    }

    /** The receptionist handles a complaint until it is escalated; from then on only a manager may act on it. */
    private void requireHandler(SupportRequest request, String role) {
        if (isManager(role)) {
            if (!request.isEscalated()) {
                throw new ForbiddenException("SUPPORT_NOT_ESCALATED", "support.manager.not_escalated", null, null);
            }
        } else if (isReceptionist(role)) {
            if (request.isEscalated()) {
                throw new ForbiddenException("SUPPORT_ESCALATED_LOCKED", "support.escalated.locked", null, null);
            }
        } else {
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        }
    }

    /** Hand a complaint the receptionist cannot resolve up to the managers. */
    @Transactional
    @Audited(action = "SUPPORT_ESCALATE", entity = "support_requests")
    public SupportRequestDto escalate(Long id, Long actorId, String role, EscalateSupportRequestDto dto) {
        if (!isReceptionist(role)) {
            throw new ForbiddenException("FORBIDDEN", "support.message.forbidden", null, null);
        }
        User actor = requireActor(actorId, role);
        SupportRequest request = supportRequestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", id));
        if (request.isEscalated()) {
            throw new ConflictException("SUPPORT_ALREADY_ESCALATED", "support.escalate.already", null,
                    "Support request is already escalated");
        }
        String status = request.getStatus() == null ? "" : request.getStatus().toLowerCase(Locale.ROOT);
        if (!"open".equals(status) && !"in_progress".equals(status)) {
            throw new BadRequestException("SUPPORT_ESCALATE_INVALID_STATE", "support.escalate.invalid_state", null,
                    "Only an open or in-progress request can be escalated");
        }
        request.setEscalatedAt(LocalDateTime.now(clock));
        request.setEscalatedBy(actor);
        request.setEscalationReason(dto.reason().trim());
        request.setAssignedTo(null);
        SupportRequest saved = supportRequestRepository.save(request);
        SupportRequest result = saved != null ? saved : request;
        notifyStaff(MANAGER, "notifications.support.escalated_manager.title", "notifications.support.escalated_manager.body",
                id, result.getSubject());
        if (notificationService != null && result.getMember() != null && result.getMember().getUserId() != null
                && memberReachable(result)) {
            notificationService.send(result.getMember().getUserId(),
                    text("notifications.support.escalated_member.title"),
                    text("notifications.support.escalated_member.body", result.getSubject()),
                    "support_reply", "support_request", id);
        }
        return supportRequestMapper.toDto(result);
    }

    /**
     * Notifications resolve the recipient among non-deleted users. Replying to or updating a complaint
     * of a deleted member must still work, so skip the in-app notice instead of failing the whole write.
     */
    private static boolean memberReachable(SupportRequest request) {
        Member member = request.getMember();
        return member != null && (member.getUser() == null || member.getUser().getDeletedAt() == null);
    }

    private String text(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    private void notifyStaff(String roleCode, String titleKey, String bodyKey, Long requestId, Object... bodyArgs) {
        if (notificationService == null || userRepository == null) return;
        List<User> staff = userRepository.findActiveStaffUsers();
        if (staff == null) return;
        for (User user : staff) {
            boolean match = MANAGER.equals(roleCode)
                    ? isManager(user.getRole() != null ? user.getRole().getCode() : null)
                    : isReceptionist(user.getRole() != null ? user.getRole().getCode() : null);
            if (user.getId() != null && user.getRole() != null && match) {
                notificationService.send(user.getId(), text(titleKey), text(bodyKey, bodyArgs),
                        "support_reply", "support_request", requestId);
            }
        }
    }

    private void validateStatusTransition(String currentStatus, String targetStatus) {
        if (currentStatus != null && currentStatus.equalsIgnoreCase(targetStatus)) {
            return;
        }
        boolean valid = switch (currentStatus == null ? "" : currentStatus.toLowerCase()) {
            case "open" -> "in_progress".equalsIgnoreCase(targetStatus) || "resolved".equalsIgnoreCase(targetStatus);
            case "in_progress" -> "open".equalsIgnoreCase(targetStatus) || "resolved".equalsIgnoreCase(targetStatus) || "closed".equalsIgnoreCase(targetStatus);
            case "resolved" -> "in_progress".equalsIgnoreCase(targetStatus) || "closed".equalsIgnoreCase(targetStatus);
            default -> false;
        };
        if (!valid) {
            throw new com.swp391.scms.common.exception.AppException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "INVALID_STATE_TRANSITION",
                    "support.status.invalid_transition",
                    new Object[]{currentStatus, targetStatus},
                    "Invalid state transition from " + currentStatus + " to " + targetStatus
            );
        }
    }
}
