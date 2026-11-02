package com.swp391.scms.coaching.repository;

import com.swp391.scms.coaching.entity.CoachMonthlyReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CoachMonthlyReviewRepository extends JpaRepository<CoachMonthlyReview, Long> {

    @Query("SELECT r FROM CoachMonthlyReview r JOIN FETCH r.coach c JOIN FETCH c.user " +
            "WHERE r.year = :year AND r.month = :month AND r.status = 'published' " +
            "ORDER BY r.rankPosition ASC, r.averageRating DESC")
    List<CoachMonthlyReview> findLeaderboardByPeriod(@Param("year") Integer year, @Param("month") Integer month);

    @Query("SELECT r FROM CoachMonthlyReview r JOIN FETCH r.coach c JOIN FETCH c.user " +
            "WHERE r.year = :year AND r.month = :month " +
            "ORDER BY r.rankPosition ASC, r.averageRating DESC")
    List<CoachMonthlyReview> findAllByPeriod(@Param("year") Integer year, @Param("month") Integer month);

    @Query("SELECT r FROM CoachMonthlyReview r JOIN FETCH r.coach c JOIN FETCH c.user " +
            "WHERE r.coach.userId = :coachId AND r.year = :year AND r.month = :month")
    Optional<CoachMonthlyReview> findByCoachIdAndPeriod(@Param("coachId") Long coachId,
                                                        @Param("year") Integer year,
                                                        @Param("month") Integer month);

    @Query("SELECT r FROM CoachMonthlyReview r JOIN FETCH r.coach c JOIN FETCH c.user " +
            "WHERE r.coach.userId = :coachId AND r.status = 'published' " +
            "ORDER BY r.year DESC, r.month DESC")
    List<CoachMonthlyReview> findByCoachIdPublished(@Param("coachId") Long coachId);
}

