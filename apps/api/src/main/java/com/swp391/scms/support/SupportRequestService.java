package com.swp391.scms.support;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.support.dto.CreateSupportMessageDto;
import com.swp391.scms.support.dto.CreateSupportRequestDto;
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
    private static final Set<String> STAFF_ROLES = Set.of("CENTER_MANAGER", "RECEPTIONIST", "COACH");

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
        supportRequestRepository.save(request);
        return supportRequestMapper.toDto(request);
    }

    @Transactional(readOnly = true)
    public Page<SupportRequestDto> getMyRequests(Long memberId, Pageable pageable) {
        return supportRequestRepository.findByMemberUserIdOrderByCreatedAtDesc(memberId, pageable)
                .map(supportRequestMapper::toDto);
    }

    @Transactional(readOnly = true)
    public Page<SupportRequestDto> getAllRequests(String status, Pageable pageable) {
        String normalizedStatus = (status == null || status.isBlank()) ? null : status.trim().toLowerCase(Locale.ROOT);
        if (normalizedStatus != null && !VALID_STATUSES.contains(normalizedStatus)) {
            throw new BadRequestException("INVALID_SUPPORT_STATUS", "validation.support.status.invalid", null,
                    "Invalid support request status: " + status);
        }
        return supportRequestRepository.findAllByStatus(normalizedStatus, pageable)
                .map(supportRequestMapper::toDto);
    }

    @Transactional
    @Audited(action = "SUPPORT_STATUS_UPDATE", entity = "support_requests")
    public SupportRequestDto updateStatus(Long id, UpdateSupportRequestStatusDto dto) {
        SupportRequest request = supportRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.support_request", id));

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
            if (assignee.getRole() != null && assignee.getRole().getCode() != null
                    && !STAFF_ROLES.contains(assignee.getRole().getCode().toUpperCase(Locale.ROOT))) {
                throw new BadRequestException("INVALID_ASSIGNEE", "support.assignee.invalid", null,
                        "Assignee must hold a staff role");
            }
            request.setAssignedTo(assignee);
        }

        SupportRequest saved = supportRequestRepository.save(request);
        if (statusChanged && notificationService != null && request.getMember() != null) {
            Long memberUserId = request.getMember().getUserId() != null
                    ? request.getMember().getUserId()
                    : (request.getMember().getUser() != null ? request.getMember().getUser().getId() : null);
            if (memberUserId != null) {
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
        SupportRequest request = supportRequestRepository.findById(requestId)
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
        }

        if ("closed".equalsIgnoreCase(request.getStatus())) {
            throw new BadRequestException(
                    "TICKET_CLOSED",
                    "support.message.ticket_closed",
                    new Object[]{requestId},
                    "Cannot send message to a closed support request"
            );
        }

        User sender = userRepository.findByIdAndDeletedAtIsNull(senderUserId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", senderUserId));

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
                // If staff replies, notify the member
                if (memberUserId != null) {
                    notificationService.send(memberUserId, title, body, "support_reply", "support_request", targetRequestId);
                }
            } else {
                // If member sends message, notify the assigned staff (if assigned)
                if (request.getAssignedTo() != null && request.getAssignedTo().getId() != null) {
                    notificationService.send(request.getAssignedTo().getId(), title, body, "support_reply", "support_request", targetRequestId);
                } else {
                    // P2 #49: Ticket is unassigned: broadcast notification to active staff (Receptionists & Center Managers)
                    List<User> activeStaff = userRepository.findActiveStaffUsers();
                    if (activeStaff != null) {
                        for (User staffUser : activeStaff) {
                            if (staffUser.getId() != null) {
                                notificationService.send(staffUser.getId(), title, body, "support_reply", "support_request", targetRequestId);
                            }
                        }
                    }
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

        if (supportRequestMessageRepository == null) {
            return List.of();
        }

        List<SupportRequestMessage> messages = supportRequestMessageRepository.findBySupportRequestIdOrderByCreatedAtAsc(requestId);
        return messages.stream().map(supportRequestMapper::toMessageDto).toList();
    }

    private boolean isStaffRole(String role) {
        if (role == null) return false;
        String normalized = role.startsWith("ROLE_") ? role.substring(5) : role;
        return STAFF_ROLES.contains(normalized.toUpperCase(Locale.ROOT))
                || "MANAGER".equalsIgnoreCase(normalized)
                || "STAFF".equalsIgnoreCase(normalized)
                || "COACH".equalsIgnoreCase(normalized);
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
