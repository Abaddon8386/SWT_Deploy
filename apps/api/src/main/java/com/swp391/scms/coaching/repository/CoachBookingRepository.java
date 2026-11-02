package com.swp391.scms.coaching.repository;

import com.swp391.scms.coaching.entity.CoachBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Repository
public interface CoachBookingRepository extends JpaRepository<CoachBooking, Long> {

    @Query("""
            select cb from CoachBooking cb
            join fetch cb.coach c
            join fetch c.user cu
            left join fetch cb.discipline d
            where cb.member.userId = :memberId
            order by cb.bookingDate desc, cb.startTime desc
            """)
    List<CoachBooking> findByMemberId(@Param("memberId") Long memberId);

    @Query("""
            select cb from CoachBooking cb
            join fetch cb.member m
            join fetch m.user mu
            left join fetch cb.discipline d
            where cb.coach.userId = :coachId
            order by cb.bookingDate desc, cb.startTime desc
            """)
    List<CoachBooking> findByCoachId(@Param("coachId") Long coachId);

    @Query("""
            select cb from CoachBooking cb
            where cb.coach.userId = :coachId
              and cb.bookingDate = :date
              and cb.status = 'confirmed'
            """)
    List<CoachBooking> findActiveByCoachAndDate(@Param("coachId") Long coachId, @Param("date") LocalDate date);

    @Query("""
            select cb from CoachBooking cb
            where cb.member.userId = :memberId
              and cb.bookingDate = :date
              and cb.status = 'confirmed'
            """)
    List<CoachBooking> findActiveByMemberAndDate(@Param("memberId") Long memberId, @Param("date") LocalDate date);

    @Query("""
            select count(cb) from CoachBooking cb
            where cb.member.userId = :memberId
              and cb.bookingDate between :startDate and :endDate
              and cb.paymentMethod = :paymentMethod
              and cb.status <> 'cancelled'
            """)
    long countMonthlyQuotaUsage(
            @Param("memberId") Long memberId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("paymentMethod") String paymentMethod
    );
}
