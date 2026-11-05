package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.MemberAddress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MemberAddressRepository extends JpaRepository<MemberAddress, Long> {
    List<MemberAddress> findAllByMember_UserIdOrderByIsDefaultDescCreatedAtDescIdDesc(Long memberId);
    Optional<MemberAddress> findByIdAndMember_UserId(Long id, Long memberId);
    long countByMember_UserId(Long memberId);
}
