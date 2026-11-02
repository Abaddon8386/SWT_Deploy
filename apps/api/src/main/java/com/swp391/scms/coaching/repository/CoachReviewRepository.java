package com.swp391.scms.coaching.repository;

import com.swp391.scms.coaching.entity.CoachReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface CoachReviewRepository extends JpaRepository<CoachReview, Long> {
    boolean existsByMemberUserIdAndBookingId(Long memberId, Long bookingId);
    boolean existsByMemberUserIdAndClassSessionId(Long memberId, Long classSessionId);


    @Query("SELECT r FROM CoachReview r JOIN FETCH r.coach c JOIN FETCH c.user JOIN FETCH r.member m JOIN FETCH m.user " +
            "WHERE r.coach.userId = :coachId AND r.status = 'approved' ORDER BY r.createdAt DESC")
    List<CoachReview> findApprovedByCoachId(@Param("coachId") Long coachId);

    @Query("SELECT r FROM CoachReview r JOIN FETCH r.coach c JOIN FETCH c.user JOIN FETCH r.member m JOIN FETCH m.user " +
            "WHERE r.member.userId = :memberId ORDER BY r.createdAt DESC")
    List<CoachReview> findByMemberId(@Param("memberId") Long memberId);

    @Query("SELECT AVG(r.rating) FROM CoachReview r WHERE r.coach.userId = :coachId " +
            "AND r.createdAt >= :start AND r.createdAt <= :end AND r.status = 'approved'")
    Double getAverageRatingForPeriod(@Param("coachId") Long coachId,
                                     @Param("start") LocalDateTime start,
                                     @Param("end") LocalDateTime end);

    @Query("SELECT COUNT(r) FROM CoachReview r WHERE r.coach.userId = :coachId " +
            "AND r.createdAt >= :start AND r.createdAt <= :end AND r.status = 'approved'")
    long countReviewsForPeriod(@Param("coachId") Long coachId,
                               @Param("start") LocalDateTime start,
                               @Param("end") LocalDateTime end);
}

