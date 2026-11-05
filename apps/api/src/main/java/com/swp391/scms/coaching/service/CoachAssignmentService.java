package com.swp391.scms.coaching.service;

import com.swp391.scms.coaching.dto.*;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@Transactional
public class CoachAssignmentService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final CoachRepository coachRepository;
    private final MemberRepository memberRepository;
    private final TrainingPlanRepository trainingPlanRepository;
    private final CoachBookingRepository coachBookingRepository;
    private final GymClassRepository gymClassRepository;
    private final ClassEnrollmentRepository classEnrollmentRepository;
    private final MembershipSubscriptionRepository subscriptionRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;
    private final Clock clock;

    @Autowired
    public CoachAssignmentService(
            CoachRepository coachRepository,
            MemberRepository memberRepository,
            TrainingPlanRepository trainingPlanRepository,
            CoachBookingRepository coachBookingRepository,
            GymClassRepository gymClassRepository,
            ClassEnrollmentRepository classEnrollmentRepository,
            MembershipSubscriptionRepository subscriptionRepository,
            NotificationService notificationService,
            @Autowired(required = false) MessageService messageService,
            @Autowired(required = false) Clock clock
    ) {
        this.coachRepository = coachRepository;
        this.memberRepository = memberRepository;
        this.trainingPlanRepository = trainingPlanRepository;
        this.coachBookingRepository = coachBookingRepository;
        this.gymClassRepository = gymClassRepository;
        this.classEnrollmentRepository = classEnrollmentRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.notificationService = notificationService;
        this.messageService = messageService;
        this.clock = clock != null ? clock : Clock.systemDefaultZone();
    }

    private LocalDate today() {
        return LocalDate.now(clock);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getOverview(Long filterCoachId, String search, String assignmentType) {
        List<Coach> allCoaches = coachRepository.findActiveWithUser();
        if (filterCoachId != null) {
            allCoaches = allCoaches.stream()
                    .filter(c -> c.getUserId().equals(filterCoachId))
                    .toList();
        }

        LocalDate currentDate = today();
        String normalizedSearch = (search != null && !search.isBlank()) ? search.trim().toLowerCase() : null;
        String normalizedType = (assignmentType != null && !assignmentType.isBlank()) ? assignmentType.trim().toUpperCase() : null;

        List<CoachAssignmentOverviewDto> overviewList = new ArrayList<>();
        int totalPtStudentsAll = 0;
        int totalPlanStudentsAll = 0;
        int totalClassStudentsAll = 0;
        Set<Long> uniqueAssignedMembersAll = new HashSet<>();

        for (Coach coach : allCoaches) {
            Long coachId = coach.getUserId();
            String coachName = coach.getUser() != null ? coach.getUser().getFullName() : "HLV #" + coachId;
            String coachEmail = coach.getUser() != null ? coach.getUser().getEmail() : "";
            String coachPhone = coach.getUser() != null ? coach.getUser().getPhone() : "";
            String specialization = coach.getSpecialization() != null ? coach.getSpecialization() : "Thể hình & Thể lực";
            String bio = coach.getBio();
            String status = coach.getEmploymentStatus();

            List<CoachAssignmentStudentDto> studentList = new ArrayList<>();
            Set<Long> coachUniqueStudents = new HashSet<>();
            int ptCount = 0;
            int planCount = 0;
            int classCount = 0;

            // 1. Training Plans for this coach
            List<TrainingPlan> plans = trainingPlanRepository.findByCoachUserIdOrderByCreatedAtDesc(coachId);
            for (TrainingPlan plan : plans) {
                if ("cancelled".equalsIgnoreCase(plan.getStatus())) {
                    continue;
                }
                Member member = plan.getMember();
                if (member == null || member.getUser() == null || member.getUser().getDeletedAt() != null) {
                    continue;
                }

                String memberName = member.getUser().getFullName();
                String memberCode = member.getMembershipCode();
                String memberPhone = member.getUser().getPhone();
                String memberEmail = member.getUser().getEmail();

                CoachAssignmentStudentDto studentDto = new CoachAssignmentStudentDto(
                        member.getUserId(),
                        memberCode,
                        memberName,
                        memberPhone,
                        memberEmail,
                        member.getUser().getAvatarUrl(),
                        member.getFitnessGoal() != null ? member.getFitnessGoal() : plan.getGoal(),
                        member.getFitnessLevel(),
                        member.getHealthNotes(),
                        "TRAINING_PLAN",
                        "Theo giáo án riêng",
                        plan.getGoal() != null ? plan.getGoal() : "Kế hoạch rèn luyện thể lực",
                        plan.getStartDate(),
                        plan.getEndDate(),
                        plan.getEndDate() != null ? "Hạn: " + plan.getEndDate().format(DATE_FORMATTER) : null,
                        plan.getStatus(),
                        plan.getId()
                );

                if (matchesFilters(studentDto, coachName, normalizedSearch, normalizedType)) {
                    studentList.add(studentDto);
                    coachUniqueStudents.add(member.getUserId());
                    uniqueAssignedMembersAll.add(member.getUserId());
                    planCount++;
                    totalPlanStudentsAll++;
                }
            }

            // 2. 1-on-1 PT Bookings
            List<CoachBooking> ptBookings = coachBookingRepository.findByCoachId(coachId);
            for (CoachBooking booking : ptBookings) {
                if ("cancelled".equalsIgnoreCase(booking.getStatus())) {
                    continue;
                }
                Member member = booking.getMember();
                if (member == null || member.getUser() == null || member.getUser().getDeletedAt() != null) {
                    continue;
                }

                String memberName = member.getUser().getFullName();
                String memberCode = member.getMembershipCode();
                String memberPhone = member.getUser().getPhone();
                String memberEmail = member.getUser().getEmail();
                String disciplineName = booking.getDiscipline() != null ? booking.getDiscipline().getName() : "Thể hình 1:1";
                String nextSessionStr = (booking.getBookingDate() != null && booking.getStartTime() != null)
                        ? booking.getStartTime() + " " + booking.getBookingDate().format(DATE_FORMATTER)
                        : null;

                CoachAssignmentStudentDto studentDto = new CoachAssignmentStudentDto(
                        member.getUserId(),
                        memberCode,
                        memberName,
                        memberPhone,
                        memberEmail,
                        member.getUser().getAvatarUrl(),
                        member.getFitnessGoal(),
                        member.getFitnessLevel(),
                        member.getHealthNotes(),
                        "PT_1_1",
                        "Tập 1:1 với HLV",
                        "Buổi tập PT: " + disciplineName,
                        booking.getBookingDate(),
                        booking.getBookingDate(),
                        nextSessionStr,
                        booking.getStatus(),
                        booking.getId()
                );

                if (matchesFilters(studentDto, coachName, normalizedSearch, normalizedType)) {
                    studentList.add(studentDto);
                    coachUniqueStudents.add(member.getUserId());
                    uniqueAssignedMembersAll.add(member.getUserId());
                    ptCount++;
                    totalPtStudentsAll++;
                }
            }

            // 3. Classes taught by this coach
            List<GymClass> classes = gymClassRepository.findByCoachUserId(coachId);
            for (GymClass gymClass : classes) {
                if ("inactive".equalsIgnoreCase(gymClass.getStatus())) {
                    continue;
                }
                List<ClassEnrollment> enrollments = classEnrollmentRepository.findByGymClassIdAndStatus(gymClass.getId(), "booked");
                for (ClassEnrollment enrollment : enrollments) {
                    Member member = enrollment.getMember();
                    if (member == null || member.getUser() == null || member.getUser().getDeletedAt() != null) {
                        continue;
                    }

                    String memberName = member.getUser().getFullName();
                    String memberCode = member.getMembershipCode();
                    String memberPhone = member.getUser().getPhone();
                    String memberEmail = member.getUser().getEmail();

                    CoachAssignmentStudentDto studentDto = new CoachAssignmentStudentDto(
                            member.getUserId(),
                            memberCode,
                            memberName,
                            memberPhone,
                            memberEmail,
                            member.getUser().getAvatarUrl(),
                            member.getFitnessGoal(),
                            member.getFitnessLevel(),
                            member.getHealthNotes(),
                            "CLASS",
                            "Lớp học nhóm",
                            "Lớp: " + gymClass.getName() + " (" + (gymClass.getDiscipline() != null ? gymClass.getDiscipline().getName() : "") + ")",
                            null,
                            null,
                            "Lớp đang hoạt động",
                            "active",
                            enrollment.getId()
                    );

                    if (matchesFilters(studentDto, coachName, normalizedSearch, normalizedType)) {
                        studentList.add(studentDto);
                        coachUniqueStudents.add(member.getUserId());
                        uniqueAssignedMembersAll.add(member.getUserId());
                        classCount++;
                        totalClassStudentsAll++;
                    }
                }
            }

            overviewList.add(new CoachAssignmentOverviewDto(
                    coachId,
                    coachName,
                    coachEmail,
                    coachPhone,
                    specialization,
                    bio,
                    status,
                    coachUniqueStudents.size(),
                    ptCount,
                    planCount,
                    classCount,
                    studentList
            ));
        }

        CoachAssignmentSummaryStatsDto stats = new CoachAssignmentSummaryStatsDto(
                coachRepository.findAll().size(),
                allCoaches.size(),
                uniqueAssignedMembersAll.size(),
                totalPtStudentsAll,
                totalPlanStudentsAll,
                totalClassStudentsAll
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("coaches", overviewList);
        result.put("stats", stats);
        return result;
    }

    private boolean matchesFilters(
            CoachAssignmentStudentDto student,
            String coachName,
            String normalizedSearch,
            String normalizedType
    ) {
        if (normalizedType != null && !normalizedType.equals("ALL") && !student.assignmentType().equalsIgnoreCase(normalizedType)) {
            return false;
        }

        if (normalizedSearch != null) {
            boolean inStudent = (student.fullName() != null && student.fullName().toLowerCase().contains(normalizedSearch))
                    || (student.membershipCode() != null && student.membershipCode().toLowerCase().contains(normalizedSearch))
                    || (student.phone() != null && student.phone().contains(normalizedSearch))
                    || (student.email() != null && student.email().toLowerCase().contains(normalizedSearch));
            boolean inCoach = coachName != null && coachName.toLowerCase().contains(normalizedSearch);
            boolean inDetail = student.detail() != null && student.detail().toLowerCase().contains(normalizedSearch);
            return inStudent || inCoach || inDetail;
        }

        return true;
    }

    public CoachAssignmentStudentDto assignStudent(CoachAssignmentAssignDto dto) {
        Coach coach = coachRepository.findById(dto.coachId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", dto.coachId()));

        Member member = memberRepository.findById(dto.memberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", dto.memberId()));

        if (dto.startDate().isAfter(dto.endDate())) {
            throw new BadRequestException("INVALID_DATE_RANGE", "Ngày bắt đầu không được sau ngày kết thúc.");
        }

        boolean hasActiveSubscription = subscriptionRepository.existsEntitlementEndingOnOrAfter(member.getUserId(), today());
        if (!hasActiveSubscription) {
            throw new BadRequestException("NO_ACTIVE_SUBSCRIPTION", "Hội viên chưa có gói tập hợp lệ hoặc đã hết hạn, không thể phân công HLV.");
        }

        String goal = (dto.goal() != null && !dto.goal().isBlank())
                ? dto.goal().trim()
                : (member.getFitnessGoal() != null ? member.getFitnessGoal() : "Rèn luyện thể lực và vóc dáng với HLV");

        TrainingPlan plan = new TrainingPlan();
        plan.setCoach(coach);
        plan.setMember(member);
        plan.setGoal(goal);
        plan.setStartDate(dto.startDate());
        plan.setEndDate(dto.endDate());
        plan.setStatus("active");
        plan = trainingPlanRepository.save(plan);

        // Send notifications
        String coachName = coach.getUser() != null ? coach.getUser().getFullName() : "HLV";
        String memberName = member.getUser() != null ? member.getUser().getFullName() : "Học viên";
        String dateRange = dto.startDate().format(DATE_FORMATTER) + " - " + dto.endDate().format(DATE_FORMATTER);

        notificationService.send(
                coach.getUserId(),
                "Phân công học viên mới",
                "Quản lý đã phân công học viên " + memberName + " (" + member.getMembershipCode() + ") cho bạn phụ trách từ ngày " + dateRange + ".",
                "system",
                "training_plan",
                plan.getId(),
                "/coach/training-plans"
        );

        notificationService.send(
                member.getUserId(),
                "Phân công huấn luyện viên",
                "Bạn đã được trung tâm sắp xếp HLV " + coachName + " đồng hành phụ trách luyện tập (" + dateRange + ").",
                "system",
                "training_plan",
                plan.getId(),
                "/member/progress"
        );

        return new CoachAssignmentStudentDto(
                member.getUserId(),
                member.getMembershipCode(),
                memberName,
                member.getUser() != null ? member.getUser().getPhone() : null,
                member.getUser() != null ? member.getUser().getEmail() : null,
                member.getUser() != null ? member.getUser().getAvatarUrl() : null,
                goal,
                member.getFitnessLevel(),
                member.getHealthNotes(),
                "TRAINING_PLAN",
                "Theo giáo án riêng",
                goal,
                plan.getStartDate(),
                plan.getEndDate(),
                "Hạn: " + plan.getEndDate().format(DATE_FORMATTER),
                plan.getStatus(),
                plan.getId()
        );
    }

    public void reassignStudent(CoachAssignmentReassignDto dto) {
        if (dto.fromCoachId().equals(dto.toCoachId())) {
            throw new BadRequestException("SAME_COACH", "Không thể điều chuyển sang cùng một huấn luyện viên.");
        }

        Coach fromCoach = coachRepository.findById(dto.fromCoachId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", dto.fromCoachId()));

        Coach toCoach = coachRepository.findById(dto.toCoachId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", dto.toCoachId()));

        Member member = memberRepository.findById(dto.memberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", dto.memberId()));

        // 1. Reassign training plans
        List<TrainingPlan> plans = trainingPlanRepository.findByMemberUserIdOrderByCreatedAtDesc(member.getUserId());
        for (TrainingPlan plan : plans) {
            if (plan.getCoach() != null && plan.getCoach().getUserId().equals(fromCoach.getUserId()) && "active".equalsIgnoreCase(plan.getStatus())) {
                plan.setCoach(toCoach);
                trainingPlanRepository.save(plan);
            }
        }

        // 2. Reassign future confirmed bookings
        List<CoachBooking> bookings = coachBookingRepository.findByMemberId(member.getUserId());
        LocalDate currentDate = today();
        for (CoachBooking booking : bookings) {
            if (booking.getCoach() != null && booking.getCoach().getUserId().equals(fromCoach.getUserId())
                    && "confirmed".equalsIgnoreCase(booking.getStatus())
                    && booking.getBookingDate() != null && !booking.getBookingDate().isBefore(currentDate)) {
                booking.setCoach(toCoach);
                coachBookingRepository.save(booking);
            }
        }

        // 3. Send notifications
        String fromCoachName = fromCoach.getUser() != null ? fromCoach.getUser().getFullName() : "HLV cũ";
        String toCoachName = toCoach.getUser() != null ? toCoach.getUser().getFullName() : "HLV mới";
        String memberName = member.getUser() != null ? member.getUser().getFullName() : "Học viên";
        String reasonStr = (dto.reason() != null && !dto.reason().isBlank()) ? " (Lý do: " + dto.reason().trim() + ")" : "";

        notificationService.send(
                toCoach.getUserId(),
                "Tiếp nhận học viên mới",
                "Quản lý đã điều chuyển học viên " + memberName + " từ HLV " + fromCoachName + " sang bạn phụ trách" + reasonStr + ".",
                "system",
                "member",
                member.getUserId(),
                "/coach/classes"
        );

        notificationService.send(
                fromCoach.getUserId(),
                "Điều chuyển học viên",
                "Học viên " + memberName + " của bạn đã được chuyển giao cho HLV " + toCoachName + " phụ trách" + reasonStr + ".",
                "system",
                "member",
                member.getUserId(),
                "/coach/classes"
        );

        notificationService.send(
                member.getUserId(),
                "Thay đổi huấn luyện viên phụ trách",
                "HLV phụ trách luyện tập của bạn đã được chuyển từ HLV " + fromCoachName + " sang HLV " + toCoachName + reasonStr + ".",
                "system",
                "coach",
                toCoach.getUserId(),
                "/member/progress"
        );
    }

    public void removeAssignment(Long planId) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));

        plan.setStatus("completed");
        trainingPlanRepository.save(plan);

        if (plan.getMember() != null && plan.getCoach() != null) {
            String memberName = plan.getMember().getUser() != null ? plan.getMember().getUser().getFullName() : "Học viên";
            notificationService.send(
                    plan.getCoach().getUserId(),
                    "Hoàn thành kế hoạch phụ trách",
                    "Kế hoạch phụ trách học viên " + memberName + " (" + plan.getGoal() + ") đã được quản lý đánh dấu hoàn thành.",
                    "system",
                    "training_plan",
                    plan.getId(),
                    "/coach/training-plans"
            );
        }
    }
}
