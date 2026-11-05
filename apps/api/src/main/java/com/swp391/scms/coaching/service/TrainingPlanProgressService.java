package com.swp391.scms.coaching.service;
import com.swp391.scms.coaching.repository.*;
import com.swp391.scms.common.exception.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
@Service
public class TrainingPlanProgressService {
 private final TrainingPlanRepository plans;
 private final TrainingPlanItemRepository items;
 private final TrainingItemCompletionRepository completions;
 private final CurrentCoachMembers access;
 private final Clock clock;
 public TrainingPlanProgressService(TrainingPlanRepository plans, TrainingPlanItemRepository items,
  TrainingItemCompletionRepository completions, CurrentCoachMembers access, Clock clock){
  this.plans=plans;this.items=items;this.completions=completions;this.access=access;this.clock=clock;
 }
 public record ItemProgress(Long itemId,String exerciseName,boolean completed) {}
 public record PlanProgress(Long planId,LocalDate exerciseDate,List<ItemProgress> items) {}
 @Transactional(readOnly=true)
 public PlanProgress get(Long planId,LocalDate date,Long userId,String role){
  if(userId==null || !("COACH".equals(role)||"CENTER_MANAGER".equals(role))) throw new ForbiddenException("FORBIDDEN","coaching.plan.not_owner",null,"Access denied.");
  if(date==null || date.isAfter(LocalDate.now(clock.withZone(ZoneId.of("Asia/Ho_Chi_Minh"))))) throw new BadRequestException("INVALID_EXERCISE_DATE","coaching.completion.invalid_date",null,"Invalid exercise date.");
  var plan=plans.findById(planId).orElseThrow(()->new ResourceNotFoundException("resource.training_plan",planId));
  Long memberId=plan.getMember()==null?null:plan.getMember().getUserId();
  if(memberId==null) throw new ResourceNotFoundException("resource.member",planId);
  if("COACH".equals(role) && (plan.getCoach()==null || !userId.equals(plan.getCoach().getUserId()))) access.requireCoachOf(userId,memberId);
  if(date.isBefore(plan.getStartDate())||date.isAfter(plan.getEndDate())) return new PlanProgress(planId,date,List.of());
  var scheduled=items.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(planId).stream()
   .filter(item->Objects.equals(item.getDayOfWeek(),date.getDayOfWeek().getValue())).toList();
  Set<Long> done=new HashSet<>();
  completions.findByMemberUserIdAndExerciseDate(memberId,date).forEach(row->done.add(row.getTrainingPlanItem().getId()));
  return new PlanProgress(planId,date,scheduled.stream().map(item->new ItemProgress(item.getId(),item.getExerciseName(),done.contains(item.getId()))).toList());
 }
}
