package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.ProductOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductOrderRepository extends JpaRepository<ProductOrder, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from ProductOrder o where o.id = :id")
    Optional<ProductOrder> findByIdForUpdate(@Param("id") Long id);

    Optional<ProductOrder> findByMember_UserIdAndClientRequestId(Long memberId, String clientRequestId);

    Optional<ProductOrder> findByIdAndMember_UserId(Long id, Long memberId);

    boolean existsByCode(String code);

    @Query("select o from ProductOrder o where o.status = 'pending_payment' and o.paymentDueAt < :now order by o.paymentDueAt asc, o.id asc")
    List<ProductOrder> findExpiredUnpaid(@Param("now") LocalDateTime now);

    Page<ProductOrder> findByMember_UserIdOrderByCreatedAtDescIdDesc(Long memberId, Pageable pageable);

    Page<ProductOrder> findByMember_UserIdAndStatusInOrderByCreatedAtDescIdDesc(
            Long memberId,
            Collection<String> statuses,
            Pageable pageable
    );

    @Query("""
        select o from ProductOrder o join o.member m join m.user u
        where (:status = '' or o.status = :status)
          and (:counterPending = false or (o.status = 'pending_payment' and o.paymentMethod = 'counter'))
          and (:q = ''
               or lower(o.code) like concat('%', :q, '%')
               or lower(u.fullName) like concat('%', :q, '%')
               or lower(coalesce(u.phone, '')) like concat('%', :q, '%')
               or lower(coalesce(o.shipPhone, '')) like concat('%', :q, '%'))
        """)
    Page<ProductOrder> searchStaff(
            @Param("status") String status,
            @Param("counterPending") boolean counterPending,
            @Param("q") String q,
            Pageable pageable
    );

    long countByStatus(String status);

    long countByStatusAndPaymentMethod(String status, String paymentMethod);

    @Query("select o from ProductOrder o where o.status in ('paid', 'processing') or o.paidAt >= :since")
    List<ProductOrder> findRecentAndActive(@Param("since") LocalDateTime since);
}
