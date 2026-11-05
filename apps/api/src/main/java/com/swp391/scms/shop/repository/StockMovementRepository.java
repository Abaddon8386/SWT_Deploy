package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.StockMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {
    List<StockMovement> findAllByVariant_IdOrderByCreatedAtDescIdDesc(Long variantId);
}
