package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.ProductVariant;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from ProductVariant v join fetch v.product where v.id in :ids order by v.id")
    List<ProductVariant> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from ProductVariant v where v.id = :id")
    Optional<ProductVariant> findByIdForUpdate(@Param("id") Long id);

    @Query("select v from ProductVariant v join fetch v.product p join fetch p.category where v.id in :ids")
    List<ProductVariant> findAllWithProductByIdIn(@Param("ids") Collection<Long> ids);

    List<ProductVariant> findAllByProduct_IdInOrderBySortOrderAscIdAsc(Collection<Long> productIds);

    boolean existsBySkuIgnoreCase(String sku);
    boolean existsBySkuIgnoreCaseAndIdNot(String sku, Long id);
    Optional<ProductVariant> findBySkuIgnoreCase(String sku);

    @Query("select count(v) from ProductVariant v join v.product p where p.active = true and v.active = true and v.stock < 10")
    long countLowStockActiveVariants();
}
