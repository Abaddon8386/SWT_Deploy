package com.swp391.scms.coaching.service;

import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class CoachBookingService {
    private final com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard;

    private static final int ADVANCE_MINUTES_REQUIRED = 120; // 2 hours
    private static final java.util.Set<String> ALLOWED_PAYMENT_METHODS =
            java.util.Set.of("package_quota", "cash", "bank_transfer");
    private static final int MAX_UNPAID_UPCOMING = 2;
    private static final java.util.Set<String> DESK_ROLES = java.util.Set.of("RECEPTIONIST", "CENTER_MANAGER");

    @Autowired(required = false)
    private com.swp391.scms.finance.repository.PaymentRepository paymentRepository;

    @Autowired(required = false)
    private com.swp391.scms.users.UserRepository userRepository;

    @Autowired(required = false)
    private com.swp391.scms.operations.repository.StaffInternalRequestRepository staffRequestRepository;

    private boolean onLeave(Long coachId, LocalDate date) {
        return staffRequestRepository != null && staffRequestRepository.existsApprovedLeaveOn(coachId, date);
    }
    private static final BigDecimal DEFAULT_HOURLY_RATE = new BigDecimal("200000.00");

    private final CoachBookingRepository coachBookingRepository;
    private final CoachRepository coachRepository;
    private final MemberRepository memberRepository;
    private final ClassSessionRepository classSessionRepository;
    private final ClassEnrollmentRepository classEnrollmentRepository;
    private final MembershipSubscriptionRepository subscriptionRepository;
    private final DisciplineRepository disciplineRepository;
    private final NotificationService notificationService;
    private final Clock clock;
    private final MessageService messageService;

    public CoachBookingService(
            CoachBookingRepository coachBookingRepository,
            CoachRepository coachRepository,
            MemberRepository memberRepository,
            ClassSessionRepository classSessionRepository,
            ClassEnrollmentRepository classEnrollmentRepository,
            MembershipSubscriptionRepository subscriptionRepository,
            DisciplineRepository disciplineRepository,
            Clock clock,
            MessageService messageService) {
        this(coachBookingRepository, coachRepository, memberRepository, classSessionRepository,
                classEnrollmentRepository, subscriptionRepository, disciplineRepository, null, clock, messageService);
    }

    public CoachBookingService(
            CoachBookingRepository coachBookingRepository,
            CoachRepository coachRepository,
            MemberRepository memberRepository,
            ClassSessionRepository classSessionRepository,
            ClassEnrollmentRepository classEnrollmentRepository,
            MembershipSubscriptionRepository subscriptionRepository,
            DisciplineRepository disciplineRepository,
            @Autowired(required = false) NotificationService notificationService,
            Clock clock,
            MessageService messageService) {
        this(coachBookingRepository, coachRepository, memberRepository, classSessionRepository, classEnrollmentRepository, subscriptionRepository, disciplineRepository, notificationService, clock, messageService, null);
    }

    @Autowired
    public CoachBookingService(
            CoachBookingRepository coachBookingRepository,
            CoachRepository coachRepository,
            MemberRepository memberRepository,
            ClassSessionRepository classSessionRepository,
            ClassEnrollmentRepository classEnrollmentRepository,
            MembershipSubscriptionRepository subscriptionRepository,
            DisciplineRepository disciplineRepository,
            @Autowired(required = false) NotificationService notificationService,
            Clock clock,
            MessageService messageService, com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard) {
        this.vnpayGuard = vnpayGuard;
        this.coachBookingRepository = coachBookingRepository;
        this.coachRepository = coachRepository;
        this.memberRepository = memberRepository;
        this.classSessionRepository = classSessionRepository;
        this.classEnrollmentRepository = classEnrollmentRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.disciplineRepository = disciplineRepository;
        this.notificationService = notificationService;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
        this.messageService = messageService;
    }

    @Transactional(readOnly = true)
    public List<CoachPublicDto> getPublicCoaches() {
        return coachRepository.findPublicCoaches().stream()
                .map(c -> new CoachPublicDto(
                        c.getUserId(),
                        c.getUser() != null ? c.getUser().getFullName() : "HLV",
                        c.getUser() != null ? c.getUser().getEmail() : "",
                        c.getUser() != null ? c.getUser().getPhone() : "",
                        c.getSpecialization(),
                        c.getBio(),
                        c.getCertification(),
                        c.getUser() != null ? c.getUser().getAvatarUrl() : null,
                        DEFAULT_HOURLY_RATE
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CoachAvailableSlotDto> getAvailableSlots(Long coachId, LocalDate date, Long currentMemberId) {
        Coach coach = coachRepository.findById(coachId)
                .orElseThrow(() -> new ResourceNotFoundException("Coach", coachId));

        List<ClassSession> coachClasses = classSessionRepository.findActiveByCoachAndDate(coachId, date);
        List<CoachBooking> coachBookings = coachBookingRepository.findActiveByCoachAndDate(coachId, date);

        List<ClassSession> memberClasses = currentMemberId != null ? classSessionRepository.findActiveByMemberAndDate(currentMemberId, date) : List.of();
        List<CoachBooking> memberBookings = currentMemberId != null ? coachBookingRepository.findActiveByMemberAndDate(currentMemberId, date) : List.of();

        LocalDateTime now = LocalDateTime.now(clock);
        List<CoachAvailableSlotDto> slots = new ArrayList<>();
        boolean coachOnLeave = onLeave(coachId, date);

        for (int hour = 6; hour <= 20; hour++) {
            LocalTime start = LocalTime.of(hour, 0);
            LocalTime end = LocalTime.of(hour + 1, 0);

            LocalDateTime slotStartDateTime = LocalDateTime.of(date, start);

            boolean isTooSoon = slotStartDateTime.isBefore(now.plusMinutes(ADVANCE_MINUTES_REQUIRED));

            boolean coachBusy = coachClasses.stream().anyMatch(cs ->
                    start.isBefore(cs.getEndTime()) && end.isAfter(cs.getStartTime()))
                    || coachBookings.stream().anyMatch(cb ->
                    start.isBefore(cb.getEndTime()) && end.isAfter(cb.getStartTime()));

            boolean memberBusy = memberClasses.stream().anyMatch(cs ->
                    start.isBefore(cs.getEndTime()) && end.isAfter(cs.getStartTime()))
                    || memberBookings.stream().anyMatch(mb ->
                    start.isBefore(mb.getEndTime()) && end.isAfter(mb.getStartTime()));

            boolean available = !coachOnLeave && !isTooSoon && !coachBusy && !memberBusy;
            String reason = null;
            if (!available) {
                if (coachOnLeave) {
                    reason = "coach_on_leave";
                } else if (isTooSoon) {
                    reason = "too_soon";
                } else if (coachBusy) {
                    reason = "coach_busy";
                } else {
                    reason = "member_busy";
                }
            }

            slots.add(new CoachAvailableSlotDto(start, end, available, reason));
        }

        return slots;
    }

    @Transactional(readOnly = true)
    public CoachQuotaStatusDto getMemberQuotaStatus(Long memberUserId) {
        List<MembershipSubscription> activeSubs = subscriptionRepository.findByMemberUserIdAndStatus(memberUserId, "active").stream()
                .filter(sub -> sub.getStartDate() != null && sub.getEndDate() != null
                        && !sub.getStartDate().isAfter(LocalDate.now(clock))
                        && !sub.getEndDate().isBefore(LocalDate.now(clock)))
                .toList();
        if (activeSubs.isEmpty()) {
            return new CoachQuotaStatusDto(null, 0, 0, 0);
        }
        MembershipSubscription sub = activeSubs.get(0);
        String pkgName = sub.getMembershipPackage() != null && sub.getMembershipPackage().getName() != null
                ? sub.getMembershipPackage().getName().toUpperCase() : "";

        int monthlyQuota = 0;
        if (pkgName.contains("PLATINUM")) {
            monthlyQuota = 6;
        } else if (pkgName.contains("GOLD")) {
            monthlyQuota = 3;
        }

        LocalDate now = LocalDate.now(clock);
        LocalDate startMonth = now.withDayOfMonth(1);
        LocalDate endMonth = now.withDayOfMonth(now.lengthOfMonth());
        long usedQuota = coachBookingRepository.countMonthlyQuotaUsage(memberUserId, startMonth, endMonth, "package_quota");

        int remaining = Math.max(0, monthlyQuota - (int) usedQuota);
        return new CoachQuotaStatusDto(pkgName, monthlyQuota, (int) usedQuota, remaining);
    }

    @Transactional
    public CoachBookingDto createBooking(AuthenticatedPrincipal principal, CoachBookingCreateDto request) {
        // Row lock serializes concurrent bookings of one member so the quota count below stays exact.
        Member member = memberRepository.findByUserIdForUpdate(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("Member", principal.id()));

        Coach coach = coachRepository.findById(request.coachId())
                .orElseThrow(() -> new ResourceNotFoundException("Coach", request.coachId()));

        if (!"active".equalsIgnoreCase(coach.getEmploymentStatus())) {
            throw new BadRequestException("COACH_INACTIVE", "error.coach.inactive", "Huấn luyện viên hiện không nhận học viên.");
        }
        if (request.bookingDate() != null && onLeave(coach.getUserId(), request.bookingDate())) {
            throw new ConflictException("COACH_ON_LEAVE", "error.coach_booking.coach_on_leave",
                    new Object[]{request.bookingDate()}, "The coach is on approved leave that day.");
        }

        String paymentMethod = request.paymentMethod() != null
                ? request.paymentMethod().trim().toLowerCase(java.util.Locale.ROOT) : "package_quota";
        if (!ALLOWED_PAYMENT_METHODS.contains(paymentMethod)) {
            throw new BadRequestException("INVALID_PAYMENT_METHOD", "error.coach_booking.invalid_payment_method",
                    "Unsupported payment method.");
        }

        if (request.endTime().isBefore(request.startTime()) || request.endTime().equals(request.startTime())) {
            throw new BadRequestException("INVALID_TIME_RANGE", "error.scheduling.invalid_time_range", "Giờ kết thúc phải sau giờ bắt đầu.");
        }

        if (!request.endTime().equals(request.startTime().plusHours(1))
                || request.startTime().getMinute() != 0 || request.startTime().getSecond() != 0
                || request.endTime().getSecond() != 0
                || request.startTime().isBefore(LocalTime.of(6, 0)) || request.endTime().isAfter(LocalTime.of(21, 0))) {
            throw new BadRequestException("INVALID_COACH_BOOKING_SLOT", "error.coach_booking.invalid_slot",
                    "Choose a one-hour slot from 06:00 to 21:00.");
        }

        // Rule 1: Advance booking requirement (at least 2 hours)
        LocalDateTime bookingStart = LocalDateTime.of(request.bookingDate(), request.startTime());
        LocalDateTime now = LocalDateTime.now(clock);
        if (bookingStart.isBefore(now.plusMinutes(ADVANCE_MINUTES_REQUIRED))) {
            throw new BadRequestException(
                    "COACH_BOOKING_TOO_SOON",
                    "error.coach_booking.too_soon",
                    new Object[]{ADVANCE_MINUTES_REQUIRED / 60},
                    "Buổi tập 1:1 với Huấn luyện viên phải được đặt trước ít nhất 2 tiếng."
            );
        }

        // Rule 2: Coach conflict check
        List<ClassSession> coachSessions = classSessionRepository.findActiveByCoachAndDate(coach.getUserId(), request.bookingDate());
        for (ClassSession cs : coachSessions) {
            if (request.startTime().isBefore(cs.getEndTime()) && request.endTime().isAfter(cs.getStartTime())) {
                throw new ConflictException(
                        "COACH_SCHEDULE_CONFLICT",
                        "error.coach_booking.coach_busy",
                        new Object[]{cs.getGymClass().getName(), cs.getStartTime().toString(), cs.getEndTime().toString()},
                        "Huấn luyện viên đã có lịch dạy lớp " + cs.getGymClass().getName() + " trong khung giờ này."
                );
            }
        }

        List<CoachBooking> coachBookings = coachBookingRepository.findActiveByCoachAndDate(coach.getUserId(), request.bookingDate());
        for (CoachBooking cb : coachBookings) {
            if (request.startTime().isBefore(cb.getEndTime()) && request.endTime().isAfter(cb.getStartTime())) {
                throw new ConflictException(
                        "COACH_SCHEDULE_CONFLICT",
                        "error.coach_booking.coach_busy_pt",
                        new Object[]{cb.getStartTime().toString(), cb.getEndTime().toString()},
                        "Huấn luyện viên đã có lịch hẹn 1:1 khác trong khung giờ này."
                );
            }
        }

        // Rule 3: Member conflict check
        List<CoachBooking> memberBookings = coachBookingRepository.findActiveByMemberAndDate(member.getUserId(), request.bookingDate());
        for (CoachBooking mb : memberBookings) {
            if (request.startTime().isBefore(mb.getEndTime()) && request.endTime().isAfter(mb.getStartTime())) {
                throw new ConflictException(
                        "MEMBER_SCHEDULE_CONFLICT",
                        "error.coach_booking.member_busy",
                        new Object[]{mb.getStartTime().toString(), mb.getEndTime().toString()},
                        "Bạn đã có lịch hẹn 1:1 khác trong khung giờ này."
                );
            }
        }

        if (classSessionRepository.findActiveByMemberAndDate(member.getUserId(), request.bookingDate()).stream()
                .anyMatch(cs -> request.startTime().isBefore(cs.getEndTime()) && request.endTime().isAfter(cs.getStartTime()))) {
            throw new ConflictException("MEMBER_SCHEDULE_CONFLICT", "error.coach_booking.member_busy", null,
                    "Bạn đã có lịch học lớp trong khung giờ này.");
        }

        List<MembershipSubscription> validSubscriptions = subscriptionRepository
                .findByMemberUserIdAndStatus(member.getUserId(), "active").stream()
                .filter(sub -> sub.getStartDate() != null && sub.getEndDate() != null
                        && !sub.getStartDate().isAfter(LocalDate.now(clock))
                        && !sub.getEndDate().isBefore(LocalDate.now(clock))
                        && !sub.getStartDate().isAfter(request.bookingDate())
                        && !sub.getEndDate().isBefore(request.bookingDate()))
                .toList();
        if (validSubscriptions.isEmpty()) {
            throw new BadRequestException("MEMBERSHIP_INACTIVE_OR_EXPIRED", "error.coach_booking.no_active_subscription",
                    "Bạn chưa có gói tập đang hoạt động (hoặc gói tập không còn hiệu lực vào ngày đặt lịch). Vui lòng đăng ký hoặc kích hoạt gói tập trước khi đặt lịch HLV 1:1.");
        }

        // Rule 4: Payment / PT Quota verification
        String paymentStatus = "used_quota";

        if ("package_quota".equalsIgnoreCase(paymentMethod)) {
            List<MembershipSubscription> activeSubs = validSubscriptions;
            if (activeSubs.isEmpty()) {
                throw new BadRequestException("MEMBERSHIP_INACTIVE_OR_EXPIRED", "error.coach_booking.no_active_subscription", "Bạn cần có gói tập đang hoạt động để đặt lịch HLV.");
            }

            MembershipSubscription sub = activeSubs.get(0);
            String pkgName = sub.getMembershipPackage() != null && sub.getMembershipPackage().getName() != null
                    ? sub.getMembershipPackage().getName().toUpperCase() : "";

            int monthlyQuota = 0;
            if (pkgName.contains("PLATINUM")) {
                monthlyQuota = 6;
            } else if (pkgName.contains("GOLD")) {
                monthlyQuota = 3;
            }

            if (monthlyQuota == 0) {
                throw new BadRequestException(
                        "COACH_BOOKING_PACKAGE_NO_QUOTA",
                        "error.coach_booking.package_no_quota",
                        "Gói tập hiện tại (Silver) không bao gồm buổi tập 1:1 miễn phí. Vui lòng chọn thanh toán theo giờ (200.000đ/buổi)."
                );
            }

            LocalDate startMonth = request.bookingDate().withDayOfMonth(1);
            LocalDate endMonth = request.bookingDate().withDayOfMonth(request.bookingDate().lengthOfMonth());
            long usedQuota = coachBookingRepository.countMonthlyQuotaUsage(member.getUserId(), startMonth, endMonth, "package_quota");

            if (usedQuota >= monthlyQuota) {
                throw new BadRequestException(
                        "COACH_BOOKING_QUOTA_EXCEEDED",
                        "error.coach_booking.quota_exceeded",
                        new Object[]{monthlyQuota},
                        "Bạn đã sử dụng hết " + monthlyQuota + " lượt tập 1:1 trong tháng này của gói tập. Vui lòng chọn thanh toán theo giờ."
                );
            }
        } else {
            // Hourly sessions are settled at the desk; cap unpaid ones so they cannot become free, unlimited booking.
            if (coachBookingRepository.countUnpaid(member.getUserId()) >= MAX_UNPAID_UPCOMING) {
                throw new ConflictException("COACH_BOOKING_UNPAID_LIMIT", "error.coach_booking.unpaid_limit",
                        new Object[]{MAX_UNPAID_UPCOMING}, "Please settle your unpaid 1:1 sessions first.");
            }
            paymentStatus = "pending";
        }

        Discipline discipline = null;
        if (request.disciplineId() != null) {
            discipline = disciplineRepository.findById(request.disciplineId()).orElse(null);
        }

        CoachBooking booking = new CoachBooking();
        booking.setMember(member);
        booking.setCoach(coach);
        booking.setDiscipline(discipline);
        booking.setBookingDate(request.bookingDate());
        booking.setStartTime(request.startTime());
        booking.setEndTime(request.endTime());
        booking.setHourlyRate(DEFAULT_HOURLY_RATE);
        booking.setPaymentMethod(paymentMethod);
        booking.setPaymentStatus(paymentStatus);
        booking.setStatus("confirmed");
        booking.setNotes(request.notes());

        CoachBooking saved = coachBookingRepository.save(booking);

        // Notify the coach about the new 1:1 private booking
        if (coach.getUser() != null && notificationService != null) {
            String memberName = member.getUser() != null ? member.getUser().getFullName() : "Hội viên";
            String title = msg("notifications.coaching.booking.coach.title");
            String message = msg("notifications.coaching.booking.coach.body",
                    memberName, saved.getBookingDate(), saved.getStartTime().toString().substring(0, 5), saved.getEndTime().toString().substring(0, 5));
            notificationService.send(coach.getUserId(), title, message, "system", null, saved.getId());
        }

        // Notify the member about successful booking
        if (member.getUser() != null && notificationService != null) {
            String coachName = coach.getUser() != null ? coach.getUser().getFullName() : "Huấn luyện viên";
            String title = msg("notifications.coaching.booking.member.title");
            String message = msg("notifications.coaching.booking.member.body",
                    coachName, saved.getBookingDate(), saved.getStartTime().toString().substring(0, 5), saved.getEndTime().toString().substring(0, 5));
            notificationService.send(member.getUserId(), title, message, "system", null, saved.getId());
        }

        return mapToDto(saved);
    }

    /**
     * Books the same 1:1 slot on every chosen weekday of a week or month. Every date goes through the normal
     * single-booking rules (coach/member conflicts, membership, monthly quota, unpaid cap), so dates that fail are
     * reported in {@code skipped} while the rest are kept.
     */
    @Transactional
    public com.swp391.scms.coaching.dto.CoachRecurringResultDto createRecurringBooking(
            AuthenticatedPrincipal principal, com.swp391.scms.coaching.dto.CoachRecurringBookingDto request) {
        List<LocalDate> dates = com.swp391.scms.common.RecurrenceDates.expand(
                request.startDate(), request.period(), request.daysOfWeek());
        coachRepository.findById(request.coachId())
                .orElseThrow(() -> new ResourceNotFoundException("Coach", request.coachId()));
        List<CoachBookingDto> booked = new java.util.ArrayList<>();
        List<com.swp391.scms.common.RecurrenceDates.Skipped> skipped = new java.util.ArrayList<>();
        for (LocalDate date : dates) {
            try {
                booked.add(createBooking(principal, new CoachBookingCreateDto(request.coachId(), request.disciplineId(),
                        date, request.startTime(), request.endTime(), request.paymentMethod(), request.notes())));
            } catch (com.swp391.scms.common.exception.AppException e) {
                String reason = e.getMessageKey() != null
                        ? msg(e.getMessageKey(), e.getMessageArgs() == null ? new Object[0] : e.getMessageArgs())
                        : e.getErrorCode();
                skipped.add(new com.swp391.scms.common.RecurrenceDates.Skipped(date, e.getErrorCode(), reason));
            }
        }
        return new com.swp391.scms.coaching.dto.CoachRecurringResultDto(booked, skipped);
    }

    @Transactional(readOnly = true)
    public List<CoachBookingDto> getMemberBookings(Long memberId) {
        return coachBookingRepository.findByMemberId(memberId).stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CoachBookingDto> getCoachSchedule(Long coachUserId) {
        return coachBookingRepository.findByCoachId(coachUserId).stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public CoachBookingDto cancelBooking(AuthenticatedPrincipal principal, Long bookingId, String reason) {
        CoachBooking booking = coachBookingRepository.findByIdForUpdate(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("CoachBooking", bookingId));
        if (!booking.getMember().getUserId().equals(principal.id()) && !"CENTER_MANAGER".equalsIgnoreCase(principal.role()) && !("COACH".equalsIgnoreCase(principal.role()) && booking.getCoach().getUserId().equals(principal.id()))) {
            throw new ForbiddenException("FORBIDDEN", "error.coach_booking.forbidden_cancel", null, "You cannot cancel this booking.");
        }

        if (vnpayGuard != null) vnpayGuard.coach(bookingId);

        if ("cancelled".equalsIgnoreCase(booking.getStatus())) {
            throw new BadRequestException("ALREADY_CANCELLED", "error.coach_booking.already_cancelled", "Lịch này đã được hủy trước đó.");
        }
        // A session that was held (or has started) is part of attendance, quota and revenue history.
        if ("completed".equalsIgnoreCase(booking.getStatus()) || booking.getBookingDate() == null
                || booking.getStartTime() == null
                || !LocalDateTime.of(booking.getBookingDate(), booking.getStartTime()).isAfter(LocalDateTime.now(clock))) {
            throw new BadRequestException("COACH_BOOKING_CANCEL_TOO_LATE", "error.coach_booking.cancel_too_late", null,
                    "A 1:1 session that has started can no longer be cancelled.");
        }

        if (paymentRepository != null) {
            paymentRepository.findAllByCoachBookingId(bookingId).stream()
                    .filter(payment -> "pending".equals(payment.getStatus()))
                    .forEach(payment -> payment.setStatus("failed"));
        }
        booking.setStatus("cancelled");
        booking.setCancelledAt(LocalDateTime.now(clock));
        booking.setCancelReason(reason != null ? reason : "Hội viên yêu cầu hủy");

        // Notify the coach about cancellation
        if (booking.getCoach() != null && booking.getCoach().getUser() != null && notificationService != null) {
            String memberName = booking.getMember().getUser() != null ? booking.getMember().getUser().getFullName() : "Hội viên";
            String title = msg("notifications.coaching.booking.cancelled.title");
            String message = msg("notifications.coaching.booking.cancelled.body",
                    memberName, booking.getBookingDate(), booking.getStartTime().toString().substring(0, 5), booking.getEndTime().toString().substring(0, 5));
            notificationService.send(booking.getCoach().getUserId(), title, message, "system", null, booking.getId());
        }

        return mapToDto(booking);
    }

    /** Hourly 1:1 sessions waiting for the desk to collect payment, oldest first. */
    @Transactional(readOnly = true)
    public List<CoachBookingDto> getUnpaidBookings(AuthenticatedPrincipal principal) {
        requireDesk(principal);
        return coachBookingRepository.findUnpaid().stream().map(this::mapToDto).toList();
    }

    /**
     * The desk records that an hourly 1:1 session was paid: the booking becomes paid and a successful payment
     * is written so the money appears in revenue reports.
     */
    @Transactional
    public CoachBookingDto confirmHourlyPayment(AuthenticatedPrincipal principal, Long bookingId, String method) {
        requireDesk(principal);
        CoachBooking booking = coachBookingRepository.findByIdForUpdate(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach_booking", bookingId));
        if (vnpayGuard != null) vnpayGuard.coach(bookingId);
        if ("package_quota".equalsIgnoreCase(booking.getPaymentMethod())
                || !"pending".equalsIgnoreCase(booking.getPaymentStatus())
                || "cancelled".equalsIgnoreCase(booking.getStatus())) {
            throw new ConflictException("COACH_BOOKING_PAYMENT_NOT_PENDING",
                    "error.coach_booking.payment_not_pending", null, "This 1:1 session has no payment to collect.");
        }
        String paidWith = method == null || method.isBlank()
                ? "cash" : method.trim().toLowerCase(java.util.Locale.ROOT);
        if (!ALLOWED_PAYMENT_METHODS.contains(paidWith) || "package_quota".equals(paidWith)) {
            throw new BadRequestException("INVALID_PAYMENT_METHOD", "error.coach_booking.invalid_payment_method",
                    "Unsupported payment method.");
        }
        booking.setPaymentMethod(paidWith);
        booking.setPaymentStatus("paid");
        if (paymentRepository != null) {
            com.swp391.scms.finance.entity.Payment payment = new com.swp391.scms.finance.entity.Payment();
            payment.setMember(booking.getMember());
            payment.setAmount(booking.getHourlyRate() != null ? booking.getHourlyRate() : DEFAULT_HOURLY_RATE);
            payment.setMethod(paidWith);
            payment.setStatus("success");
            payment.setPaidAt(LocalDateTime.now(clock));
            payment.setNote("PT #" + booking.getId());
            payment.setCoachBookingId(booking.getId());
            if (userRepository != null) {
                userRepository.findByIdAndDeletedAtIsNull(principal.id()).ifPresent(payment::setReceivedBy);
            }
            var existing = paymentRepository.findAllByCoachBookingId(bookingId);
            if (existing != null && !existing.isEmpty()) {
                if (existing.size() != 1 || !"pending".equals(existing.getFirst().getStatus()))
                    throw new ConflictException("VNPAY_TARGET_UNAVAILABLE", "finance.vnpay.target_unavailable", null, null);
                var pending = existing.getFirst();
                pending.setMethod(payment.getMethod()); pending.setStatus("success");pending.setPaidAt(payment.getPaidAt());pending.setReceivedBy(payment.getReceivedBy());
                paymentRepository.save(pending);
            } else paymentRepository.save(payment);
        }
        return mapToDto(booking);
    }

    private static void requireDesk(AuthenticatedPrincipal principal) {
        if (principal == null || principal.role() == null
                || !DESK_ROLES.contains(principal.role().toUpperCase(java.util.Locale.ROOT))) {
            throw new ForbiddenException("FORBIDDEN", "error.forbidden", null, "Only the front desk can collect 1:1 payments.");
        }
    }

    private CoachBookingDto mapToDto(CoachBooking b) {
        return new CoachBookingDto(
                b.getId(),
                b.getMember().getUserId(),
                b.getMember().getUser() != null ? b.getMember().getUser().getFullName() : "Hội viên",
                b.getCoach().getUserId(),
                b.getCoach().getUser() != null ? b.getCoach().getUser().getFullName() : "HLV",
                b.getCoach().getSpecialization(),
                b.getCoach().getUser() != null ? b.getCoach().getUser().getAvatarUrl() : null,
                b.getDiscipline() != null ? b.getDiscipline().getId() : null,
                b.getDiscipline() != null ? b.getDiscipline().getName() : null,
                b.getBookingDate(),
                b.getStartTime(),
                b.getEndTime(),
                b.getHourlyRate(),
                b.getPaymentMethod(),
                b.getPaymentStatus(),
                b.getStatus(),
                b.getNotes(),
                b.getCreatedAt(),
                b.getCancelledAt(),
                b.getCancelReason()
        );
    }
    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }
}
