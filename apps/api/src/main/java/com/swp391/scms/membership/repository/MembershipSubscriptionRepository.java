package com.swp391.scms.membership.repository;

import com.swp391.scms.membership.entity.MembershipSubscription;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface MembershipSubscriptionRepository extends JpaRepository<MembershipSubscription, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from MembershipSubscription s where s.id = :id")
    Optional<MembershipSubscription> findByIdForUpdate(@Param("id") Long id);

    List<MembershipSubscription> findByMemberUserId(Long memberId);

    @Lock(LockModeType.PESSIMISTIC_READ)
    Optional<MembershipSubscription> findByQrCode(String qrCode);

    List<MembershipSubscription> findByMemberUserIdOrderByCreatedAtDesc(Long memberId);

    List<MembershipSubscription> findByStatusOrderByCreatedAtDesc(String status);

    List<MembershipSubscription> findByHoldStatusOrderByHoldRequestedAtDesc(String holdStatus);

    List<MembershipSubscription> findByMemberUserIdAndStatus(Long memberId, String status);

    boolean existsByMemberUserIdAndStatus(Long memberId, String status);

    boolean existsByPreviousSubscriptionIdAndStatusIn(Long previousId, java.util.Collection<String> statuses);

    @Query("""
            select count(s) from MembershipSubscription s
            where s.endDate between :start and :end and s.status in ('active', 'expired')
              and exists (select p.id from Payment p where p.subscriptionId = s.id and p.status = 'success')
            """)
    long countExpiredPaidPeriods(@Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("""
            select count(s) from MembershipSubscription s
            where s.endDate between :start and :end and s.status in ('active', 'expired')
              and exists (select p.id from Payment p where p.subscriptionId = s.id and p.status = 'success')
              and exists (select next.id from MembershipSubscription next
                  where next.previousSubscription = s and next.status in ('active', 'expired', 'frozen')
                    and exists (select p2.id from Payment p2 where p2.subscriptionId = next.id and p2.status = 'success'))
            """)
    long countRenewedExpiredPaidPeriods(@Param("start") LocalDate start, @Param("end") LocalDate end);

    boolean existsByMemberUserIdAndStatusAndEndDateGreaterThanEqual(Long memberId, String status, LocalDate date);

    boolean existsByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
            Long memberId, String status, LocalDate startDate, LocalDate endDate);

    Optional<MembershipSubscription> findFirstByMemberUserIdAndStatusOrderByEndDateDesc(Long memberId,
            String status);

    Optional<MembershipSubscription> findFirstByMemberUserIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateDesc(
            Long memberId, String status, LocalDate todayForStart, LocalDate todayForEnd);

    @Query("""
            select (count(s) > 0) from MembershipSubscription s
            where s.member.userId = :memberId and s.status = 'active'
              and s.startDate <= :date and s.endDate >= :date
            """)
    boolean hasActiveMembership(@Param("memberId") Long memberId, @Param("date") LocalDate date);

    @Query("""
            select (count(s) > 0) from MembershipSubscription s
            where s.member.userId = :memberId and s.status = 'active'
              and s.startDate <= :today and s.endDate >= :today
              and s.startDate <= :sessionDate and s.endDate >= :sessionDate
            """)
    boolean hasActiveMembershipCoveringSession(@Param("memberId") Long memberId,
                                               @Param("today") LocalDate today,
                                               @Param("sessionDate") LocalDate sessionDate);

    @Query("""
            select s from MembershipSubscription s
            join fetch s.member m
            join fetch m.user u
            join fetch s.membershipPackage p
            where s.status = 'active'
              and s.endDate = :endDate
            """)
    List<MembershipSubscription> findActiveSubscriptionsExpiringOn(@Param("endDate") LocalDate endDate);
}
