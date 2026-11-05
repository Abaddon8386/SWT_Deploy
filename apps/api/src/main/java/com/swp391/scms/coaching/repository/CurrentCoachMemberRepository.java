package com.swp391.scms.coaching.repository;
import com.swp391.scms.users.entity.Member;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
/** One row per member, even when multiple current relationships exist. */
public interface CurrentCoachMemberRepository extends Repository<Member,Long> {
 @Query("""
 select m from Member m join fetch m.user u
 where u.deletedAt is null and u.status = 'active'
 and (:memberId is null or m.userId = :memberId)
 and (:coachId is null or
  exists (select p.id from TrainingPlan p where p.member = m and p.coach.userId = :coachId
   and p.status in ('active', 'draft') and p.endDate >= :today)
  or exists (select cb.id from CoachBooking cb where cb.member = m and cb.coach.userId = :coachId
   and cb.status = 'confirmed' and cb.bookingDate >= :today)
  or exists (select e.id from ClassEnrollment e where e.member = m and e.gymClass.coach.userId = :coachId
   and e.status = 'booked' and e.gymClass.status = 'active' and exists (select s.id from ClassSession s where s.gymClass = e.gymClass
    and s.status = 'scheduled' and s.sessionDate >= :today))
  or exists (select b.id from SessionBooking b where b.member = m and b.session.gymClass.coach.userId = :coachId
   and b.status = 'booked' and b.session.gymClass.status = 'active' and b.session.status = 'scheduled' and b.session.sessionDate >= :today))
 order by u.fullName, m.userId
 """)
 List<Member> findCurrent(@Param("coachId") Long coachId,@Param("memberId") Long memberId,@Param("today") LocalDate today);
}
