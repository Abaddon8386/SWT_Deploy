package com.swp391.scms.attendance;

import com.swp391.scms.attendance.dto.CheckinRequests;
import com.swp391.scms.attendance.dto.CheckinResponses.CheckinDto;
import com.swp391.scms.attendance.dto.CheckinResponses.StreakDto;
import com.swp391.scms.attendance.service.CenterCheckinService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controller for center access QR check-in, checkout and daily history (SCRUM-75).
 */
@Tag(name = "Center Check-in", description = "QR check-in, checkout and daily history (SCRUM-75)")
@RestController
@RequestMapping("/api/v1/check-in")
public class CenterCheckinController {

    private final CenterCheckinService service;
    private final MessageService messageService;

    public CenterCheckinController(CenterCheckinService service) {
        this(service, null);
    }

    @Autowired
    public CenterCheckinController(CenterCheckinService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @GetMapping("/gate-qr")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<com.swp391.scms.attendance.dto.CheckinResponses.GateQrDto>> gateQr(
            @AuthenticationPrincipal AuthenticatedPrincipal principal, @RequestParam(defaultValue = "A1") String gate) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.ok(msg("attendance.gate_qr.success"), service.gateQr(principal, gate)));
    }

    @PostMapping("/self")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<CheckinDto>> selfScan(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CheckinRequests.SelfScan request) {
        CheckinDto dto = service.selfScan(principal, request);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.created(msg("GRANTED".equals(dto.status()) ? "attendance.checkin.granted" : "attendance.checkin.denied"), dto));
    }

    @Operation(summary = "Scan a membership QR code at center gate (Staff only)")
    @PostMapping("/scan")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'ADMIN')")
    public ResponseEntity<ApiResponse<CheckinDto>> scan(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CheckinRequests.Scan request) {
        CheckinDto dto = service.scan(principal, request);
        String msgKey = "GRANTED".equalsIgnoreCase(dto.status())
                ? "attendance.checkin.granted"
                : "attendance.checkin.denied";
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg(msgKey), dto));
    }

    @Operation(summary = "Check out of the center (Staff only)")
    @PostMapping("/{id}/checkout")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'ADMIN')")
    public ApiResponse<CheckinDto> checkout(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable Long id) {
        return ApiResponse.ok(msg("attendance.checkout.success"), service.checkout(principal, id));
    }

    @Operation(summary = "Get today's center check-in history")
    @GetMapping("/history")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'MEMBER', 'ADMIN')")
    public ApiResponse<List<CheckinDto>> history(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate fromDate,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate toDate) {
        List<CheckinDto> rows = fromDate == null && toDate == null
                ? service.history(principal)
                : service.history(principal, fromDate, toDate);
        return ApiResponse.ok(msg("attendance.history.success"), rows);
    }

    @Operation(summary = "Member checks out by scanning the gate QR")
    @PostMapping("/self/checkout")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<CheckinDto>> selfCheckout(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CheckinRequests.SelfScan request) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.ok(msg("attendance.self_checkout.success"), service.selfCheckout(principal, request)));
    }

    @Operation(summary = "Get the current member's workout streak")
    @GetMapping("/streak")
    @PreAuthorize("hasRole('MEMBER')")
    public ResponseEntity<ApiResponse<StreakDto>> streak(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(ApiResponse.ok(msg("attendance.streak.success"), service.streak(principal)));
    }
}
