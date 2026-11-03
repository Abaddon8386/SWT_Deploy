package com.swp391.scms.coaching.service;
import com.swp391.scms.coaching.repository.CurrentCoachMemberRepository;
import com.swp391.scms.common.exception.ForbiddenException;
import java.time.*;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class CurrentCoachMembers {
 private final CurrentCoachMemberRepository members; private final Clock clock;
 public CurrentCoachMembers(CurrentCoachMemberRepository members,Clock clock){this.members=members;this.clock=clock;}
 private LocalDate today(){return LocalDate.now(clock.withZone(ZoneId.of("Asia/Ho_Chi_Minh")));}
 public record MemberOption(Long id,String memberCode,String fullName,String fitnessGoal,String healthNotes,String fitnessLevel) {}
 @Transactional(readOnly=true)
 public List<MemberOption> list(Long userId,String role){
  if(userId==null||!("COACH".equals(role)||"CENTER_MANAGER".equals(role))) throw denied();
  return members.findCurrent("COACH".equals(role)?userId:null,null,today()).stream()
   .map(m->new MemberOption(m.getUserId(),m.getMembershipCode(),m.getUser().getFullName(),m.getFitnessGoal(),m.getHealthNotes(),m.getFitnessLevel())).toList();
 }
 @Transactional(readOnly=true)
 public void requireCoachOf(Long coachId,Long memberId){
  if(coachId==null||memberId==null||members.findCurrent(coachId,memberId,today()).isEmpty()) throw denied();
 }
 private ForbiddenException denied(){return new ForbiddenException("COACH_MEMBER_NOT_ASSIGNED","coaching.member.not_assigned",null,"No current coaching assignment.");}
}
