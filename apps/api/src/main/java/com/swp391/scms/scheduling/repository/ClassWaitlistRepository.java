package com.swp391.scms.scheduling.repository;

import com.swp391.scms.scheduling.entity.ClassWaitlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClassWaitlistRepository extends JpaRepository<ClassWaitlist, Long> {

    @Query("select w.gymClass.id from ClassWaitlist w where w.id = :id")
    Optional<Long> findClassIdById(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from ClassWaitlist w where w.id = :id")
    Optional<ClassWaitlist> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from ClassWaitlist w where w.id = :id and w.gymClass.id = :classId and w.member.userId = :memberId")
    Optional<ClassWaitlist> findClaimOfferForUpdate(@Param("id") Long id, @Param("classId") Long classId,
                                                  @Param("memberId") Long memberId);

    @Query("select distinct w.gymClass.id from ClassWaitlist w where w.member.userId = :memberId and w.status in ('waiting', 'notified')")
    List<Long> findActiveClassIdsByMemberId(@Param("memberId") Long memberId);

    @Query("""
            select distinct w.gymClass.id from ClassWaitlist w
            where w.gymClass.id > :afterId and w.status = 'notified'
              and (w.reservationExpiresAt <= :now or w.notifiedAt <= :cutoff
                   or (w.reservationExpiresAt is null and w.notifiedAt is null))
            order by w.gymClass.id
            """)
    List<Long> findExpiredClassIds(@Param("afterId") Long afterId, @Param("now") LocalDateTime now,
                                   @Param("cutoff") LocalDateTime cutoff, Pageable pageable);

    @Query("""
            select w from ClassWaitlist w where w.gymClass.id = :classId and w.status = 'notified'
              and (w.reservationExpiresAt <= :now or w.notifiedAt <= :cutoff
                   or (w.reservationExpiresAt is null and w.notifiedAt is null))
            order by w.id
            """)
    List<ClassWaitlist> findExpiredOffers(@Param("classId") Long classId, @Param("now") LocalDateTime now,
                                         @Param("cutoff") LocalDateTime cutoff);

    @Query("""
            select count(w) from ClassWaitlist w where w.gymClass.id = :classId and w.status = 'notified'
              and (w.reservationExpiresAt is null or w.reservationExpiresAt > :now)
              and (w.notifiedAt is null or w.notifiedAt > :cutoff)
              and (w.reservationExpiresAt is not null or w.notifiedAt is not null)
            """)
    long countLiveOffers(@Param("classId") Long classId, @Param("now") LocalDateTime now,
                         @Param("cutoff") LocalDateTime cutoff);

    Optional<ClassWaitlist> findFirstByGymClassIdAndStatusOrderByRequestedAtAscIdAsc(Long classId, String status);

    List<ClassWaitlist> findByMemberUserIdOrderByRequestedAtAsc(Long memberId);

    Optional<ClassWaitlist> findByGymClassIdAndMemberUserIdAndStatus(Long classId, Long memberId, String status);

    /** SCRUM-74 BR-04: FIFO ordering by requested_at. */
    List<ClassWaitlist> findByGymClassIdAndStatusOrderByRequestedAtAsc(Long classId, String status);

    long countByGymClassIdAndStatus(Long classId, String status);

    long countByGymClassIdAndStatusAndReservationExpiresAtGreaterThan(Long classId, String status, java.time.LocalDateTime now);

    List<ClassWaitlist> findByGymClassIdAndStatusAndReservationExpiresAtLessThan(Long classId, String status, java.time.LocalDateTime now);

    List<ClassWaitlist> findByStatusAndReservationExpiresAtLessThan(String status, java.time.LocalDateTime now);

    org.springframework.data.domain.Page<ClassWaitlist> findByStatusAndReservationExpiresAtLessThan(
            String status, java.time.LocalDateTime now, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<ClassWaitlist> findByStatusAndNotifiedAtBefore(
            String status, java.time.LocalDateTime cutoff, org.springframework.data.domain.Pageable pageable);

    java.util.Optional<ClassWaitlist> findFirstByGymClassIdAndStatusOrderByRequestedAtAsc(Long classId, String status);
}
