package com.swp391.scms.courts.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.courts.dto.CourtBookingRequests.*;
import com.swp391.scms.courts.dto.CourtBookingResponses.*;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CourtBookingController {
    private final CourtBookingService service;
    private final MessageService messages;
    public CourtBookingController(CourtBookingService service) { this(service, null); }
    @org.springframework.beans.factory.annotation.Autowired
    public CourtBookingController(CourtBookingService service, MessageService messages) {
        this.service = service; this.messages = messages;
    }
    private String msg(String key) { return messages == null ? key : messages.getMessage(key); }

    @GetMapping("/courts")
    @PreAuthorize("hasAnyRole('MEMBER','RECEPTIONIST','STAFF','CENTER_MANAGER')")
    public ApiResponse<List<CourtDto>> courts(@RequestParam(required = false) String discipline) {
        return ApiResponse.ok(msg("success.courts.list"), service.listCourts(discipline));
    }

    @GetMapping("/courts/{roomId}/availability")
    @PreAuthorize("hasAnyRole('MEMBER','RECEPTIONIST','STAFF','CENTER_MANAGER')")
    public ApiResponse<List<SlotDto>> availability(@PathVariable Long roomId, @RequestParam LocalDate date) {
        return ApiResponse.ok(msg("success.courts.availability"), service.availability(roomId, date));
    }

    @PostMapping("/court-bookings")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<BookingDto>> book(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                      @Valid @RequestBody BookRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(msg("success.courts.booked"), service.book(principal, request)));
    }

    @GetMapping("/court-bookings/quota")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<QuotaDto> quota(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                       @RequestParam(required = false) LocalDate date) {
        return ApiResponse.ok(msg("success.courts.quota"), service.quota(principal, date));
    }

    @GetMapping("/court-bookings/my")
    @PreAuthorize("hasRole('MEMBER')")
    public ApiResponse<Page<BookingDto>> my(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                           @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(msg("success.courts.my"), service.my(principal, page, size));
    }

    @GetMapping("/court-bookings")
    @PreAuthorize("hasAnyRole('RECEPTIONIST','STAFF','CENTER_MANAGER')")
    public ApiResponse<Page<BookingDto>> daily(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                              @RequestParam LocalDate date, @RequestParam(required = false) Long roomId,
                                              @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(msg("success.courts.bookings"), service.daily(principal, date, roomId, page, size));
    }

    @PatchMapping("/court-bookings/{id}/cancel")
    @PreAuthorize("hasAnyRole('MEMBER','RECEPTIONIST','STAFF','CENTER_MANAGER')")
    public ApiResponse<BookingDto> cancel(@AuthenticationPrincipal AuthenticatedPrincipal principal, @PathVariable Long id,
                                         @Valid @RequestBody(required = false) CancelRequest request) {
        return ApiResponse.ok(msg("success.courts.cancelled"), service.cancel(principal, id, request == null ? null : request.reason()));
    }

    @PatchMapping("/court-bookings/{id}/confirm-payment")
    @PreAuthorize("hasAnyRole('RECEPTIONIST','STAFF','CENTER_MANAGER')")
    public ApiResponse<BookingDto> confirmPayment(@AuthenticationPrincipal AuthenticatedPrincipal principal, @PathVariable Long id) {
        return ApiResponse.ok(msg("success.courts.payment_confirmed"), service.confirmPayment(principal, id));
    }

    @PostMapping("/court-bookings/recurring")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<RecurringResult>> bookRecurring(@AuthenticationPrincipal AuthenticatedPrincipal principal,
                                                                    @Valid @RequestBody RecurringBookRequest request) {
        RecurringResult result = service.bookRecurring(principal, request);
        String message = msg("success.courts.recurring_booked");
        return result.booked().isEmpty()
                ? ResponseEntity.ok(ApiResponse.ok(message, result))
                : ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(message, result));
    }
}
