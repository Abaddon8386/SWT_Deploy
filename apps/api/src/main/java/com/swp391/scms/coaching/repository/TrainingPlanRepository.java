package com.swp391.scms.coaching.repository;

import com.swp391.scms.coaching.entity.TrainingPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrainingPlanRepository extends JpaRepository<TrainingPlan, Long> {

    List<TrainingPlan> findByMemberUserIdAndStatusOrderByCreatedAtDesc(Long memberId, String status);

    List<TrainingPlan> findByMemberUserIdOrderByCreatedAtDesc(Long memberId);

    List<TrainingPlan> findByCoachUserIdOrderByCreatedAtDesc(Long coachId);

    List<TrainingPlan> findAllByOrderByCreatedAtDesc();

    @org.springframework.data.jpa.repository.Query("select (count(p) > 0) from TrainingPlan p where p.coach.userId = :coachId and p.member.userId = :memberId")
    boolean existsForCoachAndMember(@org.springframework.data.repository.query.Param("coachId") Long coachId, @org.springframework.data.repository.query.Param("memberId") Long memberId);
}

