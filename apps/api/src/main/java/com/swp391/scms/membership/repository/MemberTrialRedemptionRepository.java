package com.swp391.scms.membership.repository;

import com.swp391.scms.membership.entity.MemberTrialRedemption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MemberTrialRedemptionRepository extends JpaRepository<MemberTrialRedemption, Long> {
    boolean existsByCccdHash(String cccdHash);
    boolean existsByCccdHashAndMemberUserIdNot(String cccdHash, Long memberId);
    boolean existsByMemberUserId(Long memberId);
    Optional<MemberTrialRedemption> findByMemberUserId(Long memberId);
    List<MemberTrialRedemption> findByStatusOrderByRedeemedAtDesc(String status);
    List<MemberTrialRedemption> findAllByOrderByRedeemedAtDesc();
}
