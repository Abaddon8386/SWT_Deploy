package com.swp391.scms.scheduling.repository;

import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.dto.ClassBookingCount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassEnrollmentRepository extends JpaRepository<ClassEnrollment, Long> {
    @Query("""
            select e from ClassEnrollment e join fetch e.member m join fetch m.user u join fetch e.gymClass c
            where c.coach.userId = :coachId and c.status = 'active' and e.status = 'booked'
              and u.deletedAt is null and u.status = 'active'
              and exists (select s.id from ClassSession s where s.gymClass = c and s.status = 'scheduled'
                and (s.sessionDate > :today or (s.sessionDate = :today and s.startTime > :now)))
            order by c.id, e.id
            """)
    List<ClassEnrollment> findCurrentCoachAssignments(@Param("coachId") Long coachId,
            @Param("today") java.time.LocalDate today, @Param("now") java.time.LocalTime now);

    @Query("select e.gymClass.id from ClassEnrollment e where e.id = :id")
    Optional<Long> findClassIdById(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from ClassEnrollment e where e.id = :id")
    Optional<ClassEnrollment> findByIdForUpdate(@Param("id") Long id);

    @Query("select distinct e.gymClass.id from ClassEnrollment e where e.member.userId = :memberId and e.status = 'booked'")
    List<Long> findBookedClassIdsByMemberId(@Param("memberId") Long memberId);

    List<ClassEnrollment> findByMemberUserId(Long memberId);

    List<ClassEnrollment> findByGymClassId(Long classId);

    Optional<ClassEnrollment> findByGymClassIdAndMemberUserId(Long classId, Long memberId);

    long countByGymClassIdAndStatus(Long classId, String status);

    @Query("select new com.swp391.scms.scheduling.dto.ClassBookingCount(e.gymClass.id, count(e)) "
            + "from ClassEnrollment e where e.gymClass.id in :classIds and e.status = :status group by e.gymClass.id")
    List<ClassBookingCount> countByClassIdsAndStatus(@Param("classIds") List<Long> classIds, @Param("status") String status);

    /** SCRUM-73 BR-03: a member may only hold one active booking per class. */
    Optional<ClassEnrollment> findByGymClassIdAndMemberUserIdAndStatus(Long classId, Long memberId, String status);

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"member", "member.user"})
    List<ClassEnrollment> findByGymClassIdAndStatus(Long classId, String status);

    void deleteByGymClassId(Long classId);

    @org.springframework.data.jpa.repository.Query("""
            select (count(e) > 0) from ClassEnrollment e
            where e.member.userId = :memberId and e.gymClass.coach.userId = :coachId
              and e.status in ('booked', 'completed')
            """)
    boolean existsForCoachAndMember(@org.springframework.data.repository.query.Param("coachId") Long coachId,
                                    @org.springframework.data.repository.query.Param("memberId") Long memberId);

    @org.springframework.data.jpa.repository.Query("select distinct e.member.userId from ClassEnrollment e where e.status = 'booked'")
    List<Long> findMemberIdsWithBookedEnrollments();

    @org.springframework.data.jpa.repository.Query("""
            select (count(e) > 0) from ClassEnrollment e
            where e.member.userId = :memberId and e.status = 'booked'
              and exists (select s.id from ClassSession s
                          where s.gymClass = e.gymClass and s.status = 'scheduled' and s.sessionDate >= :today)
            """)
    boolean existsUpcomingBookedForMember(@org.springframework.data.repository.query.Param("memberId") Long memberId,
                                          @org.springframework.data.repository.query.Param("today") java.time.LocalDate today);
}
