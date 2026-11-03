package com.swp391.scms.courts.repository;

import com.swp391.scms.courts.entity.CourtBooking;
import com.swp391.scms.scheduling.entity.ClassSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.*;
import java.util.*;

public interface CourtBookingRepository extends JpaRepository<CourtBooking, Long> {
    boolean existsByRoomId(Long roomId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from CourtBooking b where b.id = :id")
    Optional<CourtBooking> findByIdForUpdate(@Param("id") Long id);

    @Query("select (count(b) > 0) from CourtBooking b where b.room.id = :roomId and b.bookingDate = :date "
            + "and b.status = 'booked' and b.startTime < :end and b.endTime > :start")
    boolean existsRoomOverlap(@Param("roomId") Long roomId, @Param("date") LocalDate date,
                             @Param("start") LocalTime start, @Param("end") LocalTime end);

    @Query("select (count(b) > 0) from CourtBooking b where b.member.id = :memberId and b.bookingDate = :date "
            + "and b.status = 'booked' and b.startTime < :end and b.endTime > :start")
    boolean existsMemberOverlap(@Param("memberId") Long memberId, @Param("date") LocalDate date,
                               @Param("start") LocalTime start, @Param("end") LocalTime end);

    @Query("select (count(s) > 0) from ClassSession s where s.gymClass.room.id = :roomId and s.sessionDate = :date "
            + "and s.status <> 'cancelled' and s.startTime < :end and s.endTime > :start")
    boolean existsClassOverlap(@Param("roomId") Long roomId, @Param("date") LocalDate date,
                              @Param("start") LocalTime start, @Param("end") LocalTime end);

    @Query("select s from ClassSession s where s.gymClass.room.id = :roomId and s.sessionDate = :date and s.status <> 'cancelled'")
    List<ClassSession> findRoomClasses(@Param("roomId") Long roomId, @Param("date") LocalDate date);

    @Query("select b from CourtBooking b where b.room.id = :roomId and b.bookingDate = :date and b.status = 'booked'")
    List<CourtBooking> findRoomBookings(@Param("roomId") Long roomId, @Param("date") LocalDate date);

    @Query("select b from CourtBooking b where b.status = 'booked' and b.paymentStatus = 'pending' "
            + "and b.paymentMethod = 'vnpay' and b.createdAt < :cutoff")
    List<CourtBooking> findUnpaidOnlineBefore(@Param("cutoff") LocalDateTime cutoff);

    @Query("select b from CourtBooking b where b.status = 'booked' and b.paymentStatus = 'pending' "
            + "and b.paymentMethod = 'cash' and (b.bookingDate < :date or (b.bookingDate = :date and b.startTime <= :time))")
    List<CourtBooking> findUnpaidCashStarted(@Param("date") LocalDate date, @Param("time") LocalTime time);

    long countByMemberIdAndBookingDateAndStatus(Long memberId, LocalDate bookingDate, String status);

    @Query("select count(b) from CourtBooking b where b.member.id = :memberId and b.status = 'booked' "
            + "and b.paymentMethod = :method and b.bookingDate between :from and :to")
    long countQuotaUsage(@Param("memberId") Long memberId, @Param("from") LocalDate from, @Param("to") LocalDate to,
                         @Param("method") String method);

    @EntityGraph(attributePaths = {"room", "room.discipline", "member"})
    Page<CourtBooking> findByMemberIdOrderByBookingDateDescStartTimeDescIdDesc(Long memberId, Pageable pageable);

    @EntityGraph(attributePaths = {"room", "room.discipline", "member"})
    @Query("select b from CourtBooking b where b.bookingDate = :date and b.member.deletedAt is null "
            + "order by b.startTime, b.room.name, b.id")
    Page<CourtBooking> findDaily(@Param("date") LocalDate date, Pageable pageable);

    @EntityGraph(attributePaths = {"room", "room.discipline", "member"})
    @Query("select b from CourtBooking b where b.bookingDate = :date and b.room.id = :roomId "
            + "and b.member.deletedAt is null order by b.startTime, b.room.name, b.id")
    Page<CourtBooking> findDailyByRoom(@Param("date") LocalDate date, @Param("roomId") Long roomId, Pageable pageable);

    @Query("""
            select b from CourtBooking b
            where b.member.id = :memberId and b.status = 'booked' and b.bookingDate >= :today
            """)
    List<CourtBooking> findUpcomingBookedByMember(@Param("memberId") Long memberId, @Param("today") LocalDate today);

    @Query("select distinct b.member.id from CourtBooking b where b.status = 'booked' and b.bookingDate >= :today")
    List<Long> findMemberIdsWithUpcomingBookings(@Param("today") LocalDate today);

    @Query("""
            select (count(b) > 0) from CourtBooking b
            where b.member.id = :memberId and b.status = 'booked' and b.bookingDate >= :today
            """)
    boolean existsUpcomingForMember(@Param("memberId") Long memberId, @Param("today") LocalDate today);
}
