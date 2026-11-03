package com.swp391.scms.health;
import com.swp391.scms.health.dto.HealthMetricDto;
import com.swp391.scms.health.entity.MemberProgressLog;
import com.swp391.scms.coaching.service.CurrentCoachMembers;
import com.swp391.scms.common.exception.*;
import com.swp391.scms.users.*;
import com.swp391.scms.users.entity.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class HealthMetricWritingTest {
 MemberProgressLogRepository logs=mock(MemberProgressLogRepository.class);
 MemberRepository members=mock(MemberRepository.class); UserRepository users=mock(UserRepository.class);
 CurrentCoachMembers access=mock(CurrentCoachMembers.class);
 HealthMetricService service=new HealthMetricService(logs,members,users);
 HealthMetricDto metric(String name,String value,String unit){return new HealthMetricDto(null,name,new BigDecimal(value),unit,999L,LocalDateTime.of(2000,1,1,0,0));}
 @BeforeEach void setup(){ReflectionTestUtils.setField(service,"currentCoachMembers",access);}
 @Test void memberCannotWriteOwnMetrics(){assertThatThrownBy(()->service.addMetric(10L,metric("weight","70","kg"),10L,"MEMBER")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
 @Test void staffCannotWriteWithoutBusinessPermission(){for(String role:List.of("STAFF","RECEPTIONIST"))assertThatThrownBy(()->service.addMetric(10L,metric("weight","70","kg"),20L,role)).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
 @Test void unrelatedCoachCannotWrite(){doThrow(new ForbiddenException("X","coaching.member.not_assigned",null,"Denied")).when(access).requireCoachOf(20L,10L);assertThatThrownBy(()->service.addMetric(10L,metric("weight","70","kg"),20L,"COACH")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
 @Test void coachMustHaveAuthoritativeAccessChecker(){ReflectionTestUtils.setField(service,"currentCoachMembers",null);assertThatThrownBy(()->service.addMetric(10L,metric("weight","70","kg"),20L,"COACH")).isInstanceOf(ForbiddenException.class);}
 @Test void invalidUnitAndValueAreRejected(){for(var m:List.of(metric("weight","70","lb"),metric("height","170","kg"),metric("body_fat","101","%"),metric("weight","-1","kg")))assertThatThrownBy(()->service.addMetric(10L,m,20L,"COACH")).isInstanceOf(BadRequestException.class);verifyNoInteractions(logs);}
 @Test void assignedCoachAppendsWithoutTrustingClientAuditFields(){ReflectionTestUtils.setField(service,"clock",Clock.fixed(Instant.parse("2026-10-25T17:05:00Z"),ZoneOffset.UTC));Member member=new Member();member.setUserId(10L);User recorder=new User();recorder.setId(20L);when(members.findById(10L)).thenReturn(Optional.of(member));when(users.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(recorder));when(logs.save(any())).thenAnswer(i->i.getArgument(0));var dto=service.addMetric(10L,metric("weight","70","kg"),20L,"COACH");assertThat(dto.recordedBy()).isEqualTo(20L);assertThat(dto.recordedAt()).isEqualTo(LocalDateTime.of(2026,10,26,0,5));verify(access).requireCoachOf(20L,10L);verify(logs).save(any());verify(logs,never()).delete(any());}
 @Test void updateFromWeightToBmiClearsThePreviousUnit(){
  Member member=new Member(); member.setUserId(10L);
  MemberProgressLog row=new MemberProgressLog(); row.setMember(member); row.setMetricName("weight"); row.setMetricValue(new BigDecimal("70")); row.setUnit("kg");
  when(logs.findById(3L)).thenReturn(Optional.of(row)); when(logs.save(any())).thenAnswer(i->i.getArgument(0));
  var result=service.updateMetric(10L,3L,metric("bmi","23",null),20L,"COACH");
  assertThat(result.metricName()).isEqualTo("bmi"); assertThat(result.unit()).isNull();
 }
}
