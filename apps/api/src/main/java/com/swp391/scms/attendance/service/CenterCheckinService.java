package com.swp391.scms.attendance.service;

import com.swp391.scms.attendance.dto.CheckinRequests;
import com.swp391.scms.attendance.dto.CheckinResponses.CheckinDto;
import com.swp391.scms.attendance.dto.CheckinResponses.StreakDto;
import com.swp391.scms.common.CenterTime;
import com.swp391.scms.attendance.entity.CenterCheckin;
import com.swp391.scms.attendance.repository.CenterCheckinRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.membership.service.DynamicQrService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.time.DayOfWeek;
import java.time.temporal.TemporalAdjusters;

/**
 * Service managing center access QR check-in, checkout, audit trail and daily history (SCRUM-75).
 */
@Service
public class CenterCheckinService {

    public static final int ANTI_PASSBACK_TIMEOUT_HOURS = 12;
    public static final int MAX_HISTORY_DAYS = 31;
    public static final String AUTO_CHECKOUT_NOTE = "SYSTEM_AUTO_CHECKOUT";

    private static final String STATUS_ACTIVE = "active";
    private static final String RESULT_GRANTED = "GRANTED";
    private static final String RESULT_DENIED = "DENIED";

    private static final Set<String> STAFF_SCAN_ROLES = Set.of(
            "CENTER_MANAGER", "RECEPTIONIST", "ADMIN"
    );

    private final CenterCheckinRepository checkins;
    private final MembershipSubscriptionRepository subscriptions;
    private final UserRepository users;
    private final MemberRepository members;
    private final Clock clock;
    private final MessageService messageService;
    private final DynamicQrService dynamicQrService;
    private final GateQrService gateQrService;

    public CenterCheckinService(CenterCheckinRepository checkins,
                                MembershipSubscriptionRepository subscriptions,
                                UserRepository users,
                                MemberRepository members,
                                Clock clock) {
        this(checkins, subscriptions, users, members, clock, null, new DynamicQrService());
    }

    public CenterCheckinService(CenterCheckinRepository checkins,
                                MembershipSubscriptionRepository subscriptions,
                                UserRepository users,
                                MemberRepository members,
                                Clock clock,
                                MessageService messageService) {
        this(checkins, subscriptions, users, members, clock, messageService, new DynamicQrService());
    }

    public CenterCheckinService(CenterCheckinRepository checkins,
                                MembershipSubscriptionRepository subscriptions,
                                UserRepository users,
                                MemberRepository members,
                                Clock clock,
                                MessageService messageService,
                                @Autowired(required = false) DynamicQrService dynamicQrService) {
        this(checkins, subscriptions, users, members, clock, messageService, dynamicQrService,
                new GateQrService(java.util.UUID.randomUUID().toString()));
    }

    @Autowired
    public CenterCheckinService(CenterCheckinRepository checkins,
                                MembershipSubscriptionRepository subscriptions,
                                UserRepository users, MemberRepository members, Clock clock,
                                MessageService messageService, DynamicQrService dynamicQrService,
                                GateQrService gateQrService) {
        this.checkins = checkins;
        this.subscriptions = subscriptions;
        this.users = users;
        this.members = members;
        this.clock = clock;
        this.messageService = messageService;
        this.dynamicQrService = dynamicQrService != null ? dynamicQrService : new DynamicQrService();
        this.gateQrService = gateQrService;
    }

    @Transactional(readOnly = true)
    public com.swp391.scms.attendance.dto.CheckinResponses.GateQrDto gateQr(AuthenticatedPrincipal principal, String gateId) {
        ensureStaff(principal);
        return gateQrService.generate(gateId, clock.millis());
    }

    @Transactional
    public CheckinDto selfScan(AuthenticatedPrincipal principal, CheckinRequests.SelfScan request) {
        if (principal == null || !"MEMBER".equalsIgnoreCase(principal.role())) {
            throw new ForbiddenException("CHECKIN_MEMBER_REQUIRED", "error.forbidden", null, "error.forbidden");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        User recorder = users.findById(principal.id()).orElse(null);
        String gate;
        try {
            String gateId = gateQrService.verify(request.gateQr(), clock.millis());
            gate = gateQrService.gateName(gateId);
        } catch (BadRequestException invalidGate) {
            // Audit rejected gate challenges too (forged, malformed or expired) instead of dropping them silently.
            Member member = members.findByUserIdForUpdate(principal.id()).orElse(null);
            String reasonKey = "GATE_QR_EXPIRED".equals(invalidGate.getErrorCode())
                    ? "error.attendance.gate_qr_expired" : "error.attendance.gate_qr_invalid";
            return saveDeniedRecord(member, now, null, recorder, reasonKey);
        }
        Optional<MembershipSubscription> subscription = subscriptions
                .findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
                        principal.id(), STATUS_ACTIVE, today, today);
        if (subscription.isEmpty()) {
            Member member = members.findByUserIdForUpdate(principal.id()).orElse(null);
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.subscription_not_active");
        }
        return recordEntry(subscription.get(), now, gate, recorder);
    }

    /** Member leaves the center by scanning a valid gate QR; closes their own open GRANTED visit. */
    @Transactional
    public CheckinDto selfCheckout(AuthenticatedPrincipal principal, CheckinRequests.SelfScan request) {
        if (principal == null || !"MEMBER".equalsIgnoreCase(principal.role())) {
            throw new ForbiddenException("CHECKIN_MEMBER_REQUIRED", "error.forbidden", null, "error.forbidden");
        }
        gateQrService.verify(request.gateQr(), clock.millis());
        members.findByUserIdForUpdate(principal.id())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", principal.id()));
        CenterCheckin open = checkins
                .findFirstByMemberUserIdAndCheckOutTimeIsNullOrderByCheckInTimeDesc(principal.id())
                .orElseThrow(() -> new BadRequestException("CHECKIN_NO_OPEN_VISIT",
                        "error.attendance.no_open_visit", null, "No open check-in to check out"));
        open.setCheckOutTime(LocalDateTime.now(clock));
        return toDto(checkins.saveAndFlush(open));
    }

    private String resolveMessage(String key) {
        return messageService != null ? messageService.getMessageOrDefault(key, key) : key;
    }

    /**
     * SCRUM-75 BR-01, BR-02, BR-03, BR-04 & Trigger P4:
     * - BR-01: Chỉ RECEPTIONIST và CENTER_MANAGER (hoặc barrier) mới được gọi API quét mã. Member bị 403.
     * - BR-02 & Trigger P4: Quét QR tra cứu membership_subscriptions (hỗ trợ cả Dynamic QR HMAC-SHA256 lẫn static QR).
     *   result = 'GRANTED' khi: qr tồn tại, subscription có status = 'active', end_date >= CURRENT_DATE.
     *   Nếu không thỏa: result = 'DENIED' kèm denial_reason.
     * - BR-03: MỌI lượt quét (GRANTED hay DENIED) bắt buộc lưu 1 bản ghi vào center_checkins với server time.
     * - BR-04: Anti-passback: Nếu hội viên đã GRANTED mà chưa checkout, chặn GRANTED thứ hai và log DENIED.
     *   Tự động đóng phiên treo quá 12 tiếng để tránh kẹt quyền vào cửa ngày hôm sau.
     */
    @Transactional
    public CheckinDto scan(AuthenticatedPrincipal principal, CheckinRequests.Scan request) {
        ensureStaff(principal);

        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        User recorder = users.findById(principal.id()).orElse(null);

        String rawQr = request.qrCode() != null ? request.qrCode().trim() : "";
        Optional<MembershipSubscription> subOpt;

        // Xử lý Dynamic QR HMAC-SHA256 (nếu mã bắt đầu bằng DYN:)
        if (dynamicQrService.isDynamic(rawQr)) {
            long currentMillis = now.atZone(clock.getZone()).toInstant().toEpochMilli();
            DynamicQrService.VerificationResult qrResult = dynamicQrService.verify(rawQr, currentMillis);
            if (!qrResult.valid()) {
                String reasonKey = qrResult.expired() ? "error.attendance.qr_expired" : "error.attendance.qr_invalid";
                return saveDeniedRecord(null, now, request.gate(), recorder, reasonKey);
            }
            subOpt = subscriptions.findById(qrResult.subscriptionId());
            if (subOpt.isPresent() && (subOpt.get().getMember() == null || !subOpt.get().getMember().getUserId().equals(qrResult.userId()))) {
                return saveDeniedRecord(null, now, request.gate(), recorder, "error.attendance.qr_invalid");
            }
        } else {
            subOpt = subscriptions.findByQrCode(rawQr);
        }

        // Trường hợp 1: Mã QR không tồn tại
        if (subOpt.isEmpty()) {
            return saveDeniedRecord(null, now, request.gate(), recorder, "error.attendance.qr_invalid");
        }

        return recordEntry(subOpt.get(), now, request.gate(), recorder);
    }

    private CheckinDto recordEntry(MembershipSubscription sub, LocalDateTime now, String gate, User recorder) {
        LocalDate today = now.toLocalDate();
        Member member = sub.getMember();

        // Trường hợp 2: Không tìm thấy hội viên liên kết
        if (member == null) {
            return saveDeniedRecord(null, now, gate, recorder, "error.attendance.member_not_found");
        }

        // Serialize every QR belonging to the same member before checking for an open visit.
        member = members.findByUserIdForUpdate(member.getUserId()).orElse(null);
        if (member == null) {
            return saveDeniedRecord(null, now, gate, recorder, "error.attendance.member_not_found");
        }
        User memberUser = member.getUser();
        if (memberUser == null || memberUser.getDeletedAt() != null || !"active".equals(memberUser.getStatus())) {
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.member_inactive");
        }

        // Trường hợp 3: Gói tập chưa active (vd: pending_payment, cancelled)
        if (!STATUS_ACTIVE.equalsIgnoreCase(sub.getStatus())) {
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.subscription_not_active");
        }

        // Trường hợp 4: Gói tập chưa đến ngày hoặc đã hết hạn
        if (sub.getStartDate() != null && sub.getStartDate().isAfter(today)) {
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.subscription_not_active");
        }
        if (sub.getEndDate() != null && sub.getEndDate().isBefore(today)) {
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.subscription_expired");
        }

        // Tự động đóng các lượt check-in GRANTED bị treo quá 12 tiếng của hội viên (giải phóng bẫy anti-passback)
        autoCheckoutStaleVisitsForMember(member.getUserId(), now);

        // Trường hợp 5 (BR-04 Anti-passback): Hội viên đang ở trong phòng tập chưa checkout
        if (checkins.existsByMemberUserIdAndStatusAndCheckOutTimeIsNull(member.getUserId(), RESULT_GRANTED)) {
            return saveDeniedRecord(member, now, gate, recorder, "error.attendance.already_checked_in");
        }

        // Hợp lệ -> GRANTED
        CenterCheckin checkin = new CenterCheckin();
        checkin.setMember(member);
        checkin.setCheckInTime(now);
        checkin.setMethod("qr");
        checkin.setGate(gate);
        checkin.setRecordedBy(recorder);
        checkin.setStatus(RESULT_GRANTED);
        checkin.setDenialReason(null);

        CheckinDto result = toDto(checkins.saveAndFlush(checkin));
        return new CheckinDto(result.id(), result.memberId(), result.memberName(), result.checkInTime(),
                result.checkOutTime(), result.method(), result.gate(), result.status(), result.denialReason(),
                memberUser.getAvatarUrl(), sub.getMembershipPackage() != null ? sub.getMembershipPackage().getName() : null,
                sub.getEndDate() != null ? ChronoUnit.DAYS.between(today, sub.getEndDate()) : null);
    }

    /**
     * Tự động checkout các lượt check-in GRANTED của member bị treo quá 12 tiếng.
     */
    @Transactional
    public void autoCheckoutStaleVisitsForMember(Long memberUserId, LocalDateTime now) {
        if (memberUserId == null) return;
        LocalDateTime cutoff = now.minusHours(ANTI_PASSBACK_TIMEOUT_HOURS);
        List<CenterCheckin> staleVisits = checkins
                .findByMemberUserIdAndStatusAndCheckOutTimeIsNullAndCheckInTimeLessThan(
                        memberUserId, RESULT_GRANTED, cutoff);
        closeStaleVisits(staleVisits, now);
    }

    /**
     * Cron Job chạy lúc 03:00 AM hàng ngày: Tự động đóng các lượt check-in GRANTED chưa checkout của ngày hôm trước
     * với trạng thái ghi chú SYSTEM_AUTO_CHECKOUT, giải phóng hội viên khỏi bẫy anti-passback ngày hôm sau.
     */
    @Scheduled(cron = "${app.attendance.auto-checkout.cron:0 0 3 * * ?}")
    @Transactional
    public int autoCheckoutStaleVisits() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDateTime cutoff = now.minusHours(ANTI_PASSBACK_TIMEOUT_HOURS);
        List<CenterCheckin> staleVisits = checkins
                .findByStatusAndCheckOutTimeIsNullAndCheckInTimeLessThan(RESULT_GRANTED, cutoff);
        return closeStaleVisits(staleVisits, now);
    }

    private int closeStaleVisits(List<CenterCheckin> staleVisits, LocalDateTime now) {
        for (CenterCheckin stale : staleVisits) {
            LocalDateTime defaultEnd = stale.getCheckInTime().plusHours(4);
            stale.setCheckOutTime(defaultEnd.isBefore(now) ? defaultEnd : now);
            stale.setNotes(AUTO_CHECKOUT_NOTE);
            checkins.save(stale);
        }
        return staleVisits.size();
    }

    private CheckinDto saveDeniedRecord(Member member, LocalDateTime now, String gate, User recorder, String reasonKey) {
        CenterCheckin checkin = new CenterCheckin();
        checkin.setMember(member);
        checkin.setCheckInTime(now);
        checkin.setMethod("qr");
        checkin.setGate(gate);
        checkin.setRecordedBy(recorder);
        checkin.setStatus(RESULT_DENIED);
        checkin.setDenialReason(reasonKey);

        return toDto(checkins.saveAndFlush(checkin));
    }

    /**
     * SCRUM-75 BR-05:
     * Ghi nhận giờ rời trung tâm (check_out_time = NOW()).
     * Không cho phép checkout bản ghi đã có check_out_time hoặc bản ghi DENIED.
     */
    @Transactional
    public CheckinDto checkout(AuthenticatedPrincipal principal, Long id) {
        ensureStaff(principal);

        CenterCheckin checkin = checkins.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.checkin", id));

        if (RESULT_DENIED.equalsIgnoreCase(checkin.getStatus())) {
            throw new BadRequestException(
                    "CHECKIN_CANNOT_CHECKOUT_DENIED",
                    "error.attendance.cannot_checkout_denied",
                    null,
                    "Cannot check out a denied check-in record");
        }

        if (checkin.getCheckOutTime() != null) {
            throw new BadRequestException(
                    "CHECKIN_ALREADY_CHECKED_OUT",
                    "error.attendance.already_checked_out",
                    null,
                    "Already checked out");
        }

        checkin.setCheckOutTime(LocalDateTime.now(clock));
        return toDto(checkins.saveAndFlush(checkin));
    }

    /**
     * SCRUM-75 BR-06:
     * Lấy lịch sử ra vào trong ngày tại các cổng (mới nhất trước).
     * Member chỉ được xem lịch sử của chính mình (principal.id()).
     * Staff/Manager xem toàn bộ lịch sử trong ngày.
     */
    @Transactional(readOnly = true)
    public List<CheckinDto> history(AuthenticatedPrincipal principal) {
        return history(principal, null, null);
    }

    /** History for an inclusive date range (default today, at most {@link #MAX_HISTORY_DAYS} days). */
    @Transactional(readOnly = true)
    public List<CheckinDto> history(AuthenticatedPrincipal principal, LocalDate from, LocalDate to) {
        if (principal == null) {
            throw new ForbiddenException("CHECKIN_UNAUTHORIZED", "error.unauthorized", null, "Authentication required");
        }

        LocalDate today = LocalDate.now(clock);
        LocalDate first = from != null ? from : (to != null ? to : today);
        LocalDate last = to != null ? to : (from != null ? today : first);
        if (last.isBefore(first) || ChronoUnit.DAYS.between(first, last) >= MAX_HISTORY_DAYS) {
            throw new BadRequestException("CHECKIN_INVALID_RANGE", "error.attendance.invalid_range", null,
                    "Invalid history date range");
        }
        LocalDateTime startOfDay = first.atStartOfDay();
        LocalDateTime endOfDay = last.plusDays(1).atStartOfDay();

        if (isStaff(principal)) {
            return checkins.findByCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(startOfDay, endOfDay)
                    .stream()
                    .map(this::toDto)
                    .toList();
        }

        // Member xem lịch sử của chính mình
        if ("MEMBER".equalsIgnoreCase(principal.role())) {
            return checkins.findByMemberUserIdAndCheckInTimeGreaterThanEqualAndCheckInTimeLessThanOrderByCheckInTimeDesc(
                    principal.id(), startOfDay, endOfDay)
                    .stream()
                    .map(this::toDto)
                    .toList();
        }

        throw new ForbiddenException("CHECKIN_FORBIDDEN", "error.forbidden", null, "Access denied");
    }

    @Transactional(readOnly = true)
    public StreakDto streak(AuthenticatedPrincipal principal) {
        if (principal == null || !"MEMBER".equalsIgnoreCase(principal.role())) {
            throw new ForbiddenException("CHECKIN_FORBIDDEN", "error.forbidden", null, "Access denied");
        }
        LocalDateTime now = LocalDateTime.now(clock.withZone(CenterTime.ZONE));
        LocalDate today = now.toLocalDate();
        var days = checkins.findGrantedVisitTimes(principal.id(), now).stream()
                .map(LocalDateTime::toLocalDate)
                .collect(Collectors.toCollection(TreeSet::new));
        int longest = 0;
        int run = 0;
        LocalDate previous = null;
        for (LocalDate day : days) {
            run = previous != null && previous.plusDays(1).equals(day) ? run + 1 : 1;
            longest = Math.max(longest, run);
            previous = day;
        }
        int current = 0;
        LocalDate cursor = days.contains(today) ? today : today.minusDays(1);
        while (days.contains(cursor)) {
            current++;
            cursor = cursor.minusDays(1);
        }
        LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(12);
        var recent = List.copyOf(days.tailSet(start));
        return new StreakDto(current, longest, recent.size(), start, today, recent);
    }

    private void ensureStaff(AuthenticatedPrincipal principal) {
        if (!isStaff(principal)) {
            throw new ForbiddenException(
                    "CHECKIN_STAFF_REQUIRED",
                    "error.forbidden",
                    null,
                    "Staff access is required for this operation");
        }
    }

    private boolean isStaff(AuthenticatedPrincipal principal) {
        return principal != null
                && principal.role() != null
                && STAFF_SCAN_ROLES.contains(principal.role().toUpperCase());
    }

    private CheckinDto toDto(CenterCheckin c) {
        Member member = c.getMember();
        String memberName = null;
        if (member != null && member.getUser() != null) {
            memberName = member.getUser().getFullName();
        }
        return new CheckinDto(
                c.getId(),
                member != null ? member.getUserId() : null,
                memberName,
                c.getCheckInTime(),
                c.getCheckOutTime(),
                c.getMethod(),
                c.getGate(),
                c.getStatus(),
                c.getDenialReason() != null ? resolveMessage(c.getDenialReason()) : null
        );
    }
}
