package com.swp391.scms.scheduling;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.scheduling.dto.SessionBookingRequests.BulkBookRequest;
import com.swp391.scms.scheduling.dto.SessionBookingRequests.BulkCancelRequest;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkBookResult;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.BulkCancelResult;
import com.swp391.scms.scheduling.dto.SessionBookingResponses.SessionBookingDto;
import com.swp391.scms.scheduling.service.SessionBookingService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Per-session class booking: one session, any hand-picked set, a whole week or month, and their cancellation. */
@Tag(name = "Session Bookings", description = "Book and cancel individual class sessions, singly or in bulk")
@RestController
@RequestMapping("/api/v1/classes")
public class SessionBookingController {

    private final SessionBookingService service;
    private final MessageService messageService;

    public SessionBookingController(SessionBookingService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Book one class session for the authenticated member")
    @PostMapping("/sessions/{id}/bookings")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<SessionBookingDto>> book(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                              @PathVariable Long id) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("scheduling.booking.created"), service.book(principal, id)));
    }

    @Operation(summary = "Book many sessions at once (a week, a month or a hand-picked set); failures are reported per session")
    @PostMapping("/session-bookings/bulk")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<BulkBookResult>> bookMany(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                               @Valid @RequestBody BulkBookRequest request) {
        BulkBookResult result = service.bookMany(principal, request.sessionIds());
        String message = msg("scheduling.booking.bulk_done");
        return result.booked().isEmpty()
                ? ResponseEntity.ok(ApiResponse.ok(message, result))
                : ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(message, result));
    }

    @Operation(summary = "List the authenticated member's session bookings, optionally by status and date range")
    @GetMapping("/session-bookings/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<List<SessionBookingDto>> mine(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(msg("scheduling.booking.list"), service.myBookings(principal, status, from, to));
    }

    @Operation(summary = "Cancel one session booking (owner or staff)")
    @DeleteMapping("/session-bookings/{id}")
    @PreAuthorize("hasAnyRole('MEMBER', 'CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<SessionBookingDto> cancel(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                @PathVariable Long id) {
        return ApiResponse.ok(msg("scheduling.booking.cancelled"), service.cancel(principal, id));
    }

    @Operation(summary = "Cancel many session bookings at once; failures are reported per booking")
    @PostMapping("/session-bookings/cancel")
    @PreAuthorize("hasAnyRole('MEMBER', 'CENTER_MANAGER', 'RECEPTIONIST')")
    public ApiResponse<BulkCancelResult> cancelMany(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                   @Valid @RequestBody BulkCancelRequest request) {
        return ApiResponse.ok(msg("scheduling.booking.bulk_cancelled"), service.cancelMany(principal, request.bookingIds()));
    }
}
