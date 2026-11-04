package com.swp391.scms.membership.repository;

import com.swp391.scms.membership.entity.MemberTrialRedemption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MemberTrialRedemptionRepository extends JpaRepository<MemberTrialRedemption, Long> {
    boolean existsByCccd(String cccd);
    boolean existsByMemberUserId(Long memberId);
    Optional<MemberTrialRedemption> findByMemberUserId(Long memberId);
    Optional<MemberTrialRedemption> findByCccd(String cccd);
}

