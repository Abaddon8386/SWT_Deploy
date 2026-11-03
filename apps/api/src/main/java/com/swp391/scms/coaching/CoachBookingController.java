package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.service.CoachBookingService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * SCRUM-133: REST Controller for 1-on-1 coach booking (PT hourly booking).
 */
@RestController
@RequestMapping("/api/v1/coach-bookings")
public class CoachBookingController {

    private final CoachBookingService coachBookingService;
    private final MessageService messageService;

    public CoachBookingController(CoachBookingService coachBookingService, MessageService messageService) {
        this.coachBookingService = coachBookingService;
        this.messageService = messageService;
    }

    @GetMapping("/coaches")
    public ResponseEntity<ApiResponse<List<CoachPublicDto>>> getCoaches() {
        List<CoachPublicDto> coaches = coachBookingService.getPublicCoaches();
        String msg = messageService != null
                ? messageService.getMessage("message.coach.list_success", "Lấy danh sách HLV thành công")
                : "Lấy danh sách HLV thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, coaches));
    }

    @GetMapping("/available-slots")
    public ResponseEntity<ApiResponse<List<CoachAvailableSlotDto>>> getAvailableSlots(
            @RequestParam("coachId") Long coachId,
            @RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        Long memberId = principal != null ? principal.id() : null;
        List<CoachAvailableSlotDto> slots = coachBookingService.getAvailableSlots(coachId, date, memberId);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.slots_success", "Lấy danh sách khung giờ thành công")
                : "Lấy danh sách khung giờ thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, slots));
    }

    @GetMapping("/quota-status")
    public ResponseEntity<ApiResponse<CoachQuotaStatusDto>> getQuotaStatus(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        CoachQuotaStatusDto status = coachBookingService.getMemberQuotaStatus(principal.id());
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.quota_success", "Lấy trạng thái hạn mức PT thành công")
                : "Lấy trạng thái hạn mức PT thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, status));
    }

    @PostMapping("/recurring")
    public ResponseEntity<ApiResponse<CoachRecurringResultDto>> createRecurringBooking(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CoachRecurringBookingDto request) {
        CoachRecurringResultDto result = coachBookingService.createRecurringBooking(principal, request);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.recurring_success", "Đặt lịch HLV 1:1 định kỳ thành công")
                : "Đặt lịch HLV 1:1 định kỳ thành công";
        return result.booked().isEmpty()
                ? ResponseEntity.ok(ApiResponse.ok(msg, result))
                : ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(msg, result));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CoachBookingDto>> createBooking(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CoachBookingCreateDto request) {
        CoachBookingDto booking = coachBookingService.createBooking(principal, request);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.created_success", "Đặt lịch HLV 1:1 thành công")
                : "Đặt lịch HLV 1:1 thành công";
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(msg, booking));
    }

    @GetMapping("/my")
    public ResponseEntity<ApiResponse<List<CoachBookingDto>>> getMyBookings(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<CoachBookingDto> bookings = coachBookingService.getMemberBookings(principal.id());
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.my_list_success", "Lấy danh sách lịch 1:1 thành công")
                : "Lấy danh sách lịch 1:1 thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, bookings));
    }

    @GetMapping("/coach-schedule")
    public ResponseEntity<ApiResponse<List<CoachBookingDto>>> getCoachSchedule(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<CoachBookingDto> schedule = coachBookingService.getCoachSchedule(principal.id());
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.coach_schedule_success", "Lấy danh sách lịch dạy kèm 1:1 thành công")
                : "Lấy danh sách lịch dạy kèm 1:1 thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, schedule));
    }

    @GetMapping("/unpaid")
    public ResponseEntity<ApiResponse<List<CoachBookingDto>>> getUnpaidBookings(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<CoachBookingDto> bookings = coachBookingService.getUnpaidBookings(principal);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.unpaid_list", "Danh sách buổi 1:1 chưa thanh toán")
                : "Danh sách buổi 1:1 chưa thanh toán";
        return ResponseEntity.ok(ApiResponse.ok(msg, bookings));
    }

    @PostMapping("/{id}/confirm-payment")
    public ResponseEntity<ApiResponse<CoachBookingDto>> confirmPayment(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable("id") Long id,
            @RequestParam(value = "method", required = false) String method) {
        CoachBookingDto paid = coachBookingService.confirmHourlyPayment(principal, id, method);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.payment_confirmed", "Đã xác nhận thu tiền buổi 1:1")
                : "Đã xác nhận thu tiền buổi 1:1";
        return ResponseEntity.ok(ApiResponse.ok(msg, paid));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<CoachBookingDto>> cancelBooking(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable("id") Long id,
            @RequestParam(value = "reason", required = false) String reason) {
        CoachBookingDto cancelled = coachBookingService.cancelBooking(principal, id, reason);
        String msg = messageService != null
                ? messageService.getMessage("message.coach_booking.cancelled_success", "Hủy lịch 1:1 thành công")
                : "Hủy lịch 1:1 thành công";
        return ResponseEntity.ok(ApiResponse.ok(msg, cancelled));
    }
}
