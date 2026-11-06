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
            select b from CoachBooking b join fetch b.member m join fetch m.user u
            left join fetch b.discipline
            where b.coach.userId = :coachId and b.status = 'confirmed'
              and (b.bookingDate > :today or (b.bookingDate = :today and b.startTime > :now))
              and u.deletedAt is null and u.status = 'active'
            order by b.bookingDate, b.startTime
            """)
    List<CoachBooking> findCurrentAssignments(@Param("coachId") Long coachId, @Param("today") LocalDate today,
            @Param("now") LocalTime now);
    boolean existsByDisciplineId(Long disciplineId);


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
              and cb.status in ('confirmed', 'completed')
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
    @Query("""
            select cb from CoachBooking cb
            where cb.member.userId = :memberId
              and cb.bookingDate >= :today
              and cb.status = 'confirmed'
            """)
    List<CoachBooking> findFutureConfirmedByMember(@Param("memberId") Long memberId, @Param("today") LocalDate today);

    /** Hourly sessions not yet paid for, past or upcoming; only a cancellation or a payment clears them. */
    @Query("""
            select count(cb) from CoachBooking cb
            where cb.member.userId = :memberId
              and cb.paymentStatus = 'pending'
              and cb.status in ('confirmed', 'completed')
            """)
    long countUnpaid(@Param("memberId") Long memberId);

    @Query("""
            select cb from CoachBooking cb
            join fetch cb.member m join fetch m.user mu
            join fetch cb.coach c join fetch c.user cu
            left join fetch cb.discipline d
            where cb.paymentStatus = 'pending' and cb.status in ('confirmed', 'completed')
            order by cb.bookingDate asc, cb.startTime asc, cb.id asc
            """)
    List<CoachBooking> findUnpaid();

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select cb from CoachBooking cb where cb.id = :id")
    java.util.Optional<CoachBooking> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            select (count(cb) > 0) from CoachBooking cb
            where cb.coach.userId = :coachId and cb.member.userId = :memberId and cb.status <> 'cancelled'
            """)
    boolean existsForCoachAndMember(@Param("coachId") Long coachId, @Param("memberId") Long memberId);

    @Query("select distinct cb.member.userId from CoachBooking cb where cb.status = 'confirmed' and cb.bookingDate >= :today")
    List<Long> findMemberIdsWithUpcomingSessions(@Param("today") LocalDate today);

    @Query("""
            select (count(cb) > 0) from CoachBooking cb
            where cb.member.userId = :memberId and cb.status = 'confirmed' and cb.bookingDate >= :today
            """)
    boolean existsUpcomingForMember(@Param("memberId") Long memberId, @Param("today") LocalDate today);

    @Query("""
            select (count(cb) > 0) from CoachBooking cb
            where cb.coach.userId = :coachId and cb.status = 'confirmed' and cb.bookingDate >= :today
            """)
    boolean existsUpcomingForCoach(@Param("coachId") Long coachId, @Param("today") LocalDate today);

    @Query("""
            select count(cb) from CoachBooking cb
            where cb.coach.userId = :coachId and cb.status = 'confirmed'
              and cb.bookingDate between :startDate and :endDate
            """)
    long countConfirmedForCoachBetween(@Param("coachId") Long coachId, @Param("startDate") LocalDate startDate,
                                       @Param("endDate") LocalDate endDate);
}
