package com.swp391.scms.support;

import com.swp391.scms.support.entity.SupportRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupportRequestRepository extends JpaRepository<SupportRequest, Long> {
    
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from SupportRequest r where r.id = :id")
    java.util.Optional<SupportRequest> findByIdForUpdate(@Param("id") Long id);

    Page<SupportRequest> findByMemberUserIdOrderByCreatedAtDesc(Long memberId, Pageable pageable);

    Page<SupportRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<SupportRequest> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    default Page<SupportRequest> findAllByStatus(@Param("status") String status, Pageable pageable) {
        if (status == null || status.isBlank()) {
            return findAllByOrderByCreatedAtDesc(pageable);
        }
        return findByStatusOrderByCreatedAtDesc(status, pageable);
    }
}

