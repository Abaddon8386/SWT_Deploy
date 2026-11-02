package com.swp391.scms.operations.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.operations.dto.StaffInternalRequestCreateDto;
import com.swp391.scms.operations.dto.StaffInternalRequestDto;
import com.swp391.scms.operations.dto.StaffInternalRequestReviewDto;
import com.swp391.scms.operations.entity.StaffInternalRequest;
import com.swp391.scms.operations.repository.StaffInternalRequestRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import com.swp391.scms.common.i18n.MessageService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
public class StaffInternalRequestService {

    private static final Set<String> VALID_TYPES = Set.of(
            "LEAVE", "SHIFT_EXCHANGE", "SCHEDULE_CHANGE", "OTHER"
    );

    private final StaffInternalRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;

    public StaffInternalRequestService(StaffInternalRequestRepository requestRepository,
                                       UserRepository userRepository) {
        this(requestRepository, userRepository, null);
    }

    public StaffInternalRequestService(StaffInternalRequestRepository requestRepository,
                                       UserRepository userRepository,
                                       NotificationService notificationService) {
        this(requestRepository, userRepository, notificationService, null);
    }

    @Autowired
    public StaffInternalRequestService(StaffInternalRequestRepository requestRepository,
                                       UserRepository userRepository,
                                       @Autowired(required = false) NotificationService notificationService, MessageService messageService) {
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.messageService = messageService;
    }

    @Transactional
    public StaffInternalRequestDto createRequest(Long userId, StaffInternalRequestCreateDto requestDto) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", userId));

        String type = requestDto.requestType().toUpperCase().trim();
        if (!VALID_TYPES.contains(type)) {
            throw new BadRequestException("INVALID_REQUEST_TYPE", "error.operations.request.invalid_type", "Loại đơn từ không hợp lệ.");
        }

        if (requestDto.startDate() != null && requestDto.endDate() != null
                && requestDto.endDate().isBefore(requestDto.startDate())) {
            throw new BadRequestException("INVALID_DATE_RANGE", "error.operations.request.invalid_date_range",
                    "End date must not precede start date.");
        }

        User replacement = null;
        if (requestDto.replacementUserId() != null) {
            replacement = userRepository.findById(requestDto.replacementUserId()).orElse(null);
        }

        StaffInternalRequest req = new StaffInternalRequest();
        req.setUser(user);
        req.setRequestType(type);
        req.setTitle(requestDto.title().trim());
        req.setReason(requestDto.reason().trim());
        req.setStartDate(requestDto.startDate());
        req.setEndDate(requestDto.endDate());
        req.setTargetShift(requestDto.targetShift());
        req.setReplacementUser(replacement);
        req.setStatus("PENDING");
        req.setCreatedAt(LocalDateTime.now());

        StaffInternalRequest saved = requestRepository.save(req);

        // Notify managers about new request
        if (notificationService != null) {
            List<User> managers = userRepository.findActiveManagers().stream()
                    .filter(u -> u.getRole() != null && 
                            ("MANAGER".equalsIgnoreCase(u.getRole().getCode()) || "CENTER_MANAGER".equalsIgnoreCase(u.getRole().getCode())))
                    .toList();
            for (User mgr : managers) {
                String roleCode = user.getRole() != null ? user.getRole().getCode() : "STAFF";
                notificationService.send(
                        mgr.getId(),
                        msg("notifications.operations.created.title"),
                        msg("notifications.operations.created.body", user.getFullName(), roleCode, type, saved.getTitle()),
                        "system",
                        null,
                        saved.getId()
                );
            }
        }

        return mapToDto(saved);
    }

    @Transactional(readOnly = true)
    public List<StaffInternalRequestDto> getMyRequests(Long userId, String status) {
        List<StaffInternalRequest> list;
        if (status != null && !status.isBlank()) {
            list = requestRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, status.toUpperCase().trim());
        } else {
            list = requestRepository.findByUserIdOrderByCreatedAtDesc(userId);
        }
        return list.stream().map(this::mapToDto).toList();
    }

    @Transactional
    public StaffInternalRequestDto cancelRequest(Long userId, Long requestId) {
        StaffInternalRequest req = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.staff_internal_request", requestId));

        if (!req.getUser().getId().equals(userId)) {
            throw new ForbiddenException("FORBIDDEN", "error.operations.request.forbidden", null, "Bạn không có quyền thao tác trên đơn từ của người khác.");
        }

        if (!"PENDING".equalsIgnoreCase(req.getStatus())) {
            throw new BadRequestException("CANNOT_CANCEL", "error.operations.request.cannot_cancel", "Chỉ có thể hủy đơn khi đang ở trạng thái Chờ duyệt.");
        }

        req.setStatus("CANCELLED");
        req.setUpdatedAt(LocalDateTime.now());
        StaffInternalRequest updated = requestRepository.save(req);
        return mapToDto(updated);
    }

    @Transactional(readOnly = true)
    public List<StaffInternalRequestDto> getAllRequests(String status, String requestType) {
        String cleanStatus = (status != null && !status.isBlank()) ? status.toUpperCase().trim() : null;
        String cleanType = (requestType != null && !requestType.isBlank()) ? requestType.toUpperCase().trim() : null;
        return requestRepository.findWithFilters(cleanStatus, cleanType).stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public StaffInternalRequestDto reviewRequest(Long managerUserId, Long requestId, StaffInternalRequestReviewDto reviewDto) {
        StaffInternalRequest req = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.staff_internal_request", requestId));

        if (!"PENDING".equalsIgnoreCase(req.getStatus())) {
            throw new BadRequestException("ALREADY_REVIEWED", "error.operations.request.already_reviewed", "Đơn từ này đã được xử lý trước đó.");
        }

        String newStatus = reviewDto.status().toUpperCase().trim();
        if (!"APPROVED".equals(newStatus) && !"REJECTED".equals(newStatus)) {
            throw new BadRequestException("INVALID_STATUS", "error.operations.request.invalid_status", "Trạng thái phê duyệt chỉ có thể là APPROVED hoặc REJECTED.");
        }

        if ("REJECTED".equals(newStatus) && (reviewDto.managerNotes() == null || reviewDto.managerNotes().isBlank())) {
            throw new BadRequestException("REJECTION_REASON_REQUIRED", "error.operations.request.rejection_reason_required", "Vui lòng nhập lý do từ chối đơn.");
        }

        User manager = userRepository.findById(managerUserId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", managerUserId));

        req.setStatus(newStatus);
        req.setManagerNotes(reviewDto.managerNotes() != null ? reviewDto.managerNotes().trim() : null);
        req.setReviewedBy(manager);
        req.setReviewedAt(LocalDateTime.now());
        req.setUpdatedAt(LocalDateTime.now());

        StaffInternalRequest saved = requestRepository.save(req);

        // Send in-app notification to the requester
        if (notificationService != null) {
            String title = msg("APPROVED".equals(newStatus) ? "notifications.operations.approved.title" : "notifications.operations.rejected.title");
            String message = msg("notifications.operations.reviewed.body", saved.getTitle(),
                    manager.getFullName(), msg("operations.status." + newStatus.toLowerCase(java.util.Locale.ROOT)),
                    saved.getManagerNotes() != null ? saved.getManagerNotes() : "");

            notificationService.send(
                    saved.getUser().getId(),
                    title,
                    message,
                    "system",
                    null,
                    saved.getId()
            );
        }

        return mapToDto(saved);
    }

    private StaffInternalRequestDto mapToDto(StaffInternalRequest r) {
        return new StaffInternalRequestDto(
                r.getId(),
                r.getUser().getId(),
                r.getUser().getFullName(),
                r.getUser().getEmail(),
                r.getUser().getRole() != null ? r.getUser().getRole().getCode() : null,
                r.getRequestType(),
                r.getTitle(),
                r.getReason(),
                r.getStartDate(),
                r.getEndDate(),
                r.getTargetShift(),
                r.getReplacementUser() != null ? r.getReplacementUser().getId() : null,
                r.getReplacementUser() != null ? r.getReplacementUser().getFullName() : null,
                r.getStatus(),
                r.getManagerNotes(),
                r.getReviewedBy() != null ? r.getReviewedBy().getId() : null,
                r.getReviewedBy() != null ? r.getReviewedBy().getFullName() : null,
                r.getReviewedAt(),
                r.getCreatedAt(),
                r.getUpdatedAt()
        );
    }
    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }
}
