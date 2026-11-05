package com.swp391.scms.coaching.repository;

import com.swp391.scms.coaching.entity.TrainingPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingPlanRepository extends JpaRepository<TrainingPlan, Long> {

    @org.springframework.data.jpa.repository.Query("""
            select p from TrainingPlan p join fetch p.member m join fetch m.user u
            where p.coach.userId = :coachId and p.status = 'active'
              and p.startDate <= :today and p.endDate >= :today
              and u.deletedAt is null and u.status = 'active'
            order by p.createdAt desc
            """)
    List<TrainingPlan> findCurrentAssignments(@org.springframework.data.repository.query.Param("coachId") Long coachId,
            @org.springframework.data.repository.query.Param("today") java.time.LocalDate today);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from TrainingPlan p where p.id = :id")
    java.util.Optional<TrainingPlan> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);

    List<TrainingPlan> findByMemberUserIdAndStatusOrderByCreatedAtDesc(Long memberId, String status);

    List<TrainingPlan> findByMemberUserIdOrderByCreatedAtDesc(Long memberId);

    List<TrainingPlan> findByCoachUserIdOrderByCreatedAtDesc(Long coachId);

    List<TrainingPlan> findAllByOrderByCreatedAtDesc();

    @org.springframework.data.jpa.repository.Query("select (count(p) > 0) from TrainingPlan p where p.coach.userId = :coachId and p.member.userId = :memberId")
    boolean existsForCoachAndMember(@org.springframework.data.repository.query.Param("coachId") Long coachId, @org.springframework.data.repository.query.Param("memberId") Long memberId);
}

