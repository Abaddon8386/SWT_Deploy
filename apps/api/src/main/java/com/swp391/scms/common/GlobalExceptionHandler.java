package com.swp391.scms.common;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.swp391.scms.common.i18n.MessageService;
import java.util.HashMap;
import java.util.Map;

/**
 * Centralized exception handler for all REST controllers.
 * Maps application and database errors into standardized API responses,
 * with i18n multi-language support.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final MessageService messageService;

    public GlobalExceptionHandler() {
        this.messageService = null;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public GlobalExceptionHandler(MessageService messageService) {
        this.messageService = messageService;
    }

    private String resolveMessage(String code, String defaultMessage, Object... args) {
        if (messageService != null) {
            Object[] resolvedArgs = args;
            if (args != null && args.length > 0) {
                resolvedArgs = new Object[args.length];
                for (int i = 0; i < args.length; i++) {
                    if (args[i] instanceof String strArg && (strArg.startsWith("resource.") || strArg.startsWith("role."))) {
                        resolvedArgs[i] = messageService.getMessageOrDefault(strArg, strArg);
                    } else {
                        resolvedArgs[i] = args[i];
                    }
                }
            }
            return messageService.getMessageOrDefault(code, defaultMessage, resolvedArgs);
        }
        return defaultMessage;
    }

    /**
     * Handles custom business application exceptions.
     */
    @ExceptionHandler(AppException.class)
    public ResponseEntity<ApiResponse<Object>> handleAppException(AppException ex) {
        log.warn("Application exception [{}]: {}", ex.getErrorCode(), ex.getMessage());
        String message = ex.getMessageKey() != null
                ? resolveMessage(ex.getMessageKey(), ex.getMessage(), ex.getMessageArgs() != null ? ex.getMessageArgs() : new Object[0])
                : ex.getMessage();
        ApiResponse<Object> response = ApiResponse.error(
                ex.getStatus().value(),
                ex.getErrorCode(),
                message,
                ex.getDetails()
        );
        return ResponseEntity.status(ex.getStatus()).body(response);
    }

    /**
     * Handles ResourceNotFoundException specifically.
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleResourceNotFound(ResourceNotFoundException ex) {
        String message = ex.getMessageKey() != null
                ? resolveMessage(ex.getMessageKey(), ex.getMessage(), ex.getMessageArgs() != null ? ex.getMessageArgs() : new Object[0])
                : ex.getMessage();
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.NOT_FOUND.value(),
                ex.getErrorCode(),
                message
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
    }

    /**
     * Handles bean validation errors (@Valid on request bodies).
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(err -> {
            String defaultMsg = err.getDefaultMessage();
            if (defaultMsg != null && defaultMsg.startsWith("{") && defaultMsg.endsWith("}")) {
                String key = defaultMsg.substring(1, defaultMsg.length() - 1);
                defaultMsg = resolveMessage(key, defaultMsg);
            }
            errors.put(err.getField(), defaultMsg);
        });

        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.BAD_REQUEST.value(),
                "VALIDATION_ERROR",
                resolveMessage("error.validation", "error.validation"),
                errors
        );
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles constraint violation errors on query params or entities.
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleConstraintViolation(ConstraintViolationException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getConstraintViolations().forEach(cv ->
                errors.put(cv.getPropertyPath().toString(), cv.getMessage())
        );

        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.BAD_REQUEST.value(),
                "CONSTRAINT_VIOLATION",
                resolveMessage("error.constraint_violation", "error.constraint_violation"),
                errors
        );
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles Spring Security access denied (HTTP 403).
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Object>> handleAccessDenied(AccessDeniedException ex) {
        log.warn("Access denied: {}", ex.getMessage());
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.FORBIDDEN.value(),
                "FORBIDDEN",
                resolveMessage("error.forbidden", "error.forbidden")
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(response);
    }

    /**
     * Handles Spring Security authentication failures (HTTP 401).
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Object>> handleAuthentication(AuthenticationException ex) {
        log.warn("Authentication failure: {}", ex.getMessage());
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.UNAUTHORIZED.value(),
                "UNAUTHORIZED",
                resolveMessage("error.unauthorized", "error.unauthorized")
        );
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
    }

    /**
     * Handles illegal arguments and invalid states.
     */
    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<ApiResponse<Object>> handleIllegalArgument(RuntimeException ex) {
        log.warn("Illegal argument / state: {}", ex.getMessage());
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.BAD_REQUEST.value(),
                "BAD_REQUEST",
                ex.getMessage()
        );
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles database integrity and PostgreSQL trigger violations.
     * Invariants from AGENTS.md & PROJECT_MASTER_GUIDE.md:
     * - trg_enrollments_check_capacity (Capacity Exceeded)
     * - trg_sessions_check_conflict (Coach / Room Schedule Overlap)
     * - trg_member_schedule_conflict (one member in two overlapping classes)
     * - trg_enrollments_check_membership & trg_checkins_check_membership (Active Subscription)
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleDataIntegrity(DataIntegrityViolationException ex) {
        String rootMsg = ex.getRootCause() != null ? ex.getRootCause().getMessage() : ex.getMessage();
        String normalizedRootMsg = rootMsg == null ? "" : rootMsg.toLowerCase(java.util.Locale.ROOT);
        log.error("Data integrity violation from {}", ex.getMostSpecificCause().getClass().getSimpleName());

        if (rootMsg != null) {
            String courtCode = null;
            String courtKey = null;
            HttpStatus courtStatus = HttpStatus.CONFLICT;
            if (normalizedRootMsg.contains("trg_court_bookings_check_conflict") || normalizedRootMsg.contains("court_booking_slot_taken")) {
                courtCode = "COURT_BOOKING_SLOT_TAKEN";
                courtKey = "slot_taken";
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_membership") || normalizedRootMsg.contains("court_booking_membership_invalid")) {
                courtCode = "COURT_BOOKING_MEMBERSHIP_INVALID";
                courtKey = "membership_invalid";
                courtStatus = HttpStatus.FORBIDDEN;
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_limit") || normalizedRootMsg.contains("court_booking_limit_reached")) {
                courtCode = "COURT_BOOKING_LIMIT_REACHED";
                courtKey = "limit_reached";
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_court") || normalizedRootMsg.contains("court_booking_court_unavailable")) {
                courtCode = "COURT_BOOKING_COURT_UNAVAILABLE";
                courtKey = "court_unavailable";
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_past") || normalizedRootMsg.contains("court_booking_past_slot")) {
                courtCode = "COURT_BOOKING_PAST_SLOT";
                courtKey = "past_slot";
                courtStatus = HttpStatus.BAD_REQUEST;
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_horizon") || normalizedRootMsg.contains("court_booking_too_far")) {
                courtCode = "COURT_BOOKING_TOO_FAR";
                courtKey = "too_far";
                courtStatus = HttpStatus.BAD_REQUEST;
            } else if (normalizedRootMsg.contains("trg_court_bookings_check_slot") || normalizedRootMsg.contains("court_booking_invalid_slot")) {
                courtCode = "COURT_BOOKING_INVALID_SLOT";
                courtKey = "invalid_slot";
                courtStatus = HttpStatus.BAD_REQUEST;
            }
            if (courtCode != null) {
                String key = "error.courts." + courtKey;
                return ResponseEntity.status(courtStatus).body(
                        ApiResponse.error(courtStatus.value(), courtCode, resolveMessage(key, key)));
            }
            if (normalizedRootMsg.contains("trg_coach_bookings_rest_required")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "COACH_REST_REQUIRED",
                                resolveMessage("error.coach_booking.rest_required", "error.coach_booking.rest_required")));
            }
            if (normalizedRootMsg.contains("trg_pt_schedule_busy")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "SCHEDULE_UPDATE_IN_PROGRESS",
                                resolveMessage("error.scheduling.update_in_progress", "error.scheduling.update_in_progress"))
                );
            }
            if (normalizedRootMsg.contains("trg_enrollments_check_capacity")
                    || normalizedRootMsg.contains("trg_session_bookings_check_capacity")
                    || normalizedRootMsg.contains("buổi học đã đầy chỗ (vượt quá capacity cho phép).")
                    || normalizedRootMsg.contains("lớp học đã đầy chỗ (vượt quá capacity cho phép).")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "CLASS_CAPACITY_EXCEEDED",
                                resolveMessage("error.scheduling.class_full", "invariant.capacity_exceeded"))
                );
            }
            if (normalizedRootMsg.contains("trg_member_schedule_conflict")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "SCHEDULING_MEMBER_TIME_OVERLAP",
                                resolveMessage("error.scheduling.member_class_overlap", "error.scheduling.member_class_overlap"))
                );
            }
            if (normalizedRootMsg.contains("trg_sessions_check_conflict")
                    || normalizedRootMsg.contains("coach_schedule_conflict")
                    || normalizedRootMsg.contains("member_schedule_conflict")
                    || normalizedRootMsg.contains("huấn luyện viên hoặc phòng tập đã có lịch trùng khung giờ này.")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "SCHEDULE_CONFLICT",
                                resolveMessage("error.scheduling.session_conflict", "invariant.schedule_conflict"))
                );
            }
            if (normalizedRootMsg.contains("trg_enrollments_check_membership") || normalizedRootMsg.contains("trg_checkins_check_membership")
                    || normalizedRootMsg.contains("học viên không có gói thành viên còn hiệu lực để đăng ký lớp.")
                    || normalizedRootMsg.contains("học viên không có gói thành viên còn hiệu lực để check-in.")) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                        ApiResponse.error(HttpStatus.FORBIDDEN.value(), "MEMBERSHIP_INACTIVE_OR_EXPIRED",
                                resolveMessage("error.scheduling.membership_expired_or_inactive", "invariant.membership_inactive_or_expired"))
                );
            }
            if (normalizedRootMsg.contains("ck_product_variants_stock_nonneg")
                    || normalizedRootMsg.contains("ck_product_variants_values")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "PRODUCT_OUT_OF_STOCK",
                                resolveMessage("error.shop.product_out_of_stock", "error.shop.product_out_of_stock"))
                );
            }
            if (normalizedRootMsg.contains("duplicate") || normalizedRootMsg.contains("unique constraint") || normalizedRootMsg.contains("uq_")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "DUPLICATE_RESOURCE",
                                resolveMessage("invariant.duplicate_resource", "invariant.duplicate_resource"))
                );
            }
            if (normalizedRootMsg.contains("foreign key") || normalizedRootMsg.contains("fk_")) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(
                        ApiResponse.error(HttpStatus.CONFLICT.value(), "FOREIGN_KEY_VIOLATION",
                                resolveMessage("invariant.foreign_key_violation", "invariant.foreign_key_violation"))
                );
            }
        }

        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.CONFLICT.value(),
                "DATA_INTEGRITY_VIOLATION",
                resolveMessage("invariant.data_integrity", "invariant.data_integrity")
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }

    /**
     * Handles malformed JSON payloads.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Object>> handleMalformedJson(HttpMessageNotReadableException ex) {
        log.warn("Malformed JSON request: {}", ex.getMessage());
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.BAD_REQUEST.value(),
                "MALFORMED_JSON_REQUEST",
                resolveMessage("error.malformed_json", "error.malformed_json")
        );
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles missing or mistyped request parameters.
     */
    @ExceptionHandler({org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiResponse<Object>> handleBadParameter(Exception ex) {
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.BAD_REQUEST.value(),
                "INVALID_REQUEST_PARAMETER",
                resolveMessage("error.invalid_parameter", "error.invalid_parameter")
        );
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles unsupported HTTP methods.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                "METHOD_NOT_ALLOWED",
                resolveMessage("error.method_not_allowed", "error.method_not_allowed", ex.getMethod())
        );
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(response);
    }

    /**
     * Handles non-existent API routes.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleNoResourceFound(NoResourceFoundException ex) {
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.NOT_FOUND.value(),
                "ENDPOINT_NOT_FOUND",
                resolveMessage("error.endpoint_not_found", "error.endpoint_not_found", ex.getResourcePath())
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
    }

    /**
     * Fallback for any unhandled exceptions (HTTP 500).
     */
    @ExceptionHandler(org.springframework.web.context.request.async.AsyncRequestNotUsableException.class)
    public void handleAsyncRequestNotUsable(org.springframework.web.context.request.async.AsyncRequestNotUsableException ex) {
        log.debug("Client closed connection before response completed: {}", ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleGeneral(Exception ex) {
        log.error("Unhandled server error: ", ex);
        ApiResponse<Object> response = ApiResponse.error(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "INTERNAL_SERVER_ERROR",
                resolveMessage("error.internal", "error.internal")
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }
}
