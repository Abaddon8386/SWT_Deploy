package com.swp391.scms.membership.repository;

import com.swp391.scms.membership.entity.MembershipCancellationRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface MembershipCancellationRequestRepository extends JpaRepository<MembershipCancellationRequest, Long> {
    @EntityGraph(attributePaths = {"member", "member.user", "subscription", "subscription.membershipPackage", "resolvedBy", "requestedBy"})
    List<MembershipCancellationRequest> findByMemberUserIdOrderByRequestedAtDesc(Long memberId);

    @Query("""
            SELECT r FROM MembershipCancellationRequest r
            JOIN FETCH r.member m
            JOIN FETCH m.user u
            JOIN FETCH r.subscription s
            JOIN FETCH s.membershipPackage
            LEFT JOIN FETCH r.resolvedBy
            LEFT JOIN FETCH r.requestedBy
            WHERE u.deletedAt IS NULL
            ORDER BY r.requestedAt DESC
            """)
    List<MembershipCancellationRequest> findAllForManager();

    List<MembershipCancellationRequest> findByStatusOrderByRequestedAtAsc(String status);
    boolean existsBySubscriptionIdAndStatus(Long subscriptionId, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from MembershipCancellationRequest r where r.id = :id")
    Optional<MembershipCancellationRequest> findByIdForUpdate(@Param("id") Long id);
}
