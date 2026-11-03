package com.swp391.scms.coaching;
import com.swp391.scms.coaching.service.*;
import com.swp391.scms.coaching.repository.*;
import com.swp391.scms.coaching.entity.*;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.common.exception.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class TrainingPlanProgressServiceTest {
 TrainingPlanRepository plans=mock(TrainingPlanRepository.class);
 TrainingPlanItemRepository items=mock(TrainingPlanItemRepository.class);
 TrainingItemCompletionRepository completions=mock(TrainingItemCompletionRepository.class);
 CurrentCoachMembers access=mock(CurrentCoachMembers.class);
 Clock clock=Clock.fixed(Instant.parse("2026-10-25T17:05:00Z"),ZoneOffset.UTC);
 TrainingPlanProgressService service=new TrainingPlanProgressService(plans,items,completions,access,clock);
 LocalDate date=LocalDate.of(2026,10,26);TrainingPlan plan;TrainingPlanItem item;
 @BeforeEach void setup(){Member member=new Member();member.setUserId(10L);plan=new TrainingPlan();plan.setMember(member);plan.setStartDate(date);plan.setEndDate(date);when(plans.findById(1L)).thenReturn(Optional.of(plan));item=new TrainingPlanItem();ReflectionTestUtils.setField(item,"id",5L);item.setDayOfWeek(1);item.setExerciseName("Squat");when(items.findByTrainingPlanIdOrderByOrderIndexAscIdAsc(1L)).thenReturn(List.of(item));}
 @Test void assignedCoachReadsPersistedCompletionUsingVietnamDate(){TrainingItemCompletion done=new TrainingItemCompletion();done.setTrainingPlanItem(item);when(completions.findByMemberUserIdAndExerciseDate(10L,date)).thenReturn(List.of(done));var result=service.get(1L,date,20L,"COACH");assertThat(result.items()).hasSize(1);assertThat(result.items().getFirst().completed()).isTrue();verify(access).requireCoachOf(20L,10L);verify(completions,never()).save(any());}
 @Test void missingCompletionMeansUnfinished(){when(completions.findByMemberUserIdAndExerciseDate(10L,date)).thenReturn(List.of());assertThat(service.get(1L,date,20L,"COACH").items().getFirst().completed()).isFalse();}
 @Test void unrelatedCoachCannotRead(){doThrow(new ForbiddenException("X","coaching.member.not_assigned",null,"Denied")).when(access).requireCoachOf(20L,10L);assertThatThrownBy(()->service.get(1L,date,20L,"COACH")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(completions);}
 @Test void memberAndStaffCannotUseCoachEndpoint(){for(String role:List.of("MEMBER","STAFF","RECEPTIONIST"))assertThatThrownBy(()->service.get(1L,date,20L,role)).isInstanceOf(ForbiddenException.class);verifyNoInteractions(completions);}
 @Test void futureDatesAreRejectedAtVietnamBoundary(){assertThatThrownBy(()->service.get(1L,date.plusDays(1),20L,"COACH")).isInstanceOf(BadRequestException.class);}
 @Test void outsidePlanDatesReturnsNoScheduledWork(){assertThat(service.get(1L,date.minusDays(1),20L,"COACH").items()).isEmpty();verifyNoInteractions(completions);}
 @Test void excludesOtherWeekdays(){item.setDayOfWeek(7);when(completions.findByMemberUserIdAndExerciseDate(10L,date)).thenReturn(List.of());assertThat(service.get(1L,date,20L,"COACH").items()).isEmpty();}
}
