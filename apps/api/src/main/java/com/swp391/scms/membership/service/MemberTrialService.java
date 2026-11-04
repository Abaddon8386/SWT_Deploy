package com.swp391.scms.membership.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.CatalogSeeder;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.membership.dto.SubscriptionResponses.SubscriptionDto;
import com.swp391.scms.membership.dto.TrialClaimRequest;
import com.swp391.scms.membership.dto.TrialStatusDto;
import com.swp391.scms.membership.entity.MemberTrialRedemption;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MemberTrialRedemptionRepository;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class MemberTrialService {

    private final MemberTrialRedemptionRepository trialRedemptions;
    private final MemberRepository members;
    private final MembershipSubscriptionRepository subscriptions;
    private final MembershipPackageRepository packages;
    private final NotificationService notifications;
    private final MessageService messageService;
    private final Clock clock;
    private final CccdHasher cccdHasher;

    @Autowired
    public MemberTrialService(
            MemberTrialRedemptionRepository trialRedemptions,
            MemberRepository members,
            MembershipSubscriptionRepository subscriptions,
            MembershipPackageRepository packages,
            @Autowired(required = false) NotificationService notifications,
            @Autowired(required = false) MessageService messageService,
            @Autowired(required = false) Clock clock,
            CccdHasher cccdHasher
    ) {
        this.trialRedemptions = trialRedemptions;
        this.members = members;
        this.subscriptions = subscriptions;
        this.packages = packages;
        this.notifications = notifications;
        this.messageService = messageService;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
        this.cccdHasher = cccdHasher;
    }

    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }

    @Transactional(readOnly = true)
    public TrialStatusDto getTrialStatus(Long memberId) {
        var existing = trialRedemptions.findByMemberUserId(memberId);
        if (existing.isPresent()) {
            MemberTrialRedemption r = existing.get();
            return new TrialStatusDto(
                    false,
                    true,
                    cccdHasher.mask(r.getCccdLast4()),
                    r.getFullName(),
                    r.getRedeemedAt(),
                    r.getSubscription() != null ? r.getSubscription().getId() : null
            );
        }

        // Chỉ hội viên mới (chưa từng có gói nào) mới được nhận trải nghiệm.
        boolean hasAnySubscription = subscriptions.existsByMemberUserId(memberId);

        return new TrialStatusDto(
                !hasAnySubscription,
                false,
                null,
                null,
                null,
                null
        );
    }

    @Transactional
    public SubscriptionDto claimGoldTrial(AuthenticatedPrincipal principal, TrialClaimRequest request) {
        if (principal == null || principal.id() == null) {
            throw new BadRequestException("AUTH_REQUIRED", "error.unauthorized", null, "Authentication required");
        }
        Long memberId = principal.id();
        String cccd = request.cccd().trim();
        String cccdHash = cccdHasher.hash(cccd);
        String fullName = request.fullName().trim();

        // 1. Kiểm tra hội viên đã từng nhận gói thử chưa
        if (trialRedemptions.existsByMemberUserId(memberId)) {
            throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                    msg("trial.already_claimed.member"));
        }

        // 2. Kiểm tra số CCCD đã từng được dùng nhận gói thử chưa
        if (trialRedemptions.existsByCccdHash(cccdHash)) {
            throw new ConflictException("TRIAL_CCCD_ALREADY_USED", "trial.already_claimed.cccd", null,
                    msg("trial.already_claimed.cccd"));
        }

        // 3. Chỉ hội viên chưa từng có gói tập nào mới được nhận gói thử
        if (subscriptions.existsByMemberUserId(memberId)) {
            throw new ConflictException("TRIAL_NOT_NEW_MEMBER", "trial.not_new_member", null,
                    msg("trial.not_new_member"));
        }
        LocalDate today = LocalDate.now(clock);

        Member member = members.findById(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));

        // 4. Tìm gói tập GOLD 1 tháng đang bán (không dùng gói đã retire hoặc gói khác làm fallback)
        MembershipPackage goldPkg = packages.findByStatusOrderByPriceAsc("active").stream()
                .filter(p -> CatalogSeeder.GOLD_NAME.equalsIgnoreCase(p.getName()))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("resource.package", CatalogSeeder.GOLD_NAME));

        // 5. Tạo MembershipSubscription 3 ngày kích hoạt ngay lập tức
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(goldPkg);
        subscription.setStartDate(today);
        subscription.setEndDate(today.plusDays(3));
        subscription.setStatus("active");
        subscription.setUpgradeCharge(BigDecimal.ZERO);
        subscription.setQrCode(UUID.randomUUID().toString());

        MembershipSubscription savedSub;
        try {
            savedSub = subscriptions.saveAndFlush(subscription);

            // 6. Ghi nhận lượt nhận gói thử vào MemberTrialRedemption
            MemberTrialRedemption redemption = new MemberTrialRedemption(member, cccdHash, cccdHasher.last4(cccd), fullName, savedSub);
            trialRedemptions.saveAndFlush(redemption);
        } catch (DataIntegrityViolationException e) {
            // Hai yêu cầu đồng thời cùng vượt qua bước kiểm tra: unique constraint member/cccd chặn bản thứ hai.
            throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                    msg("trial.already_claimed.member"));
        }

        // 7. Gửi thông báo đến hội viên
        if (notifications != null) {
            notifications.send(
                    memberId,
                    msg("trial.claimed.title"),
                    msg("trial.claimed.success"),
                    "membership",
                    "memberships",
                    savedSub.getId()
            );
        }

        return toDto(savedSub);
    }


    private SubscriptionDto toDto(MembershipSubscription s) {
        return new SubscriptionDto(
                s.getId(),
                s.getMember() != null ? s.getMember().getUserId() : null,
                s.getMembershipPackage() != null ? s.getMembershipPackage().getId() : null,
                s.getMembershipPackage() != null ? s.getMembershipPackage().getName() : null,
                s.getPreviousSubscription() != null ? s.getPreviousSubscription().getId() : null,
                s.getStartDate(),
                s.getEndDate(),
                s.getStatus(),
                s.getQrCode(),
                s.getCreatedAt(),
                s.getHoldStatus(),
                s.getHoldReason(),
                s.getHoldRequestedAt(),
                s.getHoldResolvedAt(),
                s.getEndDate(),
                s.getUpgradeCharge()
        );
    }
}

