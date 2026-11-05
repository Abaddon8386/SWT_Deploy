package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.ProductOrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProductOrderItemRepository extends JpaRepository<ProductOrderItem, Long> {
    boolean existsByVariant_Product_Id(Long productId);
    boolean existsByVariant_Id(Long variantId);
}
