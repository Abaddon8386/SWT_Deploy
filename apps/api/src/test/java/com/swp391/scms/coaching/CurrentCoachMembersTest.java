package com.swp391.scms.coaching;
import com.swp391.scms.coaching.repository.CurrentCoachMemberRepository;
import com.swp391.scms.coaching.service.CurrentCoachMembers;
import com.swp391.scms.users.entity.*;
import com.swp391.scms.common.exception.ForbiddenException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class CurrentCoachMembersTest {
 CurrentCoachMemberRepository repository=mock(CurrentCoachMemberRepository.class);
 CurrentCoachMembers service=new CurrentCoachMembers(repository,Clock.fixed(Instant.parse("2026-11-03T17:05:00Z"),ZoneOffset.UTC));
 Member member(long id){User u=new User();u.setId(id);u.setFullName("Test member");Member m=new Member();m.setUserId(id);m.setUser(u);return m;}
 @Test void returnsAuthoritativeClassAndPtOnlyMembersWithoutRosterCalls(){when(repository.findCurrent(20L,null,LocalDate.of(2026,11,4))).thenReturn(List.of(member(10),member(11)));assertThat(service.list(20L,"COACH")).extracting(CurrentCoachMembers.MemberOption::id).containsExactly(10L,11L);}
 @Test void expiredOrUnassignedMemberIsDenied(){when(repository.findCurrent(20L,10L,LocalDate.of(2026,11,4))).thenReturn(List.of());assertThatThrownBy(()->service.requireCoachOf(20L,10L)).isInstanceOf(ForbiddenException.class);}
 @Test void currentMemberIsAllowed(){when(repository.findCurrent(20L,10L,LocalDate.of(2026,11,4))).thenReturn(List.of(member(10)));service.requireCoachOf(20L,10L);}
 @Test void staffAndMemberCannotEnumerateCoachMembers(){for(String role:List.of("MEMBER","RECEPTIONIST"))assertThatThrownBy(()->service.list(20L,role)).isInstanceOf(ForbiddenException.class);verifyNoInteractions(repository);}
 @Test void managerRetainsActiveMemberDirectory(){when(repository.findCurrent(null,null,LocalDate.of(2026,11,4))).thenReturn(List.of(member(10)));assertThat(service.list(20L,"CENTER_MANAGER")).hasSize(1);}
 @Test void queryHasAllAuthoritativeRelationsAndOneOuterMemberRow() throws Exception {
  String query=CurrentCoachMemberRepository.class.getMethod("findCurrent",Long.class,Long.class,LocalDate.class).getAnnotation(org.springframework.data.jpa.repository.Query.class).value();
  assertThat(query).contains("select m from Member m", "CoachBooking", "TrainingPlan", "ClassEnrollment", "SessionBooking", "cb.status = 'confirmed'", "cb.bookingDate >= :today", "p.endDate >= :today", "u.deletedAt is null", "u.status = 'active'");
  assertThat(query).doesNotContain("join CoachBooking", "join TrainingPlan");
 }
}
