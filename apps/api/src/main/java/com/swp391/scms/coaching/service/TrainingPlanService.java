package com.swp391.scms.coaching.service;

import com.swp391.scms.ai.entity.AiRecommendationLog;
import com.swp391.scms.ai.repository.AiRecommendationLogRepository;
import com.swp391.scms.coaching.dto.TrainingPlanCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemCreateDto;
import com.swp391.scms.coaching.dto.TrainingPlanItemDto;
import com.swp391.scms.coaching.entity.TrainingPlan;
import com.swp391.scms.coaching.entity.TrainingPlanItem;
import com.swp391.scms.coaching.repository.TrainingPlanItemRepository;
import com.swp391.scms.coaching.repository.TrainingPlanRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@Transactional
public class TrainingPlanService {

    private final TrainingPlanRepository trainingPlanRepository;
    private final TrainingPlanItemRepository trainingPlanItemRepository;
    private final MemberRepository memberRepository;
    private final CoachRepository coachRepository;
    private final GymClassRepository gymClassRepository;
    private final AiRecommendationLogRepository aiRecommendationLogRepository;

    public TrainingPlanService(TrainingPlanRepository trainingPlanRepository,
                               TrainingPlanItemRepository trainingPlanItemRepository,
                               MemberRepository memberRepository,
                               CoachRepository coachRepository) {
        this(trainingPlanRepository, trainingPlanItemRepository, memberRepository, coachRepository, null, null);
    }

    @Autowired
    public TrainingPlanService(TrainingPlanRepository trainingPlanRepository,
                               TrainingPlanItemRepository trainingPlanItemRepository,
                               MemberRepository memberRepository,
                               CoachRepository coachRepository,
                               @Autowired(required = false) GymClassRepository gymClassRepository,
                               @Autowired(required = false) AiRecommendationLogRepository aiRecommendationLogRepository) {
        this.trainingPlanRepository = trainingPlanRepository;
        this.trainingPlanItemRepository = trainingPlanItemRepository;
        this.memberRepository = memberRepository;
        this.coachRepository = coachRepository;
        this.gymClassRepository = gymClassRepository;
        this.aiRecommendationLogRepository = aiRecommendationLogRepository;
    }

    public TrainingPlanDto createPlan(TrainingPlanCreateDto dto, Long currentUserId, String currentUserRole) {
        if (dto.getStartDate() == null || dto.getEndDate() == null || dto.getStartDate().isAfter(dto.getEndDate())) {
            throw new BadRequestException("INVALID_DATE_RANGE", "coaching.plan.invalid_date_range", null,
                    "Start date cannot be after end date");
        }

        Member member = memberRepository.findById(dto.getMemberId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.member", dto.getMemberId()));

        Long targetCoachId = dto.getCoachId() != null ? dto.getCoachId() : currentUserId;
        if (targetCoachId == null) {
            throw new BadRequestException("COACH_REQUIRED", "coaching.plan.coach_required", null,
                    "Coach ID is required");
        }
        if (isCoach(currentUserRole) && currentUserId != null && !currentUserId.equals(targetCoachId)) {
            throw new ForbiddenException("FORBIDDEN", "coaching.plan.not_owner", null,
                    "Coaches can only create training plans for themselves");
        }
        if (isCoach(currentUserRole)) requireCurrentAssignment(currentUserId, member.getUserId());

        Coach coach = coachRepository.findById(targetCoachId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach", targetCoachId));

        TrainingPlan plan = new TrainingPlan();
        plan.setMember(member);
        plan.setCoach(coach);
        String resolvedGoal = (dto.getGoal() != null && !dto.getGoal().isBlank())
                ? dto.getGoal().trim()
                : (dto.getTitle() != null && !dto.getTitle().isBlank() ? dto.getTitle().trim() : null);
        plan.setGoal(resolvedGoal);
        plan.setStartDate(dto.getStartDate());
        plan.setEndDate(dto.getEndDate());
        boolean activateImmediately = Boolean.TRUE.equals(dto.getActivate())
                || "active".equalsIgnoreCase(dto.getStatus());
        plan.setStatus(activateImmediately ? "active" : "draft");
        plan.setAiGenerated(Boolean.TRUE.equals(dto.getAiGenerated()));

        if (dto.getClassId() != null && gymClassRepository != null) {
            GymClass gymClass = gymClassRepository.findById(dto.getClassId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.gym_class", dto.getClassId()));
            plan.setGymClass(gymClass);
        }

        if (dto.getAiRecommendationId() != null && aiRecommendationLogRepository != null) {
            AiRecommendationLog recoLog = aiRecommendationLogRepository.findById(dto.getAiRecommendationId())
                    .orElseThrow(() -> new ResourceNotFoundException("resource.ai_recommendation", dto.getAiRecommendationId()));
            plan.setAiGenerated(true);
            plan.setAiRecommendation(recoLog);
            recoLog.setApplied(true);
            aiRecommendationLogRepository.save(recoLog);
        }

        TrainingPlan savedPlan = trainingPlanRepository.save(plan);

        List<TrainingPlanItem> savedItems = new ArrayList<>();
        if (dto.getItems() != null && !dto.getItems().isEmpty()) {
            int idx = 1;
            for (TrainingPlanItemCreateDto itemDto : dto.getItems()) {
                validateItem(itemDto);
                TrainingPlanItem item = buildItem(savedPlan, itemDto,
                        itemDto.getOrderIndex() != null ? itemDto.getOrderIndex() : idx);
                savedItems.add(trainingPlanItemRepository.save(item));
                idx++;
            }
        }

        return toDto(savedPlan, savedItems);
    }

    public TrainingPlanDto addItem(Long planId, TrainingPlanItemCreateDto itemDto, Long currentUserId, String currentUserRole) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));

        verifyCoachOwnership(plan, currentUserId, currentUserRole);
        if ("cancelled".equalsIgnoreCase(plan.getStatus()) || "completed".equalsIgnoreCase(plan.getStatus())) {
            throw new ConflictException("INVALID_PLAN_STATUS", "coaching.plan.cannot_modify_status",
                    new Object[]{plan.getStatus()}, "Cannot modify training plan in status " + plan.getStatus());
        }

        validateItem(itemDto);
        List<TrainingPlanItem> existing = trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId);
        int nextOrder = itemDto.getOrderIndex() != null ? itemDto.getOrderIndex() : existing.size() + 1;

        TrainingPlanItem item = buildItem(plan, itemDto, nextOrder);
        trainingPlanItemRepository.save(item);

        List<TrainingPlanItem> updatedItems = trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId);
        return toDto(plan, updatedItems);
    }

    public TrainingPlanDto activatePlan(Long planId, Long currentUserId, String currentUserRole) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));

        verifyCoachOwnership(plan, currentUserId, currentUserRole);

        if (!"draft".equalsIgnoreCase(plan.getStatus()) && !"active".equalsIgnoreCase(plan.getStatus())) {
            throw new ConflictException("INVALID_PLAN_STATUS", "coaching.plan.invalid_activate_status",
                    new Object[]{plan.getStatus()}, "Only draft training plans can be activated");
        }

        plan.setStatus("active");
        TrainingPlan saved = trainingPlanRepository.save(plan);
        List<TrainingPlanItem> items = trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId);
        return toDto(saved, items);
    }

    public TrainingPlanDto updatePlan(Long planId, com.swp391.scms.coaching.dto.TrainingPlanUpdateDto dto,
                                      Long currentUserId, String currentUserRole) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));
        verifyCoachOwnership(plan, currentUserId, currentUserRole);
        if (!"draft".equalsIgnoreCase(plan.getStatus()) && !"active".equalsIgnoreCase(plan.getStatus())) {
            throw new ConflictException("INVALID_PLAN_STATUS", "coaching.plan.cannot_modify_status",
                    new Object[]{plan.getStatus()}, "Cannot modify training plan in status " + plan.getStatus());
        }
        java.time.LocalDate start = dto.getStartDate() != null ? dto.getStartDate() : plan.getStartDate();
        java.time.LocalDate end = dto.getEndDate() != null ? dto.getEndDate() : plan.getEndDate();
        if (start.isAfter(end)) {
            throw new BadRequestException("INVALID_DATE_RANGE", "coaching.plan.invalid_date_range", null,
                    "Start date cannot be after end date");
        }
        List<TrainingPlanItem> items = trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId);
        if (dto.getItems() != null) {
            var seen = new java.util.HashSet<Long>();
            for (var update : dto.getItems()) {
                if (update == null || update.getId() == null || !seen.add(update.getId())
                        || items.stream().noneMatch(item -> update.getId().equals(item.getId()))) {
                    throw new BadRequestException("INVALID_PLAN_ITEM", "coaching.plan.item_not_owned", null, null);
                }
                validateItem(update);
            }
            for (var update : dto.getItems()) {
                var item = items.stream().filter(existing -> update.getId().equals(existing.getId())).findFirst().orElseThrow();
                item.setDayOfWeek(update.getDayOfWeek());item.setExerciseName(update.getExerciseName().trim());
                item.setDescription(update.getDescription());item.setSets(update.getSets());item.setReps(update.getReps());
                item.setDurationMinutes(update.getDurationMinutes());item.setRestSeconds(update.getRestSeconds());
            }
        }
        plan.setStartDate(start);
        plan.setEndDate(end);
        if (dto.getGoal() != null) {
            plan.setGoal(dto.getGoal().isBlank() ? null : dto.getGoal().trim());
        }
        TrainingPlan saved = trainingPlanRepository.save(plan);
        return toDto(saved, items);
    }

    /** Activated plans are withdrawn without deleting exercises or member completion history. */
    public void deletePlan(Long planId, Long currentUserId, String currentUserRole) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));
        verifyCoachOwnership(plan, currentUserId, currentUserRole);
        if ("cancelled".equalsIgnoreCase(plan.getStatus())) return;
        if ("active".equalsIgnoreCase(plan.getStatus())) {
            plan.setStatus("cancelled");trainingPlanRepository.save(plan);return;
        }
        if (!"draft".equalsIgnoreCase(plan.getStatus())) {
            throw new ConflictException("INVALID_PLAN_STATUS", "coaching.plan.cannot_delete_status",
                    new Object[]{plan.getStatus()}, null);
        }
        trainingPlanRepository.delete(plan);
    }

    @Transactional(readOnly = true)
    public List<TrainingPlanDto> getMyActivePlans(Long memberId) {
        return trainingPlanRepository.findByMemberUserIdAndStatusOrderByCreatedAtDesc(memberId, "active")
                .stream()
                .map(plan -> toDto(plan, trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(plan.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public TrainingPlanDto getPlanById(Long planId, Long currentUserId, String currentUserRole) {
        TrainingPlan plan = trainingPlanRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.training_plan", planId));

        if (isCoach(currentUserRole) && coachMemberAccess != null
                && (plan.getCoach() == null || !plan.getCoach().getUserId().equals(currentUserId))) {
            coachMemberAccess.requireCoachOf(currentUserId, plan.getMember() != null ? plan.getMember().getUserId() : null);
        }
        if (!isManager(currentUserRole) && !isCoach(currentUserRole)) {
            Long ownerId = plan.getMember() != null ? plan.getMember().getUserId() : null;
            if (currentUserId == null || !currentUserId.equals(ownerId)) {
                throw new ForbiddenException("FORBIDDEN", "coaching.plan.not_owner", null,
                        "You do not have permission to view this training plan");
            }
        }

        List<TrainingPlanItem> items = trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId);
        return toDto(plan, items);
    }

    @Transactional(readOnly = true)
    public List<TrainingPlanDto> getPlans(Long memberId, Long currentUserId, String currentUserRole) {
        List<TrainingPlan> plans;
        if (memberId != null) {
            if (coachMemberAccess != null) {
                coachMemberAccess.requireAccess(currentUserId, currentUserRole, memberId);
            }
            plans = trainingPlanRepository.findByMemberUserIdOrderByCreatedAtDesc(memberId);
        } else if (isCoach(currentUserRole) && currentUserId != null) {
            plans = trainingPlanRepository.findByCoachUserIdOrderByCreatedAtDesc(currentUserId);
        } else {
            plans = trainingPlanRepository.findAllByOrderByCreatedAtDesc();
        }
        return plans.stream()
                .map(plan -> toDto(plan, trainingPlanItemRepository.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(plan.getId())))
                .toList();
    }

    private void verifyCoachOwnership(TrainingPlan plan, Long currentUserId, String currentUserRole) {
        if (isManager(currentUserRole)) {
            return;
        }
        Long planCoachId = plan.getCoach() != null ? plan.getCoach().getUserId() : null;
        if (currentUserId != null && currentUserId.equals(planCoachId)) {
            return;
        }
        if (isCoach(currentUserRole)) {
            requireCurrentAssignment(currentUserId, plan.getMember() != null ? plan.getMember().getUserId() : null);
        }
        // An unassigned plan belongs to management; only its own coach may change an assigned one.
        if (currentUserId == null || planCoachId == null || !currentUserId.equals(planCoachId)) {
            throw new ForbiddenException("FORBIDDEN", "coaching.plan.not_owner", null,
                    "You can only modify your own training plans");
        }
    }

    private void validateItem(TrainingPlanItemCreateDto itemDto) {
        if (itemDto.getExerciseName() == null || itemDto.getExerciseName().isBlank()) {
            throw new BadRequestException("EXERCISE_NAME_REQUIRED", "validation.coaching.exercise_name.not_blank",
                    null, "Exercise name is required");
        }
        if (itemDto.getExerciseName().trim().length() > 150) {
            throw new BadRequestException("INVALID_EXERCISE_NAME", "validation.coaching.exercise_name.size", null, null);
        }
        if (itemDto.getSets() != null && itemDto.getSets() < 1)
            throw new BadRequestException("INVALID_SETS", "validation.coaching.sets.min", null, null);
        if (itemDto.getReps() != null && itemDto.getReps() < 1)
            throw new BadRequestException("INVALID_REPS", "validation.coaching.reps.min", null, null);
        if (itemDto.getDurationMinutes() != null && itemDto.getDurationMinutes() < 1)
            throw new BadRequestException("INVALID_DURATION", "validation.coaching.duration.min", null, null);
        if (itemDto.getRestSeconds() != null && itemDto.getRestSeconds() < 0)
            throw new BadRequestException("INVALID_REST", "validation.coaching.rest.min", null, null);
        if (itemDto.getDayOfWeek() != null && (itemDto.getDayOfWeek() < 1 || itemDto.getDayOfWeek() > 7)) {
            throw new BadRequestException("INVALID_DAY_OF_WEEK", "validation.coaching.day_of_week.range",
                    null, "Day of week must be between 1 and 7");
        }
    }

    private TrainingPlanItem buildItem(TrainingPlan plan, TrainingPlanItemCreateDto dto, int orderIndex) {
        TrainingPlanItem item = new TrainingPlanItem();
        item.setTrainingPlan(plan);
        item.setDayOfWeek(dto.getDayOfWeek());
        item.setExerciseName(dto.getExerciseName().trim());
        item.setDescription(dto.getDescription());
        item.setRestSeconds(dto.getRestSeconds());
        item.setSets(dto.getSets());
        item.setReps(dto.getReps());
        item.setDurationMinutes(dto.getDurationMinutes());
        item.setOrderIndex(orderIndex);
        return item;
    }

    private TrainingPlanDto toDto(TrainingPlan plan, List<TrainingPlanItem> items) {
        TrainingPlanDto dto = new TrainingPlanDto();
        dto.setId(plan.getId());
        if (plan.getMember() != null) {
            dto.setMemberId(plan.getMember().getUserId());
            if (plan.getMember().getUser() != null) {
                dto.setMemberName(plan.getMember().getUser().getFullName());
            }
        }
        if (plan.getCoach() != null) {
            dto.setCoachId(plan.getCoach().getUserId());
            if (plan.getCoach().getUser() != null) {
                dto.setCoachName(plan.getCoach().getUser().getFullName());
            }
        }
        if (plan.getGymClass() != null) {
            dto.setClassId(plan.getGymClass().getId());
        }
        dto.setGoal(plan.getGoal());
        dto.setStartDate(plan.getStartDate());
        dto.setEndDate(plan.getEndDate());
        dto.setStatus(plan.getStatus());
        dto.setAiGenerated(plan.isAiGenerated());
        if (plan.getAiRecommendation() != null) {
            dto.setAiRecommendationId(plan.getAiRecommendation().getId());
        }
        dto.setCreatedAt(plan.getCreatedAt());
        dto.setUpdatedAt(plan.getUpdatedAt());

        List<TrainingPlanItemDto> itemDtos = items == null ? List.of() : items.stream()
                .map(i -> { var itemDto = new TrainingPlanItemDto(
                        i.getId(),
                        plan.getId(),
                        i.getDayOfWeek(),
                        i.getExerciseName(),
                        i.getDescription(),
                        i.getSets(),
                        i.getReps(),
                        i.getDurationMinutes(),
                        i.getOrderIndex()
                ); itemDto.setRestSeconds(i.getRestSeconds()); return itemDto; })
                .toList();
        dto.setItems(itemDtos);
        return dto;
    }

    @org.springframework.beans.factory.annotation.Autowired
    private CurrentCoachMembers currentCoachMembers;

    private void requireCurrentAssignment(Long coachId, Long memberId) {
        if(currentCoachMembers == null) throw new ForbiddenException("COACH_MEMBER_NOT_ASSIGNED", "coaching.member.not_assigned", null, "Current assignment cannot be verified.");
        currentCoachMembers.requireCoachOf(coachId, memberId);
    }

    private boolean isManager(String role) {
        return "CENTER_MANAGER".equalsIgnoreCase(role) || "Manager".equalsIgnoreCase(role);
    }

    private boolean isCoach(String role) {
        return "COACH".equalsIgnoreCase(role) || "Coach".equalsIgnoreCase(role);
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.coaching.service.CoachMemberAccess coachMemberAccess;
}

