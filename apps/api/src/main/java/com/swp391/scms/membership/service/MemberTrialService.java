package com.swp391.scms.membership.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.CatalogSeeder;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.membership.dto.ReceptionTrialDto;
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
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class MemberTrialService {

    public static final int TRIAL_DAYS = 3;

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
            return toStatusDto(existing.get());
        }

        boolean hasAnySubscription = subscriptions.existsByMemberUserId(memberId);

        return new TrialStatusDto(
                !hasAnySubscription,
                false,
                "NONE",
                MemberTrialRedemption.DOC_CCCD,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                CatalogSeeder.TRIAL_PACKAGE_NAME,
                1
        );
    }

    public void validateDocument(String docType, String docNumber, String nationality) {
        if (docNumber == null || docNumber.isBlank()) {
            throw new BadRequestException("TRIAL_DOCUMENT_REQUIRED", "validation.trial.document_number.required", null,
                    msg("validation.trial.document_number.required"));
        }
        String cleanDoc = docNumber.trim();
        if (MemberTrialRedemption.DOC_PASSPORT.equalsIgnoreCase(docType)) {
            if (nationality == null || nationality.isBlank() || isVietnamese(nationality)) {
                throw new BadRequestException("TRIAL_PASSPORT_FOREIGN_ONLY", "trial.passport.foreign_only", null,
                        msg("trial.passport.foreign_only"));
            }
            if (!cleanDoc.matches("^[A-Za-z0-9]{6,15}$")) {
                throw new BadRequestException("TRIAL_PASSPORT_INVALID", "trial.passport.format", null,
                        msg("trial.passport.format"));
            }
        } else {
            // CCCD
            if (!cleanDoc.matches("^(\\d{9}|\\d{12})$")) {
                throw new BadRequestException("TRIAL_CCCD_INVALID", "validation.trial.cccd.format", null,
                        msg("validation.trial.cccd.format"));
            }
        }
    }

    private boolean isVietnamese(String nationality) {
        if (nationality == null) return false;
        String s = nationality.trim().toUpperCase(Locale.ROOT);
        return s.equals("VN") || s.equals("VNM") || s.equals("VIETNAM") || s.equals("VIỆT NAM") || s.equals("VIET NAM");
    }

    @Transactional
    public TrialStatusDto requestTrial(AuthenticatedPrincipal principal, TrialClaimRequest request) {
        if (principal == null || principal.id() == null) {
            throw new BadRequestException("AUTH_REQUIRED", "error.unauthorized", null, "Authentication required");
        }
        Long memberId = principal.id();
        String docType = request.resolvedDocumentType();
        String docNumber = request.resolvedDocumentNumber();
        String fullName = request.fullName().trim();
        String nationality = request.nationality() != null ? request.nationality().trim() : null;
        String frontImageUrl = request.frontImageUrl() != null ? request.frontImageUrl().trim() : null;
        String backImageUrl = request.backImageUrl() != null ? request.backImageUrl().trim() : null;

        // 1. Kiểm tra định dạng giấy tờ & quốc tịch
        validateDocument(docType, docNumber, nationality);

        String docHash = cccdHasher.hash(docNumber);

        // 2. Chỉ hội viên chưa từng có gói tập nào mới được gửi yêu cầu trải nghiệm
        if (subscriptions.existsByMemberUserId(memberId)) {
            throw new ConflictException("TRIAL_NOT_NEW_MEMBER", "trial.not_new_member", null,
                    msg("trial.not_new_member"));
        }

        // 3. Kiểm tra số giấy tờ này đã được tài khoản khác sử dụng chưa
        if (trialRedemptions.existsByCccdHashAndMemberUserIdNot(docHash, memberId)) {
            throw new ConflictException("TRIAL_DOCUMENT_ALREADY_USED", "trial.already_claimed.document", null,
                    msg("trial.already_claimed.document"));
        }

        // 4. Kiểm tra đơn yêu cầu của chính hội viên này
        var existingOpt = trialRedemptions.findByMemberUserId(memberId);
        MemberTrialRedemption redemption;
        if (existingOpt.isPresent()) {
            redemption = existingOpt.get();
            if (MemberTrialRedemption.STATUS_APPROVED.equalsIgnoreCase(redemption.getStatus())) {
                throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                        msg("trial.already_claimed.member"));
            }
            if (MemberTrialRedemption.STATUS_PENDING.equalsIgnoreCase(redemption.getStatus())) {
                throw new ConflictException("TRIAL_REQUEST_PENDING", "trial.request.already_pending", null,
                        msg("trial.request.already_pending"));
            }
            // Nếu đơn trước bị REJECTED: cập nhật lại thông tin mới để Lễ tân duyệt lại
            redemption.setDocumentType(docType);
            redemption.setCccdHash(docHash);
            redemption.setCccdLast4(cccdHasher.last4(docNumber));
            redemption.setFullName(fullName);
            redemption.setNationality(nationality);
            redemption.setFrontImageUrl(frontImageUrl);
            redemption.setBackImageUrl(backImageUrl);
            redemption.setStatus(MemberTrialRedemption.STATUS_PENDING);
            redemption.setRejectionReason(null);
            redemption.setReviewedBy(null);
            redemption.setReviewedAt(null);
            redemption.setRedeemedAt(LocalDateTime.now(clock));
        } else {
            // Kiểm tra hash trên toàn bộ nếu chưa có bản ghi của member
            if (trialRedemptions.existsByCccdHash(docHash)) {
                throw new ConflictException("TRIAL_DOCUMENT_ALREADY_USED", "trial.already_claimed.document", null,
                        msg("trial.already_claimed.document"));
            }
            Member member = members.findById(memberId)
                    .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));
            redemption = new MemberTrialRedemption();
            redemption.setMember(member);
            redemption.setDocumentType(docType);
            redemption.setCccdHash(docHash);
            redemption.setCccdLast4(cccdHasher.last4(docNumber));
            redemption.setFullName(fullName);
            redemption.setNationality(nationality);
            redemption.setFrontImageUrl(frontImageUrl);
            redemption.setBackImageUrl(backImageUrl);
            redemption.setStatus(MemberTrialRedemption.STATUS_PENDING);
            redemption.setRedeemedAt(LocalDateTime.now(clock));
        }

        MemberTrialRedemption saved;
        try {
            saved = trialRedemptions.saveAndFlush(redemption);
        } catch (DataIntegrityViolationException e) {
            for (Throwable cause = e; cause != null; cause = cause.getCause()) {
                if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint) {
                    if ("uq_trial_cccd_hash".equalsIgnoreCase(constraint.getConstraintName())) {
                        throw new ConflictException("TRIAL_DOCUMENT_ALREADY_USED", "trial.already_claimed.document", null,
                                msg("trial.already_claimed.document"));
                    }
                    if ("uq_trial_member".equalsIgnoreCase(constraint.getConstraintName())) {
                        throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                                msg("trial.already_claimed.member"));
                    }
                }
            }
            throw e;
        }

        if (notifications != null) {
            notifications.send(
                    memberId,
                    msg("trial.request.submitted_title"),
                    msg("trial.request.submitted_body"),
                    "system",
                    "member_trial_redemption",
                    saved.getId()
            );
        }

        return toStatusDto(saved);
    }

    @Transactional
    public ReceptionTrialDto approveTrial(AuthenticatedPrincipal reviewer, Long trialId) {
        MembershipSubscription savedSub = approveTrialInternal(reviewer, trialId);
        MemberTrialRedemption updated = trialRedemptions.findById(trialId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.trial", trialId));
        return toReceptionDto(updated);
    }

    private MembershipSubscription approveTrialInternal(AuthenticatedPrincipal reviewer, Long trialId) {
        MemberTrialRedemption redemption = trialRedemptions.findById(trialId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.trial", trialId));

        if (MemberTrialRedemption.STATUS_APPROVED.equalsIgnoreCase(redemption.getStatus())) {
            throw new ConflictException("TRIAL_ALREADY_APPROVED", "trial.already_approved", null,
                    "Đơn đăng ký gói trải nghiệm này đã được phê duyệt trước đó.");
        }

        Member member = redemption.getMember();
        if (member == null) {
            throw new ResourceNotFoundException("resource.member", trialId);
        }

        // Đồng bộ họ tên User theo họ tên trên giấy tờ đã xác minh
        if (member.getUser() != null) {
            member.getUser().setFullName(redemption.getFullName());
        }
        member.setDocumentType(redemption.getDocumentType());
        member.setCitizenId(redemption.getCccdLast4());
        member.setNationality(redemption.getNationality());
        member.setFrontImageUrl(redemption.getFrontImageUrl());
        member.setBackImageUrl(redemption.getBackImageUrl());
        member.setIdentityVerified(true);
        member.setIdentityVerifiedAt(LocalDateTime.now(clock));

        // Tìm gói tập trải nghiệm 3 ngày (fallback gói Gold nếu chưa seed)
        MembershipPackage trialPkg = packages.findByStatusOrderByPriceAsc("active").stream()
                .filter(p -> CatalogSeeder.TRIAL_PACKAGE_NAME.equalsIgnoreCase(p.getName())
                        || (p.getDurationDays() == 3 && p.getPrice().compareTo(BigDecimal.ZERO) == 0))
                .findFirst()
                .orElseGet(() -> packages.findByStatusOrderByPriceAsc("active").stream()
                        .filter(p -> CatalogSeeder.GOLD_NAME.equalsIgnoreCase(p.getName()))
                        .findFirst()
                        .orElseThrow(() -> new ResourceNotFoundException("resource.package", CatalogSeeder.TRIAL_PACKAGE_NAME)));

        LocalDate today = LocalDate.now(clock);
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(trialPkg);
        subscription.setStartDate(today);
        subscription.setEndDate(today.plusDays(TRIAL_DAYS));
        subscription.setStatus("active");
        subscription.setUpgradeCharge(BigDecimal.ZERO);
        subscription.setQrCode(UUID.randomUUID().toString());

        MembershipSubscription savedSub = subscriptions.saveAndFlush(subscription);

        redemption.setSubscription(savedSub);
        redemption.setStatus(MemberTrialRedemption.STATUS_APPROVED);
        redemption.setReviewedBy(reviewer != null ? reviewer.id() : null);
        redemption.setReviewedAt(LocalDateTime.now(clock));
        trialRedemptions.saveAndFlush(redemption);

        if (notifications != null) {
            notifications.send(
                    member.getUserId(),
                    msg("trial.approved.title"),
                    msg("trial.approved.body"),
                    "system",
                    "membership_subscription",
                    savedSub.getId()
            );
        }

        return savedSub;
    }

    @Transactional
    public ReceptionTrialDto rejectTrial(AuthenticatedPrincipal reviewer, Long trialId, String reason) {
        MemberTrialRedemption redemption = trialRedemptions.findById(trialId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.trial", trialId));

        if (MemberTrialRedemption.STATUS_APPROVED.equalsIgnoreCase(redemption.getStatus())) {
            throw new ConflictException("TRIAL_ALREADY_APPROVED", "trial.already_approved", null,
                    "Không thể từ chối đơn đăng ký đã được phê duyệt.");
        }

        String rejectionReason = (reason != null && !reason.isBlank()) ? reason.trim() : "Thông tin giấy tờ không khớp";
        redemption.setStatus(MemberTrialRedemption.STATUS_REJECTED);
        redemption.setRejectionReason(rejectionReason);
        redemption.setReviewedBy(reviewer != null ? reviewer.id() : null);
        redemption.setReviewedAt(LocalDateTime.now(clock));

        MemberTrialRedemption saved = trialRedemptions.saveAndFlush(redemption);

        if (notifications != null && redemption.getMember() != null) {
            notifications.send(
                    redemption.getMember().getUserId(),
                    msg("trial.rejected.title"),
                    msg("trial.rejected.body", rejectionReason),
                    "system",
                    "member_trial_redemption",
                    saved.getId()
            );
        }

        return toReceptionDto(saved);
    }

    @Transactional(readOnly = true)
    public List<ReceptionTrialDto> listTrials(String status, String search) {
        List<MemberTrialRedemption> list;
        if (status != null && !status.isBlank()) {
            list = trialRedemptions.findByStatusOrderByRedeemedAtDesc(status.trim().toUpperCase(Locale.ROOT));
        } else {
            list = trialRedemptions.findAllByOrderByRedeemedAtDesc();
        }

        if (search != null && !search.isBlank()) {
            String q = search.trim().toLowerCase(Locale.ROOT);
            list = list.stream().filter(r -> {
                String name = r.getFullName() != null ? r.getFullName().toLowerCase(Locale.ROOT) : "";
                String last4 = r.getCccdLast4() != null ? r.getCccdLast4() : "";
                Member m = r.getMember();
                User u = m != null ? m.getUser() : null;
                String code = m != null && m.getMembershipCode() != null ? m.getMembershipCode().toLowerCase(Locale.ROOT) : "";
                String email = u != null && u.getEmail() != null ? u.getEmail().toLowerCase(Locale.ROOT) : "";
                String phone = u != null && u.getPhone() != null ? u.getPhone().toLowerCase(Locale.ROOT) : "";
                return name.contains(q) || last4.contains(q) || code.contains(q) || email.contains(q) || phone.contains(q);
            }).toList();
        }

        return list.stream().map(this::toReceptionDto).toList();
    }

    /**
     * Backward-compatible claim method for direct activation.
     */
    @Transactional
    public SubscriptionDto claimGoldTrial(AuthenticatedPrincipal principal, TrialClaimRequest request) {
        if (principal == null || principal.id() == null) {
            throw new BadRequestException("AUTH_REQUIRED", "error.unauthorized", null, "Authentication required");
        }
        Long memberId = principal.id();
        String cccd = request.resolvedDocumentNumber();
        String cccdHash = cccdHasher.hash(cccd);
        String fullName = request.fullName().trim();

        if (trialRedemptions.existsByMemberUserId(memberId)) {
            throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                    msg("trial.already_claimed.member"));
        }

        if (trialRedemptions.existsByCccdHash(cccdHash)) {
            throw new ConflictException("TRIAL_CCCD_ALREADY_USED", "trial.already_claimed.cccd", null,
                    msg("trial.already_claimed.cccd"));
        }

        if (subscriptions.existsByMemberUserId(memberId)) {
            throw new ConflictException("TRIAL_NOT_NEW_MEMBER", "trial.not_new_member", null,
                    msg("trial.not_new_member"));
        }

        LocalDate today = LocalDate.now(clock);
        Member member = members.findById(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", memberId));

        MembershipPackage trialPkg = packages.findByStatusOrderByPriceAsc("active").stream()
                .filter(p -> CatalogSeeder.TRIAL_PACKAGE_NAME.equalsIgnoreCase(p.getName())
                        || (p.getDurationDays() == 3 && p.getPrice().compareTo(BigDecimal.ZERO) == 0))
                .findFirst()
                .orElseGet(() -> packages.findByStatusOrderByPriceAsc("active").stream()
                        .filter(p -> CatalogSeeder.GOLD_NAME.equalsIgnoreCase(p.getName()))
                        .findFirst()
                        .orElseThrow(() -> new ResourceNotFoundException("resource.package", CatalogSeeder.TRIAL_PACKAGE_NAME)));

        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(trialPkg);
        subscription.setStartDate(today);
        subscription.setEndDate(today.plusDays(TRIAL_DAYS));
        subscription.setStatus("active");
        subscription.setUpgradeCharge(BigDecimal.ZERO);
        subscription.setQrCode(UUID.randomUUID().toString());

        MembershipSubscription savedSub;
        try {
            savedSub = subscriptions.saveAndFlush(subscription);
            MemberTrialRedemption redemption = new MemberTrialRedemption(member, cccdHash, cccdHasher.last4(cccd), fullName, savedSub);
            trialRedemptions.saveAndFlush(redemption);
        } catch (DataIntegrityViolationException e) {
            for (Throwable cause = e; cause != null; cause = cause.getCause()) {
                if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint) {
                    if ("uq_trial_cccd_hash".equalsIgnoreCase(constraint.getConstraintName())) {
                        throw new ConflictException("TRIAL_CCCD_ALREADY_USED", "trial.already_claimed.cccd", null,
                                msg("trial.already_claimed.cccd"));
                    }
                    if ("uq_trial_member".equalsIgnoreCase(constraint.getConstraintName())) {
                        throw new ConflictException("TRIAL_ALREADY_CLAIMED", "trial.already_claimed.member", null,
                                msg("trial.already_claimed.member"));
                    }
                }
            }
            throw e;
        }

        if (notifications != null) {
            notifications.send(
                    memberId,
                    msg("trial.claimed.title"),
                    msg("trial.claimed.success"),
                    "system",
                    "membership_subscription",
                    savedSub.getId()
            );
        }

        return toSubscriptionDto(savedSub);
    }

    private TrialStatusDto toStatusDto(MemberTrialRedemption r) {
        String effectiveStatus = r.getStatus() != null
                ? r.getStatus()
                : (r.getSubscription() != null ? MemberTrialRedemption.STATUS_APPROVED : MemberTrialRedemption.STATUS_PENDING);
        String effectiveDocType = r.getDocumentType() != null
                ? r.getDocumentType()
                : MemberTrialRedemption.DOC_CCCD;
        boolean isApproved = MemberTrialRedemption.STATUS_APPROVED.equalsIgnoreCase(effectiveStatus);
        return new TrialStatusDto(
                false,
                isApproved,
                effectiveStatus,
                effectiveDocType,
                cccdHasher.mask(r.getCccdLast4()),
                r.getFullName(),
                r.getNationality(),
                r.getFrontImageUrl(),
                r.getBackImageUrl(),
                r.getRejectionReason(),
                r.getRedeemedAt(),
                r.getSubscription() != null ? r.getSubscription().getId() : null,
                CatalogSeeder.TRIAL_PACKAGE_NAME,
                1
        );
    }

    private ReceptionTrialDto toReceptionDto(MemberTrialRedemption r) {
        Member m = r.getMember();
        User u = m != null ? m.getUser() : null;
        MembershipSubscription s = r.getSubscription();
        String effectiveStatus = r.getStatus() != null
                ? r.getStatus()
                : (s != null ? MemberTrialRedemption.STATUS_APPROVED : MemberTrialRedemption.STATUS_PENDING);
        String effectiveDocType = r.getDocumentType() != null
                ? r.getDocumentType()
                : MemberTrialRedemption.DOC_CCCD;
        return new ReceptionTrialDto(
                r.getId(),
                m != null ? m.getUserId() : null,
                m != null ? m.getMembershipCode() : null,
                u != null ? u.getFullName() : r.getFullName(),
                u != null ? u.getEmail() : null,
                u != null ? u.getPhone() : null,
                effectiveDocType,
                cccdHasher.mask(r.getCccdLast4()),
                r.getFullName(),
                r.getNationality(),
                r.getFrontImageUrl(),
                r.getBackImageUrl(),
                effectiveStatus,
                r.getRedeemedAt(),
                r.getReviewedBy(),
                r.getReviewedAt(),
                r.getRejectionReason(),
                s != null ? s.getId() : null,
                s != null ? s.getStartDate() : null,
                s != null ? s.getEndDate() : null,
                s != null ? s.getStatus() : null
        );
    }

    private SubscriptionDto toSubscriptionDto(MembershipSubscription s) {
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
