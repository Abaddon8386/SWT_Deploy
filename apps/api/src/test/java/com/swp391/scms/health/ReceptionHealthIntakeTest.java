package com.swp391.scms.health;
import com.swp391.scms.health.dto.HealthMetricDto;
import com.swp391.scms.attendance.entity.CenterCheckin;
import com.swp391.scms.attendance.repository.CenterCheckinRepository;
import com.swp391.scms.users.*;
import com.swp391.scms.users.entity.*;
import com.swp391.scms.common.exception.ForbiddenException;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;import java.time.*;import java.util.*;
import static org.mockito.Mockito.*;import static org.assertj.core.api.Assertions.*;
class ReceptionHealthIntakeTest {
 MemberProgressLogRepository logs=mock(MemberProgressLogRepository.class);MemberRepository members=mock(MemberRepository.class);UserRepository users=mock(UserRepository.class);CenterCheckinRepository checkins=mock(CenterCheckinRepository.class);
 HealthMetricService service=new HealthMetricService(logs,members,users);CenterCheckin checkin;Member member;User staff;LocalDateTime now=LocalDateTime.of(2026,11,4,0,5);
 HealthMetricDto metric=new HealthMetricDto(null,"weight",new BigDecimal("70"),"kg",null,null);
 @BeforeEach void setup(){ReflectionTestUtils.setField(service,"checkins",checkins);ReflectionTestUtils.setField(service,"clock",Clock.fixed(Instant.parse("2026-11-03T17:05:00Z"),ZoneOffset.UTC));member=new Member();member.setUserId(10L);User u=new User();u.setId(10L);member.setUser(u);staff=new User();staff.setId(20L);checkin=new CenterCheckin();ReflectionTestUtils.setField(checkin,"id",1L);checkin.setMember(member);checkin.setRecordedBy(staff);checkin.setCheckInTime(now.minusMinutes(1));when(checkins.findFirstByMemberUserIdAndStatusAndCheckOutTimeIsNullOrderByCheckInTimeDesc(10L,"GRANTED")).thenReturn(Optional.of(checkin));when(checkins.findByIdForUpdate(1L)).thenReturn(Optional.of(checkin));}
 @Test void ownOpenCheckinAllowsAppendAndPreservesAudit(){when(members.findById(10L)).thenReturn(Optional.of(member));when(users.findByIdAndDeletedAtIsNull(20L)).thenReturn(Optional.of(staff));when(logs.save(any())).thenAnswer(i->i.getArgument(0));var dto=service.addMetric(10L,metric,20L,"RECEPTIONIST");assertThat(dto.recordedBy()).isEqualTo(20L);assertThat(dto.recordedAt()).isEqualTo(now);verify(checkins).findByIdForUpdate(1L);verify(logs).save(any());verify(logs,never()).delete(any());}
 @Test void anotherReceptionistCannotWrite(){assertThatThrownBy(()->service.addMetric(10L,metric,99L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
 @Test void checkedOutOrYesterdayOrDeniedAreRejected(){checkin.setCheckOutTime(now);assertDenied();checkin.setCheckOutTime(null);checkin.setCheckInTime(now.minusDays(1));assertDenied();checkin.setCheckInTime(now.minusMinutes(1));checkin.setStatus("DENIED");assertDenied();}
 @Test void missingCheckinOrOtherMemberIsRejected(){when(checkins.findFirstByMemberUserIdAndStatusAndCheckOutTimeIsNullOrderByCheckInTimeDesc(10L,"GRANTED")).thenReturn(Optional.empty());assertDenied();assertThatThrownBy(()->service.addMetric(11L,metric,20L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);}
 @Test void staffCannotEditDeleteOrReadHistory(){assertThatThrownBy(()->service.updateMetric(10L,1L,metric,20L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);assertThatThrownBy(()->service.deleteMetric(10L,1L,20L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);assertThatThrownBy(()->service.getMetrics(10L,20L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
 @Test void inactiveMemberIsRejected(){member.getUser().setStatus("inactive");assertDenied();}
 private void assertDenied(){assertThatThrownBy(()->service.addMetric(10L,metric,20L,"RECEPTIONIST")).isInstanceOf(ForbiddenException.class);verifyNoInteractions(logs);}
}
