package com.swp391.scms.ai.service;

import com.swp391.scms.catalog.PublicCatalogService;
import com.swp391.scms.catalog.PublicCatalogService.CatalogDto;
import com.swp391.scms.catalog.PublicCatalogService.CoachDto;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.entity.TrainingPlanItem;
import com.swp391.scms.coaching.repository.TrainingPlanItemRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Retrieval-Augmented Generation (RAG) context builder over live Supabase PostgreSQL data.
 * Injects verified catalog (packages, coaches, upcoming 7-day sessions) and authenticated
 * member context (profile, active subscription, booked classes, active workout plan) into AI prompts.
 */
@Service
public class AiRagContextService {

    private static final int MAX_SESSION_ITEMS = 15;
    private static final int MAX_PLAN_ITEMS = 10;
    private static final long CATALOG_CACHE_TTL_MS = 60_000L;
    private static final long MEMBER_CACHE_TTL_MS = 30_000L;

    private record CachedCatalog(CatalogDto catalog, long expiresAt) {}
    private record CachedMemberSnapshot(String memberSection, Set<Long> bookedClassIds, long expiresAt) {}

    private volatile CachedCatalog cachedCatalog;
    private final java.util.concurrent.ConcurrentHashMap<Long, CachedMemberSnapshot> memberCache =
            new java.util.concurrent.ConcurrentHashMap<>();

    private final PublicCatalogService catalogService;
    private final MembershipSubscriptionRepository subscriptionRepository;
    private final ClassEnrollmentRepository enrollmentRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.SessionBookingRepository sessionBookings;
    private final TrainingPlanRepository trainingPlanRepository;
    private final TrainingPlanItemRepository trainingPlanItemRepository;

    @Autowired
    public AiRagContextService(
            @Autowired(required = false) PublicCatalogService catalogService,
            @Autowired(required = false) MembershipSubscriptionRepository subscriptionRepository,
            @Autowired(required = false) ClassEnrollmentRepository enrollmentRepository,
            @Autowired(required = false) TrainingPlanRepository trainingPlanRepository,
            @Autowired(required = false) TrainingPlanItemRepository trainingPlanItemRepository) {
        this.catalogService = catalogService;
        this.subscriptionRepository = subscriptionRepository;
        this.enrollmentRepository = enrollmentRepository;
        this.trainingPlanRepository = trainingPlanRepository;
        this.trainingPlanItemRepository = trainingPlanItemRepository;
    }

    @Transactional(readOnly = true)
    public String buildRagContext(Member member, String userQuery) {
        StringBuilder sb = new StringBuilder();
        sb.append("[DỮ LIỆU HỆ THỐNG SÖL THỜI GIAN THỰC - DÙNG ĐỂ TRẢ LỜI CHÍNH XÁC]\n");

        Set<Long> bookedClassIds = new HashSet<>();
        if (member != null) {
            Long memberId = member.getUserId();
            long now = System.currentTimeMillis();
            CachedMemberSnapshot cached = memberId != null ? memberCache.get(memberId) : null;
            if (cached != null && cached.expiresAt() > now) {
                sb.append(cached.memberSection());
                bookedClassIds.addAll(cached.bookedClassIds());
            } else {
                StringBuilder memberSb = new StringBuilder();
                appendMemberContext(memberSb, member, bookedClassIds);
                String memberSection = memberSb.toString();
                sb.append(memberSection);
                if (memberId != null) {
                    memberCache.put(memberId, new CachedMemberSnapshot(memberSection, Set.copyOf(bookedClassIds), now + MEMBER_CACHE_TTL_MS));
                }
            }
        }
        appendCatalogContext(sb, bookedClassIds);
        appendPolicyContext(sb);
        return sb.toString().trim();
    }

    private void appendMemberContext(StringBuilder sb, Member member, Set<Long> bookedClassIds) {
        sb.append("\n1. HỒ SƠ HỘI VIÊN ĐANG TRÒ CHUYỆN:\n");
        sb.append("- Mã hội viên: ").append(member.getMembershipCode() != null ? member.getMembershipCode() : "#" + member.getUserId()).append("\n");
        if (member.getFitnessGoal() != null && !member.getFitnessGoal().isBlank()) {
            sb.append("- Mục tiêu thể lực: ").append(member.getFitnessGoal()).append("\n");
        }
        if (member.getFitnessLevel() != null && !member.getFitnessLevel().isBlank()) {
            sb.append("- Trình độ: ").append(member.getFitnessLevel()).append("\n");
        }
        if (member.getHealthNotes() != null && !member.getHealthNotes().isBlank()) {
            sb.append("- Lưu ý sức khỏe / chấn thương: ").append(member.getHealthNotes()).append("\n");
        }

        Long memberId = member.getUserId();
        if (memberId == null) {
            return;
        }

        if (subscriptionRepository != null) {
            Optional<MembershipSubscription> activeSub = subscriptionRepository
                    .findFirstByMemberUserIdAndStatusOrderByEndDateDesc(memberId, "active");
            if (activeSub.isPresent()) {
                MembershipSubscription sub = activeSub.get();
                String pkgName = sub.getMembershipPackage() != null ? sub.getMembershipPackage().getName() : "Gói hội viên";
                sb.append("- Gói tập đang hoạt động: ").append(pkgName)
                        .append(" (Hiệu lực: ").append(sub.getStartDate()).append(" đến ").append(sub.getEndDate()).append(")\n");
            } else {
                sb.append("- Gói tập đang hoạt động: Chưa có gói active\n");
            }
        }

        if (enrollmentRepository != null) {
            List<Long> ids = enrollmentRepository.findBookedClassIdsByMemberId(memberId);
            if (ids != null) {
                bookedClassIds.addAll(ids);
            }
        }
        if (sessionBookings != null) {
            bookedClassIds.addAll(sessionBookings.findBookedClassIdsByMemberId(memberId));
        }

        if (trainingPlanRepository != null) {
            List<TrainingPlan> activePlans = trainingPlanRepository
                    .findByMemberUserIdAndStatusOrderByCreatedAtDesc(memberId, "active");
            if (activePlans != null && !activePlans.isEmpty()) {
                TrainingPlan plan = activePlans.get(0);
                sb.append("- Giáo án tập luyện hiện tại: ").append(plan.getGoal() != null ? plan.getGoal() : "Giáo án cá nhân hóa").append("\n");
                if (trainingPlanItemRepository != null && plan.getId() != null) {
                    List<TrainingPlanItem> items = trainingPlanItemRepository
                            .findByTrainingPlanIdOrderByOrderIndexAscIdAsc(plan.getId());
                    if (items != null && !items.isEmpty()) {
                        sb.append("  Các bài tập trong giáo án:\n");
                        items.stream().limit(MAX_PLAN_ITEMS).forEach(item -> sb.append("  + Thứ ")
                                .append(item.getDayOfWeek() != null ? item.getDayOfWeek() + 1 : 2)
                                .append(": ").append(item.getExerciseName())
                                .append(" (").append(item.getSets()).append(" sets x ").append(item.getReps()).append(" reps)\n"));
                    }
                }
            }
        }
    }

    private void appendCatalogContext(StringBuilder sb, Set<Long> bookedClassIds) {
        if (catalogService == null) {
            return;
        }
        CatalogDto catalog = getCachedCatalog();
        if (catalog == null) {
            return;
        }

        List<PackageDto> packages = catalog.packages();
        if (packages != null && !packages.isEmpty()) {
            sb.append("\n2. BẢNG GIÁ GÓI TẬP ĐANG MỞ BÁN TẠI SÖL:\n");
            for (PackageDto pkg : packages) {
                sb.append("- ").append(pkg.name())
                        .append(": ").append(pkg.price()).append(" VNĐ / ").append(pkg.durationDays()).append(" ngày");
                if (pkg.classCreditLimit() != null) {
                    sb.append(" (Tối đa ").append(pkg.classCreditLimit()).append(" buổi lớp)");
                }
                if (pkg.description() != null && !pkg.description().isBlank()) {
                    sb.append(" — ").append(pkg.description());
                }
                sb.append("\n");
            }
        }

        List<CoachDto> coaches = catalog.coaches();
        if (coaches != null && !coaches.isEmpty()) {
            sb.append("\n3. ĐỘI NGŨ HUẤN LUYỆN VIÊN (COACH):\n");
            for (CoachDto coach : coaches) {
                sb.append("- HLV ").append(coach.name())
                        .append(" (Chuyên môn: ").append(coach.specialization() != null ? coach.specialization() : "Đa môn");
                if (coach.certification() != null && !coach.certification().isBlank()) {
                    sb.append(", Chứng chỉ: ").append(coach.certification());
                }
                sb.append(")\n");
            }
        }

        List<ClassSessionDto> sessions = catalog.sessions();
        if (sessions != null && !sessions.isEmpty()) {
            sb.append("\n4. LỊCH LỚP HỌC SẮP TỚI (7 NGÀY TỚI):\n");
            sessions.stream().limit(MAX_SESSION_ITEMS).forEach(s -> {
                long remaining = Math.max(0L, s.capacity() - s.bookedCount());
                sb.append("- [").append(s.sessionDate()).append(" ").append(s.startTime()).append("-").append(s.endTime()).append("] ")
                        .append(s.className()).append(" (Bộ môn: ").append(s.disciplineName())
                        .append(", HLV: ").append(s.coachName())
                        .append(", Phòng: ").append(s.roomName())
                        .append(", Còn trống: ").append(remaining).append("/").append(s.capacity()).append(" chỗ)");
                if (s.classId() != null && bookedClassIds.contains(s.classId())) {
                    sb.append(" [HỘI VIÊN ĐÃ ĐẶT CHỖ]");
                }
                sb.append("\n");
            });
        }
    }

    private CatalogDto getCachedCatalog() {
        long now = System.currentTimeMillis();
        CachedCatalog current = this.cachedCatalog;
        if (current != null && current.expiresAt() > now) {
            return current.catalog();
        }
        CatalogDto fresh = catalogService.getCatalog();
        if (fresh != null) {
            this.cachedCatalog = new CachedCatalog(fresh, now + CATALOG_CACHE_TTL_MS);
        }
        return fresh;
    }

    private void appendPolicyContext(StringBuilder sb) {
        sb.append("\n5. QUY ĐỊNH & TIỆN ÍCH TRUNG TÂM SÖL:\n");
        sb.append("- Check-in: Hội viên có gói tập active quét mã QR cổng tại sảnh lễ tân từ mục 'Quét QR Check-in' trên Portal.\n");
        sb.append("- Đặt lớp: Đặt lịch trực tiếp tại mục 'Lịch học'. Hội viên đặt từng buổi, hoặc bật 'Đặt nhiều buổi' để đặt cả tuần hay cả tháng một lượt; buổi đã đầy chỗ thì không đặt được.\n");
        sb.append("- Bảo lưu & Hỗ trợ: Gửi yêu cầu bảo lưu gói tập hoặc tạo phiếu tại mục 'Hỗ trợ & Khiếu nại' / nút 'Tin nhắn' để nhân viên lễ tân xử lý.\n");
    }
}

